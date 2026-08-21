import type { CharacterProgress } from '../character/characterCreator';
import type { ItemCategory, ItemRarity } from '../items/itemCatalog';
import { getPetDefinition, STARTER_PET_ID } from './petCatalog';
import type { PetCollectionSettings, PetSaveData } from './petTypes';

type PetProgress = CharacterProgress & { petData?: PetSaveData };

const ALL_CATEGORIES: ItemCategory[] = ['consumable', 'material', 'weapon', 'equipment', 'accessory'];
const RARITIES: ItemRarity[] = ['common', 'uncommon', 'rare', 'epic'];

function defaultCollection(): PetCollectionSettings {
  return {
    enabled: true,
    categories: { consumable: true, material: true, weapon: true, equipment: true, accessory: true },
    minRarity: 'common',
  };
}

export function createDefaultPetData(): PetSaveData {
  return {
    version: 1,
    activePetId: STARTER_PET_ID,
    owned: { [STARTER_PET_ID]: { level: 1, exp: 0, evolutionStage: 0 } },
    collection: defaultCollection(),
  };
}

export function ensurePetState(progress: CharacterProgress): PetSaveData {
  const target = progress as PetProgress;
  const source = target.petData;
  const fallback = createDefaultPetData();
  if (!source || typeof source !== 'object') {
    target.petData = fallback;
    return fallback;
  }

  source.version = 1;
  if (!source.owned || typeof source.owned !== 'object') source.owned = {};
  if (!source.owned[STARTER_PET_ID]) source.owned[STARTER_PET_ID] = { level: 1, exp: 0, evolutionStage: 0 };
  for (const state of Object.values(source.owned)) {
    state.level = Math.max(1, Math.floor(Number(state.level) || 1));
    state.exp = Math.max(0, Math.floor(Number(state.exp) || 0));
    state.evolutionStage = Math.max(0, Math.floor(Number(state.evolutionStage) || 0));
  }

  if (!source.activePetId || !source.owned[source.activePetId] || !getPetDefinition(source.activePetId)) source.activePetId = STARTER_PET_ID;
  const collection = source.collection ?? defaultCollection();
  collection.enabled = collection.enabled !== false;
  collection.categories ??= defaultCollection().categories;
  for (const category of ALL_CATEGORIES) collection.categories[category] = collection.categories[category] !== false;
  if (!RARITIES.includes(collection.minRarity)) collection.minRarity = 'common';
  source.collection = collection;
  target.petData = source;
  return source;
}

export function setPetCategory(progress: CharacterProgress, category: ItemCategory, enabled: boolean) {
  ensurePetState(progress).collection.categories[category] = enabled;
}

export function setPetMinimumRarity(progress: CharacterProgress, rarity: ItemRarity) {
  ensurePetState(progress).collection.minRarity = rarity;
}

export function setPetCollectionEnabled(progress: CharacterProgress, enabled: boolean) {
  ensurePetState(progress).collection.enabled = enabled;
}
