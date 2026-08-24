import { Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import type { CharacterProgress } from '../character/characterCreator';
import { triggerLatestGatheringAction, type LpcGatheringAction } from '../character/lpcCharacter';
import { animationFrameIndex } from '../editor/map/mapAnimationRuntime';
import { getMapAssetImage } from '../editor/map/mapAssetRenderer';
import { getPaletteEntry } from '../editor/map/mapEditorCatalog';
import { generateSpawnOffsets, readSpawnGroupConfig, spawnRespawnDelay } from '../editor/map/spawnGroupConfig';
import { getSpawnGroup } from '../editor/map/spawnGroupStore';
import { getItem } from '../items/itemCatalog';
import { getPreparedPublishedWorldRuntime } from '../map/publishedMapRuntime';
import { GATHERING_NODES, type GatheringKind } from './gatheringCatalog';
import { collectibleIdFromAssetId, ensureCollectibleMigration, getCollectibleDefinition, resolveCollectibleAppearanceAssetId } from './collectibleStore';
import { hasRequiredGatheringTool, requiredGatheringToolName, rollCollectibleDrops } from './collectibleRuntimeHelpers';
import type { CollectibleAnimationState, CollectibleDefinition, CollectiblePlayerAnimation } from './collectibleTypes';

type GatheringSave = CharacterProgress & { gatheringData?: Record<string, { readyAt: number }> };
type RuntimeNode = {
  id: string;
  definition: CollectibleDefinition;
  map: string;
  x: number;
  y: number;
  radius: number;
  respawnMs: number;
  respawnJitterMs: number;
  view: Container;
  art: Container;
  fallback: Graphics;
  sprite: Sprite | null;
  assetId: string;
  halo: Graphics;
  marker: Text;
  label: Text;
  depleted: Text;
  harvestingUntil: number;
  breakUntil: number;
  respawnUntil: number;
  wasReady: boolean;
};

export type GatheringResult = {
  ok: boolean;
  reason?: string;
  node?: { id: string; name: string; x: number; y: number; animation: 'slash' | 'emote'; playerAnimation: CollectiblePlayerAnimation; harvestDurationMs: number };
  itemId?: string;
  added?: number;
  lost?: number;
};

const COLORS: Record<GatheringKind | 'digging' | 'custom', number> = { mining: 0xb8c4cf, herbalism: 0x9edb8f, woodcutting: 0xd7ad72, digging: 0xc9a875, custom: 0x8db6c6 };
const textureCache = new Map<string, Texture[]>();

function saveState(progress: CharacterProgress) { const state = progress as GatheringSave; state.gatheringData ??= {}; return state.gatheringData; }
function readyAt(progress: CharacterProgress, id: string) { return Math.max(0, Number(saveState(progress)[id]?.readyAt ?? 0)); }
function setReadyAt(progress: CharacterProgress, id: string, value: number) { saveState(progress)[id] = { readyAt: value }; }
function playerGatheringAction(definition: CollectibleDefinition): LpcGatheringAction {
  const value = definition.playerAnimation;
  if (value === 'mine') return 'mine';
  if (value === 'dig') return 'dig';
  if (value === 'gather' || value === 'emote') return 'gather';
  return 'chop';
}

function fallbackArt(definition: CollectibleDefinition) {
  const color = COLORS[definition.kind];
  const art = new Graphics();
  if (definition.kind === 'woodcutting') {
    art.roundRect(-8, -4, 16, 38, 5).fill(0x765034);
    art.circle(-12, -24, 24).fill(0x2c633d); art.circle(13, -27, 25).fill(0x347447); art.circle(0, -44, 24).fill(0x3c8150);
  } else if (definition.kind === 'herbalism') {
    art.moveTo(0, 11).lineTo(0, -13).stroke({ width: 3, color: 0x446d40 }); art.ellipse(-9, -1, 12, 5).fill(0x5f9c55); art.ellipse(9, 2, 12, 5).fill(0x5f9c55); art.circle(0, -15, 6).fill(0xe0dc80);
  } else {
    art.poly([-28, 11, -18, -12, -2, -23, 17, -15, 29, 10, 15, 22, -17, 21]).fill(color).stroke({ width: 2, color: 0x4d5552 });
  }
  return art;
}

function frameTextures(assetId: string) {
  const cached = textureCache.get(assetId); if (cached) return cached;
  const entry = getPaletteEntry(assetId); const image = getMapAssetImage(entry);
  if (!image || !image.complete || image.naturalWidth <= 0) return [];
  const frames = entry.sprite?.animation?.frames?.length ? entry.sprite.animation.frames : [entry.sprite?.sourceRect ?? { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight }];
  const textures = frames.map((frame) => new Texture({ source: Texture.from(image).source, frame: new Rectangle(frame.x, frame.y, frame.width, frame.height) }));
  if (textures.length) textureCache.set(assetId, textures);
  return textures;
}

function createNodeView(id: string, definition: CollectibleDefinition, map: string, x: number, y: number, radius: number, respawnMs: number, respawnJitterMs: number): RuntimeNode {
  const view = new Container(); view.position.set(x, y); view.sortableChildren = true;
  const color = COLORS[definition.kind];
  const halo = new Graphics().circle(0, 0, 35).stroke({ width: 1.5, color, alpha: .18 }); halo.zIndex = 0; view.addChild(halo);
  const art = new Container(); art.zIndex = 1; const fallback = fallbackArt(definition); art.addChild(fallback); view.addChild(art);
  const marker = new Text({ text: definition.icon, style: { fill: color, fontSize: 15, fontWeight: 'bold', stroke: { color: 0x14231d, width: 3 } } }); marker.anchor.set(.5); marker.y = definition.kind === 'woodcutting' ? -77 : -49; marker.alpha = .42; marker.zIndex = 3; view.addChild(marker);
  const label = new Text({ text: '', style: { fill: 0xf1f5f2, fontSize: 10, fontWeight: 'bold', stroke: { color: 0x102018, width: 4 } } }); label.anchor.set(.5); label.y = definition.kind === 'woodcutting' ? -96 : -67; label.visible = false; label.zIndex = 4; view.addChild(label);
  const depleted = new Text({ text: '', style: { fill: 0xb8c1bc, fontSize: 9, fontWeight: 'bold', stroke: { color: 0x102018, width: 3 } } }); depleted.anchor.set(.5); depleted.y = definition.kind === 'woodcutting' ? -77 : -50; depleted.visible = false; depleted.zIndex = 4; view.addChild(depleted);
  return { id, definition, map, x, y, radius, respawnMs, respawnJitterMs, view, art, fallback, sprite: null, assetId: '', halo, marker, label, depleted, harvestingUntil: 0, breakUntil: 0, respawnUntil: 0, wasReady: true };
}

function visualState(node: RuntimeNode, progress: CharacterProgress, now: number): CollectibleAnimationState {
  if (now < node.harvestingUntil) return 'harvest';
  if (now < node.breakUntil) return 'break';
  const ready = now >= readyAt(progress, node.id);
  if (!ready) return 'depleted';
  if (!node.wasReady) { node.respawnUntil = now + 650; node.wasReady = true; }
  if (now < node.respawnUntil) return 'respawn';
  return 'idle';
}

function applyAppearance(node: RuntimeNode, state: CollectibleAnimationState, now: number) {
  const assetId = resolveCollectibleAppearanceAssetId(node.definition, state);
  const entry = getPaletteEntry(assetId); const textures = frameTextures(assetId);
  if (!textures.length) { node.fallback.visible = true; if (node.sprite) node.sprite.visible = false; return; }
  node.fallback.visible = false;
  if (!node.sprite || node.assetId !== assetId) {
    node.sprite?.destroy();
    const sprite = new Sprite(textures[0]); const visual = entry.sprite; sprite.anchor.set(visual?.anchorX ?? .5, visual?.anchorY ?? 1);
    const tile = getPreparedPublishedWorldRuntime()?.document.tileSize ?? 48; sprite.width = tile * (visual?.widthTiles ?? 1) * node.definition.appearance.scale; sprite.height = tile * (visual?.heightTiles ?? 1) * node.definition.appearance.scale;
    node.art.addChild(sprite); node.sprite = sprite; node.assetId = assetId;
  }
  if (!node.sprite) return; node.sprite.visible = true;
  const animation = entry.sprite?.animation;
  if (animation?.frames.length && textures.length > 1) node.sprite.texture = textures[Math.min(textures.length - 1, animationFrameIndex(animation, now, `collectible:${node.id}:${state}`))];
  else node.sprite.texture = textures[0];
}

function legacyCollectibleId(yieldItemId: string) {
  if (yieldItemId === 'iron_ore') return 'iron_vein'; if (yieldItemId === 'silver_ore') return 'silver_vein'; if (yieldItemId === 'oak_wood') return 'oak_tree'; if (yieldItemId === 'moonleaf') return 'moonleaf'; return 'healing_herb';
}

function nodesFromPublished(progress: CharacterProgress) {
  const runtime = getPreparedPublishedWorldRuntime(); if (!runtime) return [] as RuntimeNode[];
  const nodes: RuntimeNode[] = [];
  for (const object of runtime.document.objects) {
    let definition: CollectibleDefinition | null = null;
    const id = collectibleIdFromAssetId(object.assetId);
    if (id) definition = getCollectibleDefinition(id);
    else if (object.assetId === 'iron_vein') definition = getCollectibleDefinition('iron_vein');
    else if (object.assetId === 'herb') definition = getCollectibleDefinition('healing_herb');
    else if (object.assetId === 'wood_node') definition = getCollectibleDefinition('oak_tree');
    if (!definition) continue;
    const external = getSpawnGroup(runtime.document.id, object.id);
    const config = external ?? readSpawnGroupConfig(object, definition.respawnMs);
    const offsets = generateSpawnOffsets(config, `${runtime.document.id}:${object.id}`);
    for (let index = 0; index < offsets.length; index++) {
      const offset = offsets[index]; const x = (object.x + .5 + offset.x) * runtime.document.tileSize; const y = (object.y + 1 + offset.y) * runtime.document.tileSize;
      const nodeId = `${object.id}:${index}`; const node = createNodeView(nodeId, definition, runtime.document.name, x, y, definition.interactionRadiusTiles * runtime.document.tileSize, config.respawnMs || definition.respawnMs, config.respawnJitterMs || definition.respawnJitterMs);
      node.wasReady = Date.now() >= readyAt(progress, nodeId); nodes.push(node);
    }
  }
  return nodes;
}

function legacyNodes(progress: CharacterProgress) {
  return GATHERING_NODES.flatMap((legacy) => {
    const definition = getCollectibleDefinition(legacyCollectibleId(legacy.yieldItemId)); if (!definition) return [];
    const node = createNodeView(legacy.id, definition, legacy.map, legacy.x, legacy.y, legacy.radius, legacy.respawnMs, definition.respawnJitterMs); node.wasReady = Date.now() >= readyAt(progress, node.id); return [node];
  });
}

export function createGatheringSystem(world: Container, progress: CharacterProgress) {
  ensureCollectibleMigration();
  const nodes = getPreparedPublishedWorldRuntime() ? nodesFromPublished(progress) : legacyNodes(progress);
  for (const node of nodes) world.addChild(node.view);
  let pulse = 0;
  const isReady = (node: RuntimeNode) => Date.now() >= readyAt(progress, node.id) && Date.now() >= node.harvestingUntil;
  const nearest = (x: number, y: number, map = 'Floresta Inicial', hintExtra = 55) => {
    let best: RuntimeNode | null = null, bestDistance = Infinity;
    for (const node of nodes) { if (node.map !== map) continue; const d = Math.hypot(x - node.x, y - node.y); if (d <= node.radius + hintExtra && d < bestDistance) { best = node; bestDistance = d; } }
    return best ? { node: best, distance: bestDistance, ready: isReady(best) } : null;
  };
  const update = (x: number, y: number, map: string, deltaMs: number) => {
    pulse += deltaMs * .0024; const now = Date.now(); const closest = nearest(x, y, map);
    for (const node of nodes) {
      const state = visualState(node, progress, now); const ready = state === 'idle' || state === 'respawn'; const isClosest = closest?.node === node; const until = Math.max(0, readyAt(progress, node.id) - now);
      if (!ready) node.wasReady = false;
      if (state === 'harvest' && isClosest) triggerLatestGatheringAction(playerGatheringAction(node.definition));
      applyAppearance(node, state, performance.now());
      node.view.alpha = state === 'depleted' && !node.definition.appearance.depleted ? .27 : 1; node.marker.visible = ready; node.marker.alpha = isClosest ? .82 : .38; node.halo.alpha = ready ? (isClosest ? .45 + Math.sin(pulse) * .08 : .14) : .04;
      node.label.visible = Boolean(isClosest && ready); node.label.text = `${node.definition.icon} ${node.definition.name} · ${node.definition.hint}`;
      node.depleted.visible = Boolean(isClosest && state === 'depleted'); node.depleted.text = until > 0 ? `Retorna em ${Math.max(1, Math.ceil(until / 1000))}s` : '';
    }
    return closest;
  };
  const gather = (x: number, y: number, map = 'Floresta Inicial'): GatheringResult => {
    const closest = nearest(x, y, map, 0); if (!closest) return { ok: false, reason: 'Chegue mais perto do recurso para coletá-lo.' };
    const node = closest.node; if (!closest.ready) return { ok: false, reason: `${node.definition.name} ainda está se regenerando.` };
    if (!hasRequiredGatheringTool(progress, node.definition)) return { ok: false, reason: `Você precisa de ${requiredGatheringToolName(node.definition)} no inventário para ${node.definition.hint.toLowerCase()}.` };
    const rewards = rollCollectibleDrops(progress, node.definition); const added = rewards.reduce((sum, reward) => sum + reward.added, 0); const lost = rewards.reduce((sum, reward) => sum + reward.remaining, 0);
    if (!rewards.length || added <= 0) return { ok: false, reason: rewards.length ? 'Inventário cheio.' : 'Este recurso não gerou nenhum item desta vez.' };
    const now = Date.now(); node.harvestingUntil = now + node.definition.harvestDurationMs; node.breakUntil = node.harvestingUntil + 450;
    const ready = node.breakUntil + spawnRespawnDelay({ count: 1, radiusTiles: 0, minDistanceTiles: 0, respawnMs: node.respawnMs, respawnJitterMs: node.respawnJitterMs }, node.definition.respawnMs);
    setReadyAt(progress, node.id, ready); node.wasReady = false;
    triggerLatestGatheringAction(playerGatheringAction(node.definition));
    const first = rewards.find((reward) => reward.added > 0);
    return { ok: true, node: { id: node.id, name: node.definition.name, x: node.x, y: node.y, animation: node.definition.playerAnimation === 'gather' || node.definition.playerAnimation === 'emote' ? 'emote' : 'slash', playerAnimation: node.definition.playerAnimation, harvestDurationMs: node.definition.harvestDurationMs }, itemId: first?.itemId, added, lost };
  };
  const hint = (x: number, y: number, map = 'Floresta Inicial') => {
    const closest = nearest(x, y, map); if (!closest) return null; const def = closest.node.definition; const until = Math.max(0, readyAt(progress, closest.node.id) - Date.now());
    if (closest.ready && !hasRequiredGatheringTool(progress, def)) return { icon: '🔒', text: `Precisa: ${requiredGatheringToolName(def)}`, actionable: false };
    return closest.ready ? { icon: def.icon, text: `${def.hint} · ${def.name}`, actionable: closest.distance <= closest.node.radius } : { icon: '⌛', text: `${def.name} · ${Math.max(1, Math.ceil(until / 1000))}s`, actionable: false };
  };
  return { nodes, update, gather, hint, nearest };
}

export function gatheringItemName(itemId: string) { return getItem(itemId)?.name ?? itemId; }
