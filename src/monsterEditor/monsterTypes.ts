export type MonsterDirection = 'south' | 'south-west' | 'west' | 'north-west' | 'north' | 'north-east' | 'east' | 'south-east';
export type MonsterAnimationState = 'idle' | 'walk' | 'attack' | 'hurt' | 'death';
export type MonsterRank = 'normal' | 'elite' | 'boss';
export type MonsterTemperament = 'passive' | 'defensive' | 'aggressive';

export type MonsterAppearance = {
  fallbackAssetId: string;
  idle: Partial<Record<MonsterDirection, string>>;
  walk: Partial<Record<MonsterDirection, string>>;
  attack: Partial<Record<MonsterDirection, string>>;
  hurt: Partial<Record<MonsterDirection, string>>;
  death: Partial<Record<MonsterDirection, string>>;
  scale: number;
  showShadow: boolean;
};

export type MonsterDrop = {
  itemId: string;
  chance: number;
  min: number;
  max: number;
};

export type MonsterSkill = {
  id: string;
  name: string;
  chance: number;
  cooldownMs: number;
  range: number;
  damageMultiplier: number;
};

export type MonsterDefinition = {
  version: 1;
  id: string;
  name: string;
  title: string;
  category: string;
  rank: MonsterRank;
  level: number;
  tags: string[];
  notes: string;
  appearance: MonsterAppearance;
  stats: {
    maxHp: number;
    attack: number;
    defense: number;
    moveSpeed: number;
    attackRange: number;
    attackCooldownMs: number;
    expReward: number;
    coinReward: number;
  };
  ai: {
    temperament: MonsterTemperament;
    aggroRadius: number;
    leashRadius: number;
    wanderRadius: number;
    respawnMs: number;
    idleMinMs: number;
    idleMaxMs: number;
  };
  drops: MonsterDrop[];
  skills: MonsterSkill[];
  createdAt: number;
  updatedAt: number;
};

export const MONSTER_DIRECTIONS: Array<{ id: MonsterDirection; label: string; short: string }> = [
  { id: 'north', label: 'Norte', short: 'N' },
  { id: 'north-east', label: 'Nordeste', short: 'NE' },
  { id: 'east', label: 'Leste', short: 'L' },
  { id: 'south-east', label: 'Sudeste', short: 'SE' },
  { id: 'south', label: 'Sul', short: 'S' },
  { id: 'south-west', label: 'Sudoeste', short: 'SO' },
  { id: 'west', label: 'Oeste', short: 'O' },
  { id: 'north-west', label: 'Noroeste', short: 'NO' },
];

export const MONSTER_STATES: Array<{ id: MonsterAnimationState; label: string }> = [
  { id: 'idle', label: 'Parado' },
  { id: 'walk', label: 'Andando' },
  { id: 'attack', label: 'Atacando' },
  { id: 'hurt', label: 'Recebendo dano' },
  { id: 'death', label: 'Morrendo' },
];
