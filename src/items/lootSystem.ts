import { Container, Graphics, Text, type Ticker } from 'pixi.js';
import type { CharacterProgress } from '../character/characterCreator';
import type { MonsterKind } from '../game/quests';
import { distance } from '../game/world';
import { addItem, getItem } from './itemCatalog';

export type GroundLoot = {
  itemId: string;
  quantity: number;
  ownerCharacterId: string;
  view: Container;
  ageMs: number;
  phase: number;
  fullWarned: boolean;
};

export type GroundLootCollectResult = {
  ok: boolean;
  itemId: string;
  added: number;
  remaining: number;
  reason?: 'not_owner' | 'inventory_full';
};

export type MonsterDropRoll = { itemId: string; chance: number; min?: number; max?: number };

const WOLF_DROPS: MonsterDropRoll[] = [
  { itemId: 'wolf_pelt', chance: 1 },
  { itemId: 'wolf_fang', chance: .46 },
  { itemId: 'small_health_potion', chance: .18 },
  { itemId: 'iron_sword', chance: .07 },
  { itemId: 'wolf_hood', chance: .035 },
  { itemId: 'fang_charm', chance: .022 },
  { itemId: 'shadow_fang_blade', chance: .009 },
];

const SLUDGE_DROPS: MonsterDropRoll[] = [
  { itemId: 'toxic_sludge', chance: 1 },
  { itemId: 'sludge_core', chance: .36 },
  { itemId: 'small_health_potion', chance: .2 },
  { itemId: 'forest_boots', chance: .055 },
  { itemId: 'ranger_legs', chance: .035 },
  { itemId: 'amber_ring', chance: .025 },
];

function roll(kind: MonsterKind, customDrops?: MonsterDropRoll[]) {
  const table = customDrops ?? (kind === 'wolf' ? WOLF_DROPS : kind === 'sludge' ? SLUDGE_DROPS : []);
  return table.flatMap((drop) => {
    if (!drop.itemId || Math.random() > Math.max(0, Math.min(1, drop.chance))) return [];
    const min = Math.max(1, Math.floor(drop.min ?? 1)), max = Math.max(min, Math.floor(drop.max ?? min));
    return [{ itemId: drop.itemId, quantity: min + Math.floor(Math.random() * (max - min + 1)) }];
  });
}

function createLootView(itemId: string, quantity: number) {
  const item = getItem(itemId);
  const view = new Container();
  const glow = new Graphics().circle(0, 0, 24).fill({ color: item?.rarity === 'epic' ? 0xb986ff : item?.rarity === 'rare' ? 0x5da9ef : item?.rarity === 'uncommon' ? 0x61ca76 : 0xe2d295, alpha: .13 });
  const ring = new Graphics().circle(0, 0, 14).stroke({ width: 2, color: item?.rarity === 'epic' ? 0xc59aff : item?.rarity === 'rare' ? 0x70b8f5 : item?.rarity === 'uncommon' ? 0x73d886 : 0xe6cf82, alpha: .7 });
  const icon = new Text({ text: item?.icon ?? '◆', style: { fontSize: 21, stroke: { color: 0x000000, width: 3 } } });
  icon.anchor.set(.5);
  view.addChild(glow, ring, icon);
  if (quantity > 1) {
    const count = new Text({ text: String(quantity), style: { fill: 0xffffff, fontSize: 9, fontWeight: 'bold', stroke: { color: 0, width: 3 } } });
    count.anchor.set(.5); count.position.set(14, 13); view.addChild(count);
  }
  return view;
}

function destroyLoot(loots: GroundLoot[], loot: GroundLoot) {
  const index = loots.indexOf(loot);
  loot.view.parent?.removeChild(loot.view);
  loot.view.destroy({ children: true });
  if (index >= 0) loots.splice(index, 1);
}

export function spawnMonsterLoot(world: Container, kind: MonsterKind, x: number, y: number, target: GroundLoot[], ownerCharacterId: string, customDrops?: MonsterDropRoll[]) {
  const drops = roll(kind, customDrops);
  drops.forEach((drop, index) => {
    const angle = (index / Math.max(1, drops.length)) * Math.PI * 2 + Math.random() * .35;
    const radius = 18 + Math.random() * 18;
    const view = createLootView(drop.itemId, drop.quantity);
    view.position.set(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
    world.addChild(view);
    target.push({ itemId: drop.itemId, quantity: drop.quantity, ownerCharacterId, view, ageMs: 0, phase: Math.random() * Math.PI * 2, fullWarned: false });
  });
}

export function collectGroundLoot(loots: GroundLoot[], loot: GroundLoot, progress: CharacterProgress, collectorCharacterId: string): GroundLootCollectResult {
  if (loot.ownerCharacterId !== collectorCharacterId) return { ok: false, itemId: loot.itemId, added: 0, remaining: loot.quantity, reason: 'not_owner' };
  const result = addItem(progress, loot.itemId, loot.quantity);
  loot.quantity = result.remaining;
  if (loot.quantity <= 0) destroyLoot(loots, loot);
  return {
    ok: result.added > 0,
    itemId: loot.itemId,
    added: result.added,
    remaining: result.remaining,
    ...(result.added <= 0 && result.remaining > 0 ? { reason: 'inventory_full' as const } : {}),
  };
}

export function updateGroundLoot(
  loots: GroundLoot[], ticker: Ticker, player: Container, progress: CharacterProgress, collectorCharacterId: string,
  onCollected: (itemId: string, quantity: number) => void,
  onInventoryFull: () => void,
) {
  for (let i = loots.length - 1; i >= 0; i--) {
    const loot = loots[i];
    loot.ageMs += ticker.deltaMS;
    loot.phase += ticker.deltaTime * .055;
    loot.view.y += Math.sin(loot.phase) * .07 * ticker.deltaTime;
    loot.view.rotation = Math.sin(loot.phase * .45) * .04;

    if (loot.ageMs > 90000) { destroyLoot(loots, loot); continue; }
    if (loot.ownerCharacterId !== collectorCharacterId) continue;
    if (distance(player.x, player.y, loot.view.x, loot.view.y) > 62) continue;
    const result = collectGroundLoot(loots, loot, progress, collectorCharacterId);
    if (result.added > 0) onCollected(result.itemId, result.added);
    if (result.reason === 'inventory_full' && !loot.fullWarned) { loot.fullWarned = true; onInventoryFull(); }
  }
}
