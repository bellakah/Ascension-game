import { listPublishedCraftRecipeRecords, listPublishedCraftStationTypeRecords } from './craftStudioStore';
import type { CraftLearnMode } from './craftStudioTypes';

export type CraftingStationType = string;
export type CraftingIngredient = { itemId: string; quantity: number; consume?: boolean };
export type CraftingOutput = { itemId: string; quantity: number; chance?: number };
export type CraftingRecipe = {
  id: string;
  numericId?: number;
  name: string;
  description: string;
  icon: string;
  station: CraftingStationType;
  category: string;
  inputs: CraftingIngredient[];
  output: CraftingOutput;
  byproducts?: CraftingOutput[];
  requiredLevel?: number;
  classIds?: string[];
  completedQuests?: string[];
  eventKey?: string;
  learnMode?: CraftLearnMode;
  learnItemId?: string;
  learnQuestId?: string;
  sortOrder?: number;
};

export type CraftingStationDefinition = {
  id: string;
  name: string;
  type: CraftingStationType;
  map: string;
  x: number;
  y: number;
  radius: number;
  icon: string;
  hint: string;
};

function toRuntimeRecipe(record: ReturnType<typeof listPublishedCraftRecipeRecords>[number]): CraftingRecipe | null {
  const primary = record.outputs.find((output) => output.kind === 'primary');
  if (!primary) return null;
  return {
    id: record.key,
    numericId: record.numericId,
    name: record.name,
    description: record.description,
    icon: record.icon,
    station: record.stationTypeId,
    category: record.category,
    inputs: record.ingredients.map((input) => ({ itemId: input.itemId, quantity: input.quantity, consume: input.consume })),
    output: { itemId: primary.itemId, quantity: primary.quantity, chance: primary.chance },
    byproducts: record.outputs.filter((output) => output.kind === 'byproduct').map((output) => ({ itemId: output.itemId, quantity: output.quantity, chance: output.chance })),
    requiredLevel: record.requirements.minLevel,
    classIds: record.requirements.classIds,
    completedQuests: record.requirements.completedQuests,
    eventKey: record.requirements.eventKey,
    learnMode: record.requirements.learnMode,
    learnItemId: record.requirements.learnItemId,
    learnQuestId: record.requirements.learnQuestId,
    sortOrder: record.sortOrder,
  };
}

export const CRAFTING_RECIPES: CraftingRecipe[] = listPublishedCraftRecipeRecords().map(toRuntimeRecipe).filter((value): value is CraftingRecipe => Boolean(value));

// Compatibilidade: estas duas posições só são usadas quando não há mundo publicado.
// Em mapas publicados, craftingStations.ts resolve as instâncias colocadas pelo Map Editor.
export const CRAFTING_STATIONS: CraftingStationDefinition[] = [
  { id: 'clearing-forge', name: 'Forja da Clareira', type: 'forge', map: 'Floresta Inicial', x: 665, y: 1355, radius: 82, icon: '⚒', hint: 'Usar forja' },
  { id: 'clearing-alchemy', name: 'Bancada de Alquimia', type: 'alchemy', map: 'Floresta Inicial', x: 1275, y: 1355, radius: 78, icon: '⚗', hint: 'Preparar alquimia' },
];

export const CRAFTING_CATEGORY_LABELS: Record<string, string> = {
  refining: 'Refino', enhancement: 'Aprimoramento', weapon: 'Armas', armor: 'Armaduras', accessory: 'Acessórios', consumable: 'Consumíveis', custom: 'Personalizado',
};
export const CRAFTING_STATION_LABELS: Record<string, string> = Object.fromEntries(listPublishedCraftStationTypeRecords().map((station) => [station.key, station.name]));
export function recipesForStation(type: CraftingStationType) { return CRAFTING_RECIPES.filter((recipe) => recipe.station === type).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)); }
export function getRecipe(id: string) { return CRAFTING_RECIPES.find((recipe) => recipe.id === id); }
