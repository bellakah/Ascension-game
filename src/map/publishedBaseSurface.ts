import { Container, Graphics, Texture, Ticker, TilingSprite } from 'pixi.js';
import { mapBaseSurface } from '../editor/map/mapBaseSurface';
import { prepareWaterFrames, waterFrameIndex } from '../editor/map/mapWaterRenderer';
import type { AscensionMapDocument } from '../editor/map/mapEditorTypes';

const cleanupByView = new WeakMap<Container, () => void>();

/**
 * Adiciona uma única Base Surface abaixo dos chunks publicados. Água real usa
 * somente um TilingSprite; a textura só troca quando o frame da animação muda.
 */
export function addPublishedBaseSurface(view: Container, map: AscensionMapDocument) {
  cleanupPublishedBaseSurface(view);
  const surface = mapBaseSurface(map);
  if (surface.mode === 'none') return;
  const width = map.width * map.tileSize;
  const height = map.height * map.tileSize;

  const base = new Graphics().rect(0, 0, width, height).fill(surface.color);
  base.zIndex = -2_100_000;
  view.addChild(base);
  if (surface.mode !== 'water' || !surface.waterAssetId) return;

  let disposed = false;
  let stopTicker: (() => void) | null = null;
  cleanupByView.set(view, () => {
    disposed = true;
    stopTicker?.();
  });

  void prepareWaterFrames(surface).then((prepared) => {
    if (!prepared || disposed || view.destroyed) return;
    const textures = prepared.frames.map((frame) => Texture.from(frame));
    if (!textures.length) return;
    const water = new TilingSprite({ texture: textures[0], width, height });
    water.alpha = surface.waterOpacity;
    water.zIndex = -2_090_000;
    const scale = Math.max(.1, Math.min(8, surface.waterScale ?? 1));
    water.tileScale.set(scale, scale);
    view.addChild(water);

    let lastFrame = 0;
    const tick = () => {
      const next = waterFrameIndex(prepared.asset, surface, performance.now()) % textures.length;
      if (next === lastFrame) return;
      lastFrame = next;
      water.texture = textures[next];
    };
    Ticker.shared.add(tick);
    stopTicker = () => {
      Ticker.shared.remove(tick);
      if (!water.destroyed) water.destroy();
      for (const texture of textures) if (!texture.destroyed) texture.destroy(true);
    };
  });
}

export function cleanupPublishedBaseSurface(view: Container | null | undefined) {
  if (!view) return;
  cleanupByView.get(view)?.();
  cleanupByView.delete(view);
}
