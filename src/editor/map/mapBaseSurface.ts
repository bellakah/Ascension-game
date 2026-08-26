import type { AscensionMapDocument, MapBaseSurface } from './mapEditorTypes';

export const DEFAULT_WATER: MapBaseSurface = {
  mode: 'water',
  color: '#225b78',
  waterStyle: 'ocean',
  waterSpeed: 1,
  waterOpacity: 1,
  collision: 'blocked',
};

export const DEFAULT_COLOR_SURFACE: MapBaseSurface = {
  mode: 'color',
  color: '#527b45',
  waterStyle: 'ocean',
  waterSpeed: 1,
  waterOpacity: 1,
  collision: 'walkable',
};

export function normalizeBaseSurface(input: Partial<MapBaseSurface> | null | undefined, legacyBackground = '#527b45'): MapBaseSurface {
  const mode = input?.mode === 'water' || input?.mode === 'none' ? input.mode : 'color';
  return {
    mode,
    color: String(input?.color || legacyBackground || '#527b45'),
    waterStyle: input?.waterStyle === 'deep' || input?.waterStyle === 'swamp' ? input.waterStyle : 'ocean',
    waterSpeed: Math.max(.1, Math.min(4, Number(input?.waterSpeed) || 1)),
    waterOpacity: Math.max(.05, Math.min(1, Number(input?.waterOpacity) || 1)),
    collision: input?.collision === 'walkable' || input?.collision === 'swimmable' ? input.collision : (mode === 'water' ? 'blocked' : 'walkable'),
  };
}

export function mapBaseSurface(map: AscensionMapDocument) {
  return normalizeBaseSurface(map.metadata.baseSurface, map.metadata.background);
}

function waterPalette(style: MapBaseSurface['waterStyle']) {
  if (style === 'deep') return { base: '#123f61', mid: '#1c5f86', light: '#4d9fbd' };
  if (style === 'swamp') return { base: '#365c54', mid: '#4d7869', light: '#7ba48b' };
  return { base: '#23698d', mid: '#3187a8', light: '#77c7d6' };
}

/**
 * Desenha uma superfície contínua em coordenadas de mundo. Não cria sprites por tile,
 * não aloca canvas por célula e só trabalha no viewport recebido.
 */
export function drawMapBaseSurface(
  ctx: CanvasRenderingContext2D,
  map: AscensionMapDocument,
  options: { screenX: number; screenY: number; width: number; height: number; worldX: number; worldY: number; scale: number; now?: number },
) {
  const surface = mapBaseSurface(map);
  if (surface.mode === 'none') return;
  ctx.save();
  if (surface.mode === 'color') {
    ctx.fillStyle = surface.color;
    ctx.fillRect(options.screenX, options.screenY, options.width, options.height);
    ctx.restore();
    return;
  }

  const palette = waterPalette(surface.waterStyle);
  const now = options.now ?? performance.now();
  const t = now * .001 * surface.waterSpeed;
  ctx.globalAlpha *= surface.waterOpacity;
  ctx.fillStyle = palette.base;
  ctx.fillRect(options.screenX, options.screenY, options.width, options.height);

  // O padrão é calculado em world-space para não "grudar" na câmera.
  const waveGap = Math.max(18, map.tileSize * .72) * options.scale;
  const waveWidth = Math.max(16, map.tileSize * .8) * options.scale;
  const waveHeight = Math.max(2, map.tileSize * .07) * options.scale;
  const startWorldX = options.worldX;
  const startWorldY = options.worldY;
  const phaseX = ((startWorldX * options.scale) % waveGap + waveGap) % waveGap;
  const phaseY = ((startWorldY * options.scale) % waveGap + waveGap) % waveGap;

  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1, options.scale * 1.15);
  for (let row = -2; row < options.height / waveGap + 3; row++) {
    const y = options.screenY + row * waveGap - phaseY;
    const worldRow = Math.floor((startWorldY + row * waveGap / options.scale) / Math.max(1, map.tileSize));
    const drift = Math.sin(t * 1.5 + worldRow * .73) * waveGap * .22;
    for (let col = -2; col < options.width / waveGap + 3; col++) {
      const x = options.screenX + col * waveGap - phaseX + drift + (row % 2 ? waveGap * .42 : 0);
      const seed = Math.sin((worldRow * 53 + col * 97) * .17);
      const lift = Math.sin(t * 2.2 + seed * 2.8 + col * .43) * waveHeight * .65;
      ctx.strokeStyle = seed > -.12 ? palette.light : palette.mid;
      ctx.globalAlpha = surface.waterOpacity * (seed > -.12 ? .42 : .28);
      ctx.beginPath();
      ctx.moveTo(x - waveWidth * .48, y + lift);
      ctx.quadraticCurveTo(x, y - waveHeight + lift, x + waveWidth * .48, y + lift);
      ctx.stroke();
    }
  }

  // brilho lento e amplo, sem filtros caros.
  ctx.globalAlpha = surface.waterOpacity * .08;
  ctx.fillStyle = palette.light;
  const sheen = (Math.sin(t * .55) * .5 + .5) * Math.max(10, map.tileSize * options.scale);
  for (let y = options.screenY - 40; y < options.screenY + options.height + 40; y += Math.max(42, map.tileSize * 2.1 * options.scale)) {
    ctx.fillRect(options.screenX - 20 + sheen, y, options.width * .42, Math.max(1, options.scale * 1.2));
  }
  ctx.restore();
}

export function baseSurfaceBlocksPoint(map: AscensionMapDocument, x: number, y: number) {
  const surface = mapBaseSurface(map);
  if (surface.mode !== 'water' || surface.collision !== 'blocked') return false;
  const tileX = Math.floor(x), tileY = Math.floor(y);
  const tile = map.tiles[`${tileX},${tileY}`];
  return !tile?.ground;
}
