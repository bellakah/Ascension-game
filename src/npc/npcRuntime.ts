import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { animationFrameIndex } from '../editor/map/mapAnimationRuntime';
import { getMapAssetImage } from '../editor/map/mapAssetRenderer';
import { getPaletteEntry } from '../editor/map/mapEditorCatalog';
import type { MapAnimationFrame, MapPaletteEntry, MapSpriteRect } from '../editor/map/mapEditorTypes';
import { getPreparedPublishedWorldRuntime } from '../map/publishedMapRuntime';
import type { NpcDefinition, NpcDirection, NpcInstanceRoute } from './npcTypes';
import { getNpcDefinition, getNpcInstanceRoute, npcIdFromAssetId, resolveNpcAppearanceAssetId } from './npcStore';

const textureCache = new Map<string, Texture[]>();

function directionFromDelta(dx: number, dy: number): NpcDirection {
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  if (angle >= -22.5 && angle < 22.5) return 'east';
  if (angle >= 22.5 && angle < 67.5) return 'south-east';
  if (angle >= 67.5 && angle < 112.5) return 'south';
  if (angle >= 112.5 && angle < 157.5) return 'south-west';
  if (angle >= 157.5 || angle < -157.5) return 'west';
  if (angle >= -157.5 && angle < -112.5) return 'north-west';
  if (angle >= -112.5 && angle < -67.5) return 'north';
  return 'north-east';
}

function frameCanvas(entry: MapPaletteEntry, rect?: MapSpriteRect) {
  const image = getMapAssetImage(entry);
  if (!image || !image.complete || image.naturalWidth <= 0) return null;
  const source = rect ?? entry.sprite?.sourceRect ?? { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width)); canvas.height = Math.max(1, Math.round(source.height));
  const ctx = canvas.getContext('2d'); if (!ctx) return null;
  ctx.imageSmoothingEnabled = false; ctx.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function texturesFor(entry: MapPaletteEntry) {
  const cached = textureCache.get(entry.id); if (cached) return cached;
  const animation = entry.sprite?.animation;
  const canvases = animation?.frames.length
    ? animation.frames.map((frame: MapAnimationFrame) => frameCanvas(entry, frame)).filter((value): value is HTMLCanvasElement => Boolean(value))
    : [frameCanvas(entry)].filter((value): value is HTMLCanvasElement => Boolean(value));
  const textures = canvases.map((canvas) => Texture.from(canvas));
  if (textures.length) textureCache.set(entry.id, textures);
  return textures;
}

function waitForEntry(entry: MapPaletteEntry) {
  return new Promise<void>((resolve) => {
    const image = getMapAssetImage(entry);
    if (!image || (image.complete && image.naturalWidth > 0)) { resolve(); return; }
    const done = () => resolve(); image.addEventListener('load', done, { once: true }); image.addEventListener('error', done, { once: true });
  });
}

type NpcActor = {
  definition: NpcDefinition;
  route: NpcInstanceRoute | null;
  container: Container;
  sprite: Sprite | null;
  assetId: string;
  x: number;
  y: number;
  state: 'idle' | 'walk';
  facing: NpcDirection;
  targetIndex: number;
  routeDirection: number;
  waitMs: number;
  stopped: boolean;
};

function createActorView(definition: NpcDefinition, tileSize: number) {
  const container = new Container(); container.sortableChildren = true;
  if (definition.appearance.showShadow) container.addChild(new Graphics().ellipse(0, 3, tileSize * .32, tileSize * .12).fill({ color: 0x000000, alpha: .25 }));
  const label = new Text({ text: definition.title ? `${definition.name}\n${definition.title}` : definition.name, style: { fill: 0xffffff, fontSize: 10, align: 'center', fontWeight: 'bold', stroke: { color: 0x071018, width: 3 } } });
  label.anchor.set(.5, 1); label.position.set(0, -tileSize * 1.1); label.zIndex = 4; container.addChild(label);
  return container;
}

function applyAppearance(actor: NpcActor, tileSize: number, time: number) {
  const nextId = resolveNpcAppearanceAssetId(actor.definition, actor.state, actor.facing);
  const entry = getPaletteEntry(nextId);
  const textures = texturesFor(entry);
  if (!textures.length) return;
  if (!actor.sprite || actor.assetId !== nextId) {
    actor.sprite?.destroy();
    const sprite = new Sprite(textures[0]);
    const def = entry.sprite;
    sprite.anchor.set(def?.anchorX ?? .5, def?.anchorY ?? 1);
    sprite.width = tileSize * (def?.widthTiles ?? 1) * actor.definition.appearance.scale;
    sprite.height = tileSize * (def?.heightTiles ?? 1) * actor.definition.appearance.scale;
    sprite.zIndex = 2; actor.container.addChild(sprite); actor.sprite = sprite; actor.assetId = nextId;
  }
  const animation = entry.sprite?.animation;
  if (animation?.frames.length && textures.length > 1 && actor.sprite) {
    const index = Math.min(textures.length - 1, animationFrameIndex(animation, time, `npc:${actor.definition.id}:${actor.container.label ?? ''}`));
    actor.sprite.texture = textures[index];
  }
}

function nextRouteTarget(actor: NpcActor) {
  const route = actor.route; if (!route || route.points.length < 2 || route.mode === 'stationary') { actor.stopped = true; return; }
  if (route.mode === 'loop') actor.targetIndex = (actor.targetIndex + 1) % route.points.length;
  else if (route.mode === 'once') { if (actor.targetIndex >= route.points.length - 1) actor.stopped = true; else actor.targetIndex++; }
  else {
    if (actor.targetIndex >= route.points.length - 1) actor.routeDirection = -1;
    if (actor.targetIndex <= 0) actor.routeDirection = 1;
    actor.targetIndex = Math.max(0, Math.min(route.points.length - 1, actor.targetIndex + actor.routeDirection));
  }
}

let stopRuntime: (() => void) | null = null;

export async function installPublishedNpcRuntime() {
  stopRuntime?.(); stopRuntime = null;
  const runtime = getPreparedPublishedWorldRuntime(); if (!runtime) return () => {};
  const npcObjects = runtime.document.objects.map((object) => ({ object, npcId: npcIdFromAssetId(object.assetId) })).filter((value): value is { object: typeof runtime.document.objects[number]; npcId: string } => Boolean(value.npcId));
  if (!npcObjects.length) return () => {};

  const definitions = new Map<string, NpcDefinition>();
  const appearanceIds = new Set<string>();
  for (const { npcId } of npcObjects) {
    const definition = getNpcDefinition(npcId); if (!definition) continue; definitions.set(npcId, definition);
    appearanceIds.add(definition.appearance.fallbackAssetId); Object.values(definition.appearance.idle).forEach((id) => id && appearanceIds.add(id)); Object.values(definition.appearance.walk).forEach((id) => id && appearanceIds.add(id));
  }
  await Promise.all([...appearanceIds].map((id) => waitForEntry(getPaletteEntry(id))));

  const usedOriginal = new Set<Container>();
  const actors: NpcActor[] = [];
  const tileSize = runtime.document.tileSize;
  for (const { object, npcId } of npcObjects) {
    const definition = definitions.get(npcId); if (!definition) continue;
    const px = (object.x + .5) * tileSize, py = (object.y + 1) * tileSize;
    const original = runtime.view.children.find((child) => !usedOriginal.has(child as Container) && child.zIndex > -900000 && Math.abs(child.x - px) < .5 && Math.abs(child.y - py) < .5) as Container | undefined;
    if (original) { original.visible = false; usedOriginal.add(original); }
    const container = createActorView(definition, tileSize); container.position.set(px, py); container.zIndex = py; container.label = object.id; runtime.view.addChild(container);
    const route = getNpcInstanceRoute(runtime.document.id, object.id);
    const actor: NpcActor = { definition, route, container, sprite: null, assetId: '', x: object.x, y: object.y, state: 'idle', facing: 'south', targetIndex: route && route.points.length > 1 ? 1 : 0, routeDirection: 1, waitMs: 0, stopped: !route || route.points.length < 2 || route.mode === 'stationary' };
    actors.push(actor); applyAppearance(actor, tileSize, performance.now());
  }

  let previous = performance.now(); let raf = 0; let stopped = false;
  const tick = (time: number) => {
    if (stopped) return;
    const dt = Math.min(.05, Math.max(0, (time - previous) / 1000)); previous = time;
    for (const actor of actors) {
      const route = actor.route;
      actor.state = 'idle';
      if (!actor.stopped && route && route.points.length > 1) {
        if (actor.waitMs > 0) actor.waitMs -= dt * 1000;
        else {
          const target = route.points[actor.targetIndex], dx = target.x - actor.x, dy = target.y - actor.y, distance = Math.hypot(dx, dy);
          if (distance <= .018) {
            actor.x = target.x; actor.y = target.y; actor.waitMs = target.waitMs;
            if (target.face && target.face !== 'auto') actor.facing = target.face;
            nextRouteTarget(actor);
          } else {
            actor.state = 'walk'; actor.facing = directionFromDelta(dx, dy);
            const step = Math.min(distance, Math.max(.05, route.speed || actor.definition.behavior.walkSpeed) * dt); actor.x += dx / distance * step; actor.y += dy / distance * step;
          }
        }
      }
      applyAppearance(actor, tileSize, time);
      actor.container.position.set((actor.x + .5) * tileSize, (actor.y + 1) * tileSize); actor.container.zIndex = (actor.y + 1) * tileSize;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  stopRuntime = () => { stopped = true; cancelAnimationFrame(raf); for (const actor of actors) actor.container.destroy({ children: true }); };
  window.addEventListener('pagehide', stopRuntime, { once: true });
  return stopRuntime;
}
