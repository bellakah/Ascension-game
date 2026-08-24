import type { CharacterProgress } from '../character/characterCreator';
import type { LpcGatheringToolVisual } from '../character/lpcCharacter';
import { addItem, ensureInventoryState, getItem } from '../items/itemCatalog';
import { resolveItemStudioRecord } from '../items/itemStudioStore';
import type { CollectibleDefinition, CollectibleDrop } from './collectibleTypes';

function requiredToolRecord(definition: CollectibleDefinition) {
  if (!definition.requiredToolItemId && !definition.requiredToolNumericId) return null;
  return resolveItemStudioRecord(definition.requiredToolItemId ?? '', definition.requiredToolNumericId);
}

function requiredToolKey(definition: CollectibleDefinition) {
  return requiredToolRecord(definition)?.key ?? definition.requiredToolItemId ?? '';
}

function normalizedToolIdentity(definition: CollectibleDefinition) {
  const record = requiredToolRecord(definition);
  const runtime = definition.requiredToolItemId ? getItem(definition.requiredToolItemId) : null;
  return [
    record?.key,
    record?.name,
    ...(record?.tags ?? []),
    definition.requiredToolItemId,
    runtime?.name,
  ]
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

export function hasRequiredGatheringTool(progress: CharacterProgress, definition: CollectibleDefinition) {
  if (!definition.requiredToolItemId && !definition.requiredToolNumericId) return true;
  const toolKey = requiredToolKey(definition);
  if (!toolKey) return false;
  return ensureInventoryState(progress).inventory.some((stack) => stack.itemId === toolKey && stack.quantity > 0);
}

export function requiredGatheringToolName(definition: CollectibleDefinition) {
  if (!definition.requiredToolItemId && !definition.requiredToolNumericId) return '';
  const record = requiredToolRecord(definition);
  if (record?.name) return record.name;
  if (definition.requiredToolItemId) return getItem(definition.requiredToolItemId)?.name ?? definition.requiredToolItemId;
  return `Item #${definition.requiredToolNumericId}`;
}

/**
 * Resolve somente ferramentas que possuem uma representação compatível no
 * Universal LPC. Ferramentas personalizadas desconhecidas retornam null para
 * nunca exibir um visual incorreto durante a coleta.
 */
export function resolveGatheringToolVisual(definition: CollectibleDefinition): LpcGatheringToolVisual | null {
  if (!definition.requiredToolItemId && !definition.requiredToolNumericId) return null;
  const record = requiredToolRecord(definition);
  const key = record?.key ?? definition.requiredToolItemId ?? '';
  if (key === 'woodcutting_axe') return 'axe';
  if (key === 'mining_pickaxe') return 'pickaxe';
  if (key === 'herbalism_shovel') return 'shovel';

  const identity = normalizedToolIdentity(definition);
  // Pickaxe precisa vir antes de axe porque a palavra inglesa contém "axe".
  if (/\bpickaxe\b|picareta|minera/.test(identity)) return 'pickaxe';
  if (/\bshovel\b|\bpa\b|herbal|ervas?/.test(identity)) return 'shovel';
  if (/\baxe\b|machado|lenhador|woodcut/.test(identity)) return 'axe';
  return null;
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
