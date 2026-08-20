import type { ClassId, ClassName } from '../classes/classCatalog';

export type SkillKind = 'melee' | 'charge' | 'aoe' | 'buff' | 'target';
export type SkillId =
  | 'warrior.power_strike' | 'warrior.charge' | 'warrior.whirlwind' | 'warrior.war_cry'
  | 'mage.arcane_bolt' | 'mage.fireball' | 'mage.arcane_wave' | 'mage.arcane_focus';

export type SkillDefinition = {
  id: SkillId;
  classId: ClassId;
  className: ClassName;
  slot: 1 | 2 | 3 | 4;
  name: string;
  shortName: string;
  icon: string;
  description: string;
  kind: SkillKind;
  energyCost: number;
  cooldownMs: number;
  range?: number;
  radius?: number;
  damageMultiplier?: number;
  buffAttackPercent?: number;
  buffDurationMs?: number;
  effectColor?: number;
};

export const WARRIOR_SKILLS: SkillDefinition[] = [
  { id: 'warrior.power_strike', classId: 'warrior', className: 'Guerreiro', slot: 1, name: 'Golpe Poderoso', shortName: 'Golpe', icon: '💥', description: 'Um golpe pesado que causa 150% do Ataque em um alvo próximo.', kind: 'melee', energyCost: 20, cooldownMs: 4000, range: 135, damageMultiplier: 1.5, effectColor: 0xf0b85d },
  { id: 'warrior.charge', classId: 'warrior', className: 'Guerreiro', slot: 2, name: 'Investida', shortName: 'Investida', icon: '➤', description: 'Avança rapidamente até um inimigo e causa 125% do Ataque.', kind: 'charge', energyCost: 25, cooldownMs: 7000, range: 300, damageMultiplier: 1.25, effectColor: 0x79c9ff },
  { id: 'warrior.whirlwind', classId: 'warrior', className: 'Guerreiro', slot: 3, name: 'Corte Circular', shortName: 'Circular', icon: '🌀', description: 'Gira a arma e atinge todos os monstros próximos com 110% do Ataque.', kind: 'aoe', energyCost: 35, cooldownMs: 8000, radius: 165, damageMultiplier: 1.1, effectColor: 0xe9c760 },
  { id: 'warrior.war_cry', classId: 'warrior', className: 'Guerreiro', slot: 4, name: 'Grito de Guerra', shortName: 'Grito', icon: '🔥', description: 'Aumenta o Ataque em 25% durante 8 segundos.', kind: 'buff', energyCost: 30, cooldownMs: 14000, buffAttackPercent: 25, buffDurationMs: 8000, effectColor: 0xf39a45 },
];

export const MAGE_SKILLS: SkillDefinition[] = [
  { id: 'mage.arcane_bolt', classId: 'mage', className: 'Mago', slot: 1, name: 'Projétil Arcano', shortName: 'Arcano', icon: '✨', description: 'Dispara energia arcana a longa distância causando 135% do Ataque.', kind: 'target', energyCost: 16, cooldownMs: 2200, range: 430, damageMultiplier: 1.35, effectColor: 0x8bc5ff },
  { id: 'mage.fireball', classId: 'mage', className: 'Mago', slot: 2, name: 'Bola de Fogo', shortName: 'Fogo', icon: '🔥', description: 'Concentra fogo mágico em um alvo distante causando 180% do Ataque.', kind: 'target', energyCost: 28, cooldownMs: 6000, range: 450, damageMultiplier: 1.8, effectColor: 0xff914d },
  { id: 'mage.arcane_wave', classId: 'mage', className: 'Mago', slot: 3, name: 'Onda Arcana', shortName: 'Onda', icon: '🔵', description: 'Libera uma onda de Mana ao redor do Mago e atinge todos os inimigos próximos.', kind: 'aoe', energyCost: 34, cooldownMs: 8000, radius: 185, damageMultiplier: 1.05, effectColor: 0x6f9fff },
  { id: 'mage.arcane_focus', classId: 'mage', className: 'Mago', slot: 4, name: 'Foco Arcano', shortName: 'Foco', icon: '🔮', description: 'Amplifica a magia, aumentando o Ataque em 30% durante 10 segundos.', kind: 'buff', energyCost: 30, cooldownMs: 15000, buffAttackPercent: 30, buffDurationMs: 10000, effectColor: 0xa277ff },
];

export const ALL_SKILLS: SkillDefinition[] = [...WARRIOR_SKILLS, ...MAGE_SKILLS];
export const SKILL_CATALOG = Object.fromEntries(ALL_SKILLS.map((skill) => [skill.id, skill])) as Record<SkillId, SkillDefinition>;

export function getSkill(skillId: SkillId) { return SKILL_CATALOG[skillId]; }
export function getSkillsForClass(classId: ClassId) { return ALL_SKILLS.filter((skill) => skill.classId === classId).sort((a, b) => a.slot - b.slot); }
