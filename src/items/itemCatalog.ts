import type { CharacterProgress } from '../character/characterCreator';

export type ItemCategory = 'consumable' | 'material' | 'weapon' | 'equipment' | 'accessory';
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic';
export type EquipSlot = 'weapon' | 'armor' | 'boots' | 'head' | 'legs' | 'accessory';

export type ItemStats = {
  attack?: number;
  defense?: number;
  maxHp?: number;
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
};

export const ITEM_CATEGORY_LABELS: Record<ItemCategory | 'all', string> = {
  all: 'Todos',
  consumable: 'Consumíveis',
  material: 'Materiais',
  weapon: 'Armas',
  equipment: 'Equipamentos',
  accessory: 'Acessórios',
};

export const ITEM_RARITY_LABELS: Record<ItemRarity, string> = {
  common: 'Comum',
  uncommon: 'Incomum',
  rare: 'Raro',
  epic: 'Épico',
};

const ITEMS: ItemDefinition[] = [
  { id: 'small_health_potion', name: 'Poção Pequena de Vida', description: 'Uma poção simples preparada para aventureiros. Recupera 40 HP.', icon: '🧪', category: 'consumable', rarity: 'common', stackMax: 20, value: 8, heal: 40 },
  { id: 'wolf_pelt', name: 'Pele de Lobo', description: 'Pele resistente retirada de um Lobo Sombrio. Útil para artesanato e missões.', icon: '🐺', category: 'material', rarity: 'common', stackMax: 50, value: 6 },
  { id: 'wolf_fang', name: 'Presa Sombria', description: 'Uma presa afiada impregnada pela energia escura da floresta.', icon: '🦷', category: 'material', rarity: 'uncommon', stackMax: 30, value: 12 },
  { id: 'toxic_sludge', name: 'Gosma Tóxica', description: 'Substância viscosa deixada pelos Lodos Tóxicos. Ainda borbulha levemente.', icon: '🟢', category: 'material', rarity: 'common', stackMax: 50, value: 5 },
  { id: 'sludge_core', name: 'Núcleo de Lodo', description: 'Núcleo condensado de um Lodo Tóxico. É utilizado em alquimia.', icon: '🔮', category: 'material', rarity: 'uncommon', stackMax: 30, value: 15 },

  { id: 'basic_sword', name: 'Espada de Treino', description: 'Espada simples entregue a novos guerreiros.', icon: '⚔️', category: 'weapon', rarity: 'common', stackMax: 1, value: 10, equipSlot: 'weapon', stats: {} },
  { id: 'iron_sword', name: 'Espada de Ferro', description: 'Uma lâmina bem equilibrada, superior à espada de treino.', icon: '🗡️', category: 'weapon', rarity: 'uncommon', stackMax: 1, value: 55, equipSlot: 'weapon', stats: { attack: 7 } },
  { id: 'shadow_fang_blade', name: 'Lâmina da Presa Sombria', description: 'Arma rara feita com presas dos lobos da floresta.', icon: '⚔️', category: 'weapon', rarity: 'rare', stackMax: 1, value: 140, equipSlot: 'weapon', stats: { attack: 13 } },

  { id: 'chainmail', name: 'Cota de Malha Inicial', description: 'Armadura básica do Guerreiro.', icon: '🥋', category: 'equipment', rarity: 'common', stackMax: 1, value: 12, equipSlot: 'armor', stats: {} },
  { id: 'hunter_armor', name: 'Couraça do Caçador', description: 'Couraça leve reforçada para enfrentar criaturas da floresta.', icon: '🛡️', category: 'equipment', rarity: 'uncommon', stackMax: 1, value: 65, equipSlot: 'armor', stats: { defense: 3, maxHp: 10 } },
  { id: 'basic_boots', name: 'Botas de Viagem', description: 'Botas simples e confortáveis para longas caminhadas.', icon: '🥾', category: 'equipment', rarity: 'common', stackMax: 1, value: 8, equipSlot: 'boots', stats: {} },
  { id: 'forest_boots', name: 'Botas da Floresta', description: 'Botas reforçadas cobertas por couro resistente.', icon: '👢', category: 'equipment', rarity: 'uncommon', stackMax: 1, value: 48, equipSlot: 'boots', stats: { defense: 2 } },
  { id: 'wolf_hood', name: 'Capuz do Lobo', description: 'Capuz leve feito com pele de Lobo Sombrio.', icon: '🧢', category: 'equipment', rarity: 'rare', stackMax: 1, value: 95, equipSlot: 'head', stats: { defense: 2, maxHp: 8 } },
  { id: 'ranger_legs', name: 'Calças do Patrulheiro', description: 'Proteção flexível usada pelos patrulheiros da trilha.', icon: '👖', category: 'equipment', rarity: 'uncommon', stackMax: 1, value: 52, equipSlot: 'legs', stats: { defense: 2, maxHp: 5 } },

  { id: 'amber_ring', name: 'Anel de Âmbar', description: 'Um pequeno anel que pulsa com energia vital.', icon: '💍', category: 'accessory', rarity: 'rare', stackMax: 1, value: 110, equipSlot: 'accessory', stats: { maxHp: 18 } },
  { id: 'fang_charm', name: 'Amuleto da Presa', description: 'Amuleto confeccionado com uma presa escura polida.', icon: '📿', category: 'accessory', rarity: 'rare', stackMax: 1, value: 125, equipSlot: 'accessory', stats: { attack: 4, defense: 1 } },
];

export const ITEM_CATALOG = Object.fromEntries(ITEMS.map((item) => [item.id, item])) as Record<string, ItemDefinition>;

export function getItem(itemId: string) {
  return ITEM_CATALOG[itemId];
}

export function inventorySlotsUsed(progress: CharacterProgress) {
  return progress.inventory.filter((stack) => stack.quantity > 0 && getItem(stack.itemId)).length;
}

export function addItem(progress: CharacterProgress, itemId: string, quantity = 1) {
  const item = getItem(itemId);
  if (!item || quantity <= 0) return { added: 0, remaining: quantity };
  let remaining = quantity;

  for (const stack of progress.inventory) {
    if (stack.itemId !== itemId || stack.quantity >= item.stackMax) continue;
    const free = item.stackMax - stack.quantity;
    const take = Math.min(free, remaining);
    stack.quantity += take;
    remaining -= take;
    if (remaining <= 0) break;
  }

  while (remaining > 0 && inventorySlotsUsed(progress) < progress.inventoryCapacity) {
    const take = Math.min(item.stackMax, remaining);
    progress.inventory.push({ itemId, quantity: take });
    remaining -= take;
  }

  return { added: quantity - remaining, remaining };
}

export function removeItem(progress: CharacterProgress, itemId: string, quantity = 1) {
  let remaining = quantity;
  for (let i = progress.inventory.length - 1; i >= 0 && remaining > 0; i--) {
    const stack = progress.inventory[i];
    if (stack.itemId !== itemId) continue;
    const take = Math.min(stack.quantity, remaining);
    stack.quantity -= take;
    remaining -= take;
    if (stack.quantity <= 0) progress.inventory.splice(i, 1);
  }
  return quantity - remaining;
}

const rarityOrder: Record<ItemRarity, number> = { epic: 0, rare: 1, uncommon: 2, common: 3 };
const categoryOrder: Record<ItemCategory, number> = { weapon: 0, equipment: 1, accessory: 2, consumable: 3, material: 4 };

export function organizeInventory(progress: CharacterProgress) {
  const totals = new Map<string, number>();
  for (const stack of progress.inventory) totals.set(stack.itemId, (totals.get(stack.itemId) ?? 0) + stack.quantity);
  const rebuilt: CharacterProgress['inventory'] = [];
  for (const [itemId, total] of totals) {
    const item = getItem(itemId);
    if (!item) continue;
    let left = total;
    while (left > 0) {
      const quantity = Math.min(left, item.stackMax);
      rebuilt.push({ itemId, quantity });
      left -= quantity;
    }
  }
  rebuilt.sort((a, b) => {
    const ia = getItem(a.itemId), ib = getItem(b.itemId);
    if (!ia || !ib) return 0;
    return categoryOrder[ia.category] - categoryOrder[ib.category]
      || rarityOrder[ia.rarity] - rarityOrder[ib.rarity]
      || ia.name.localeCompare(ib.name, 'pt-BR');
  });
  progress.inventory = rebuilt.slice(0, progress.inventoryCapacity);
}

function statValue(itemId: string | null, stat: keyof ItemStats) {
  if (!itemId) return 0;
  return getItem(itemId)?.stats?.[stat] ?? 0;
}

export function equipItem(progress: CharacterProgress, itemId: string) {
  const item = getItem(itemId);
  if (!item?.equipSlot) return { ok: false, reason: 'Este item não pode ser equipado.' };

  let slot: keyof CharacterProgress['equipment'];
  if (item.equipSlot === 'accessory') slot = progress.equipment.accessory1 ? 'accessory2' : 'accessory1';
  else slot = item.equipSlot;

  const oldId = progress.equipment[slot];
  const removed = removeItem(progress, itemId, 1);
  if (!removed) return { ok: false, reason: 'Item não encontrado no inventário.' };

  if (oldId) {
    const returned = addItem(progress, oldId, 1);
    if (returned.remaining > 0) {
      addItem(progress, itemId, 1);
      return { ok: false, reason: 'Não há espaço para guardar o equipamento atual.' };
    }
  }

  progress.attack += statValue(itemId, 'attack') - statValue(oldId, 'attack');
  progress.defense += statValue(itemId, 'defense') - statValue(oldId, 'defense');
  progress.maxHp += statValue(itemId, 'maxHp') - statValue(oldId, 'maxHp');
  progress.hp = Math.min(progress.hp, progress.maxHp);
  progress.equipment[slot] = itemId;
  return { ok: true, slot, oldId };
}

export function unequipItem(progress: CharacterProgress, slot: keyof CharacterProgress['equipment']) {
  const oldId = progress.equipment[slot];
  if (!oldId) return { ok: false, reason: 'Slot vazio.' };
  const returned = addItem(progress, oldId, 1);
  if (returned.remaining > 0) return { ok: false, reason: 'Inventário cheio.' };
  progress.attack -= statValue(oldId, 'attack');
  progress.defense -= statValue(oldId, 'defense');
  progress.maxHp -= statValue(oldId, 'maxHp');
  progress.maxHp = Math.max(1, progress.maxHp);
  progress.hp = Math.min(progress.hp, progress.maxHp);
  progress.equipment[slot] = null;
  return { ok: true };
}
