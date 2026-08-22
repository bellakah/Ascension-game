import { drawTerrainAsset, getMapAssetImage } from './mapAssetRenderer';
import { getPaletteEntry } from './mapEditorCatalog';
import type { AscensionMapDocument, MapPaletteEntry } from './mapEditorTypes';
import { tileKey } from './mapEditorTypes';

export type TerrainDrawOptions = {
  x: number;
  y: number;
  screenX: number;
  screenY: number;
  tilePixels: number;
  layer?: 'ground' | 'detail';
  alpha?: number;
  onReady?: () => void;
  now?: number;
  blend?: boolean;
};

type TerrainSource = {
  id: string;
  x: number;
  y: number;
};

const blendedTileCache = new Map<string, HTMLCanvasElement>();
const MAX_BLEND_CACHE = 420;
const BLEND_RADIUS = 0.94;
const MASK_MIN = 28;
const MASK_MAX = 56;

function terrainId(map: AscensionMapDocument, x: number, y: number, layer: 'ground' | 'detail') {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
  const tile = map.tiles[tileKey(x, y)];
  if (layer === 'detail') return tile?.detail ?? null;
  return tile?.ground ?? 'grass';
}

function neighborhood(map: AscensionMapDocument, tileX: number, tileY: number, layer: 'ground' | 'detail') {
  const sources: TerrainSource[] = [];
  const signature: string[] = [];
  const ids = new Set<string>();
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const x = tileX + ox;
      const y = tileY + oy;
      const id = terrainId(map, x, y, layer);
      signature.push(id ?? '-');
      if (!id) continue;
      ids.add(id);
      sources.push({ id, x: x + .5, y: y + .5 });
    }
  }
  return { sources, signature: signature.join(','), ids: [...ids] };
}

function smoothKernel(distance: number) {
  if (distance >= BLEND_RADIUS) return 0;
  const t = 1 - distance / BLEND_RADIUS;
  const smooth = t * t * (3 - 2 * t);
  return smooth * smooth;
}

function warpedWorldPoint(x: number, y: number) {
  // Small continuous warp breaks geometric-looking borders without reintroducing tile steps.
  const wx = Math.sin(y * 2.35 + Math.sin(x * 1.31) * .75) * .026;
  const wy = Math.sin(x * 2.61 + Math.cos(y * 1.47) * .72) * .026;
  return { x: x + wx, y: y + wy };
}

function createMaskCanvas(
  id: string,
  sources: TerrainSource[],
  tileX: number,
  tileY: number,
  resolution: number,
) {
  const canvas = document.createElement('canvas');
  canvas.width = resolution;
  canvas.height = resolution;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const image = ctx.createImageData(resolution, resolution);
  const data = image.data;

  for (let py = 0; py < resolution; py++) {
    for (let px = 0; px < resolution; px++) {
      const u = (px + .5) / resolution;
      const v = (py + .5) / resolution;
      const world = warpedWorldPoint(tileX + u, tileY + v);
      let wanted = 0;
      let total = 0;

      for (const source of sources) {
        const distance = Math.hypot(world.x - source.x, world.y - source.y);
        const weight = smoothKernel(distance);
        if (weight <= 0) continue;
        total += weight;
        if (source.id === id) wanted += weight;
      }

      const alpha = total > 1e-8 ? Math.max(0, Math.min(1, wanted / total)) : 0;
      const offset = (py * resolution + px) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = Math.round(alpha * 255);
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

function trimCache() {
  while (blendedTileCache.size > MAX_BLEND_CACHE) {
    const first = blendedTileCache.keys().next().value as string | undefined;
    if (!first) break;
    blendedTileCache.delete(first);
  }
}

function cachedBlendTile(
  map: AscensionMapDocument,
  options: TerrainDrawOptions,
  layer: 'ground' | 'detail',
  currentId: string,
) {
  const group = neighborhood(map, options.x, options.y, layer);
  if (group.ids.length <= 1) return null;

  const entries = new Map<string, MapPaletteEntry>();
  let animated = false;
  for (const id of group.ids) {
    const entry = getPaletteEntry(id);
    entries.set(id, entry);
    animated ||= Boolean(entry.sprite?.animation?.frames?.length);
    const image = getMapAssetImage(entry, options.onReady);
    if (image && (!image.complete || image.naturalWidth <= 0)) return null;
  }

  const size = Math.max(2, Math.ceil(options.tilePixels + .75));
  const frameKey = animated ? Math.floor((options.now ?? performance.now()) / 110) : 0;
  const cacheKey = `${layer}|${size}|${currentId}|${group.signature}|${frameKey}`;
  const cached = blendedTileCache.get(cacheKey);
  if (cached) return cached;

  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = size;
  finalCanvas.height = size;
  const finalCtx = finalCanvas.getContext('2d');
  if (!finalCtx) return null;
  finalCtx.clearRect(0, 0, size, size);
  finalCtx.globalCompositeOperation = 'lighter';

  const maskResolution = Math.max(MASK_MIN, Math.min(MASK_MAX, Math.round(size * .72)));

  for (const id of group.ids) {
    const entry = entries.get(id)!;
    const layerCanvas = document.createElement('canvas');
    layerCanvas.width = size;
    layerCanvas.height = size;
    const layerCtx = layerCanvas.getContext('2d');
    if (!layerCtx) continue;

    drawTerrainAsset(layerCtx, entry, 0, 0, size, 1, options.onReady, options.now);
    const mask = createMaskCanvas(id, group.sources, options.x, options.y, maskResolution);
    layerCtx.globalCompositeOperation = 'destination-in';
    layerCtx.imageSmoothingEnabled = true;
    layerCtx.drawImage(mask, 0, 0, size, size);

    finalCtx.drawImage(layerCanvas, 0, 0);
  }

  finalCtx.globalCompositeOperation = 'source-over';
  blendedTileCache.set(cacheKey, finalCanvas);
  trimCache();
  return finalCanvas;
}

export function clearTerrainBlendCache() {
  blendedTileCache.clear();
}

export function drawBlendedTerrainTile(ctx: CanvasRenderingContext2D, map: AscensionMapDocument, options: TerrainDrawOptions) {
  const layer = options.layer ?? 'ground';
  const id = terrainId(map, options.x, options.y, layer);
  if (!id) return;
  const current = getPaletteEntry(id);
  const alpha = options.alpha ?? 1;

  if (options.blend === false || options.tilePixels < 5) {
    drawTerrainAsset(ctx, current, options.screenX, options.screenY, options.tilePixels, alpha, options.onReady, options.now);
    return;
  }

  const blended = cachedBlendTile(map, options, layer, id);
  if (!blended) {
    drawTerrainAsset(ctx, current, options.screenX, options.screenY, options.tilePixels, alpha, options.onReady, options.now);
    return;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = true;
  // Slight overlap avoids hairline seams between independently rendered visible tiles.
  ctx.drawImage(blended, options.screenX, options.screenY, options.tilePixels + .8, options.tilePixels + .8);
  ctx.restore();
}
