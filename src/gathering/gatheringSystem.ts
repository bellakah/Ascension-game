import { Container, Graphics, Text } from 'pixi.js';
import type { CharacterProgress } from '../character/characterCreator';
import { addItem, getItem } from '../items/itemCatalog';
import { getPreparedPublishedWorldRuntime, getPublishedObjectPositions } from '../map/publishedMapRuntime';
import { GATHERING_NODES, type GatheringKind, type GatheringNodeDefinition } from './gatheringCatalog';

type GatheringSave = CharacterProgress & {
  gatheringData?: Record<string, { readyAt: number }>;
};

type RuntimeNode = {
  definition: GatheringNodeDefinition;
  view: Container;
  halo: Graphics;
  marker: Text;
  label: Text;
  depleted: Text;
};

export type GatheringResult = {
  ok: boolean;
  reason?: string;
  node?: GatheringNodeDefinition;
  itemId?: string;
  added?: number;
  lost?: number;
};

const COLORS: Record<GatheringKind, number> = {
  mining: 0xb8c4cf,
  herbalism: 0x9edb8f,
  woodcutting: 0xd7ad72,
};

function saveState(progress: CharacterProgress) {
  const state = progress as GatheringSave;
  state.gatheringData ??= {};
  return state.gatheringData;
}

function readyAt(progress: CharacterProgress, id: string) {
  return Math.max(0, Number(saveState(progress)[id]?.readyAt ?? 0));
}

function createOreVisual(kind: 'iron' | 'silver') {
  const c = new Container();
  const base = kind === 'silver' ? 0xaeb9c4 : 0x727b79;
  const shine = kind === 'silver' ? 0xe6edf2 : 0xb6b08c;
  c.addChild(
    new Graphics().ellipse(0, 15, 31, 10).fill({ color: 0, alpha: .13 }),
    new Graphics().poly([-28, 11, -18, -12, -2, -23, 17, -15, 29, 10, 15, 22, -17, 21]).fill(base).stroke({ width: 2, color: 0x4d5552 }),
    new Graphics().poly([-10, -6, -2, -15, 4, -8, -2, 4]).fill({ color: shine, alpha: .75 }),
    new Graphics().poly([9, -7, 15, -12, 20, -4, 14, 4]).fill({ color: shine, alpha: .5 }),
  );
  return c;
}

function createHerbVisual(moon = false) {
  const c = new Container();
  const leaf = moon ? 0x76a7a2 : 0x5f9c55;
  const bloom = moon ? 0xb9d8ef : 0xe0dc80;
  c.addChild(
    new Graphics().ellipse(0, 11, 20, 7).fill({ color: 0, alpha: .1 }),
    new Graphics().moveTo(0, 11).lineTo(0, -12).stroke({ width: 3, color: 0x446d40 }),
    new Graphics().ellipse(-9, -1, 12, 5).fill(leaf),
    new Graphics().ellipse(9, 2, 12, 5).fill(leaf),
    new Graphics().circle(0, -14, 6).fill(bloom),
    new Graphics().circle(0, -14, 2).fill(0xf4f2d0),
  );
  return c;
}

function createTreeVisual() {
  const c = new Container();
  c.addChild(
    new Graphics().ellipse(0, 24, 30, 10).fill({ color: 0, alpha: .12 }),
    new Graphics().roundRect(-8, -5, 16, 37, 5).fill(0x765034),
    new Graphics().circle(-12, -23, 24).fill(0x2c633d),
    new Graphics().circle(13, -26, 25).fill(0x347447),
    new Graphics().circle(0, -43, 24).fill(0x3c8150),
  );
  return c;
}

function createNodeView(definition: GatheringNodeDefinition): RuntimeNode {
  const view = new Container();
  const color = COLORS[definition.kind];
  const halo = new Graphics().circle(0, 0, 35).stroke({ width: 1.5, color, alpha: .18 });
  view.addChild(halo);

  const art = definition.kind === 'mining'
    ? createOreVisual(definition.id.includes('silver') ? 'silver' : 'iron')
    : definition.kind === 'herbalism'
      ? createHerbVisual(definition.id.includes('moon'))
      : createTreeVisual();
  view.addChild(art);

  const marker = new Text({ text: definition.icon, style: { fill: color, fontSize: 15, fontWeight: 'bold', stroke: { color: 0x14231d, width: 3 } } });
  marker.anchor.set(.5); marker.y = definition.kind === 'woodcutting' ? -77 : -49; marker.alpha = .42;
  view.addChild(marker);

  const label = new Text({ text: '', style: { fill: 0xf1f5f2, fontSize: 10, fontWeight: 'bold', stroke: { color: 0x102018, width: 4 } } });
  label.anchor.set(.5); label.y = definition.kind === 'woodcutting' ? -96 : -67; label.visible = false;
  view.addChild(label);

  const depleted = new Text({ text: '', style: { fill: 0xb8c1bc, fontSize: 9, fontWeight: 'bold', stroke: { color: 0x102018, width: 3 } } });
  depleted.anchor.set(.5); depleted.y = definition.kind === 'woodcutting' ? -77 : -50; depleted.visible = false;
  view.addChild(depleted);

  view.position.set(definition.x, definition.y);
  return { definition, view, halo, marker, label, depleted };
}

export function createGatheringSystem(world: Container, progress: CharacterProgress) {
  const publishedRuntime = getPreparedPublishedWorldRuntime();
  const positions: Record<GatheringKind, Array<{ x: number; y: number }>> = {
    mining: getPublishedObjectPositions('iron_vein'),
    herbalism: getPublishedObjectPositions('herb'),
    woodcutting: getPublishedObjectPositions('wood_node'),
  };
  const counters: Record<GatheringKind, number> = { mining: 0, herbalism: 0, woodcutting: 0 };
  const nodes: RuntimeNode[] = [];
  for (const definition of GATHERING_NODES) {
    const index = counters[definition.kind]++;
    const published = positions[definition.kind][index];
    if (publishedRuntime && !published) continue;
    const runtimeDefinition = published ? { ...definition, x: published.x, y: published.y } : definition;
    const runtime = createNodeView(runtimeDefinition);
    world.addChild(runtime.view);
    nodes.push(runtime);
  }
  let pulse = 0;

  const isReady = (node: RuntimeNode) => Date.now() >= readyAt(progress, node.definition.id);

  const nearest = (x: number, y: number, map = 'Floresta Inicial', hintExtra = 55) => {
    let best: RuntimeNode | null = null;
    let bestDistance = Infinity;
    for (const node of nodes) {
      if (node.definition.map !== map) continue;
      const d = Math.hypot(x - node.definition.x, y - node.definition.y);
      if (d <= node.definition.radius + hintExtra && d < bestDistance) { best = node; bestDistance = d; }
    }
    return best ? { node: best, distance: bestDistance, ready: isReady(best) } : null;
  };

  const update = (x: number, y: number, map: string, deltaMs: number) => {
    pulse += deltaMs * .0024;
    const closest = nearest(x, y, map);
    for (const node of nodes) {
      const ready = isReady(node);
      const isClosest = closest?.node === node;
      const until = Math.max(0, readyAt(progress, node.definition.id) - Date.now());
      node.view.alpha = ready ? 1 : .27;
      node.marker.visible = ready;
      node.marker.alpha = isClosest ? .82 : .38;
      node.halo.alpha = ready ? (isClosest ? .45 + Math.sin(pulse) * .08 : .14) : .04;
      node.label.visible = Boolean(isClosest && ready);
      node.label.text = `${node.definition.icon} ${node.definition.name} · ${node.definition.hint}`;
      node.depleted.visible = Boolean(isClosest && !ready);
      node.depleted.text = until > 0 ? `Retorna em ${Math.max(1, Math.ceil(until / 1000))}s` : '';
    }
    return closest;
  };

  const gather = (x: number, y: number, map = 'Floresta Inicial'): GatheringResult => {
    const closest = nearest(x, y, map, 0);
    if (!closest) return { ok: false, reason: 'Chegue mais perto do recurso para coletá-lo.' };
    const node = closest.node;
    if (!closest.ready) return { ok: false, reason: `${node.definition.name} ainda está se regenerando.` };
    const amount = node.definition.yieldMin + Math.floor(Math.random() * (node.definition.yieldMax - node.definition.yieldMin + 1));
    const result = addItem(progress, node.definition.yieldItemId, amount);
    if (result.added <= 0) return { ok: false, reason: 'Inventário cheio.', node: node.definition };
    saveState(progress)[node.definition.id] = { readyAt: Date.now() + node.definition.respawnMs };
    return { ok: true, node: node.definition, itemId: node.definition.yieldItemId, added: result.added, lost: result.remaining };
  };

  const hint = (x: number, y: number, map = 'Floresta Inicial') => {
    const closest = nearest(x, y, map);
    if (!closest) return null;
    const def = closest.node.definition;
    const until = Math.max(0, readyAt(progress, def.id) - Date.now());
    return closest.ready
      ? { icon: def.icon, text: `${def.hint} · ${def.name}`, actionable: closest.distance <= def.radius }
      : { icon: '⌛', text: `${def.name} · ${Math.max(1, Math.ceil(until / 1000))}s`, actionable: false };
  };

  return { nodes, update, gather, hint, nearest };
}

export function gatheringItemName(itemId: string) { return getItem(itemId)?.name ?? itemId; }
