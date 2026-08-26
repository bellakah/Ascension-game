import type { AscensionMapDocument, MapBaseSurface } from './mapEditorTypes';
import { drawWaterTextureSurface } from './mapWaterRenderer';

export const DEFAULT_WATER: MapBaseSurface = {
  mode: 'water',
  color: '#225b78',
  waterStyle: 'ocean',
  waterSpeed: 1,
  waterOpacity: 1,
  waterScale: 1,
  waterTintMode: 'original',
  waterTint: '#2f9fca',
  waterTintStrength: .8,
  waterBrightness: 0,
  collision: 'blocked',
};

export const DEFAULT_COLOR_SURFACE: MapBaseSurface = {
  mode: 'color',
  color: '#527b45',
  waterStyle: 'ocean',
  waterSpeed: 1,
  waterOpacity: 1,
  waterScale: 1,
  waterTintMode: 'original',
  waterTint: '#2f9fca',
  waterTintStrength: .8,
  waterBrightness: 0,
  collision: 'walkable',
};

export function normalizeBaseSurface(input: Partial<MapBaseSurface> | null | undefined, legacyBackground = '#527b45'): MapBaseSurface {
  const mode = input?.mode === 'water' || input?.mode === 'none' ? input.mode : 'color';
  return {
    mode,
    color: String(input?.color || legacyBackground || '#527b45'),
    waterStyle: input?.waterStyle === 'deep' || input?.waterStyle === 'swamp' ? input.waterStyle : 'ocean',
    waterAssetId: input?.waterAssetId ? String(input.waterAssetId) : undefined,
    waterSpeed: Math.max(.1, Math.min(4, Number(input?.waterSpeed) || 1)),
    waterOpacity: Math.max(.05, Math.min(1, Number(input?.waterOpacity) || 1)),
    waterScale: Math.max(.1, Math.min(8, Number(input?.waterScale) || 1)),
    waterTintMode: input?.waterTintMode === 'colorize' ? 'colorize' : 'original',
    waterTint: String(input?.waterTint || '#2f9fca'),
    waterTintStrength: Math.max(0, Math.min(1, Number.isFinite(Number(input?.waterTintStrength)) ? Number(input?.waterTintStrength) : .8)),
    waterBrightness: Math.max(-50, Math.min(50, Number(input?.waterBrightness) || 0)),
    collision: input?.collision === 'walkable' || input?.collision === 'swimmable' ? input.collision : (mode === 'water' ? 'blocked' : 'walkable'),
  };
}

export function mapBaseSurface(map: AscensionMapDocument) {
  return normalizeBaseSurface(map.metadata.baseSurface, map.metadata.background);
}

/**
 * Desenha a Base Surface em coordenadas de mundo. Água por asset usa frames
 * cacheados; quando ainda não carregou, a cor de fallback é usada sem bloquear
 * o Editor. Nenhum efeito procedural é calculado por frame.
 */
export function drawMapBaseSurface(
  ctx: CanvasRenderingContext2D,
  map: AscensionMapDocument,
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
  const surface = mapBaseSurface(map);
  if (surface.mode === 'none') return;
  if (surface.mode === 'color') {
    ctx.save();
    ctx.fillStyle = surface.color;
    ctx.fillRect(options.screenX, options.screenY, options.width, options.height);
    ctx.restore();
    return;
  }
  drawWaterTextureSurface(ctx, map, surface, options);
}

export function baseSurfaceBlocksPoint(map: AscensionMapDocument, x: number, y: number) {
  const surface = mapBaseSurface(map);
  if (surface.mode !== 'water' || surface.collision !== 'blocked') return false;
  const tileX = Math.floor(x), tileY = Math.floor(y);
  const tile = map.tiles[`${tileX},${tileY}`];
  return !tile?.ground;
}
