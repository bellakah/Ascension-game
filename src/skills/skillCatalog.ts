export type SkillKind = 'melee' | 'charge' | 'aoe' | 'buff';
export type SkillId = 'warrior.power_strike' | 'warrior.charge' | 'warrior.whirlwind' | 'warrior.war_cry';

export type SkillDefinition = {
  id: SkillId;
  className: 'Guerreiro';
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
};

export const WARRIOR_SKILLS: SkillDefinition[] = [
  {
    id: 'warrior.power_strike',
    className: 'Guerreiro',
    slot: 1,
    name: 'Golpe Poderoso',
    shortName: 'Golpe',
    icon: '💥',
    description: 'Um golpe pesado que causa 150% do Ataque em um alvo próximo.',
    kind: 'melee',
    energyCost: 20,
    cooldownMs: 4000,
    range: 135,
    damageMultiplier: 1.5,
  },
  {
    id: 'warrior.charge',
    className: 'Guerreiro',
    slot: 2,
    name: 'Investida',
    shortName: 'Investida',
    icon: '➤',
    description: 'Avança rapidamente até um inimigo e causa 125% do Ataque.',
    kind: 'charge',
    energyCost: 25,
    cooldownMs: 7000,
    range: 300,
    damageMultiplier: 1.25,
  },
  {
    id: 'warrior.whirlwind',
    className: 'Guerreiro',
    slot: 3,
    name: 'Corte Circular',
    shortName: 'Circular',
    icon: '🌀',
    description: 'Gira a arma e atinge todos os monstros próximos com 110% do Ataque.',
    kind: 'aoe',
    energyCost: 35,
    cooldownMs: 8000,
    radius: 165,
    damageMultiplier: 1.1,
  },
  {
    id: 'warrior.war_cry',
    className: 'Guerreiro',
    slot: 4,
    name: 'Grito de Guerra',
    shortName: 'Grito',
    icon: '🔥',
    description: 'Aumenta o Ataque em 25% durante 8 segundos.',
    kind: 'buff',
    energyCost: 30,
    cooldownMs: 14000,
    buffAttackPercent: 25,
    buffDurationMs: 8000,
  },
];

export const SKILL_CATALOG = Object.fromEntries(WARRIOR_SKILLS.map((skill) => [skill.id, skill])) as Record<SkillId, SkillDefinition>;

export function getSkill(skillId: SkillId) {
  return SKILL_CATALOG[skillId];
}
