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

function drawNeighborStrip(
  ctx: CanvasRenderingContext2D,
  entry: MapPaletteEntry,
  x: number,
  y: number,
  size: number,
  side: 'left' | 'right' | 'top' | 'bottom',
  alpha: number,
  onReady?: () => void,
  now?: number,
) {
  const steps = size < 18 ? 2 : size < 36 ? 3 : 4;
  const depth = Math.max(2, size * .23);
  for (let step = 0; step < steps; step++) {
    const start = step / steps;
    const end = (step + 1) / steps;
    const stripAlpha = alpha * (.34 - step * (.24 / Math.max(1, steps - 1)));
    ctx.save();
    if (side === 'left') ctx.beginPath(), ctx.rect(x, y, depth * end, size), ctx.clip();
    if (side === 'right') ctx.beginPath(), ctx.rect(x + size - depth * end, y, depth * end, size), ctx.clip();
    if (side === 'top') ctx.beginPath(), ctx.rect(x, y, size, depth * end), ctx.clip();
    if (side === 'bottom') ctx.beginPath(), ctx.rect(x, y + size - depth * end, size, depth * end), ctx.clip();
    drawTerrainAsset(ctx, entry, x, y, size, stripAlpha, onReady, now);
    ctx.restore();
    if (start > .95) break;
  }
}

function drawCorner(
  ctx: CanvasRenderingContext2D,
  entry: MapPaletteEntry,
  x: number,
  y: number,
  size: number,
  corner: 'tl' | 'tr' | 'bl' | 'br',
  alpha: number,
  onReady?: () => void,
  now?: number,
) {
  const radius = Math.max(2, size * .22);
  const cx = corner.endsWith('l') ? x : x + size;
  const cy = corner.startsWith('t') ? y : y + size;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  drawTerrainAsset(ctx, entry, x, y, size, alpha * .16, onReady, now);
  ctx.restore();
}

export function drawBlendedTerrainTile(ctx: CanvasRenderingContext2D, map: AscensionMapDocument, options: TerrainDrawOptions) {
  const layer = options.layer ?? 'ground';
  const id = terrainId(map, options.x, options.y, layer);
  if (!id) return;
  const current = getPaletteEntry(id);
  const alpha = options.alpha ?? 1;
  drawTerrainAsset(ctx, current, options.screenX, options.screenY, options.tilePixels, alpha, options.onReady, options.now);
  if (options.blend === false) return;

  const neighbors = [
    { side: 'left' as const, dx: -1, dy: 0 },
    { side: 'right' as const, dx: 1, dy: 0 },
    { side: 'top' as const, dx: 0, dy: -1 },
    { side: 'bottom' as const, dx: 0, dy: 1 },
  ];
  for (const neighbor of neighbors) {
    const neighborId = terrainId(map, options.x + neighbor.dx, options.y + neighbor.dy, layer);
    if (!neighborId || neighborId === id) continue;
    drawNeighborStrip(ctx, getPaletteEntry(neighborId), options.screenX, options.screenY, options.tilePixels, neighbor.side, alpha, options.onReady, options.now);
  }

  const corners = [
    { corner: 'tl' as const, dx: -1, dy: -1 },
    { corner: 'tr' as const, dx: 1, dy: -1 },
    { corner: 'bl' as const, dx: -1, dy: 1 },
    { corner: 'br' as const, dx: 1, dy: 1 },
  ];
  for (const corner of corners) {
    const neighborId = terrainId(map, options.x + corner.dx, options.y + corner.dy, layer);
    if (!neighborId || neighborId === id) continue;
    drawCorner(ctx, getPaletteEntry(neighborId), options.screenX, options.screenY, options.tilePixels, corner.corner, alpha, options.onReady, options.now);
  }
}
