import { AnimatedSprite, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { getMapAssetImage } from '../editor/map/mapAssetRenderer';
import { hydrateAssetLibraryV2 } from '../editor/map/mapAssetLibraryV2';
import { getPaletteEntry, MAP_PALETTE_ENTRIES } from '../editor/map/mapEditorCatalog';
import { circleHitboxRadii, getAssetPreset, objectVisualBounds } from '../editor/map/mapAssetPresets';
import { drawBlendedTerrainTile } from '../editor/map/mapTerrainBlend';
import type { AscensionMapDocument, MapAnimationFrame, MapObject, MapPaletteEntry, MapSpriteRect } from '../editor/map/mapEditorTypes';
import { parseTileKey, tileKey } from '../editor/map/mapEditorTypes';
import { loadPublishedMap } from './publishedMapStore';

export type PublishedObstacle =
  | { kind?: 'circle'; x: number; y: number; radius: number }
  | { kind: 'ellipse'; x: number; y: number; radiusX: number; radiusY: number }
  | { kind: 'rect'; x: number; y: number; width: number; height: number }
  | { kind: 'polygon'; points: Array<{ x: number; y: number }> };

export type PublishedWorldRuntime = {
  document: AscensionMapDocument;
  view: Container;
  obstacles: PublishedObstacle[];
  width: number;
  height: number;
  spawn: { x: number; y: number };
};

const FUNCTIONAL_ASSETS = new Set([
  'elandra', 'rowan', 'mira', 'theo', 'silas',
  'anvil_station', 'alchemy_station',
  'herb', 'iron_vein', 'wood_node',
  'wolf', 'sludge',
]);

let preparedRuntime: PublishedWorldRuntime | null = null;

function waitForImage(entry: MapPaletteEntry) {
  return new Promise<void>((resolve) => {
    const image = getMapAssetImage(entry);
    if (!image || (image.complete && image.naturalWidth > 0)) { resolve(); return; }
    const done = () => resolve();
    image.addEventListener('load', done, { once: true });
    image.addEventListener('error', done, { once: true });
  });
}

function frameCanvas(entry: MapPaletteEntry, rect?: MapSpriteRect) {
  const image = getMapAssetImage(entry);
  if (!image || !image.complete || image.naturalWidth <= 0) return null;
  const source = rect ?? entry.sprite?.sourceRect ?? { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width));
  canvas.height = Math.max(1, Math.round(source.height));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function createObjectView(entry: MapPaletteEntry, object: MapObject, tileSize: number) {
  const spriteDef = entry.sprite;
  if (!spriteDef) {
    const marker = new Graphics().circle(0, 0, Math.max(7, tileSize * .28)).fill(entry.color || 0x687b8a);
    marker.position.set((object.x + .5) * tileSize, (object.y + .5) * tileSize);
    return marker;
  }

  const animation = spriteDef.animation;
  if (animation?.frames.length) {
    const textures = animation.frames.map((frame: MapAnimationFrame) => frameCanvas(entry, frame)).filter((canvas): canvas is HTMLCanvasElement => Boolean(canvas)).map((canvas) => Texture.from(canvas));
    if (textures.length) {
      const animated = new AnimatedSprite(textures);
      animated.anchor.set(spriteDef.anchorX ?? .5, spriteDef.anchorY ?? 1);
      animated.position.set((object.x + .5) * tileSize, (object.y + 1) * tileSize);
      animated.width = tileSize * (spriteDef.widthTiles ?? 1) * (object.scale ?? 1);
      animated.height = tileSize * (spriteDef.heightTiles ?? 1) * (object.scale ?? 1);
      animated.animationSpeed = Math.max(.01, animation.fps / 60);
      animated.loop = animation.loop;
      animated.rotation = (object.rotation ?? 0) * Math.PI / 180;
      animated.play();
      return animated;
    }
  }

  const canvas = frameCanvas(entry);
  if (!canvas) {
    const marker = new Graphics().circle(0, 0, Math.max(7, tileSize * .28)).fill(entry.color || 0x687b8a);
    marker.position.set((object.x + .5) * tileSize, (object.y + .5) * tileSize);
    return marker;
  }
  const sprite = Sprite.from(canvas);
  sprite.anchor.set(spriteDef.anchorX ?? .5, spriteDef.anchorY ?? 1);
  sprite.position.set((object.x + .5) * tileSize, (object.y + 1) * tileSize);
  sprite.width = tileSize * (spriteDef.widthTiles ?? 1) * (object.scale ?? 1);
  sprite.height = tileSize * (spriteDef.heightTiles ?? 1) * (object.scale ?? 1);
  sprite.rotation = (object.rotation ?? 0) * Math.PI / 180;
  return sprite;
}

function addTerrainChunks(view: Container, map: AscensionMapDocument) {
  const chunkPixels = 1024;
  const tileSize = map.tileSize;
  const widthPx = map.width * tileSize;
  const heightPx = map.height * tileSize;
  const now = performance.now();
  for (let cy = 0; cy < heightPx; cy += chunkPixels) {
    for (let cx = 0; cx < widthPx; cx += chunkPixels) {
      const cw = Math.min(chunkPixels, widthPx - cx);
      const ch = Math.min(chunkPixels, heightPx - cy);
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.fillStyle = map.metadata.background || '#527b45';
      ctx.fillRect(0, 0, cw, ch);
      const startX = Math.floor(cx / tileSize);
      const startY = Math.floor(cy / tileSize);
      const endX = Math.min(map.width - 1, Math.ceil((cx + cw) / tileSize));
      const endY = Math.min(map.height - 1, Math.ceil((cy + ch) / tileSize));
      for (let y = startY; y <= endY; y++) for (let x = startX; x <= endX; x++) {
        const tile = map.tiles[tileKey(x, y)] ?? { ground: 'grass' };
        const px = x * tileSize - cx;
        const py = y * tileSize - cy;
        drawBlendedTerrainTile(ctx, map, { x, y, screenX: px, screenY: py, tilePixels: tileSize, layer: 'ground', now });
        if (tile.detail) drawBlendedTerrainTile(ctx, map, { x, y, screenX: px, screenY: py, tilePixels: tileSize, layer: 'detail', alpha: .78, now });
      }
      const sprite = Sprite.from(canvas);
      sprite.position.set(cx, cy);
      sprite.zIndex = -1_000_000;
      view.addChild(sprite);
    }
  }
}

function buildObstacles(map: AscensionMapDocument) {
  const obstacles: PublishedObstacle[] = [];
  const tileSize = map.tileSize;
  const addCircle = (x: number, y: number, radius = tileSize * .42) => obstacles.push({ kind: 'circle', x, y, radius });

  for (const key of map.collision) {
    const point = parseTileKey(key);
    addCircle((point.x + .5) * tileSize, (point.y + .5) * tileSize);
  }

  for (const object of map.objects) {
    const entry = getPaletteEntry(object.assetId);
    const preset = getAssetPreset(entry);
    if (preset.hitbox) {
      const bounds = objectVisualBounds(entry, object);
      const bx = bounds.x * tileSize, by = bounds.y * tileSize;
      const bw = bounds.width * tileSize, bh = bounds.height * tileSize;
      const hitbox = preset.hitbox;
      if (hitbox.type === 'rectangle') {
        obstacles.push({
          kind: 'rect',
          x: bx + hitbox.x * bw,
          y: by + hitbox.y * bh,
          width: hitbox.width * bw,
          height: hitbox.height * bh,
        });
      } else if (hitbox.type === 'circle') {
        const { radiusX, radiusY } = circleHitboxRadii(hitbox);
        obstacles.push({
          kind: 'ellipse',
          x: bx + hitbox.x * bw,
          y: by + hitbox.y * bh,
          radiusX: radiusX * bw,
          radiusY: radiusY * bh,
        });
      } else if (hitbox.points.length >= 3) {
        obstacles.push({
          kind: 'polygon',
          points: hitbox.points.map((point) => ({ x: bx + point.x * bw, y: by + point.y * bh })),
        });
      }
      continue;
    }

    const collision = entry.footprint?.collision ?? [];
    for (const cell of collision) addCircle((object.x + cell.x + .5) * tileSize, (object.y + cell.y + .5) * tileSize);
  }
  return obstacles;
}

function spawnFromMap(map: AscensionMapDocument) {
  const zone = map.zones.find((value) => value.kind === 'respawn');
  if (!zone) return { x: map.width * map.tileSize / 2, y: map.height * map.tileSize / 2 };
  return { x: (zone.x + zone.width / 2) * map.tileSize, y: (zone.y + zone.height / 2) * map.tileSize };
}

export async function loadPublishedWorldRuntime(): Promise<PublishedWorldRuntime | null> {
  const record = loadPublishedMap();
  if (!record) return null;
  await hydrateAssetLibraryV2();
  const map = record.document;
  const usedIds = new Set<string>();
  for (const tile of Object.values(map.tiles)) { if (tile.ground) usedIds.add(tile.ground); if (tile.detail) usedIds.add(tile.detail); }
  for (const object of map.objects) usedIds.add(object.assetId);
  const entries = MAP_PALETTE_ENTRIES.filter((entry) => usedIds.has(entry.id));
  await Promise.all(entries.map(waitForImage));

  const view = new Container();
  view.sortableChildren = true;
  addTerrainChunks(view, map);
  const visualObjects = map.objects.filter((object) => !FUNCTIONAL_ASSETS.has(object.assetId));
  visualObjects.sort((a, b) => a.y - b.y);
  for (const object of visualObjects) {
    const objectEntry = getPaletteEntry(object.assetId);
    const objectView = createObjectView(objectEntry, object, map.tileSize);
    const depthMode = getAssetPreset(objectEntry).depthMode ?? 'auto';
    objectView.zIndex = depthMode === 'ground'
      ? -500_000
      : depthMode === 'foreground'
        ? 500_000
        : (object.y + 1) * map.tileSize;
    view.addChild(objectView);
  }

  return {
    document: map,
    view,
    obstacles: buildObstacles(map),
    width: map.width * map.tileSize,
    height: map.height * map.tileSize,
    spawn: spawnFromMap(map),
  };
}

export async function preparePublishedWorldRuntime() {
  preparedRuntime = await loadPublishedWorldRuntime();
  return preparedRuntime;
}

export function getPreparedPublishedWorldRuntime() {
  return preparedRuntime;
}

export function publishedObjectPositions(map: AscensionMapDocument, assetId: string) {
  return map.objects.filter((object) => object.assetId === assetId).map((object) => ({
    x: (object.x + .5) * map.tileSize,
    y: (object.y + 1) * map.tileSize,
  }));
}

export function getPublishedObjectPositions(assetId: string) {
  return preparedRuntime ? publishedObjectPositions(preparedRuntime.document, assetId) : [];
}
