import type { AscensionMapDocument, MapBaseSurface } from './mapEditorTypes';
import { getWaterAsset, loadWaterAssetImage, waterAssetFrameRect, type WaterAssetDefinition } from './mapWaterAssetStore';

export type PreparedWaterFrames = {
  asset: WaterAssetDefinition;
  frames: HTMLCanvasElement[];
};

const preparedCache = new Map<string, PreparedWaterFrames>();
const pendingCache = new Map<string, Promise<PreparedWaterFrames | null>>();
const MAX_FRAME_SETS = 24;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function surfaceKey(surface: MapBaseSurface, asset: WaterAssetDefinition) {
  return [
    asset.id,
    asset.updatedAt,
    surface.waterTintMode ?? 'original',
    surface.waterTint ?? '#2f9fca',
    Number(surface.waterTintStrength ?? .8).toFixed(3),
    Number(surface.waterBrightness ?? 0).toFixed(2),
  ].join('|');
}

function trimCache() {
  while (preparedCache.size > MAX_FRAME_SETS) {
    const first = preparedCache.keys().next().value as string | undefined;
    if (!first) break;
    preparedCache.delete(first);
  }
}

function parseHex(value: string) {
  const normalized = String(value || '#2f9fca').replace('#', '').trim();
  const hex = normalized.length === 3 ? normalized.split('').map((part) => `${part}${part}`).join('') : normalized.padEnd(6, '0').slice(0, 6);
  return {
    r: Number.parseInt(hex.slice(0, 2), 16) || 0,
    g: Number.parseInt(hex.slice(2, 4), 16) || 0,
    b: Number.parseInt(hex.slice(4, 6), 16) || 0,
  };
}

function colorize(canvas: HTMLCanvasElement, surface: MapBaseSurface) {
  if ((surface.waterTintMode ?? 'original') !== 'colorize') return;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const target = parseHex(surface.waterTint ?? '#2f9fca');
  const strength = clamp(Number(surface.waterTintStrength ?? .8), 0, 1);
  const brightness = clamp(Number(surface.waterBrightness ?? 0), -50, 50);
  const brightnessFactor = 1 + brightness / 100;
  const data = image.data;

  // Recoloração calculada uma única vez por combinação asset/tint. O luminance
  // original preserva sombras e reflexos claros do pixel art comprado.
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] === 0) continue;
    const r = data[offset], g = data[offset + 1], b = data[offset + 2];
    const luminance = (r * .2126 + g * .7152 + b * .0722) / 255;
    const shade = .32 + luminance * .94;
    const highlight = Math.max(0, (luminance - .76) / .24) * 82;
    const cr = clamp((target.r * shade + highlight) * brightnessFactor, 0, 255);
    const cg = clamp((target.g * shade + highlight) * brightnessFactor, 0, 255);
    const cb = clamp((target.b * shade + highlight) * brightnessFactor, 0, 255);
    data[offset] = Math.round(r * (1 - strength) + cr * strength);
    data[offset + 1] = Math.round(g * (1 - strength) + cg * strength);
    data[offset + 2] = Math.round(b * (1 - strength) + cb * strength);
  }
  ctx.putImageData(image, 0, 0);
}

function buildFrames(asset: WaterAssetDefinition, image: HTMLImageElement, surface: MapBaseSurface) {
  const frames: HTMLCanvasElement[] = [];
  for (let index = 0; index < asset.frameCount; index++) {
    const rect = waterAssetFrameRect(asset, index);
    const canvas = document.createElement('canvas');
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
    colorize(canvas, surface);
    frames.push(canvas);
  }
  return frames;
}

export function clearPreparedWaterFrames(assetId?: string) {
  if (!assetId) {
    preparedCache.clear();
    pendingCache.clear();
    return;
  }
  for (const key of [...preparedCache.keys()]) if (key.startsWith(`${assetId}|`)) preparedCache.delete(key);
  for (const key of [...pendingCache.keys()]) if (key.startsWith(`${assetId}|`)) pendingCache.delete(key);
}

export async function prepareWaterFrames(surface: MapBaseSurface): Promise<PreparedWaterFrames | null> {
  const asset = getWaterAsset(surface.waterAssetId);
  if (!asset) return null;
  const key = surfaceKey(surface, asset);
  const cached = preparedCache.get(key);
  if (cached) return cached;
  const pending = pendingCache.get(key);
  if (pending) return pending;

  const task = loadWaterAssetImage(asset.id).then((image) => {
    if (!image?.complete || image.naturalWidth <= 0) return null;
    const frames = buildFrames(asset, image, surface);
    if (!frames.length) return null;
    const prepared = { asset, frames } satisfies PreparedWaterFrames;
    preparedCache.set(key, prepared);
    trimCache();
    return prepared;
  }).finally(() => pendingCache.delete(key));
  pendingCache.set(key, task);
  return task;
}

export function peekPreparedWaterFrames(surface: MapBaseSurface) {
  const asset = getWaterAsset(surface.waterAssetId);
  if (!asset) return null;
  return preparedCache.get(surfaceKey(surface, asset)) ?? null;
}

export function ensurePreparedWaterFrames(surface: MapBaseSurface, onReady?: () => void) {
  const cached = peekPreparedWaterFrames(surface);
  if (cached) return cached;
  void prepareWaterFrames(surface).then((value) => { if (value) onReady?.(); });
  return null;
}

export function waterFrameIndex(asset: WaterAssetDefinition, surface: MapBaseSurface, now = performance.now()) {
  if (asset.frameCount <= 1) return 0;
  const fps = Math.max(.1, asset.fps * Math.max(.1, Number(surface.waterSpeed) || 1));
  const index = Math.floor(now / (1000 / fps));
  return asset.loop ? index % asset.frameCount : Math.min(asset.frameCount - 1, index);
}

export function drawWaterTextureSurface(
  ctx: CanvasRenderingContext2D,
  map: AscensionMapDocument,
  surface: MapBaseSurface,
  options: {
    screenX: number;
    screenY: number;
    width: number;
    height: number;
    worldX: number;
    worldY: number;
    scale: number;
    now?: number;
    onReady?: () => void;
  },
) {
  ctx.save();
  ctx.globalAlpha *= Math.max(.05, Math.min(1, Number(surface.waterOpacity) || 1));
  ctx.fillStyle = surface.color;
  ctx.fillRect(options.screenX, options.screenY, options.width, options.height);

  const prepared = ensurePreparedWaterFrames(surface, options.onReady);
  if (!prepared) { ctx.restore(); return; }
  const frame = prepared.frames[waterFrameIndex(prepared.asset, surface, options.now) % prepared.frames.length];
  if (!frame) { ctx.restore(); return; }

  const waterScale = clamp(Number(surface.waterScale ?? 1), .1, 8);
  const drawWidth = Math.max(1, frame.width * waterScale * options.scale);
  const drawHeight = Math.max(1, frame.height * waterScale * options.scale);
  const phaseX = ((options.worldX * options.scale) % drawWidth + drawWidth) % drawWidth;
  const phaseY = ((options.worldY * options.scale) % drawHeight + drawHeight) % drawHeight;
  const startX = options.screenX - phaseX;
  const startY = options.screenY - phaseY;
  const endX = options.screenX + options.width + drawWidth;
  const endY = options.screenY + options.height + drawHeight;
  ctx.imageSmoothingEnabled = false;
  for (let y = startY; y < endY; y += drawHeight) {
    for (let x = startX; x < endX; x += drawWidth) ctx.drawImage(frame, x, y, drawWidth + .5, drawHeight + .5);
  }
  ctx.restore();
}
