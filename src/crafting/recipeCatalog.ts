export type CraftingStationType = 'forge' | 'alchemy';

export type CraftingIngredient = { itemId: string; quantity: number };
export type CraftingRecipe = {
  id: string;
  name: string;
  description: string;
  icon: string;
  station: CraftingStationType;
  category: 'refining' | 'enhancement' | 'weapon' | 'armor' | 'accessory' | 'consumable';
  inputs: CraftingIngredient[];
  output: { itemId: string; quantity: number };
  requiredLevel?: number;
  sortOrder?: number;
};

export type CraftingStationDefinition = {
  id: string; name: string; type: CraftingStationType; map: string; x: number; y: number; radius: number; icon: string; hint: string;
};

// O futuro Editor de Crafting salvará receitas neste mesmo formato.
export const CRAFTING_RECIPES: CraftingRecipe[] = [
  { id: 'refine-iron-ingot', name: 'Lingote de Ferro', description: 'Refina minério bruto em metal utilizável na forja.', icon: '▰', station: 'forge', category: 'refining', inputs: [{ itemId: 'iron_ore', quantity: 3 }], output: { itemId: 'iron_ingot', quantity: 1 }, sortOrder: 10 },
  { id: 'refine-silver-ingot', name: 'Lingote de Prata', description: 'Prata refinada para acessórios e armas arcanas.', icon: '▱', station: 'forge', category: 'refining', inputs: [{ itemId: 'silver_ore', quantity: 3 }], output: { itemId: 'silver_ingot', quantity: 1 }, sortOrder: 20 },
  { id: 'forge-refinement-stone', name: 'Pedras de Refino', description: 'Condensa ferro, prata e energia lunar em catalisadores de aprimoramento.', icon: '💠', station: 'forge', category: 'enhancement', inputs: [{ itemId: 'iron_ingot', quantity: 1 }, { itemId: 'silver_ore', quantity: 2 }, { itemId: 'moonleaf', quantity: 1 }], output: { itemId: 'refinement_stone', quantity: 2 }, sortOrder: 21 },
  { id: 'forge-ruby-shard', name: 'Pedra Rubi', description: 'Lapida uma pedra ofensiva destinada aos soquetes de armas.', icon: '🔴', station: 'forge', category: 'enhancement', inputs: [{ itemId: 'silver_ingot', quantity: 1 }, { itemId: 'wolf_fang', quantity: 2 }], output: { itemId: 'ruby_shard', quantity: 1 }, sortOrder: 22 },
  { id: 'forge-sapphire-shard', name: 'Pedra Safira', description: 'Lapida uma pedra defensiva para armaduras.', icon: '🔵', station: 'forge', category: 'enhancement', inputs: [{ itemId: 'silver_ingot', quantity: 1 }, { itemId: 'sludge_core', quantity: 2 }], output: { itemId: 'sapphire_shard', quantity: 1 }, sortOrder: 23 },
  { id: 'forge-citrine-shard', name: 'Pedra Citrina', description: 'Lapida uma pedra vital para armaduras.', icon: '🟡', station: 'forge', category: 'enhancement', inputs: [{ itemId: 'silver_ingot', quantity: 1 }, { itemId: 'moonleaf', quantity: 2 }], output: { itemId: 'citrine_shard', quantity: 1 }, sortOrder: 24 },
  { id: 'forge-iron-sword', name: 'Espada de Ferro', description: 'Forja uma espada equilibrada para Guerreiros.', icon: '🗡️', station: 'forge', category: 'weapon', inputs: [{ itemId: 'iron_ingot', quantity: 3 }, { itemId: 'oak_wood', quantity: 1 }], output: { itemId: 'iron_sword', quantity: 1 }, sortOrder: 30 },
  { id: 'forge-arcane-staff', name: 'Cajado de Carvalho Arcano', description: 'Cajado de madeira e prata capaz de canalizar Mana com mais eficiência.', icon: '🪄', station: 'forge', category: 'weapon', inputs: [{ itemId: 'oak_wood', quantity: 3 }, { itemId: 'silver_ingot', quantity: 1 }, { itemId: 'moonleaf', quantity: 2 }], output: { itemId: 'oak_arcane_staff', quantity: 1 }, sortOrder: 40 },
  { id: 'forge-guard-armor', name: 'Armadura do Guarda', description: 'Cota reforçada com ferro e couro de criaturas da floresta.', icon: '🛡️', station: 'forge', category: 'armor', inputs: [{ itemId: 'iron_ingot', quantity: 4 }, { itemId: 'wolf_pelt', quantity: 3 }], output: { itemId: 'forged_guard_armor', quantity: 1 }, sortOrder: 50 },
  { id: 'forge-fang-charm', name: 'Amuleto da Presa', description: 'Prata refinada envolvendo presas sombrias polidas.', icon: '📿', station: 'forge', category: 'accessory', inputs: [{ itemId: 'silver_ingot', quantity: 1 }, { itemId: 'wolf_fang', quantity: 3 }], output: { itemId: 'fang_charm', quantity: 1 }, sortOrder: 60 },
  { id: 'alchemy-small-potion', name: 'Poção Pequena de Vida', description: 'Infusão simples feita com ervas frescas da clareira.', icon: '🧪', station: 'alchemy', category: 'consumable', inputs: [{ itemId: 'healing_herb', quantity: 2 }], output: { itemId: 'small_health_potion', quantity: 1 }, sortOrder: 10 },
  { id: 'alchemy-medium-potion', name: 'Poção Média de Vida', description: 'Mistura concentrada de ervas medicinais e Folha Lunar.', icon: '🧴', station: 'alchemy', category: 'consumable', inputs: [{ itemId: 'healing_herb', quantity: 3 }, { itemId: 'moonleaf', quantity: 1 }], output: { itemId: 'medium_health_potion', quantity: 1 }, sortOrder: 20 },
  { id: 'alchemy-large-potion', name: 'Poção Grande de Vida', description: 'Elixir potente preparado com Folha Lunar e Núcleo de Lodo.', icon: '⚗️', station: 'alchemy', category: 'consumable', inputs: [{ itemId: 'moonleaf', quantity: 3 }, { itemId: 'sludge_core', quantity: 1 }], output: { itemId: 'large_health_potion', quantity: 1 }, sortOrder: 30 },
];

export const CRAFTING_STATIONS: CraftingStationDefinition[] = [
  { id: 'clearing-forge', name: 'Forja da Clareira', type: 'forge', map: 'Floresta Inicial', x: 665, y: 1355, radius: 82, icon: '⚒', hint: 'Usar forja' },
  { id: 'clearing-alchemy', name: 'Bancada de Alquimia', type: 'alchemy', map: 'Floresta Inicial', x: 1275, y: 1355, radius: 78, icon: '⚗', hint: 'Preparar alquimia' },
];

export const CRAFTING_CATEGORY_LABELS: Record<CraftingRecipe['category'], string> = {
  refining: 'Refino', enhancement: 'Aprimoramento', weapon: 'Armas', armor: 'Armaduras', accessory: 'Acessórios', consumable: 'Consumíveis',
};
export const CRAFTING_STATION_LABELS: Record<CraftingStationType, string> = { forge: 'Forja', alchemy: 'Alquimia' };
export function recipesForStation(type: CraftingStationType) { return CRAFTING_RECIPES.filter((recipe) => recipe.station === type).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)); }
export function getRecipe(id: string) { return CRAFTING_RECIPES.find((recipe) => recipe.id === id); }
