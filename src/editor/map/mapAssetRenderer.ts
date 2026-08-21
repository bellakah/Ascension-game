import type { MapPaletteEntry, MapSpriteRect } from './mapEditorTypes';

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

function activeSourceRect(entry: MapPaletteEntry, now = performance.now()): MapSpriteRect | null {
  const sprite = entry.sprite;
  if (!sprite) return null;
  const animation = sprite.animation;
  if (!animation?.frames.length) return sprite.sourceRect ?? null;

  const frames = animation.frames;
  const defaultDuration = 1000 / Math.max(1, animation.fps || 1);
  const durations = frames.map((frame) => Math.max(16, frame.durationMs ?? defaultDuration));
  const total = durations.reduce((sum, value) => sum + value, 0);
  let cursor = animation.loop ? now % total : Math.min(now, Math.max(0, total - 1));
  for (let index = 0; index < frames.length; index++) {
    if (cursor < durations[index]) return frames[index];
    cursor -= durations[index];
  }
  return frames[frames.length - 1];
}

function drawSpriteImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  entry: MapPaletteEntry,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  now?: number,
) {
  const rect = activeSourceRect(entry, now);
  if (rect) ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height, dx, dy, dw, dh);
  else ctx.drawImage(image, dx, dy, dw, dh);
}

export function drawTerrainAsset(
  ctx: CanvasRenderingContext2D,
  entry: MapPaletteEntry,
  x: number,
  y: number,
  size: number,
  alpha = 1,
  onReady?: () => void,
  now?: number,
) {
  const image = getMapAssetImage(entry, onReady);
  ctx.save();
  ctx.globalAlpha = alpha;
  if (image?.complete && image.naturalWidth > 0) {
    ctx.imageSmoothingEnabled = !entry.sprite?.pixelated;
    drawSpriteImage(ctx, image, entry, x, y, size + .5, size + .5, now);
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
  now?: number;
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
    drawSpriteImage(ctx, image, entry, left, top, width, height, options.now);
    if (selected) {
      ctx.strokeStyle = '#e9fbff';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(left - 2, top - 2, width + 4, height + 4);
      ctx.setLineDash([]);
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

export function drawAssetThumbnail(canvas: HTMLCanvasElement, entry: MapPaletteEntry, now = performance.now()) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width || 64));
  const height = Math.max(1, Math.floor(rect.height || 64));
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (entry.palette === 'terrain') drawTerrainAsset(ctx, entry, 5, 5, Math.min(width, height) - 10, 1, () => drawAssetThumbnail(canvas, entry), now);
  else drawObjectAsset(ctx, entry, { x: width / 2, y: height - 5, tilePixels: Math.min(width, height) * .7, onReady: () => drawAssetThumbnail(canvas, entry), now });
}
