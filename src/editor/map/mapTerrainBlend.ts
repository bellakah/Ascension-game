import { drawTerrainAsset } from './mapAssetRenderer';
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

function terrainId(map: AscensionMapDocument, x: number, y: number, layer: 'ground' | 'detail') {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
  const tile = map.tiles[tileKey(x, y)];
  if (layer === 'detail') return tile?.detail ?? null;
  return tile?.ground ?? 'grass';
}

function hash01(a: number, b: number, c: number) {
  let value = Math.imul(a + 374761393, 668265263) ^ Math.imul(b + 1442695041, 2246822519) ^ Math.imul(c + 17, 3266489917);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function edgeSeed(tileX: number, tileY: number, side: 'left' | 'right' | 'top' | 'bottom') {
  if (side === 'left') return { a: tileX, b: tileY, orientation: 1 };
  if (side === 'right') return { a: tileX + 1, b: tileY, orientation: 1 };
  if (side === 'top') return { a: tileX, b: tileY, orientation: 2 };
  return { a: tileX, b: tileY + 1, orientation: 2 };
}

function edgeDepths(tileX: number, tileY: number, side: 'left' | 'right' | 'top' | 'bottom', size: number, band: number) {
  const seed = edgeSeed(tileX, tileY, side);
  const samples = 7;
  const base = size * (0.42 - band * 0.075);
  const wobble = size * (0.12 - band * 0.012);
  return Array.from({ length: samples }, (_, index) => {
    const n1 = hash01(seed.a, seed.b, seed.orientation * 100 + index);
    const n2 = hash01(seed.a + index, seed.b - index, seed.orientation * 200 + band);
    const wave = Math.sin((index / (samples - 1)) * Math.PI * 2 + n2 * 2.2) * wobble * 0.45;
    return Math.max(size * 0.05, base + (n1 - 0.5) * wobble + wave);
  });
}

function clipOrganicEdge(
  ctx: CanvasRenderingContext2D,
  tileX: number,
  tileY: number,
  x: number,
  y: number,
  size: number,
  side: 'left' | 'right' | 'top' | 'bottom',
  band: number,
) {
  const depths = edgeDepths(tileX, tileY, side, size, band);
  const step = size / (depths.length - 1);
  ctx.beginPath();

  if (side === 'left') {
    ctx.moveTo(x, y);
    for (let i = 0; i < depths.length; i++) ctx.lineTo(x + depths[i], y + i * step);
    ctx.lineTo(x, y + size);
  } else if (side === 'right') {
    ctx.moveTo(x + size, y);
    for (let i = 0; i < depths.length; i++) ctx.lineTo(x + size - depths[i], y + i * step);
    ctx.lineTo(x + size, y + size);
  } else if (side === 'top') {
    ctx.moveTo(x, y);
    for (let i = 0; i < depths.length; i++) ctx.lineTo(x + i * step, y + depths[i]);
    ctx.lineTo(x + size, y);
  } else {
    ctx.moveTo(x, y + size);
    for (let i = 0; i < depths.length; i++) ctx.lineTo(x + i * step, y + size - depths[i]);
    ctx.lineTo(x + size, y + size);
  }
  ctx.closePath();
  ctx.clip();
}

function drawOrganicNeighbor(
  ctx: CanvasRenderingContext2D,
  entry: MapPaletteEntry,
  tileX: number,
  tileY: number,
  x: number,
  y: number,
  size: number,
  side: 'left' | 'right' | 'top' | 'bottom',
  alpha: number,
  onReady?: () => void,
  now?: number,
) {
  const bandAlpha = [0.32, 0.21, 0.13, 0.07];
  for (let band = 0; band < bandAlpha.length; band++) {
    ctx.save();
    clipOrganicEdge(ctx, tileX, tileY, x, y, size, side, band);
    drawTerrainAsset(ctx, entry, x, y, size, alpha * bandAlpha[band], onReady, now);
    ctx.restore();
  }
}

function drawOrganicCorner(
  ctx: CanvasRenderingContext2D,
  entry: MapPaletteEntry,
  tileX: number,
  tileY: number,
  x: number,
  y: number,
  size: number,
  corner: 'tl' | 'tr' | 'bl' | 'br',
  alpha: number,
  onReady?: () => void,
  now?: number,
) {
  const seed = hash01(tileX, tileY, corner === 'tl' ? 11 : corner === 'tr' ? 17 : corner === 'bl' ? 23 : 29);
  const radius = size * (0.28 + seed * 0.12);
  const cx = corner.endsWith('l') ? x : x + size;
  const cy = corner.startsWith('t') ? y : y + size;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  drawTerrainAsset(ctx, entry, x, y, size, alpha * 0.16, onReady, now);
  ctx.restore();
}

export function drawBlendedTerrainTile(ctx: CanvasRenderingContext2D, map: AscensionMapDocument, options: TerrainDrawOptions) {
  const layer = options.layer ?? 'ground';
  const id = terrainId(map, options.x, options.y, layer);
  if (!id) return;
  const current = getPaletteEntry(id);
  const alpha = options.alpha ?? 1;

  drawTerrainAsset(ctx, current, options.screenX, options.screenY, options.tilePixels, alpha, options.onReady, options.now);
  if (options.blend === false || options.tilePixels < 5) return;

  const neighbors = [
    { side: 'left' as const, dx: -1, dy: 0 },
    { side: 'right' as const, dx: 1, dy: 0 },
    { side: 'top' as const, dx: 0, dy: -1 },
    { side: 'bottom' as const, dx: 0, dy: 1 },
  ];

  for (const neighbor of neighbors) {
    const neighborId = terrainId(map, options.x + neighbor.dx, options.y + neighbor.dy, layer);
    if (!neighborId || neighborId === id) continue;
    drawOrganicNeighbor(
      ctx,
      getPaletteEntry(neighborId),
      options.x,
      options.y,
      options.screenX,
      options.screenY,
      options.tilePixels,
      neighbor.side,
      alpha,
      options.onReady,
      options.now,
    );
  }

  const corners = [
    { corner: 'tl' as const, dx: -1, dy: -1 },
    { corner: 'tr' as const, dx: 1, dy: -1 },
    { corner: 'bl' as const, dx: -1, dy: 1 },
    { corner: 'br' as const, dx: 1, dy: 1 },
  ];

  for (const corner of corners) {
    const diagonal = terrainId(map, options.x + corner.dx, options.y + corner.dy, layer);
    if (!diagonal || diagonal === id) continue;
    drawOrganicCorner(
      ctx,
      getPaletteEntry(diagonal),
      options.x,
      options.y,
      options.screenX,
      options.screenY,
      options.tilePixels,
      corner.corner,
      alpha,
      options.onReady,
      options.now,
    );
  }
}
