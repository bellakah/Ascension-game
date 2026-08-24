import type { CharacterProgress } from '../character/characterCreator';
import { addItem, ensureInventoryState, getItem } from '../items/itemCatalog';
import type { CollectibleDefinition, CollectibleDrop } from './collectibleTypes';

export function hasRequiredGatheringTool(progress: CharacterProgress, definition: CollectibleDefinition) {
  if (!definition.requiredToolItemId) return true;
  return ensureInventoryState(progress).inventory.some((stack) => stack.itemId === definition.requiredToolItemId && stack.quantity > 0);
}

export function requiredGatheringToolName(definition: CollectibleDefinition) {
  if (!definition.requiredToolItemId) return '';
  return getItem(definition.requiredToolItemId)?.name ?? definition.requiredToolItemId;
}

function quantity(drop: CollectibleDrop) {
  const min = Math.max(1, Math.floor(drop.min || 1));
  const max = Math.max(min, Math.floor(drop.max || min));
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function rollCollectibleDrops(progress: CharacterProgress, definition: CollectibleDefinition) {
  const rewards: Array<{ itemId: string; requested: number; added: number; remaining: number }> = [];
  for (const drop of definition.drops) {
    if (!drop.itemId || Math.random() > Math.max(0, Math.min(1, drop.chance))) continue;
    const requested = quantity(drop);
    const result = addItem(progress, drop.itemId, requested);
    rewards.push({ itemId: drop.itemId, requested, added: result.added, remaining: result.remaining });
  }
  return rewards;
}
