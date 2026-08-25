import type { CharacterProgress } from '../character/characterCreator';
import { getClassDefinition } from '../classes/classCatalog';
import { activeEventRecords } from '../events/eventRuntime';
import { addItem, ensureInventoryState, getItem, itemQuantity, removeItem } from '../items/itemCatalog';
import { getQuestState } from '../quests/questEngine';
import type { CraftingRecipe } from './recipeCatalog';

export type CraftResult = {
  ok: boolean;
  reason?: string;
  crafted?: number;
  outputItemId?: string;
  outputQuantity?: number;
};

function hasActiveEvent(eventKey?: string) {
  return !eventKey || activeEventRecords().some((event) => event.key === eventKey);
}

export function craftAccessReason(progress: CharacterProgress, recipe: CraftingRecipe) {
  if ((recipe.requiredLevel ?? 1) > progress.level) return `Requer nível ${recipe.requiredLevel}.`;
  if (recipe.requiredClasses?.length && !recipe.requiredClasses.includes(progress.classId)) {
    const names = recipe.requiredClasses.map((id) => getClassDefinition(id).name).join(', ');
    return `Receita disponível apenas para: ${names}.`;
  }
  if (recipe.requiredQuests?.some((id) => getQuestState(progress, id)?.status !== 'completed')) return 'Você ainda não concluiu as missões necessárias para esta receita.';
  if (recipe.requiredEventKey && !hasActiveEvent(recipe.requiredEventKey)) return 'Esta receita só fica disponível durante o evento configurado.';
  if (recipe.learnMode === 'quest' && recipe.learnQuestId && getQuestState(progress, recipe.learnQuestId)?.status !== 'completed') return `Aprenda esta receita concluindo a missão ${recipe.learnQuestId}.`;
  if (recipe.learnMode === 'item' && recipe.learnItemId && itemQuantity(progress, recipe.learnItemId) < 1) return `Você precisa de ${getItem(recipe.learnItemId)?.name ?? recipe.learnItemId} para conhecer esta receita.`;
  if (recipe.learnMode === 'event' && !hasActiveEvent(recipe.requiredEventKey)) return 'Esta receita ainda não foi liberada pelo evento configurado.';
  return null;
}

export function maxCraftable(progress: CharacterProgress, recipe: CraftingRecipe) {
  if (craftAccessReason(progress, recipe)) return 0;
  let max = Infinity;
  for (const input of recipe.inputs) {
    const owned = itemQuantity(progress, input.itemId);
    const quantity = Math.max(1, input.quantity);
    if (input.consume === false) {
      if (owned < quantity) return 0;
      continue;
    }
    max = Math.min(max, Math.floor(owned / quantity));
  }
  return Number.isFinite(max) ? Math.max(0, max) : 99;
}

export function canCraft(progress: CharacterProgress, recipe: CraftingRecipe, amount = 1) {
  const count = Math.max(1, Math.floor(amount));
  const access = craftAccessReason(progress, recipe);
  if (access) return { ok: false, reason: access };
  for (const input of recipe.inputs) {
    const needed = input.consume === false ? Math.max(1, input.quantity) : Math.max(1, input.quantity) * count;
    const owned = itemQuantity(progress, input.itemId);
    if (owned < needed) return { ok: false, reason: `Falta ${needed - owned}x ${getItem(input.itemId)?.name ?? input.itemId}.` };
  }
  return { ok: true };
}

export function craft(progress: CharacterProgress, recipe: CraftingRecipe, amount = 1): CraftResult {
  const count = Math.max(1, Math.floor(amount));
  const check = canCraft(progress, recipe, count);
  if (!check.ok) return check;

  const state = ensureInventoryState(progress);
  const inventorySnapshot = state.inventory.map((stack) => ({ ...stack, ...(stack.enhancement ? { enhancement: { ...stack.enhancement, gems: [...stack.enhancement.gems] } } : {}) }));

  for (const input of recipe.inputs) {
    if (input.consume === false) continue;
    const needed = Math.max(1, input.quantity) * count;
    const removed = removeItem(progress, input.itemId, needed);
    if (removed !== needed) {
      state.inventory = inventorySnapshot;
      return { ok: false, reason: 'Os materiais mudaram durante a fabricação. Tente novamente.' };
    }
  }

  const totalOutput = recipe.output.quantity * count;
  const output = addItem(progress, recipe.output.itemId, totalOutput);
  if (output.remaining > 0) {
    state.inventory = inventorySnapshot;
    return { ok: false, reason: 'Não há espaço suficiente no inventário para receber o item fabricado.' };
  }

  return {
    ok: true,
    crafted: count,
    outputItemId: recipe.output.itemId,
    outputQuantity: totalOutput,
  };
}
