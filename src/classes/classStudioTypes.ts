export type ClassId = string;
export type ClassName = string;
export type ClassStudioStatus = 'draft' | 'published' | 'disabled';
export type ClassStudioSource = 'legacy' | 'custom';
export type ClassArchetype = 'tank' | 'dps' | 'healer' | 'support' | 'hybrid' | 'custom';
export type ClassSex = 'male' | 'female';
export type ClassResourceMode = 'regenerate' | 'build-up' | 'hybrid' | 'none';
export type ClassBasicAttackType = 'melee' | 'projectile' | 'magic-projectile' | 'area';
export type ClassAttackAnimation = 'slash' | 'thrust' | 'spellcast' | 'bow';
export type ClassDamageType = 'physical' | 'magical' | 'true';
export type ClassGrowthMode = 'fixed' | 'percent';

export type ClassBaseStats = {
  maxHp: number;
  attack: number;
  defense: number;
  magicAttack: number;
  magicDefense: number;
  accuracy: number;
  evasion: number;
  critChance: number;
  critDamage: number;
  attackSpeed: number;
  castSpeed: number;
  moveSpeed: number;
  hpRegen: number;
};

export type ClassResourceDefinition = {
  key: string;
  label: string;
  mode: ClassResourceMode;
  max: number;
  startingValue: number;
  regenPerSecond: number;
  regenInCombat: boolean;
  regenOutOfCombat: boolean;
  gainOnBasicAttack: number;
  gainOnDamageTaken: number;
  drainOutOfCombatPerSecond: number;
  resetOnCombatEnd: boolean;
};

export type ClassBasicAttackDefinition = {
  type: ClassBasicAttackType;
  animation: ClassAttackAnimation;
  damageType: ClassDamageType;
  range: number;
  cooldownTicks: number;
  damageMultiplier: number;
  projectileKey?: string;
  projectileSpeed?: number;
  projectileColor?: number;
  effectColor?: number;
};

export type ClassProgressionDefinition = {
  maxLevel: number;
  baseExp: number;
  expGrowthPercent: number;
  growthMode: ClassGrowthMode;
  maxHpPerLevel: number;
  attackPerLevel: number;
  defensePerLevel: number;
  magicAttackPerLevel: number;
  magicDefensePerLevel: number;
  resourcePerLevel: number;
};

export type ClassStartingEquipment = {
  weapon: string | null;
  armor: string | null;
  boots: string | null;
  head: string | null;
  legs: string | null;
  accessory1: string | null;
  accessory2: string | null;
};

export type ClassStartingItem = { itemId: string; quantity: number };

export type ClassSpawnDefinition = {
  mode: 'global' | 'class';
  map: string;
  markerId?: string;
  x?: number;
  y?: number;
};

export type ClassAdvancementRequirement = {
  level: number;
  questId?: string;
  itemId?: string;
};

export type ClassStudioRecord = {
  version: 2;
  numericId: number;
  key: ClassId;
  source: ClassStudioSource;
  status: ClassStudioStatus;
  selectable: boolean;
  name: ClassName;
  shortName: string;
  icon: string;
  portrait?: string;
  colorHint: string;
  tagline: string;
  description: string;
  archetype: ClassArchetype;
  tags: string[];
  priority: number;
  allowedSexes: ClassSex[];
  baseStats: ClassBaseStats;
  resource: ClassResourceDefinition;
  basicAttack: ClassBasicAttackDefinition;
  progression: ClassProgressionDefinition;
  startingEquipment: ClassStartingEquipment;
  startingItems: ClassStartingItem[];
  allowedEquipmentTags: string[];
  skillIds: string[];
  spawn: ClassSpawnDefinition;
  parentClassId?: string;
  advancementRequirements?: ClassAdvancementRequirement;
  nextClassIds: string[];
  createdAt: number;
  updatedAt: number;
};

export type ClassDefinition = ClassStudioRecord;

export type ClassValidationIssue = {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
};
