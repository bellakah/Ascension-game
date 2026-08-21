import type { CharacterProgress } from '../character/characterCreator';
import { getClassDefinition, normalizeClassId, type ClassId } from '../classes/classCatalog';
import { GEM_BY_ID, REFINEMENT_CONFIG } from '../equipment/refinementConfig';

export type ItemCategory = 'consumable' | 'material' | 'weapon' | 'equipment' | 'accessory';
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic';
export type EquipSlot = 'weapon' | 'armor' | 'boots' | 'head' | 'legs' | 'accessory';
export type EquipmentSlot = 'weapon' | 'armor' | 'boots' | 'head' | 'legs' | 'accessory1' | 'accessory2';
export type ItemStats = { attack?: number; defense?: number; maxHp?: number };
export type ItemEnhancementData = { refine: number; gems: Array<string | null> };
export type InventoryStack = { itemId: string; quantity: number; enhancement?: ItemEnhancementData };

export type InventoryProgress = Omit<CharacterProgress, 'inventory' | 'equipment'> & {
  inventoryCapacity: number;
  inventory: InventoryStack[];
  equipment: CharacterProgress['equipment'] & Record<'head' | 'legs' | 'accessory1' | 'accessory2', string | null>;
  equipmentEnhancements?: Partial<Record<EquipmentSlot, ItemEnhancementData>>;
};

export type ItemDefinition = {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: ItemCategory;
  rarity: ItemRarity;
  stackMax: number;
  value: number;
  equipSlot?: EquipSlot;
  stats?: ItemStats;
  heal?: number;
  capacityBonus?: number;
  allowedClasses?: ClassId[];
};

export const ITEM_CATEGORY_LABELS: Record<ItemCategory | 'all', string> = {
  all: 'Todos', consumable: 'Consumíveis', material: 'Materiais', weapon: 'Armas', equipment: 'Equipamentos', accessory: 'Acessórios',
};
export const ITEM_RARITY_LABELS: Record<ItemRarity, string> = { common: 'Comum', uncommon: 'Incomum', rare: 'Raro', epic: 'Épico' };

const ITEMS: ItemDefinition[] = [
  { id: 'small_health_potion', name: 'Poção Pequena de Vida', description: 'Uma poção simples preparada para aventureiros. Recupera 40 HP.', icon: '🧪', category: 'consumable', rarity: 'common', stackMax: 20, value: 8, heal: 40 },
  { id: 'medium_health_potion', name: 'Poção Média de Vida', description: 'Uma mistura alquímica concentrada. Recupera 90 HP.', icon: '🧴', category: 'consumable', rarity: 'uncommon', stackMax: 20, value: 18, heal: 90 },
  { id: 'large_health_potion', name: 'Poção Grande de Vida', description: 'Poção potente reservada para aventureiros experientes. Recupera 180 HP.', icon: '⚗️', category: 'consumable', rarity: 'rare', stackMax: 15, value: 36, heal: 180 },
  { id: 'adventurer_bag', name: 'Bolsa de Aventureiro', description: 'Aumenta permanentemente o inventário em 6 slots, até 48.', icon: '🎒', category: 'consumable', rarity: 'uncommon', stackMax: 1, value: 55, capacityBonus: 6 },
  { id: 'reinforced_bag', name: 'Bolsa Reforçada', description: 'Aumenta permanentemente o inventário em 12 slots, até 48.', icon: '🧳', category: 'consumable', rarity: 'rare', stackMax: 1, value: 105, capacityBonus: 12 },

  { id: 'wolf_pelt', name: 'Pele de Lobo', description: 'Pele resistente retirada de um Lobo Sombrio.', icon: '🐺', category: 'material', rarity: 'common', stackMax: 50, value: 6 },
  { id: 'wolf_fang', name: 'Presa Sombria', description: 'Presa impregnada pela energia escura da floresta.', icon: '🦷', category: 'material', rarity: 'uncommon', stackMax: 30, value: 12 },
  { id: 'toxic_sludge', name: 'Gosma Tóxica', description: 'Substância viscosa deixada pelos Lodos Tóxicos.', icon: '🟢', category: 'material', rarity: 'common', stackMax: 50, value: 5 },
  { id: 'sludge_core', name: 'Núcleo de Lodo', description: 'Núcleo condensado utilizado em alquimia.', icon: '🔮', category: 'material', rarity: 'uncommon', stackMax: 30, value: 15 },
  { id: 'iron_ore', name: 'Minério de Ferro', description: 'Minério bruto que pode ser refinado na forja.', icon: '⛏️', category: 'material', rarity: 'common', stackMax: 60, value: 5 },
  { id: 'silver_ore', name: 'Minério de Prata', description: 'Minério claro usado por ferreiros e artesãos arcanos.', icon: '◇', category: 'material', rarity: 'uncommon', stackMax: 50, value: 9 },
  { id: 'iron_ingot', name: 'Lingote de Ferro', description: 'Ferro refinado para armas e armaduras.', icon: '▰', category: 'material', rarity: 'uncommon', stackMax: 40, value: 18 },
  { id: 'silver_ingot', name: 'Lingote de Prata', description: 'Prata refinada usada em acessórios e equipamentos arcanos.', icon: '▱', category: 'material', rarity: 'rare', stackMax: 40, value: 32 },
  { id: 'oak_wood', name: 'Madeira de Carvalho', description: 'Madeira firme para cabos e cajados.', icon: '🪵', category: 'material', rarity: 'common', stackMax: 60, value: 5 },
  { id: 'healing_herb', name: 'Erva-da-Clareira', description: 'Erva medicinal usada em poções.', icon: '🌿', category: 'material', rarity: 'common', stackMax: 60, value: 5 },
  { id: 'moonleaf', name: 'Folha Lunar', description: 'Erva azulada valiosa em alquimia.', icon: '🍃', category: 'material', rarity: 'uncommon', stackMax: 50, value: 12 },
  { id: 'refinement_stone', name: 'Pedra de Refino', description: 'Catalisador consumido ao tentar elevar o nível de refino de um equipamento.', icon: '💠', category: 'material', rarity: 'uncommon', stackMax: 99, value: 18 },
  { id: 'ruby_shard', name: 'Pedra Rubi', description: 'Pedra de soquete que aumenta Ataque quando aplicada em armas.', icon: '🔴', category: 'material', rarity: 'rare', stackMax: 50, value: 55 },
  { id: 'sapphire_shard', name: 'Pedra Safira', description: 'Pedra de soquete que aumenta Defesa quando aplicada em equipamentos.', icon: '🔵', category: 'material', rarity: 'rare', stackMax: 50, value: 55 },
  { id: 'citrine_shard', name: 'Pedra Citrina', description: 'Pedra de soquete que aumenta HP máximo quando aplicada em equipamentos.', icon: '🟡', category: 'material', rarity: 'rare', stackMax: 50, value: 55 },

  { id: 'basic_sword', name: 'Espada de Treino', description: 'Espada simples entregue a novos guerreiros.', icon: '⚔️', category: 'weapon', rarity: 'common', stackMax: 1, value: 10, equipSlot: 'weapon', stats: {}, allowedClasses: ['warrior'] },
  { id: 'iron_sword', name: 'Espada de Ferro', description: 'Uma lâmina bem equilibrada.', icon: '🗡️', category: 'weapon', rarity: 'uncommon', stackMax: 1, value: 55, equipSlot: 'weapon', stats: { attack: 7 }, allowedClasses: ['warrior'] },
  { id: 'shadow_fang_blade', name: 'Lâmina da Presa Sombria', description: 'Arma rara feita com presas dos lobos.', icon: '⚔️', category: 'weapon', rarity: 'rare', stackMax: 1, value: 140, equipSlot: 'weapon', stats: { attack: 13 }, allowedClasses: ['warrior'] },
  { id: 'apprentice_staff', name: 'Cajado de Aprendiz', description: 'Cajado simples para canalizar Mana.', icon: '🪄', category: 'weapon', rarity: 'common', stackMax: 1, value: 16, equipSlot: 'weapon', stats: {}, allowedClasses: ['mage'] },
  { id: 'oak_arcane_staff', name: 'Cajado de Carvalho Arcano', description: 'Cajado reforçado com prata e Folha Lunar.', icon: '🪄', category: 'weapon', rarity: 'rare', stackMax: 1, value: 145, equipSlot: 'weapon', stats: { attack: 12, maxHp: 6 }, allowedClasses: ['mage'] },

  { id: 'chainmail', name: 'Cota de Malha Inicial', description: 'Armadura básica do Guerreiro.', icon: '🥋', category: 'equipment', rarity: 'common', stackMax: 1, value: 12, equipSlot: 'armor', stats: {}, allowedClasses: ['warrior'] },
  { id: 'hunter_armor', name: 'Couraça do Caçador', description: 'Couraça leve reforçada.', icon: '🛡️', category: 'equipment', rarity: 'uncommon', stackMax: 1, value: 65, equipSlot: 'armor', stats: { defense: 3, maxHp: 10 } },
  { id: 'forged_guard_armor', name: 'Armadura do Guarda', description: 'Armadura de ferro reforçada com couro.', icon: '🛡️', category: 'equipment', rarity: 'rare', stackMax: 1, value: 155, equipSlot: 'armor', stats: { defense: 6, maxHp: 22 }, allowedClasses: ['warrior'] },
  { id: 'basic_boots', name: 'Botas de Viagem', description: 'Botas simples para longas caminhadas.', icon: '🥾', category: 'equipment', rarity: 'common', stackMax: 1, value: 8, equipSlot: 'boots', stats: {} },
  { id: 'forest_boots', name: 'Botas da Floresta', description: 'Botas reforçadas de couro.', icon: '👢', category: 'equipment', rarity: 'uncommon', stackMax: 1, value: 48, equipSlot: 'boots', stats: { defense: 2 } },
  { id: 'wolf_hood', name: 'Capuz do Lobo', description: 'Capuz feito com pele de Lobo Sombrio.', icon: '🧢', category: 'equipment', rarity: 'rare', stackMax: 1, value: 95, equipSlot: 'head', stats: { defense: 2, maxHp: 8 } },
  { id: 'ranger_legs', name: 'Calças do Patrulheiro', description: 'Proteção flexível de patrulheiro.', icon: '👖', category: 'equipment', rarity: 'uncommon', stackMax: 1, value: 52, equipSlot: 'legs', stats: { defense: 2, maxHp: 5 } },
  { id: 'amber_ring', name: 'Anel de Âmbar', description: 'Anel que pulsa com energia vital.', icon: '💍', category: 'accessory', rarity: 'rare', stackMax: 1, value: 110, equipSlot: 'accessory', stats: { maxHp: 18 } },
  { id: 'fang_charm', name: 'Amuleto da Presa', description: 'Amuleto confeccionado com uma presa escura.', icon: '📿', category: 'accessory', rarity: 'rare', stackMax: 1, value: 125, equipSlot: 'accessory', stats: { attack: 4, defense: 1 } },
];

export const ITEM_CATALOG = Object.fromEntries(ITEMS.map((item) => [item.id, item])) as Record<string, ItemDefinition>;
export function getItem(itemId: string) { return ITEM_CATALOG[itemId]; }

export function normalizeEnhancement(value?: Partial<ItemEnhancementData> | null): ItemEnhancementData {
  return {
    refine: Math.max(0, Math.min(REFINEMENT_CONFIG.maxLevel, Math.floor(Number(value?.refine ?? 0)))),
    gems: Array.isArray(value?.gems) ? value!.gems.map((gem) => typeof gem === 'string' ? gem : null) : [],
  };
}

export function ensureInventoryState(progress: CharacterProgress): InventoryProgress {
  const state = progress as unknown as InventoryProgress;
  if (!Number.isFinite(state.inventoryCapacity) || state.inventoryCapacity < 1) state.inventoryCapacity = 24;
  if (!Array.isArray(state.inventory)) state.inventory = [];
  state.inventory = state.inventory
    .filter((stack) => stack && getItem(stack.itemId) && Number(stack.quantity) > 0)
    .map((stack) => ({ itemId: stack.itemId, quantity: Math.max(1, Math.floor(Number(stack.quantity))), ...(stack.enhancement ? { enhancement: normalizeEnhancement(stack.enhancement) } : {}) }));

  const defaults = getClassDefinition(normalizeClassId(state.classId)).startingEquipment;
  const rawEquipment = (state.equipment ?? {}) as Partial<Record<EquipmentSlot, string | null>>;
  const has = (slot: EquipmentSlot) => Object.prototype.hasOwnProperty.call(rawEquipment, slot);
  if (!has('weapon')) rawEquipment.weapon = defaults.weapon;
  if (!has('armor')) rawEquipment.armor = defaults.armor;
  if (!has('boots')) rawEquipment.boots = defaults.boots;
  if (!has('head')) rawEquipment.head = null;
  if (!has('legs')) rawEquipment.legs = null;
  if (!has('accessory1')) rawEquipment.accessory1 = null;
  if (!has('accessory2')) rawEquipment.accessory2 = null;
  state.equipment = rawEquipment as InventoryProgress['equipment'];
  state.equipmentEnhancements ??= {};
  for (const slot of Object.keys(state.equipment) as EquipmentSlot[]) {
    if (state.equipment[slot] && !state.equipmentEnhancements[slot]) state.equipmentEnhancements[slot] = normalizeEnhancement();
    if (!state.equipment[slot]) delete state.equipmentEnhancements[slot];
  }
  return state;
}

export function inventorySlotsUsed(progress: CharacterProgress) { return ensureInventoryState(progress).inventory.filter((stack) => stack.quantity > 0 && getItem(stack.itemId)).length; }

export function addItem(progress: CharacterProgress, itemId: string, quantity = 1, enhancement?: ItemEnhancementData) {
  const state = ensureInventoryState(progress), item = getItem(itemId);
  if (!item || quantity <= 0) return { added: 0, remaining: quantity };
  let remaining = quantity;
  const enhanced = enhancement ? normalizeEnhancement(enhancement) : undefined;
  if (!enhanced) {
    for (const stack of state.inventory) {
      if (stack.itemId !== itemId || stack.enhancement || stack.quantity >= item.stackMax) continue;
      const take = Math.min(item.stackMax - stack.quantity, remaining);
      stack.quantity += take; remaining -= take;
      if (remaining <= 0) break;
    }
  }
  while (remaining > 0 && inventorySlotsUsed(state) < state.inventoryCapacity) {
    const take = enhanced ? 1 : Math.min(item.stackMax, remaining);
    state.inventory.push({ itemId, quantity: take, ...(enhanced ? { enhancement: normalizeEnhancement(enhanced) } : {}) });
    remaining -= take;
  }
  return { added: quantity - remaining, remaining };
}

export function removeItem(progress: CharacterProgress, itemId: string, quantity = 1) {
  const state = ensureInventoryState(progress);
  let remaining = quantity;
  const indices = state.inventory.map((stack, index) => ({ stack, index })).filter((entry) => entry.stack.itemId === itemId).sort((a, b) => Number(Boolean(a.stack.enhancement)) - Number(Boolean(b.stack.enhancement)) || b.index - a.index);
  for (const entry of indices) {
    if (remaining <= 0) break;
    const stack = state.inventory[entry.index];
    if (!stack || stack.itemId !== itemId) continue;
    const take = Math.min(stack.quantity, remaining);
    stack.quantity -= take; remaining -= take;
  }
  state.inventory = state.inventory.filter((stack) => stack.quantity > 0);
  return quantity - remaining;
}

export function itemQuantity(progress: CharacterProgress, itemId: string) {
  return ensureInventoryState(progress).inventory.reduce((total, stack) => total + (stack.itemId === itemId ? stack.quantity : 0), 0);
}

const rarityOrder: Record<ItemRarity, number> = { epic: 0, rare: 1, uncommon: 2, common: 3 };
const categoryOrder: Record<ItemCategory, number> = { weapon: 0, equipment: 1, accessory: 2, consumable: 3, material: 4 };
export function organizeInventory(progress: CharacterProgress) {
  const state = ensureInventoryState(progress), totals = new Map<string, number>();
  const enhanced = state.inventory.filter((stack) => stack.enhancement).map((stack) => ({ ...stack, enhancement: normalizeEnhancement(stack.enhancement) }));
  for (const stack of state.inventory) if (!stack.enhancement) totals.set(stack.itemId, (totals.get(stack.itemId) ?? 0) + stack.quantity);
  const rebuilt: InventoryStack[] = [...enhanced];
  for (const [itemId, total] of totals) {
    const item = getItem(itemId); if (!item) continue;
    let left = total;
    while (left > 0) { const quantity = Math.min(left, item.stackMax); rebuilt.push({ itemId, quantity }); left -= quantity; }
  }
  rebuilt.sort((a, b) => {
    const ia = getItem(a.itemId), ib = getItem(b.itemId); if (!ia || !ib) return 0;
    return categoryOrder[ia.category] - categoryOrder[ib.category] || rarityOrder[ia.rarity] - rarityOrder[ib.rarity] || ia.name.localeCompare(ib.name, 'pt-BR') || (b.enhancement?.refine ?? 0) - (a.enhancement?.refine ?? 0);
  });
  state.inventory = rebuilt.slice(0, state.inventoryCapacity);
}

function baseStat(itemId: string | null, stat: keyof ItemStats) { return itemId ? (getItem(itemId)?.stats?.[stat] ?? 0) : 0; }

export function enhancementStats(slot: EquipmentSlot, enhancement?: ItemEnhancementData | null): ItemStats {
  const meta = normalizeEnhancement(enhancement);
  const result: ItemStats = {};
  const rule = REFINEMENT_CONFIG.refineBonusBySlot[slot];
  const refineValue = rule.values[Math.min(meta.refine, rule.values.length - 1)] ?? 0;
  if (refineValue) result[rule.stat] = (result[rule.stat] ?? 0) + refineValue;
  for (const gemId of meta.gems) {
    if (!gemId) continue;
    const gem = GEM_BY_ID[gemId]; if (!gem) continue;
    for (const stat of ['attack', 'defense', 'maxHp'] as const) result[stat] = (result[stat] ?? 0) + (gem.bonus[stat] ?? 0);
  }
  return result;
}

export function equipmentTotalStats(itemId: string | null, slot: EquipmentSlot, enhancement?: ItemEnhancementData | null): ItemStats {
  const extra = enhancementStats(slot, enhancement);
  return { attack: baseStat(itemId, 'attack') + (extra.attack ?? 0), defense: baseStat(itemId, 'defense') + (extra.defense ?? 0), maxHp: baseStat(itemId, 'maxHp') + (extra.maxHp ?? 0) };
}

export function applyEquipmentStatDelta(progress: CharacterProgress, slot: EquipmentSlot, before: ItemEnhancementData, after: ItemEnhancementData) {
  const state = ensureInventoryState(progress), itemId = state.equipment[slot];
  if (!itemId) return;
  const oldStats = equipmentTotalStats(itemId, slot, before), newStats = equipmentTotalStats(itemId, slot, after);
  state.attack += (newStats.attack ?? 0) - (oldStats.attack ?? 0);
  state.defense += (newStats.defense ?? 0) - (oldStats.defense ?? 0);
  state.maxHp += (newStats.maxHp ?? 0) - (oldStats.maxHp ?? 0);
  state.maxHp = Math.max(1, state.maxHp); state.hp = Math.min(state.hp, state.maxHp);
}

export function equipItem(progress: CharacterProgress, itemId: string, inventoryIndex?: number) {
  const state = ensureInventoryState(progress), item = getItem(itemId);
  if (!item?.equipSlot) return { ok: false, reason: 'Este item não pode ser equipado.' };
  const classId = normalizeClassId(state.classId);
  if (item.allowedClasses?.length && !item.allowedClasses.includes(classId)) return { ok: false, reason: `${item.name} não pode ser usado pela classe ${getClassDefinition(classId).name}.` };
  let slot: EquipmentSlot = item.equipSlot === 'accessory' ? (state.equipment.accessory1 ? 'accessory2' : 'accessory1') : item.equipSlot;
  const index = inventoryIndex != null && state.inventory[inventoryIndex]?.itemId === itemId ? inventoryIndex : state.inventory.findIndex((stack) => stack.itemId === itemId);
  if (index < 0) return { ok: false, reason: 'Item não encontrado no inventário.' };
  const incoming = state.inventory[index], incomingMeta = normalizeEnhancement(incoming.enhancement);
  const oldId = state.equipment[slot], oldMeta = normalizeEnhancement(state.equipmentEnhancements?.[slot]);
  if (oldId && inventorySlotsUsed(state) >= state.inventoryCapacity && incoming.quantity <= 0) return { ok: false, reason: 'Não há espaço para guardar o equipamento atual.' };
  incoming.quantity -= 1; if (incoming.quantity <= 0) state.inventory.splice(index, 1);
  if (oldId) {
    const returned = addItem(state as unknown as CharacterProgress, oldId, 1, oldMeta);
    if (returned.remaining > 0) { addItem(state as unknown as CharacterProgress, itemId, 1, incomingMeta); return { ok: false, reason: 'Não há espaço para guardar o equipamento atual.' }; }
  }
  const oldStats = equipmentTotalStats(oldId, slot, oldMeta), newStats = equipmentTotalStats(itemId, slot, incomingMeta);
  state.attack += (newStats.attack ?? 0) - (oldStats.attack ?? 0);
  state.defense += (newStats.defense ?? 0) - (oldStats.defense ?? 0);
  state.maxHp += (newStats.maxHp ?? 0) - (oldStats.maxHp ?? 0);
  state.hp = Math.min(state.hp, state.maxHp);
  state.equipment[slot] = itemId;
  state.equipmentEnhancements ??= {}; state.equipmentEnhancements[slot] = incomingMeta;
  return { ok: true, slot, oldId };
}

export function unequipItem(progress: CharacterProgress, slot: EquipmentSlot) {
  const state = ensureInventoryState(progress), oldId = state.equipment[slot];
  if (!oldId) return { ok: false, reason: 'Slot vazio.' };
  const oldMeta = normalizeEnhancement(state.equipmentEnhancements?.[slot]);
  const returned = addItem(state as unknown as CharacterProgress, oldId, 1, oldMeta);
  if (returned.remaining > 0) return { ok: false, reason: 'Inventário cheio.' };
  const stats = equipmentTotalStats(oldId, slot, oldMeta);
  state.attack -= stats.attack ?? 0; state.defense -= stats.defense ?? 0; state.maxHp -= stats.maxHp ?? 0;
  state.maxHp = Math.max(1, state.maxHp); state.hp = Math.min(state.hp, state.maxHp); state.equipment[slot] = null;
  if (state.equipmentEnhancements) delete state.equipmentEnhancements[slot];
  return { ok: true };
}
