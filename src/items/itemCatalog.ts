import type { CharacterProgress } from '../character/characterCreator';
import { getClassDefinition, normalizeClassId, type ClassId } from '../classes/classCatalog';

export type ItemCategory = 'consumable' | 'material' | 'weapon' | 'equipment' | 'accessory';
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic';
export type EquipSlot = 'weapon' | 'armor' | 'boots' | 'head' | 'legs' | 'accessory';
export type EquipmentSlot = 'weapon' | 'armor' | 'boots' | 'head' | 'legs' | 'accessory1' | 'accessory2';

export type InventoryProgress = CharacterProgress & {
  inventoryCapacity: number;
  equipment: CharacterProgress['equipment'] & Record<'head' | 'legs' | 'accessory1' | 'accessory2', string | null>;
};

export type ItemStats = { attack?: number; defense?: number; maxHp?: number };
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
  { id: 'adventurer_bag', name: 'Bolsa de Aventureiro', description: 'Bolsa reforçada com compartimentos extras. Ao usar, aumenta permanentemente o inventário em 6 slots, até o limite de 48.', icon: '🎒', category: 'consumable', rarity: 'uncommon', stackMax: 1, value: 55, capacityBonus: 6 },
  { id: 'reinforced_bag', name: 'Bolsa Reforçada', description: 'Uma bolsa grande usada por mercadores de estrada. Ao usar, aumenta permanentemente o inventário em 12 slots, até o limite de 48.', icon: '🧳', category: 'consumable', rarity: 'rare', stackMax: 1, value: 105, capacityBonus: 12 },
  { id: 'wolf_pelt', name: 'Pele de Lobo', description: 'Pele resistente retirada de um Lobo Sombrio. Útil para artesanato e missões.', icon: '🐺', category: 'material', rarity: 'common', stackMax: 50, value: 6 },
  { id: 'wolf_fang', name: 'Presa Sombria', description: 'Uma presa afiada impregnada pela energia escura da floresta.', icon: '🦷', category: 'material', rarity: 'uncommon', stackMax: 30, value: 12 },
  { id: 'toxic_sludge', name: 'Gosma Tóxica', description: 'Substância viscosa deixada pelos Lodos Tóxicos. Ainda borbulha levemente.', icon: '🟢', category: 'material', rarity: 'common', stackMax: 50, value: 5 },
  { id: 'sludge_core', name: 'Núcleo de Lodo', description: 'Núcleo condensado de um Lodo Tóxico. É utilizado em alquimia.', icon: '🔮', category: 'material', rarity: 'uncommon', stackMax: 30, value: 15 },
  { id: 'basic_sword', name: 'Espada de Treino', description: 'Espada simples entregue a novos guerreiros.', icon: '⚔️', category: 'weapon', rarity: 'common', stackMax: 1, value: 10, equipSlot: 'weapon', stats: {}, allowedClasses: ['warrior'] },
  { id: 'iron_sword', name: 'Espada de Ferro', description: 'Uma lâmina bem equilibrada, superior à espada de treino.', icon: '🗡️', category: 'weapon', rarity: 'uncommon', stackMax: 1, value: 55, equipSlot: 'weapon', stats: { attack: 7 }, allowedClasses: ['warrior'] },
  { id: 'shadow_fang_blade', name: 'Lâmina da Presa Sombria', description: 'Arma rara feita com presas dos lobos da floresta.', icon: '⚔️', category: 'weapon', rarity: 'rare', stackMax: 1, value: 140, equipSlot: 'weapon', stats: { attack: 13 }, allowedClasses: ['warrior'] },
  { id: 'apprentice_staff', name: 'Cajado de Aprendiz', description: 'Cajado simples de madeira usado por magos iniciantes para canalizar Mana.', icon: '🪄', category: 'weapon', rarity: 'common', stackMax: 1, value: 16, equipSlot: 'weapon', stats: {}, allowedClasses: ['mage'] },
  { id: 'chainmail', name: 'Cota de Malha Inicial', description: 'Armadura básica do Guerreiro.', icon: '🥋', category: 'equipment', rarity: 'common', stackMax: 1, value: 12, equipSlot: 'armor', stats: {}, allowedClasses: ['warrior'] },
  { id: 'hunter_armor', name: 'Couraça do Caçador', description: 'Couraça leve reforçada para enfrentar criaturas da floresta.', icon: '🛡️', category: 'equipment', rarity: 'uncommon', stackMax: 1, value: 65, equipSlot: 'armor', stats: { defense: 3, maxHp: 10 } },
  { id: 'basic_boots', name: 'Botas de Viagem', description: 'Botas simples e confortáveis para longas caminhadas.', icon: '🥾', category: 'equipment', rarity: 'common', stackMax: 1, value: 8, equipSlot: 'boots', stats: {} },
  { id: 'forest_boots', name: 'Botas da Floresta', description: 'Botas reforçadas cobertas por couro resistente.', icon: '👢', category: 'equipment', rarity: 'uncommon', stackMax: 1, value: 48, equipSlot: 'boots', stats: { defense: 2 } },
  { id: 'wolf_hood', name: 'Capuz do Lobo', description: 'Capuz leve feito com pele de Lobo Sombrio.', icon: '🧢', category: 'equipment', rarity: 'rare', stackMax: 1, value: 95, equipSlot: 'head', stats: { defense: 2, maxHp: 8 } },
  { id: 'ranger_legs', name: 'Calças do Patrulheiro', description: 'Proteção flexível usada pelos patrulheiros da trilha.', icon: '👖', category: 'equipment', rarity: 'uncommon', stackMax: 1, value: 52, equipSlot: 'legs', stats: { defense: 2, maxHp: 5 } },
  { id: 'amber_ring', name: 'Anel de Âmbar', description: 'Um pequeno anel que pulsa com energia vital.', icon: '💍', category: 'accessory', rarity: 'rare', stackMax: 1, value: 110, equipSlot: 'accessory', stats: { maxHp: 18 } },
  { id: 'fang_charm', name: 'Amuleto da Presa', description: 'Amuleto confeccionado com uma presa escura polida.', icon: '📿', category: 'accessory', rarity: 'rare', stackMax: 1, value: 125, equipSlot: 'accessory', stats: { attack: 4, defense: 1 } },
];

export const ITEM_CATALOG = Object.fromEntries(ITEMS.map((item) => [item.id, item])) as Record<string, ItemDefinition>;
export function getItem(itemId: string) { return ITEM_CATALOG[itemId]; }

export function ensureInventoryState(progress: CharacterProgress): InventoryProgress {
  const state = progress as InventoryProgress;
  if (!Number.isFinite(state.inventoryCapacity) || state.inventoryCapacity < 1) state.inventoryCapacity = 24;
  if (!Array.isArray(state.inventory)) state.inventory = [];
  state.inventory = state.inventory.filter((stack) => stack && getItem(stack.itemId) && Number(stack.quantity) > 0).map((stack) => ({ itemId: stack.itemId, quantity: Math.max(1, Math.floor(Number(stack.quantity))) }));

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
  return state;
}

export function inventorySlotsUsed(progress: CharacterProgress) { return ensureInventoryState(progress).inventory.filter((stack) => stack.quantity > 0 && getItem(stack.itemId)).length; }

export function addItem(progress: CharacterProgress, itemId: string, quantity = 1) {
  const state = ensureInventoryState(progress), item = getItem(itemId);
  if (!item || quantity <= 0) return { added: 0, remaining: quantity };
  let remaining = quantity;
  for (const stack of state.inventory) {
    if (stack.itemId !== itemId || stack.quantity >= item.stackMax) continue;
    const take = Math.min(item.stackMax - stack.quantity, remaining);
    stack.quantity += take; remaining -= take;
    if (remaining <= 0) break;
  }
  while (remaining > 0 && inventorySlotsUsed(state) < state.inventoryCapacity) {
    const take = Math.min(item.stackMax, remaining);
    state.inventory.push({ itemId, quantity: take }); remaining -= take;
  }
  return { added: quantity - remaining, remaining };
}

export function removeItem(progress: CharacterProgress, itemId: string, quantity = 1) {
  const state = ensureInventoryState(progress);
  let remaining = quantity;
  for (let i = state.inventory.length - 1; i >= 0 && remaining > 0; i--) {
    const stack = state.inventory[i];
    if (stack.itemId !== itemId) continue;
    const take = Math.min(stack.quantity, remaining);
    stack.quantity -= take; remaining -= take;
    if (stack.quantity <= 0) state.inventory.splice(i, 1);
  }
  return quantity - remaining;
}

export function itemQuantity(progress: CharacterProgress, itemId: string) {
  return ensureInventoryState(progress).inventory.reduce((total, stack) => total + (stack.itemId === itemId ? stack.quantity : 0), 0);
}

const rarityOrder: Record<ItemRarity, number> = { epic: 0, rare: 1, uncommon: 2, common: 3 };
const categoryOrder: Record<ItemCategory, number> = { weapon: 0, equipment: 1, accessory: 2, consumable: 3, material: 4 };
export function organizeInventory(progress: CharacterProgress) {
  const state = ensureInventoryState(progress), totals = new Map<string, number>();
  for (const stack of state.inventory) totals.set(stack.itemId, (totals.get(stack.itemId) ?? 0) + stack.quantity);
  const rebuilt: CharacterProgress['inventory'] = [];
  for (const [itemId, total] of totals) {
    const item = getItem(itemId); if (!item) continue;
    let left = total;
    while (left > 0) { const quantity = Math.min(left, item.stackMax); rebuilt.push({ itemId, quantity }); left -= quantity; }
  }
  rebuilt.sort((a, b) => {
    const ia = getItem(a.itemId), ib = getItem(b.itemId); if (!ia || !ib) return 0;
    return categoryOrder[ia.category] - categoryOrder[ib.category] || rarityOrder[ia.rarity] - rarityOrder[ib.rarity] || ia.name.localeCompare(ib.name, 'pt-BR');
  });
  state.inventory = rebuilt.slice(0, state.inventoryCapacity);
}

function statValue(itemId: string | null, stat: keyof ItemStats) { return itemId ? (getItem(itemId)?.stats?.[stat] ?? 0) : 0; }

export function equipItem(progress: CharacterProgress, itemId: string) {
  const state = ensureInventoryState(progress), item = getItem(itemId);
  if (!item?.equipSlot) return { ok: false, reason: 'Este item não pode ser equipado.' };
  const classId = normalizeClassId(state.classId);
  if (item.allowedClasses?.length && !item.allowedClasses.includes(classId)) return { ok: false, reason: `${item.name} não pode ser usado pela classe ${getClassDefinition(classId).name}.` };
  let slot: EquipmentSlot;
  if (item.equipSlot === 'accessory') slot = state.equipment.accessory1 ? 'accessory2' : 'accessory1'; else slot = item.equipSlot;
  const oldId = state.equipment[slot];
  if (!removeItem(state, itemId, 1)) return { ok: false, reason: 'Item não encontrado no inventário.' };
  if (oldId) {
    const returned = addItem(state, oldId, 1);
    if (returned.remaining > 0) { addItem(state, itemId, 1); return { ok: false, reason: 'Não há espaço para guardar o equipamento atual.' }; }
  }
  state.attack += statValue(itemId, 'attack') - statValue(oldId, 'attack');
  state.defense += statValue(itemId, 'defense') - statValue(oldId, 'defense');
  state.maxHp += statValue(itemId, 'maxHp') - statValue(oldId, 'maxHp');
  state.hp = Math.min(state.hp, state.maxHp);
  state.equipment[slot] = itemId;
  return { ok: true, slot, oldId };
}

export function unequipItem(progress: CharacterProgress, slot: EquipmentSlot) {
  const state = ensureInventoryState(progress), oldId = state.equipment[slot];
  if (!oldId) return { ok: false, reason: 'Slot vazio.' };
  const returned = addItem(state, oldId, 1);
  if (returned.remaining > 0) return { ok: false, reason: 'Inventário cheio.' };
  state.attack -= statValue(oldId, 'attack'); state.defense -= statValue(oldId, 'defense'); state.maxHp -= statValue(oldId, 'maxHp');
  state.maxHp = Math.max(1, state.maxHp); state.hp = Math.min(state.hp, state.maxHp); state.equipment[slot] = null;
  return { ok: true };
}
