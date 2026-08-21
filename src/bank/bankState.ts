import type { CharacterProgress } from '../character/characterCreator';
import { getItem, normalizeEnhancement, type InventoryStack, type ItemEnhancementData } from '../items/itemCatalog';

export type BankSaveData = {
  version: 1;
  capacity: number;
  storedCoins: number;
  items: InventoryStack[];
};

type BankProgress = CharacterProgress & { bankData?: BankSaveData };

export const DEFAULT_BANK_CAPACITY = 48;
export const MAX_BANK_CAPACITY = 120;

export function createDefaultBankData(): BankSaveData {
  return { version: 1, capacity: DEFAULT_BANK_CAPACITY, storedCoins: 0, items: [] };
}

export function ensureBankState(progress: CharacterProgress): BankSaveData {
  const target = progress as BankProgress;
  const source = target.bankData;
  if (!source || typeof source !== 'object') {
    target.bankData = createDefaultBankData();
    return target.bankData;
  }
  source.version = 1;
  source.capacity = Math.max(DEFAULT_BANK_CAPACITY, Math.min(MAX_BANK_CAPACITY, Math.floor(Number(source.capacity) || DEFAULT_BANK_CAPACITY)));
  source.storedCoins = Math.max(0, Math.floor(Number(source.storedCoins) || 0));
  if (!Array.isArray(source.items)) source.items = [];
  source.items = source.items
    .filter((stack) => stack && getItem(stack.itemId) && Number(stack.quantity) > 0)
    .map((stack) => ({
      itemId: stack.itemId,
      quantity: Math.max(1, Math.floor(Number(stack.quantity))),
      ...(stack.enhancement ? { enhancement: normalizeEnhancement(stack.enhancement) } : {}),
    }));
  target.bankData = source;
  return source;
}

function addToBank(data: BankSaveData, itemId: string, quantity: number, enhancement?: ItemEnhancementData) {
  const item = getItem(itemId);
  if (!item || quantity <= 0) return { added: 0, remaining: quantity };
  let remaining = quantity;
  const enhanced = enhancement ? normalizeEnhancement(enhancement) : undefined;
  if (!enhanced) {
    for (const stack of data.items) {
      if (stack.itemId !== itemId || stack.enhancement || stack.quantity >= item.stackMax) continue;
      const take = Math.min(item.stackMax - stack.quantity, remaining);
      stack.quantity += take; remaining -= take;
      if (remaining <= 0) break;
    }
  }
  while (remaining > 0 && data.items.length < data.capacity) {
    const take = enhanced ? 1 : Math.min(item.stackMax, remaining);
    data.items.push({ itemId, quantity: take, ...(enhanced ? { enhancement: normalizeEnhancement(enhanced) } : {}) });
    remaining -= take;
  }
  return { added: quantity - remaining, remaining };
}

export function depositInventoryStack(progress: CharacterProgress, inventoryIndex: number, requestedQuantity: number) {
  const inventoryProgress = progress as CharacterProgress & { inventory: InventoryStack[] };
  const stack = inventoryProgress.inventory[inventoryIndex];
  if (!stack) return { ok: false as const, moved: 0, reason: 'Item não encontrado no inventário.' };
  const itemId = stack.itemId;
  const quantity = Math.max(1, Math.min(stack.quantity, Math.floor(requestedQuantity || 1)));
  const bank = ensureBankState(progress);
  const transfer = addToBank(bank, itemId, quantity, stack.enhancement);
  if (transfer.added <= 0) return { ok: false as const, moved: 0, reason: 'O banco está cheio.' };
  stack.quantity -= transfer.added;
  if (stack.quantity <= 0) inventoryProgress.inventory.splice(inventoryIndex, 1);
  return { ok: true as const, moved: transfer.added, remaining: transfer.remaining, itemId };
}

export function withdrawBankStack(
  progress: CharacterProgress,
  bankIndex: number,
  requestedQuantity: number,
  addToInventory: (itemId: string, quantity: number, enhancement?: ItemEnhancementData) => { added: number; remaining: number },
) {
  const bank = ensureBankState(progress);
  const stack = bank.items[bankIndex];
  if (!stack) return { ok: false as const, moved: 0, reason: 'Item não encontrado no banco.' };
  const itemId = stack.itemId;
  const quantity = Math.max(1, Math.min(stack.quantity, Math.floor(requestedQuantity || 1)));
  const transfer = addToInventory(itemId, quantity, stack.enhancement);
  if (transfer.added <= 0) return { ok: false as const, moved: 0, reason: 'Seu inventário está cheio.' };
  stack.quantity -= transfer.added;
  if (stack.quantity <= 0) bank.items.splice(bankIndex, 1);
  return { ok: true as const, moved: transfer.added, remaining: transfer.remaining, itemId };
}

const rarityOrder = { epic: 0, rare: 1, uncommon: 2, common: 3 } as const;
const categoryOrder = { weapon: 0, equipment: 1, accessory: 2, consumable: 3, material: 4 } as const;

export function organizeBank(progress: CharacterProgress) {
  const bank = ensureBankState(progress);
  const totals = new Map<string, number>();
  const enhanced = bank.items.filter((stack) => stack.enhancement).map((stack) => ({ ...stack, enhancement: normalizeEnhancement(stack.enhancement) }));
  for (const stack of bank.items) if (!stack.enhancement) totals.set(stack.itemId, (totals.get(stack.itemId) ?? 0) + stack.quantity);
  const rebuilt: InventoryStack[] = [...enhanced];
  for (const [itemId, total] of totals) {
    const item = getItem(itemId); if (!item) continue;
    let left = total;
    while (left > 0) { const quantity = Math.min(left, item.stackMax); rebuilt.push({ itemId, quantity }); left -= quantity; }
  }
  rebuilt.sort((a, b) => {
    const ia = getItem(a.itemId), ib = getItem(b.itemId); if (!ia || !ib) return 0;
    return categoryOrder[ia.category] - categoryOrder[ib.category]
      || rarityOrder[ia.rarity] - rarityOrder[ib.rarity]
      || ia.name.localeCompare(ib.name, 'pt-BR')
      || (b.enhancement?.refine ?? 0) - (a.enhancement?.refine ?? 0);
  });
  bank.items = rebuilt.slice(0, bank.capacity);
}
