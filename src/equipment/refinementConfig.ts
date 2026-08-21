export type RefineFailureMode = 'keep' | 'downgrade' | 'reset';
export type EnhancementStat = 'attack' | 'defense' | 'maxHp';

export type RefinementLevelRule = { targetLevel: number; successChance: number; stoneCost: number; failureMode: RefineFailureMode; failureDrop?: number };
export type SocketRule = { maxSockets: number; allowedGemIds: string[] };
export type GemDefinition = { id: string; name: string; icon: string; description: string; bonus: Partial<Record<EnhancementStat, number>>; allowedOn: Array<'weapon' | 'equipment'> };

// Configuração orientada a dados para o futuro Editor de Equipamentos.
// Limite, chance, custo, penalidade, soquetes e bônus podem ser alterados
// sem tocar na lógica do sistema.
export const REFINEMENT_CONFIG = {
  maxLevel: 12,
  stoneItemId: 'refinement_stone',
  levels: [
    { targetLevel: 1, successChance: 1, stoneCost: 1, failureMode: 'keep' },
    { targetLevel: 2, successChance: .9, stoneCost: 1, failureMode: 'downgrade', failureDrop: 1 },
    { targetLevel: 3, successChance: .8, stoneCost: 1, failureMode: 'downgrade', failureDrop: 1 },
    { targetLevel: 4, successChance: .7, stoneCost: 2, failureMode: 'downgrade', failureDrop: 1 },
    { targetLevel: 5, successChance: .6, stoneCost: 2, failureMode: 'downgrade', failureDrop: 1 },
    { targetLevel: 6, successChance: .5, stoneCost: 2, failureMode: 'downgrade', failureDrop: 1 },
    { targetLevel: 7, successChance: .4, stoneCost: 3, failureMode: 'downgrade', failureDrop: 1 },
    { targetLevel: 8, successChance: .3, stoneCost: 3, failureMode: 'downgrade', failureDrop: 1 },
    { targetLevel: 9, successChance: .22, stoneCost: 4, failureMode: 'downgrade', failureDrop: 1 },
    { targetLevel: 10, successChance: .15, stoneCost: 4, failureMode: 'downgrade', failureDrop: 1 },
    { targetLevel: 11, successChance: .1, stoneCost: 5, failureMode: 'downgrade', failureDrop: 1 },
    { targetLevel: 12, successChance: .05, stoneCost: 6, failureMode: 'downgrade', failureDrop: 1 },
  ] satisfies RefinementLevelRule[],
  refineBonusBySlot: {
    weapon: { stat: 'attack' as const, values: [0,2,4,7,10,14,19,25,32,40,50,62,76] },
    armor: { stat: 'defense' as const, values: [0,1,1,2,2,3,4,5,6,7,9,11,14] },
    head: { stat: 'defense' as const, values: [0,1,1,1,2,2,3,4,5,6,7,9,11] },
    legs: { stat: 'defense' as const, values: [0,1,1,1,2,2,3,4,5,6,7,9,11] },
    boots: { stat: 'defense' as const, values: [0,0,1,1,1,2,2,3,4,5,6,7,9] },
    accessory1: { stat: 'defense' as const, values: [0,1,1,2,2,3,4,5,6,7,8,10,12] },
    accessory2: { stat: 'defense' as const, values: [0,1,1,2,2,3,4,5,6,7,8,10,12] },
  },
};

export const GEM_CATALOG: GemDefinition[] = [
  { id: 'ruby_shard', name: 'Pedra Rubi', icon: '🔴', description: 'Pedra ofensiva para armas.', bonus: { attack: 3 }, allowedOn: ['weapon'] },
  { id: 'sapphire_shard', name: 'Pedra Safira', icon: '🔵', description: 'Pedra defensiva de alta resistência para armaduras.', bonus: { defense: 2 }, allowedOn: ['equipment'] },
  { id: 'citrine_shard', name: 'Pedra Citrina', icon: '🟡', description: 'Pedra de resistência equilibrada para armaduras.', bonus: { defense: 1 }, allowedOn: ['equipment'] },
];

export const GEM_BY_ID = Object.fromEntries(GEM_CATALOG.map((gem) => [gem.id, gem])) as Record<string, GemDefinition>;
export const SOCKET_RULES: Record<'weapon' | 'equipment', SocketRule> = {
  weapon: { maxSockets: 2, allowedGemIds: GEM_CATALOG.filter((gem) => gem.allowedOn.includes('weapon')).map((gem) => gem.id) },
  equipment: { maxSockets: 4, allowedGemIds: GEM_CATALOG.filter((gem) => gem.allowedOn.includes('equipment')).map((gem) => gem.id) },
};
