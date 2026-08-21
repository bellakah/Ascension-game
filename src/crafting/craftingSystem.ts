import type { CharacterProgress } from '../character/characterCreator';
import { addItem, ensureInventoryState, getItem, itemQuantity, removeItem } from '../items/itemCatalog';
import type { CraftingRecipe } from './recipeCatalog';

export type CraftResult = {
  ok: boolean;
  reason?: string;
  crafted?: number;
  outputItemId?: string;
  outputQuantity?: number;
};

export function maxCraftable(progress: CharacterProgress, recipe: CraftingRecipe) {
  if ((recipe.requiredLevel ?? 1) > progress.level) return 0;
  let max = Infinity;
  for (const input of recipe.inputs) {
    max = Math.min(max, Math.floor(itemQuantity(progress, input.itemId) / Math.max(1, input.quantity)));
  }
  return Number.isFinite(max) ? Math.max(0, max) : 0;
}

export function canCraft(progress: CharacterProgress, recipe: CraftingRecipe, amount = 1) {
  const count = Math.max(1, Math.floor(amount));
  if ((recipe.requiredLevel ?? 1) > progress.level) return { ok: false, reason: `Requer nível ${recipe.requiredLevel}.` };
  for (const input of recipe.inputs) {
    const needed = input.quantity * count;
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
  const inventorySnapshot = state.inventory.map((stack) => ({ ...stack }));

  for (const input of recipe.inputs) {
    const needed = input.quantity * count;
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
