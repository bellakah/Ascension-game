import { Container, Graphics, Text, type Ticker } from 'pixi.js';
import type { CharacterProgress } from '../character/characterCreator';
import { distance } from '../game/world';
import { getItem, type ItemRarity } from '../items/itemCatalog';
import { collectGroundLoot, type GroundLoot } from '../items/lootSystem';
import { getPetDefinition } from './petCatalog';
import { ensurePetState } from './petState';

const RARITY_SCORE: Record<ItemRarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3 };

type PetSystemCallbacks = {
  onCollected: (itemId: string, quantity: number, x: number, y: number) => void;
  onInventoryFull: () => void;
};

function createPetView(name: string) {
  const view = new Container();
  const shadow = new Graphics().ellipse(0, 7, 17, 7).fill({ color: 0x000000, alpha: .24 });
  const aura = new Graphics().circle(0, -8, 22).fill({ color: 0x8de29a, alpha: .08 });
  const body = new Graphics()
    .ellipse(-8, -20, 5, 9).fill({ color: 0x75b77d })
    .ellipse(8, -20, 5, 9).fill({ color: 0x75b77d })
    .circle(0, -8, 14).fill({ color: 0xa6dc9e })
    .circle(-5, -10, 2).fill({ color: 0x193126 })
    .circle(5, -10, 2).fill({ color: 0x193126 })
    .circle(0, -4, 2).fill({ color: 0xf2d39a });
  const sprout = new Text({ text: '🌱', style: { fontSize: 14, stroke: { color: 0x17321f, width: 2 } } });
  sprout.anchor.set(.5); sprout.position.set(0, -29);
  const label = new Text({ text: name, style: { fill: 0xcff3d0, fontSize: 9, fontWeight: 'bold', stroke: { color: 0x0b1610, width: 3 } } });
  label.anchor.set(.5); label.position.set(0, -45); label.alpha = .82;
  view.addChild(shadow, aura, body, sprout, label);
  return { view, aura, body };
}

function moveToward(view: Container, x: number, y: number, speed: number, deltaTime: number) {
  const dx = x - view.x, dy = y - view.y, length = Math.hypot(dx, dy);
  if (length <= .5) return length;
  const step = Math.min(length, speed * deltaTime);
  view.x += dx / length * step;
  view.y += dy / length * step;
  return length;
}

export function createPetSystem(
  world: Container,
  player: Container,
  progress: CharacterProgress,
  ownerCharacterId: string,
  loots: GroundLoot[],
  callbacks: PetSystemCallbacks,
) {
  const save = ensurePetState(progress);
  const initialDefinition = getPetDefinition(save.activePetId);
  const visual = createPetView(initialDefinition?.name ?? 'Mascote');
  visual.view.position.set(player.x - 48, player.y + 34);
  world.addChild(visual.view);

  let target: GroundLoot | null = null;
  let returning = false;
  let collectedThisTrip = 0;
  let cooldownMs = 0;
  let phase = Math.random() * Math.PI * 2;

  const eligible = (loot: GroundLoot) => {
    const petState = ensurePetState(progress);
    const item = getItem(loot.itemId);
    if (!petState.collection.enabled || !item) return false;
    if (loot.ownerCharacterId !== ownerCharacterId) return false;
    if (!petState.collection.categories[item.category]) return false;
    if (RARITY_SCORE[item.rarity] < RARITY_SCORE[petState.collection.minRarity]) return false;
    const definition = getPetDefinition(petState.activePetId);
    if (!definition) return false;
    return distance(player.x, player.y, loot.view.x, loot.view.y) <= definition.collection.radius;
  };

  const nearestEligible = () => {
    let best: GroundLoot | null = null, bestDistance = Infinity;
    for (const loot of loots) {
      if (!eligible(loot)) continue;
      const d = distance(visual.view.x, visual.view.y, loot.view.x, loot.view.y);
      if (d < bestDistance) { best = loot; bestDistance = d; }
    }
    return best;
  };

  const update = (ticker: Ticker, canCollect: boolean) => {
    const petState = ensurePetState(progress);
    const definition = getPetDefinition(petState.activePetId);
    visual.view.visible = Boolean(definition);
    if (!definition) return;

    cooldownMs = Math.max(0, cooldownMs - ticker.deltaMS);
    phase += ticker.deltaTime * .055;
    visual.body.y = Math.sin(phase) * 1.8;
    visual.aura.alpha = .07 + (Math.sin(phase * .7) + 1) * .025;

    const homeX = player.x - 50, homeY = player.y + 34;
    if (distance(visual.view.x, visual.view.y, player.x, player.y) > definition.collection.teleportDistance) {
      visual.view.position.set(homeX, homeY);
      target = null; returning = false; collectedThisTrip = 0;
    }

    if (target && (!loots.includes(target) || !eligible(target))) target = null;
    if (!canCollect || !petState.collection.enabled) { target = null; returning = true; }

    if (returning) {
      const homeDistance = moveToward(visual.view, homeX, homeY, definition.collection.moveSpeed, ticker.deltaTime);
      if (homeDistance <= definition.collection.followDistance * .45) {
        returning = false;
        collectedThisTrip = 0;
      }
      return;
    }

    if (!target && canCollect && cooldownMs <= 0) target = nearestEligible();
    if (target) {
      const targetDistance = moveToward(visual.view, target.view.x, target.view.y, definition.collection.moveSpeed, ticker.deltaTime);
      if (targetDistance <= definition.collection.pickupDistance) {
        const x = target.view.x, y = target.view.y;
        const result = collectGroundLoot(loots, target, progress, ownerCharacterId);
        if (result.added > 0) {
          callbacks.onCollected(result.itemId, result.added, x, y);
          collectedThisTrip += 1;
        }
        if (result.reason === 'inventory_full') {
          if (!target.fullWarned) { target.fullWarned = true; callbacks.onInventoryFull(); }
          cooldownMs = Math.max(definition.collection.pickupCooldownMs, 2400);
          returning = true;
        } else {
          cooldownMs = definition.collection.pickupCooldownMs;
          if (collectedThisTrip >= definition.collection.maxDropsPerTrip) returning = true;
        }
        target = null;
      }
      return;
    }

    const homeDistance = distance(visual.view.x, visual.view.y, homeX, homeY);
    if (homeDistance > definition.collection.followDistance) moveToward(visual.view, homeX, homeY, definition.collection.moveSpeed, ticker.deltaTime);
  };

  return {
    view: visual.view,
    update,
    refresh: () => { ensurePetState(progress); },
  };
}
