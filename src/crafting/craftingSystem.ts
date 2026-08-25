import type { CharacterProgress } from '../character/characterCreator';
import { activeEventRecords } from '../events/eventRuntime';
import { addItem, ensureInventoryState, getItem, itemQuantity, removeItem } from '../items/itemCatalog';
import { getQuestState } from '../quests/questEngine';
import type { CraftingOutput, CraftingRecipe } from './recipeCatalog';

export type CraftResult = {
  ok: boolean;
  reason?: string;
  crafted?: number;
  outputItemId?: string;
  outputQuantity?: number;
  granted?: Array<{ itemId: string; quantity: number }>;
};

function requirementsCheck(progress: CharacterProgress, recipe: CraftingRecipe) {
  if ((recipe.requiredLevel ?? 1) > progress.level) return { ok: false, reason: `Requer nível ${recipe.requiredLevel}.` };
  if (recipe.classIds?.length && !recipe.classIds.includes(progress.classId)) return { ok: false, reason: 'Sua classe não pode fabricar esta receita.' };
  if (recipe.completedQuests?.some((questId) => getQuestState(progress, questId)?.status !== 'completed')) return { ok: false, reason: 'Uma missão obrigatória ainda não foi concluída.' };
  if (recipe.eventKey && !activeEventRecords().some((event) => event.key === recipe.eventKey)) return { ok: false, reason: 'Esta receita só fica disponível durante o evento configurado.' };
  if (recipe.learnMode === 'item' && recipe.learnItemId && itemQuantity(progress, recipe.learnItemId) <= 0) return { ok: false, reason: `Requer ${getItem(recipe.learnItemId)?.name ?? recipe.learnItemId} para conhecer a receita.` };
  if (recipe.learnMode === 'quest' && recipe.learnQuestId && getQuestState(progress, recipe.learnQuestId)?.status !== 'completed') return { ok: false, reason: 'Você ainda não aprendeu esta receita pela missão necessária.' };
  if (recipe.learnMode === 'event' && recipe.eventKey && !activeEventRecords().some((event) => event.key === recipe.eventKey)) return { ok: false, reason: 'Esta receita só pode ser aprendida durante o evento configurado.' };
  return { ok: true };
}

export function maxCraftable(progress: CharacterProgress, recipe: CraftingRecipe) {
  if (!requirementsCheck(progress, recipe).ok) return 0;
  let max = Infinity;
  for (const input of recipe.inputs) {
    const owned = itemQuantity(progress, input.itemId);
    if (input.consume === false) {
      if (owned < Math.max(1, input.quantity)) return 0;
      continue;
    }
    max = Math.min(max, Math.floor(owned / Math.max(1, input.quantity)));
  }
  return Number.isFinite(max) ? Math.max(0, max) : 99;
}

export function canCraft(progress: CharacterProgress, recipe: CraftingRecipe, amount = 1) {
  const count = Math.max(1, Math.floor(amount));
  const requirements = requirementsCheck(progress, recipe);
  if (!requirements.ok) return requirements;
  for (const input of recipe.inputs) {
    const needed = input.consume === false ? Math.max(1, input.quantity) : input.quantity * count;
    const owned = itemQuantity(progress, input.itemId);
    if (owned < needed) return { ok: false, reason: `Falta ${needed - owned}x ${getItem(input.itemId)?.name ?? input.itemId}.` };
  }
  return { ok: true };
}

function rolledQuantity(output: CraftingOutput, crafts: number) {
  const chance = Math.max(0, Math.min(1, output.chance ?? 1));
  let successes = 0;
  for (let index = 0; index < crafts; index++) if (Math.random() <= chance) successes++;
  return successes * Math.max(1, output.quantity);
}

export function craft(progress: CharacterProgress, recipe: CraftingRecipe, amount = 1): CraftResult {
  const count = Math.max(1, Math.floor(amount));
  const check = canCraft(progress, recipe, count);
  if (!check.ok) return check;

  const state = ensureInventoryState(progress);
  const inventorySnapshot = state.inventory.map((stack) => ({ ...stack }));

  for (const input of recipe.inputs) {
    if (input.consume === false) continue;
    const needed = input.quantity * count;
    const removed = removeItem(progress, input.itemId, needed);
    if (removed !== needed) {
      state.inventory = inventorySnapshot;
      return { ok: false, reason: 'Os materiais mudaram durante a fabricação. Tente novamente.' };
    }
  }

  const outputs = [recipe.output, ...(recipe.byproducts ?? [])];
  const granted: Array<{ itemId: string; quantity: number }> = [];
  for (const output of outputs) {
    const quantity = rolledQuantity(output, count);
    if (quantity <= 0) continue;
    const result = addItem(progress, output.itemId, quantity);
    if (result.remaining > 0) {
      state.inventory = inventorySnapshot;
      return { ok: false, reason: 'Não há espaço suficiente no inventário para receber todos os resultados da fabricação.' };
    }
    granted.push({ itemId: output.itemId, quantity });
  }

  const primaryQuantity = granted.find((entry) => entry.itemId === recipe.output.itemId)?.quantity ?? 0;
  return { ok: true, crafted: count, outputItemId: recipe.output.itemId, outputQuantity: primaryQuantity, granted };
}
