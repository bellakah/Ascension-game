import { drawTerrainAsset, getMapAssetImage } from './mapAssetRenderer';
import { getPaletteEntry } from './mapEditorCatalog';
import { drawMapBaseSurface } from './mapBaseSurface';
import { isTraditionalTileEntry } from './mapTilesetStore';
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

type TerrainSource = { x: number; y: number };
type TerrainNeighborhood = { ids: string[]; sources: TerrainSource[][] };
type CanvasCacheEntry = { canvas: HTMLCanvasElement; animated: boolean; frameKey: number; fps: number };

const blendedTileCache = new Map<string, CanvasCacheEntry>();
const plainTileCache = new Map<string, CanvasCacheEntry>();
const terrainCodes = new Map<string, number>();
let nextTerrainCode = 1;

const MAX_BLEND_CACHE = 2800;
const MAX_PLAIN_CACHE = 320;
const SEARCH_RADIUS = 2;
const BLEND_SIGMA = 0.62;
const MASK_MIN = 14;
const MASK_MAX = 44;

function terrainId(map: AscensionMapDocument, x: number, y: number, layer: 'ground' | 'detail') {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
  const tile = map.tiles[tileKey(x, y)];
  if (layer === 'detail') return tile?.detail ?? null;
  return tile?.ground ?? null;
}

function terrainCode(id: string | null) {
  if (!id) return 0;
  const existing = terrainCodes.get(id);
  if (existing) return existing;
  const next = nextTerrainCode++;
  terrainCodes.set(id, next);
  return next;
}

function localFingerprint(map: AscensionMapDocument, tileX: number, tileY: number, layer: 'ground' | 'detail', currentId: string) {
  let hash = 2166136261 >>> 0;
  let mixed = false;
  for (let oy = -SEARCH_RADIUS; oy <= SEARCH_RADIUS; oy++) {
    for (let ox = -SEARCH_RADIUS; ox <= SEARCH_RADIUS; ox++) {
      const id = terrainId(map, tileX + ox, tileY + oy, layer);
      if (id && id !== currentId) mixed = true;
      hash ^= terrainCode(id);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
  }
  return { hash, mixed };
}

function neighborhood(map: AscensionMapDocument, tileX: number, tileY: number, layer: 'ground' | 'detail'): TerrainNeighborhood {
  const ids: string[] = [];
  const sources: TerrainSource[][] = [];
  const indexById = new Map<string, number>();
  for (let oy = -SEARCH_RADIUS; oy <= SEARCH_RADIUS; oy++) {
    for (let ox = -SEARCH_RADIUS; ox <= SEARCH_RADIUS; ox++) {
      const x = tileX + ox, y = tileY + oy;
      const id = terrainId(map, x, y, layer);
      if (!id) continue;
      let index = indexById.get(id);
      if (index === undefined) {
        index = ids.length; indexById.set(id, index); ids.push(id); sources.push([]);
      }
      sources[index].push({ x: x + .5, y: y + .5 });
    }
  }
  return { ids, sources };
}

function warpedWorldPoint(x: number, y: number) {
  const wx = Math.sin(y * 1.43 + Math.sin(x * .81) * 1.25) * .082 + Math.sin(y * 3.7) * .020;
  const wy = Math.sin(x * 1.57 + Math.cos(y * .76) * 1.18) * .082 + Math.cos(x * 3.35) * .020;
  return { x: x + wx, y: y + wy };
}

function createMaskCanvases(group: TerrainNeighborhood, tileX: number, tileY: number, resolution: number) {
  const canvases = group.ids.map(() => {
    const canvas = document.createElement('canvas'); canvas.width = resolution; canvas.height = resolution;
    const ctx = canvas.getContext('2d')!; const image = ctx.createImageData(resolution, resolution);
    return { canvas, ctx, image, data: image.data };
  });
  const weights = new Float32Array(group.ids.length);
  const inverse = 1 / (2 * BLEND_SIGMA * BLEND_SIGMA);
  for (let py = 0; py < resolution; py++) for (let px = 0; px < resolution; px++) {
    const u = (px + .5) / resolution, v = (py + .5) / resolution;
    const world = warpedWorldPoint(tileX + u, tileY + v);
    let total = 0;
    for (let index = 0; index < group.sources.length; index++) {
      let minDistanceSq = Number.POSITIVE_INFINITY;
      for (const source of group.sources[index]) {
        const dx = world.x - source.x, dy = world.y - source.y, distanceSq = dx * dx + dy * dy;
        if (distanceSq < minDistanceSq) minDistanceSq = distanceSq;
      }
      const weight = Number.isFinite(minDistanceSq) ? Math.exp(-minDistanceSq * inverse) : 0;
      weights[index] = weight; total += weight;
    }
    const offset = (py * resolution + px) * 4;
    for (let index = 0; index < canvases.length; index++) {
      const data = canvases[index].data;
      const alpha = total > 1e-9 ? weights[index] / total : 0;
      data[offset] = 255; data[offset + 1] = 255; data[offset + 2] = 255; data[offset + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
    }
  }
  canvases.forEach((value) => value.ctx.putImageData(value.image, 0, 0));
  return canvases.map((value) => value.canvas);
}

function frameKeyFor(fps: number, now = performance.now()) {
  if (fps <= 0) return 0;
  const frameMs = Math.max(55, 1000 / Math.max(1, fps));
  return Math.floor(now / frameMs);
}
function trimCache<T>(cache: Map<string, T>, maximum: number) {
  while (cache.size > maximum) { const first = cache.keys().next().value as string | undefined; if (!first) break; cache.delete(first); }
}
function renderSizeFor(tilePixels: number) {
  if (tilePixels <= 10) return 8; if (tilePixels <= 14) return 12; if (tilePixels <= 20) return 16; if (tilePixels <= 28) return 24; if (tilePixels <= 40) return 32; if (tilePixels <= 56) return 48; return 64;
}

function plainTerrainTile(entry: MapPaletteEntry, tileX: number, tileY: number, size: number, onReady?: () => void, now?: number) {
  const image = getMapAssetImage(entry, onReady);
  if (image && (!image.complete || image.naturalWidth <= 0)) return null;
  const flipX = Math.abs(tileX) % 2 === 1, flipY = Math.abs(tileY) % 2 === 1;
  const fps = entry.sprite?.animation?.frames?.length ? Math.max(1, entry.sprite.animation.fps || 8) : 0;
  const frameKey = frameKeyFor(fps, now), key = `${entry.id}|${size}|${flipX ? 1 : 0}${flipY ? 1 : 0}`;
  const cached = plainTileCache.get(key);
  if (cached && (!cached.animated || cached.frameKey === frameKey)) return cached.canvas;
  const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d'); if (!ctx) return null;
  ctx.translate(flipX ? size : 0, flipY ? size : 0); ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  drawTerrainAsset(ctx, entry, 0, 0, size + .6, 1, onReady, now);
  plainTileCache.set(key, { canvas, animated: fps > 0, frameKey, fps }); trimCache(plainTileCache, MAX_PLAIN_CACHE);
  return canvas;
}

function drawWorldAlignedTerrain(ctx: CanvasRenderingContext2D, entry: MapPaletteEntry, tileX: number, tileY: number, x: number, y: number, size: number, alpha = 1, onReady?: () => void, now?: number) {
  const cacheSize = renderSizeFor(size), cached = plainTerrainTile(entry, tileX, tileY, cacheSize, onReady, now);
  ctx.save(); ctx.globalAlpha *= alpha;
  if (cached) { ctx.imageSmoothingEnabled = true; ctx.drawImage(cached, x, y, size + .7, size + .7); }
  else {
    const flipX = Math.abs(tileX) % 2 === 1, flipY = Math.abs(tileY) % 2 === 1;
    ctx.translate(x + (flipX ? size : 0), y + (flipY ? size : 0)); ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    drawTerrainAsset(ctx, entry, 0, 0, size + .7, 1, onReady, now);
  }
  ctx.restore();
}

function cachedBlendTile(map: AscensionMapDocument, options: TerrainDrawOptions, layer: 'ground' | 'detail', currentId: string, fingerprint: number) {
  const size = renderSizeFor(options.tilePixels), baseKey = `${map.id}|${layer}|${size}|${options.x},${options.y}|${fingerprint}`;
  const existing = blendedTileCache.get(baseKey);
  if (existing) { const frameKey = frameKeyFor(existing.fps, options.now); if (!existing.animated || existing.frameKey === frameKey) return existing.canvas; }
  const group = neighborhood(map, options.x, options.y, layer);
  if (group.ids.length <= 1) return null;
  const entries: MapPaletteEntry[] = []; let maxFps = 0;
  for (const id of group.ids) {
    const entry = getPaletteEntry(id); entries.push(entry);
    if (entry.sprite?.animation?.frames?.length) maxFps = Math.max(maxFps, entry.sprite.animation.fps || 8);
    const image = getMapAssetImage(entry, options.onReady); if (image && (!image.complete || image.naturalWidth <= 0)) return null;
  }
  const finalCanvas = document.createElement('canvas'); finalCanvas.width = size; finalCanvas.height = size;
  const finalCtx = finalCanvas.getContext('2d'); if (!finalCtx) return null;
  finalCtx.clearRect(0, 0, size, size); finalCtx.globalCompositeOperation = 'lighter';
  const maskResolution = Math.max(MASK_MIN, Math.min(MASK_MAX, Math.round(size * .72))), masks = createMaskCanvases(group, options.x, options.y, maskResolution);
  for (let index = 0; index < entries.length; index++) {
    const layerCanvas = document.createElement('canvas'); layerCanvas.width = size; layerCanvas.height = size;
    const layerCtx = layerCanvas.getContext('2d'); if (!layerCtx) continue;
    drawWorldAlignedTerrain(layerCtx, entries[index], options.x, options.y, 0, 0, size, 1, options.onReady, options.now);
    layerCtx.globalCompositeOperation = 'destination-in'; layerCtx.imageSmoothingEnabled = true; layerCtx.drawImage(masks[index], 0, 0, size, size); finalCtx.drawImage(layerCanvas, 0, 0);
  }
  finalCtx.globalCompositeOperation = 'source-over';
  const frameKey = frameKeyFor(maxFps, options.now);
  blendedTileCache.set(baseKey, { canvas: finalCanvas, animated: maxFps > 0, frameKey, fps: maxFps }); trimCache(blendedTileCache, MAX_BLEND_CACHE);
  return finalCanvas;
}

export function clearTerrainBlendCache() { blendedTileCache.clear(); plainTileCache.clear(); }

export function drawBlendedTerrainTile(ctx: CanvasRenderingContext2D, map: AscensionMapDocument, options: TerrainDrawOptions) {
  const layer = options.layer ?? 'ground';
  const id = terrainId(map, options.x, options.y, layer);
  if (!id) {
    if (layer === 'ground') {
      const worldScale = options.tilePixels / Math.max(1, map.tileSize);
      drawMapBaseSurface(ctx, map, { screenX: options.screenX, screenY: options.screenY, width: options.tilePixels + .8, height: options.tilePixels + .8, worldX: options.x * map.tileSize, worldY: options.y * map.tileSize, scale: worldScale, now: options.now });
    }
    return;
  }
  const current = getPaletteEntry(id), alpha = options.alpha ?? 1;

  // Tiles do Tileset tradicional são literais: nada de blend, espelhamento ou
  // suavização orgânica. O sourceRect escolhido é desenhado exatamente como está.
  if (isTraditionalTileEntry(current)) {
    drawTerrainAsset(ctx, current, options.screenX, options.screenY, options.tilePixels + .5, alpha, options.onReady, options.now);
    return;
  }

  if (options.blend === false || options.tilePixels < 5) {
    drawWorldAlignedTerrain(ctx, current, options.x, options.y, options.screenX, options.screenY, options.tilePixels, alpha, options.onReady, options.now); return;
  }
  const fingerprint = localFingerprint(map, options.x, options.y, layer, id);
  if (!fingerprint.mixed) { drawWorldAlignedTerrain(ctx, current, options.x, options.y, options.screenX, options.screenY, options.tilePixels, alpha, options.onReady, options.now); return; }
  const blended = cachedBlendTile(map, options, layer, id, fingerprint.hash);
  if (!blended) { drawWorldAlignedTerrain(ctx, current, options.x, options.y, options.screenX, options.screenY, options.tilePixels, alpha, options.onReady, options.now); return; }
  ctx.save(); ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = true; ctx.drawImage(blended, options.screenX, options.screenY, options.tilePixels + .8, options.tilePixels + .8); ctx.restore();
}
