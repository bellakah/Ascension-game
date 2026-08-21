import type { ItemCategory, ItemRarity } from '../items/itemCatalog';

export type PetId = string;

export type PetCollectionSettings = {
  enabled: boolean;
  categories: Record<ItemCategory, boolean>;
  minRarity: ItemRarity;
};

export type OwnedPetState = {
  level: number;
  exp: number;
  evolutionStage: number;
};

export type PetSaveData = {
  version: 1;
  activePetId: PetId | null;
  owned: Record<PetId, OwnedPetState>;
  collection: PetCollectionSettings;
};

export type PetCollectionStats = {
  radius: number;
  moveSpeed: number;
  maxDropsPerTrip: number;
  pickupCooldownMs: number;
  pickupDistance: number;
  followDistance: number;
  teleportDistance: number;
};

export type PetDefinition = {
  id: PetId;
  name: string;
  icon: string;
  description: string;
  evolutionName: string;
  maxLevel: number;
  collection: PetCollectionStats;
};
