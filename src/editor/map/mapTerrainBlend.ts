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

type TerrainSource = { id: string; x: number; y: number };

const blendedTileCache = new Map<string, HTMLCanvasElement>();
const MAX_BLEND_CACHE = 700;
const SEARCH_RADIUS = 2;
const BLEND_SIGMA = 0.56;
const MASK_MIN = 36;
const MASK_MAX = 76;

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
  for (let oy = -SEARCH_RADIUS; oy <= SEARCH_RADIUS; oy++) {
    for (let ox = -SEARCH_RADIUS; ox <= SEARCH_RADIUS; ox++) {
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

function warpedWorldPoint(x: number, y: number) {
  // A low-frequency warp makes the transition feel painted instead of following the grid.
  const wx = Math.sin(y * 1.43 + Math.sin(x * .81) * 1.25) * .072 + Math.sin(y * 3.7) * .018;
  const wy = Math.sin(x * 1.57 + Math.cos(y * .76) * 1.18) * .072 + Math.cos(x * 3.35) * .018;
  return { x: x + wx, y: y + wy };
}

function terrainWeights(ids: string[], sources: TerrainSource[], worldX: number, worldY: number) {
  const inverse = 1 / (2 * BLEND_SIGMA * BLEND_SIGMA);
  const values = new Map<string, number>();
  let total = 0;

  for (const id of ids) {
    let minDistanceSq = Number.POSITIVE_INFINITY;
    for (const source of sources) {
      if (source.id !== id) continue;
      const dx = worldX - source.x;
      const dy = worldY - source.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < minDistanceSq) minDistanceSq = distanceSq;
    }
    const weight = Number.isFinite(minDistanceSq) ? Math.exp(-minDistanceSq * inverse) : 0;
    values.set(id, weight);
    total += weight;
  }

  if (total <= 1e-9) return values;
  for (const [id, weight] of values) values.set(id, weight / total);
  return values;
}

function createMaskCanvas(id: string, ids: string[], sources: TerrainSource[], tileX: number, tileY: number, resolution: number) {
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
      const alpha = terrainWeights(ids, sources, world.x, world.y).get(id) ?? 0;
      const offset = (py * resolution + px) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function drawWorldAlignedTerrain(
  ctx: CanvasRenderingContext2D,
  entry: MapPaletteEntry,
  tileX: number,
  tileY: number,
  x: number,
  y: number,
  size: number,
  alpha = 1,
  onReady?: () => void,
  now?: number,
) {
  // Mirror-repeat keeps the texture continuous across every tile boundary.
  // Adjacent edges are literally the same source edge, so no horizontal/vertical seams remain.
  const flipX = Math.abs(tileX) % 2 === 1;
  const flipY = Math.abs(tileY) % 2 === 1;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x + (flipX ? size : 0), y + (flipY ? size : 0));
  ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  drawTerrainAsset(ctx, entry, 0, 0, size + .6, 1, onReady, now);
  ctx.restore();
}

function trimCache() {
  while (blendedTileCache.size > MAX_BLEND_CACHE) {
    const first = blendedTileCache.keys().next().value as string | undefined;
    if (!first) break;
    blendedTileCache.delete(first);
  }
}

function cachedBlendTile(map: AscensionMapDocument, options: TerrainDrawOptions, layer: 'ground' | 'detail', currentId: string) {
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
  // Absolute position is intentional: organic warp and mirror-repeat are world-aligned.
  const cacheKey = `${layer}|${size}|${options.x},${options.y}|${currentId}|${group.signature}|${frameKey}`;
  const cached = blendedTileCache.get(cacheKey);
  if (cached) return cached;

  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = size;
  finalCanvas.height = size;
  const finalCtx = finalCanvas.getContext('2d');
  if (!finalCtx) return null;
  finalCtx.clearRect(0, 0, size, size);
  finalCtx.globalCompositeOperation = 'lighter';

  const maskResolution = Math.max(MASK_MIN, Math.min(MASK_MAX, Math.round(size * 1.15)));

  for (const id of group.ids) {
    const entry = entries.get(id)!;
    const layerCanvas = document.createElement('canvas');
    layerCanvas.width = size;
    layerCanvas.height = size;
    const layerCtx = layerCanvas.getContext('2d');
    if (!layerCtx) continue;

    drawWorldAlignedTerrain(layerCtx, entry, options.x, options.y, 0, 0, size, 1, options.onReady, options.now);
    const mask = createMaskCanvas(id, group.ids, group.sources, options.x, options.y, maskResolution);
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
    drawWorldAlignedTerrain(ctx, current, options.x, options.y, options.screenX, options.screenY, options.tilePixels, alpha, options.onReady, options.now);
    return;
  }

  const blended = cachedBlendTile(map, options, layer, id);
  if (!blended) {
    drawWorldAlignedTerrain(ctx, current, options.x, options.y, options.screenX, options.screenY, options.tilePixels, alpha, options.onReady, options.now);
    return;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(blended, options.screenX, options.screenY, options.tilePixels + .8, options.tilePixels + .8);
  ctx.restore();
}
