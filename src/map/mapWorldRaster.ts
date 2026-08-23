import { drawObjectAsset } from '../editor/map/mapAssetRenderer';
import { getPaletteEntry } from '../editor/map/mapEditorCatalog';
import { drawBlendedTerrainTile } from '../editor/map/mapTerrainBlend';
import type { AscensionMapDocument, MapObject } from '../editor/map/mapEditorTypes';
import { getPreparedPublishedWorldRuntime } from './publishedMapRuntime';

const MAX_RASTER_WIDTH = 1600;
const MAX_RASTER_HEIGHT = 1200;

const FUNCTIONAL_ASSETS = new Set([
  'elandra', 'rowan', 'mira', 'theo', 'silas',
  'anvil_station', 'alchemy_station',
  'herb', 'iron_vein', 'wood_node',
  'wolf', 'sludge',
]);

export type MapWorldRaster = {
  canvas: HTMLCanvasElement;
  worldWidth: number;
  worldHeight: number;
  scaleX: number;
  scaleY: number;
  mapName: string;
  published: boolean;
};

function rasterSize(worldWidth: number, worldHeight: number) {
  const scale = Math.min(1, MAX_RASTER_WIDTH / Math.max(1, worldWidth), MAX_RASTER_HEIGHT / Math.max(1, worldHeight));
  return {
    width: Math.max(1, Math.round(worldWidth * scale)),
    height: Math.max(1, Math.round(worldHeight * scale)),
  };
}

function drawPublishedTerrain(ctx: CanvasRenderingContext2D, map: AscensionMapDocument, scaleX: number, scaleY: number) {
  const now = performance.now();
  ctx.fillStyle = map.metadata.background || '#527b45';
  ctx.fillRect(0, 0, map.width * map.tileSize * scaleX, map.height * map.tileSize * scaleY);

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = map.tiles[`${x},${y}`] ?? { ground: 'grass' };
      const px = x * map.tileSize * scaleX;
      const py = y * map.tileSize * scaleY;
      const tilePixels = Math.max(1, map.tileSize * Math.min(scaleX, scaleY));
      drawBlendedTerrainTile(ctx, map, {
        x,
        y,
        screenX: px,
        screenY: py,
        tilePixels,
        layer: 'ground',
        now,
      });
      if (tile.detail) {
        drawBlendedTerrainTile(ctx, map, {
          x,
          y,
          screenX: px,
          screenY: py,
          tilePixels,
          layer: 'detail',
          alpha: .8,
          now,
        });
      }
    }
  }
}

function drawPublishedObject(ctx: CanvasRenderingContext2D, map: AscensionMapDocument, object: MapObject, scaleX: number, scaleY: number) {
  if (FUNCTIONAL_ASSETS.has(object.assetId)) return;
  const entry = getPaletteEntry(object.assetId);
  const x = (object.x + .5) * map.tileSize * scaleX;
  const y = (object.y + 1) * map.tileSize * scaleY;
  const tilePixels = map.tileSize * Math.min(scaleX, scaleY);

  ctx.save();
  ctx.translate(x, y);
  if (object.rotation) ctx.rotate(object.rotation * Math.PI / 180);
  drawObjectAsset(ctx, entry, {
    x: 0,
    y: 0,
    tilePixels,
    scale: object.scale ?? 1,
    now: performance.now(),
  });
  ctx.restore();
}

function buildPublishedRaster(map: AscensionMapDocument, worldWidth: number, worldHeight: number): MapWorldRaster {
  const size = rasterSize(worldWidth, worldHeight);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.className = 'map-world-raster';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d')!;
  const scaleX = canvas.width / Math.max(1, worldWidth);
  const scaleY = canvas.height / Math.max(1, worldHeight);

  drawPublishedTerrain(ctx, map, scaleX, scaleY);
  const objects = map.objects.filter((object) => !FUNCTIONAL_ASSETS.has(object.assetId)).sort((a, b) => a.y - b.y);
  for (const object of objects) drawPublishedObject(ctx, map, object, scaleX, scaleY);

  return { canvas, worldWidth, worldHeight, scaleX, scaleY, mapName: map.name, published: true };
}

function buildFallbackRaster(worldWidth: number, worldHeight: number, mapName: string): MapWorldRaster {
  const size = rasterSize(worldWidth, worldHeight);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.className = 'map-world-raster';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d')!;
  const scaleX = canvas.width / Math.max(1, worldWidth);
  const scaleY = canvas.height / Math.max(1, worldHeight);

  ctx.fillStyle = '#4f7947';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(48,93,58,.28)';
  for (let i = 0; i < 52; i++) {
    const x = (80 + (i * 197) % Math.max(100, worldWidth - 160)) * scaleX;
    const y = (70 + (i * 263) % Math.max(100, worldHeight - 140)) * scaleY;
    const radius = (28 + i % 5 * 8) * Math.min(scaleX, scaleY);
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  }
  const roadLeft = worldWidth * .345 * scaleX;
  const roadWidth = worldWidth * .19 * scaleX;
  ctx.fillStyle = 'rgba(166,132,84,.82)';
  ctx.fillRect(roadLeft, 0, roadWidth, canvas.height);
  ctx.strokeStyle = 'rgba(235,211,156,.18)';
  ctx.lineWidth = Math.max(1, 4 * Math.min(scaleX, scaleY));
  ctx.setLineDash([12, 12]);
  ctx.beginPath();
  ctx.moveTo((roadLeft + roadWidth / 2), 0);
  ctx.lineTo((roadLeft + roadWidth / 2), canvas.height);
  ctx.stroke();
  ctx.setLineDash([]);

  return { canvas, worldWidth, worldHeight, scaleX, scaleY, mapName, published: false };
}

export function createMapWorldRaster(worldWidth: number, worldHeight: number, fallbackName: string): MapWorldRaster {
  const runtime = getPreparedPublishedWorldRuntime();
  if (runtime) return buildPublishedRaster(runtime.document, runtime.width, runtime.height);
  return buildFallbackRaster(worldWidth, worldHeight, fallbackName);
}

export function drawMapWorldCrop(
  ctx: CanvasRenderingContext2D,
  raster: MapWorldRaster,
  centerX: number,
  centerY: number,
  worldWidth: number,
  outputWidth: number,
  outputHeight: number,
) {
  const viewWorldWidth = Math.max(1, worldWidth);
  const viewWorldHeight = viewWorldWidth * outputHeight / Math.max(1, outputWidth);
  const left = centerX - viewWorldWidth / 2;
  const top = centerY - viewWorldHeight / 2;
  const right = left + viewWorldWidth;
  const bottom = top + viewWorldHeight;

  ctx.fillStyle = '#08171d';
  ctx.fillRect(0, 0, outputWidth, outputHeight);

  const ix0 = Math.max(0, left);
  const iy0 = Math.max(0, top);
  const ix1 = Math.min(raster.worldWidth, right);
  const iy1 = Math.min(raster.worldHeight, bottom);
  if (ix1 <= ix0 || iy1 <= iy0) return;

  const sx = ix0 * raster.scaleX;
  const sy = iy0 * raster.scaleY;
  const sw = (ix1 - ix0) * raster.scaleX;
  const sh = (iy1 - iy0) * raster.scaleY;
  const dx = (ix0 - left) / viewWorldWidth * outputWidth;
  const dy = (iy0 - top) / viewWorldHeight * outputHeight;
  const dw = (ix1 - ix0) / viewWorldWidth * outputWidth;
  const dh = (iy1 - iy0) / viewWorldHeight * outputHeight;

  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(raster.canvas, sx, sy, sw, sh, dx, dy, dw, dh);
}
