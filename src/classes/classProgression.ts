import type { CharacterProgress } from '../character/characterCreator';
import type { ClassDefinition } from './classStudioTypes';

export type ClassComputedStats = {
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
  resourceMax: number;
};

export type ClassRuntimeProgress = CharacterProgress & Omit<ClassComputedStats, 'resourceMax'>;

function grow(base: number, perLevel: number, level: number, mode: ClassDefinition['progression']['growthMode']) {
  const steps = Math.max(0, level - 1);
  if (mode === 'percent') return base * Math.pow(1 + perLevel / 100, steps);
  return base + perLevel * steps;
}

export function expForLevel(classDef: ClassDefinition, level: number) {
  const steps = Math.max(0, Math.floor(level) - 1);
  return Math.max(1, Math.round(classDef.progression.baseExp * Math.pow(1 + classDef.progression.expGrowthPercent / 100, steps)));
}

export function classStatsAtLevel(classDef: ClassDefinition, level: number): ClassComputedStats {
  const safeLevel = Math.max(1, Math.min(classDef.progression.maxLevel, Math.floor(level) || 1));
  const mode = classDef.progression.growthMode;
  const p = classDef.progression;
  const b = classDef.baseStats;
  return {
    maxHp: Math.max(1, Math.round(grow(b.maxHp, p.maxHpPerLevel, safeLevel, mode))),
    attack: Math.max(0, Math.round(grow(b.attack, p.attackPerLevel, safeLevel, mode))),
    defense: Math.max(0, Math.round(grow(b.defense, p.defensePerLevel, safeLevel, mode))),
    magicAttack: Math.max(0, Math.round(grow(b.magicAttack, p.magicAttackPerLevel, safeLevel, mode))),
    magicDefense: Math.max(0, Math.round(grow(b.magicDefense, p.magicDefensePerLevel, safeLevel, mode))),
    accuracy: Math.max(0, b.accuracy),
    evasion: Math.max(0, b.evasion),
    critChance: Math.max(0, b.critChance),
    critDamage: Math.max(100, b.critDamage),
    attackSpeed: Math.max(.1, b.attackSpeed),
    castSpeed: Math.max(.1, b.castSpeed),
    moveSpeed: Math.max(.1, b.moveSpeed),
    hpRegen: Math.max(0, b.hpRegen),
    resourceMax: Math.max(1, Math.round(grow(classDef.resource.max, p.resourcePerLevel, safeLevel, mode))),
  };
}

export function ensureAdvancedClassStats(progress: CharacterProgress, classDef: ClassDefinition) {
  const state = progress as ClassRuntimeProgress;
  const computed = classStatsAtLevel(classDef, progress.level);
  if (!Number.isFinite(state.magicAttack)) state.magicAttack = computed.magicAttack;
  if (!Number.isFinite(state.magicDefense)) state.magicDefense = computed.magicDefense;
  if (!Number.isFinite(state.accuracy)) state.accuracy = computed.accuracy;
  if (!Number.isFinite(state.evasion)) state.evasion = computed.evasion;
  if (!Number.isFinite(state.critChance)) state.critChance = computed.critChance;
  if (!Number.isFinite(state.critDamage)) state.critDamage = computed.critDamage;
  if (!Number.isFinite(state.attackSpeed)) state.attackSpeed = computed.attackSpeed;
  if (!Number.isFinite(state.castSpeed)) state.castSpeed = computed.castSpeed;
  if (!Number.isFinite(state.moveSpeed)) state.moveSpeed = computed.moveSpeed;
  if (!Number.isFinite(state.hpRegen)) state.hpRegen = computed.hpRegen;
  return state;
}

export function applyClassStatsForLevel(progress: CharacterProgress, classDef: ClassDefinition, level = progress.level) {
  const state = progress as ClassRuntimeProgress;
  const stats = classStatsAtLevel(classDef, level);
  state.maxHp = stats.maxHp;
  state.attack = stats.attack;
  state.defense = stats.defense;
  state.magicAttack = stats.magicAttack;
  state.magicDefense = stats.magicDefense;
  state.accuracy = stats.accuracy;
  state.evasion = stats.evasion;
  state.critChance = stats.critChance;
  state.critDamage = stats.critDamage;
  state.attackSpeed = stats.attackSpeed;
  state.castSpeed = stats.castSpeed;
  state.moveSpeed = stats.moveSpeed;
  state.hpRegen = stats.hpRegen;
  state.expToNext = expForLevel(classDef, level);
  return stats;
}

export function levelUpCharacterProgress(progress: CharacterProgress, classDef: ClassDefinition) {
  if (progress.level >= classDef.progression.maxLevel) {
    progress.exp = Math.min(progress.exp, Math.max(0, progress.expToNext - 1));
    return false;
  }
  progress.level += 1;
  const stats = applyClassStatsForLevel(progress, classDef, progress.level);
  progress.hp = stats.maxHp;
  return true;
}

export function progressionTable(classDef: ClassDefinition, levels: number[]) {
  return levels.map((level) => ({ level, exp: expForLevel(classDef, level), ...classStatsAtLevel(classDef, level) }));
}
