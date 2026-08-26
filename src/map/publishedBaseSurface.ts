import { Container, Graphics, Texture, Ticker, TilingSprite } from 'pixi.js';
import { mapBaseSurface } from '../editor/map/mapBaseSurface';
import type { AscensionMapDocument } from '../editor/map/mapEditorTypes';

const cleanupByView = new WeakMap<Container, () => void>();
const textureCache = new Map<string, { low: Texture; high: Texture }>();

function waveTextures(style: 'ocean' | 'deep' | 'swamp') {
  const cached = textureCache.get(style);
  if (cached) return cached;
  const palette = style === 'deep'
    ? { low: 'rgba(56,137,177,.30)', high: 'rgba(113,194,213,.40)' }
    : style === 'swamp'
      ? { low: 'rgba(116,157,135,.24)', high: 'rgba(169,197,160,.30)' }
      : { low: 'rgba(77,169,202,.28)', high: 'rgba(149,222,232,.42)' };

  const make = (stroke: string, offset: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 128, 128);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (let y = 10 + offset; y < 138; y += 24) {
      for (let x = -24; x < 152; x += 48) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 12, y - 4, x + 26, y);
        ctx.stroke();
      }
    }
    return Texture.from(canvas);
  };

  const textures = { low: make(palette.low, 0), high: make(palette.high, 11) };
  textureCache.set(style, textures);
  return textures;
}

/** Adiciona uma única superfície leve abaixo dos chunks de terreno publicados. */
export function addPublishedBaseSurface(view: Container, map: AscensionMapDocument) {
  cleanupPublishedBaseSurface(view);
  const surface = mapBaseSurface(map);
  if (surface.mode === 'none') return;
  const width = map.width * map.tileSize;
  const height = map.height * map.tileSize;

  const base = new Graphics().rect(0, 0, width, height).fill(surface.color);
  base.zIndex = -2_100_000;
  view.addChild(base);
  if (surface.mode !== 'water') return;

  const textures = waveTextures(surface.waterStyle);
  const low = new TilingSprite({ texture: textures.low, width, height });
  const high = new TilingSprite({ texture: textures.high, width, height });
  low.alpha = .72 * surface.waterOpacity;
  high.alpha = .82 * surface.waterOpacity;
  low.zIndex = -2_090_000;
  high.zIndex = -2_080_000;
  view.addChild(low, high);

  const tick = (ticker: Ticker) => {
    const dt = Math.min(50, Math.max(0, ticker.deltaMS));
    const speed = surface.waterSpeed;
    low.tilePosition.x += dt * .012 * speed;
    low.tilePosition.y += dt * .004 * speed;
    high.tilePosition.x -= dt * .018 * speed;
    high.tilePosition.y += dt * .006 * speed;
  };
  Ticker.shared.add(tick);
  cleanupByView.set(view, () => Ticker.shared.remove(tick));
}

export function cleanupPublishedBaseSurface(view: Container | null | undefined) {
  if (!view) return;
  cleanupByView.get(view)?.();
  cleanupByView.delete(view);
}
