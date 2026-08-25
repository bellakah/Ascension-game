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

export function applyClassStatsForLevel(progress: CharacterProgress, classDef: ClassDefinition, level = progress.level) {
  const stats = classStatsAtLevel(classDef, level);
  progress.maxHp = stats.maxHp;
  progress.attack = stats.attack;
  progress.defense = stats.defense;
  progress.magicAttack = stats.magicAttack;
  progress.magicDefense = stats.magicDefense;
  progress.accuracy = stats.accuracy;
  progress.evasion = stats.evasion;
  progress.critChance = stats.critChance;
  progress.critDamage = stats.critDamage;
  progress.attackSpeed = stats.attackSpeed;
  progress.castSpeed = stats.castSpeed;
  progress.moveSpeed = stats.moveSpeed;
  progress.hpRegen = stats.hpRegen;
  progress.expToNext = expForLevel(classDef, level);
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
