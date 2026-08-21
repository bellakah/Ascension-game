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

type Bounds = { left: number; top: number; width: number; height: number };

function selectionOutline(ctx: CanvasRenderingContext2D, bounds: Bounds, selected: boolean) {
  if (!selected) return;
  ctx.save();
  ctx.strokeStyle = '#e9fbff';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 3]);
  ctx.strokeRect(bounds.left - 3, bounds.top - 3, bounds.width + 6, bounds.height + 6);
  ctx.restore();
}

function drawNpcFallback(ctx: CanvasRenderingContext2D, entry: MapPaletteEntry, options: DrawObjectOptions): Bounds {
  const scale = Math.max(.1, options.scale ?? 1);
  const unit = options.tilePixels * scale;
  const width = unit * .72;
  const height = unit * 1.2;
  const left = options.x - width / 2;
  const top = options.y - height;
  const skin = '#e2b58d';
  const hair = entry.id === 'mira' ? '#3d2b2b' : entry.id === 'silas' ? '#5b5149' : '#4c3428';

  ctx.save();
  ctx.globalAlpha = options.alpha ?? 1;
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  ctx.beginPath(); ctx.ellipse(options.x, options.y - unit * .03, unit * .27, unit * .1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = entry.color;
  const bodyLeft = options.x - unit * .24;
  const bodyTop = options.y - unit * .72;
  const bodyW = unit * .48;
  const bodyH = unit * .66;
  ctx.beginPath(); ctx.roundRect(bodyLeft, bodyTop, bodyW, bodyH, unit * .1); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = Math.max(1, unit * .035); ctx.stroke();
  ctx.fillStyle = 'rgba(27,31,34,.45)';
  ctx.beginPath(); ctx.roundRect(options.x - unit * .145, options.y - unit * .45, unit * .29, unit * .37, unit * .06); ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(options.x, options.y - unit * .88, unit * .18, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = hair; ctx.lineWidth = unit * .08;
  ctx.beginPath(); ctx.arc(options.x, options.y - unit * .91, unit * .15, Math.PI, Math.PI * 2); ctx.stroke();
  if (entry.id === 'elandra') {
    ctx.fillStyle = '#ffdd57'; ctx.font = `900 ${Math.max(9, unit * .25)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('!', options.x, top + unit * .04);
  }
  ctx.restore();
  const bounds = { left, top, width, height };
  selectionOutline(ctx, bounds, Boolean(options.selected));
  return bounds;
}

function drawWolfFallback(ctx: CanvasRenderingContext2D, entry: MapPaletteEntry, options: DrawObjectOptions): Bounds {
  const scale = Math.max(.1, options.scale ?? 1);
  const unit = options.tilePixels * scale;
  const width = unit * 1.05;
  const height = unit * .82;
  const left = options.x - width / 2;
  const top = options.y - height;
  const body = entry.color || '#71433f';
  ctx.save(); ctx.globalAlpha = options.alpha ?? 1;
  ctx.fillStyle = 'rgba(0,0,0,.23)'; ctx.beginPath(); ctx.ellipse(options.x, options.y - unit * .03, unit * .4, unit * .11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = body; ctx.strokeStyle = '#c66a58'; ctx.lineWidth = Math.max(1, unit * .035);
  ctx.beginPath(); ctx.ellipse(options.x + unit * .08, options.y - unit * .32, unit * .39, unit * .24, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(options.x - unit * .31, options.y - unit * .47, unit * .17, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(options.x - unit * .43, options.y - unit * .59); ctx.lineTo(options.x - unit * .36, options.y - unit * .74); ctx.lineTo(options.x - unit * .29, options.y - unit * .57); ctx.fill();
  ctx.beginPath(); ctx.moveTo(options.x - unit * .31, options.y - unit * .61); ctx.lineTo(options.x - unit * .22, options.y - unit * .72); ctx.lineTo(options.x - unit * .18, options.y - unit * .54); ctx.fill();
  ctx.fillStyle = '#ffe06b'; ctx.beginPath(); ctx.arc(options.x - unit * .37, options.y - unit * .48, unit * .035, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  const bounds = { left, top, width, height };
  selectionOutline(ctx, bounds, Boolean(options.selected));
  return bounds;
}

function drawSludgeFallback(ctx: CanvasRenderingContext2D, entry: MapPaletteEntry, options: DrawObjectOptions): Bounds {
  const scale = Math.max(.1, options.scale ?? 1);
  const unit = options.tilePixels * scale;
  const width = unit * .88;
  const height = unit * .78;
  const left = options.x - width / 2;
  const top = options.y - height;
  ctx.save(); ctx.globalAlpha = options.alpha ?? 1;
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(options.x, options.y - unit * .02, unit * .34, unit * .1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = entry.color || '#6d9458'; ctx.strokeStyle = '#a6d77d'; ctx.lineWidth = Math.max(1, unit * .035);
  ctx.beginPath();
  ctx.moveTo(options.x - unit * .4, options.y - unit * .1);
  ctx.quadraticCurveTo(options.x - unit * .4, options.y - unit * .55, options.x - unit * .18, options.y - unit * .64);
  ctx.quadraticCurveTo(options.x, options.y - unit * .82, options.x + unit * .2, options.y - unit * .61);
  ctx.quadraticCurveTo(options.x + unit * .42, options.y - unit * .48, options.x + unit * .4, options.y - unit * .1);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e9f7c8';
  ctx.beginPath(); ctx.arc(options.x - unit * .12, options.y - unit * .43, unit * .055, 0, Math.PI * 2); ctx.arc(options.x + unit * .12, options.y - unit * .43, unit * .055, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#23311f';
  ctx.beginPath(); ctx.arc(options.x - unit * .11, options.y - unit * .43, unit * .025, 0, Math.PI * 2); ctx.arc(options.x + unit * .11, options.y - unit * .43, unit * .025, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  const bounds = { left, top, width, height };
  selectionOutline(ctx, bounds, Boolean(options.selected));
  return bounds;
}

function drawResourceFallback(ctx: CanvasRenderingContext2D, entry: MapPaletteEntry, options: DrawObjectOptions): Bounds {
  const scale = Math.max(.1, options.scale ?? 1);
  const unit = options.tilePixels * scale;
  const width = unit * .86;
  const height = unit * .86;
  const left = options.x - width / 2;
  const top = options.y - height;
  ctx.save(); ctx.globalAlpha = options.alpha ?? 1;
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(options.x, options.y, unit * .32, unit * .09, 0, 0, Math.PI * 2); ctx.fill();
  if (entry.id === 'herb') {
    ctx.strokeStyle = '#416b3d'; ctx.lineWidth = Math.max(2, unit * .05); ctx.beginPath(); ctx.moveTo(options.x, options.y - unit * .05); ctx.lineTo(options.x, options.y - unit * .58); ctx.stroke();
    ctx.fillStyle = '#70ad61';
    ctx.beginPath(); ctx.ellipse(options.x - unit * .18, options.y - unit * .31, unit * .22, unit * .09, -.35, 0, Math.PI * 2); ctx.ellipse(options.x + unit * .18, options.y - unit * .25, unit * .22, unit * .09, .35, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e2dc80'; ctx.beginPath(); ctx.arc(options.x, options.y - unit * .62, unit * .09, 0, Math.PI * 2); ctx.fill();
  } else if (entry.id === 'iron_vein') {
    ctx.fillStyle = '#737d7b'; ctx.strokeStyle = '#aab6b4'; ctx.lineWidth = Math.max(1, unit * .025);
    ctx.beginPath(); ctx.moveTo(options.x - unit * .38, options.y - unit * .08); ctx.lineTo(options.x - unit * .25, options.y - unit * .5); ctx.lineTo(options.x, options.y - unit * .7); ctx.lineTo(options.x + unit * .3, options.y - unit * .48); ctx.lineTo(options.x + unit * .4, options.y - unit * .08); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else {
    ctx.fillStyle = '#765034'; ctx.beginPath(); ctx.roundRect(options.x - unit * .09, options.y - unit * .38, unit * .18, unit * .38, unit * .04); ctx.fill();
    ctx.fillStyle = '#367449'; ctx.beginPath(); ctx.arc(options.x - unit * .14, options.y - unit * .5, unit * .25, 0, Math.PI * 2); ctx.arc(options.x + unit * .15, options.y - unit * .53, unit * .26, 0, Math.PI * 2); ctx.arc(options.x, options.y - unit * .7, unit * .25, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  const bounds = { left, top, width, height };
  selectionOutline(ctx, bounds, Boolean(options.selected));
  return bounds;
}

function drawGenericFallback(ctx: CanvasRenderingContext2D, entry: MapPaletteEntry, options: DrawObjectOptions): Bounds {
  const radius = Math.max(9, Math.min(24, options.tilePixels * .38 * Math.max(.1, options.scale ?? 1)));
  const centerY = options.y - options.tilePixels * .48;
  ctx.save(); ctx.globalAlpha = options.alpha ?? 1;
  if (entry.palette === 'portal') {
    ctx.strokeStyle = entry.color; ctx.lineWidth = Math.max(3, radius * .22); ctx.beginPath(); ctx.arc(options.x, centerY, radius * .85, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#bde9ff'; ctx.lineWidth = Math.max(1, radius * .08); ctx.beginPath(); ctx.arc(options.x, centerY, radius * .5, 0, Math.PI * 2); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(options.x, centerY, radius, 0, Math.PI * 2); ctx.fillStyle = entry.color; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.max(9, Math.min(17, options.tilePixels * .35))}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(entry.icon.slice(0, 2), options.x, centerY + .5);
  }
  ctx.restore();
  const bounds = { left: options.x - radius, top: centerY - radius, width: radius * 2, height: radius * 2 };
  selectionOutline(ctx, bounds, Boolean(options.selected));
  return bounds;
}

function drawFallbackObject(ctx: CanvasRenderingContext2D, entry: MapPaletteEntry, options: DrawObjectOptions) {
  if (entry.palette === 'npc') return drawNpcFallback(ctx, entry, options);
  if (entry.palette === 'monster') return entry.id === 'sludge' ? drawSludgeFallback(ctx, entry, options) : drawWolfFallback(ctx, entry, options);
  if (entry.palette === 'resource') return drawResourceFallback(ctx, entry, options);
  return drawGenericFallback(ctx, entry, options);
}

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
    ctx.restore();
    const bounds = { left, top, width, height };
    selectionOutline(ctx, bounds, selected);
    return bounds;
  }

  return drawFallbackObject(ctx, entry, options);
}

export function drawAssetThumbnail(canvas: HTMLCanvasElement, entry: MapPaletteEntry, now = performance.now()) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width || 96));
  const height = Math.max(1, Math.floor(rect.height || 96));
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const padding = Math.max(6, Math.min(width, height) * .08);
  if (entry.palette === 'terrain') {
    const size = Math.max(1, Math.min(width, height) - padding * 2);
    drawTerrainAsset(ctx, entry, (width - size) / 2, (height - size) / 2, size, 1, () => drawAssetThumbnail(canvas, entry), now);
    return;
  }

  const spriteW = Math.max(.25, entry.sprite?.widthTiles ?? 1);
  const spriteH = Math.max(.25, entry.sprite?.heightTiles ?? 1);
  const fitTile = Math.min((width - padding * 2) / spriteW, (height - padding * 2) / spriteH);
  const fallbackTile = Math.min(width - padding * 2, height - padding * 2) * .78;
  const tilePixels = entry.sprite ? fitTile : fallbackTile;
  drawObjectAsset(ctx, entry, {
    x: width / 2,
    y: height - padding,
    tilePixels: Math.max(8, tilePixels),
    onReady: () => drawAssetThumbnail(canvas, entry),
    now,
  });
}
