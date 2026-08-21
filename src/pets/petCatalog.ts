import type { PetDefinition, PetId } from './petTypes';

export const STARTER_PET_ID: PetId = 'clearing_spirit';

export const PET_CATALOG: PetDefinition[] = [
  {
    id: STARTER_PET_ID,
    name: 'Espírito da Clareira',
    icon: '🌱',
    description: 'Um pequeno espírito que acompanha aventureiros e recolhe os espólios reservados ao seu dono.',
    evolutionName: 'Broto',
    maxLevel: 10,
    collection: {
      radius: 190,
      moveSpeed: 5.2,
      maxDropsPerTrip: 1,
      pickupCooldownMs: 900,
      pickupDistance: 25,
      followDistance: 58,
      teleportDistance: 520,
    },
  },
];

const PET_BY_ID = Object.fromEntries(PET_CATALOG.map((pet) => [pet.id, pet])) as Record<string, PetDefinition>;
export function getPetDefinition(id: PetId | null | undefined) { return id ? PET_BY_ID[id] : undefined; }
