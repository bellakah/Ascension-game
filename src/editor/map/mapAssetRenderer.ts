import type { MapPaletteEntry } from './mapEditorTypes';

const imageCache = new Map<string, HTMLImageElement>();

export function getMapAssetImage(entry: MapPaletteEntry, onReady?: () => void) {
  const src = entry.sprite?.src;
  if (!src) return null;
  let image = imageCache.get(src);
  if (!image) {
    image = new Image();
    image.decoding = 'async';
    image.src = src;
    imageCache.set(src, image);
  }
  if (!image.complete && onReady) image.addEventListener('load', onReady, { once: true });
  return image;
}

export function preloadMapAssets(entries: MapPaletteEntry[], onReady?: () => void) {
  for (const entry of entries) getMapAssetImage(entry, onReady);
}

export function drawTerrainAsset(
  ctx: CanvasRenderingContext2D,
  entry: MapPaletteEntry,
  x: number,
  y: number,
  size: number,
  alpha = 1,
  onReady?: () => void,
) {
  const image = getMapAssetImage(entry, onReady);
  ctx.save();
  ctx.globalAlpha = alpha;
  if (image?.complete && image.naturalWidth > 0) {
    ctx.imageSmoothingEnabled = !entry.sprite?.pixelated;
    ctx.drawImage(image, x, y, size + .5, size + .5);
  } else {
    ctx.fillStyle = entry.color;
    ctx.fillRect(x, y, size + .5, size + .5);
  }
  ctx.restore();
}

export type DrawObjectOptions = {
  x: number;
  y: number;
  tilePixels: number;
  scale?: number;
  alpha?: number;
  selected?: boolean;
  onReady?: () => void;
};

export function drawObjectAsset(ctx: CanvasRenderingContext2D, entry: MapPaletteEntry, options: DrawObjectOptions) {
  const { x, y, tilePixels, selected = false, onReady } = options;
  const scale = Math.max(.1, options.scale ?? 1);
  const sprite = entry.sprite;
  const image = getMapAssetImage(entry, onReady);

  if (sprite && image?.complete && image.naturalWidth > 0) {
    const width = tilePixels * (sprite.widthTiles ?? 1) * scale;
    const height = tilePixels * (sprite.heightTiles ?? 1) * scale;
    const anchorX = sprite.anchorX ?? .5;
    const anchorY = sprite.anchorY ?? 1;
    const left = x - width * anchorX;
    const top = y - height * anchorY;
    ctx.save();
    ctx.globalAlpha = options.alpha ?? 1;
    ctx.imageSmoothingEnabled = !sprite.pixelated;
    ctx.drawImage(image, left, top, width, height);
    if (selected) {
      ctx.strokeStyle = '#ecfaff';
      ctx.lineWidth = 2;
      ctx.strokeRect(left - 2, top - 2, width + 4, height + 4);
    }
    ctx.restore();
    return { left, top, width, height };
  }

  const radius = Math.max(7, Math.min(19, tilePixels * .36));
  ctx.save();
  ctx.globalAlpha = options.alpha ?? 1;
  ctx.beginPath();
  ctx.arc(x, y - tilePixels * .5, radius, 0, Math.PI * 2);
  ctx.fillStyle = entry.color;
  ctx.fill();
  ctx.strokeStyle = selected ? '#fff' : 'rgba(0,0,0,.45)';
  ctx.lineWidth = selected ? 3 : 1.5;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = `800 ${Math.max(8, Math.min(14, tilePixels * .34))}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(entry.icon.slice(0, 2), x, y - tilePixels * .5 + .5);
  ctx.restore();
  return { left: x - radius, top: y - tilePixels * .5 - radius, width: radius * 2, height: radius * 2 };
}
