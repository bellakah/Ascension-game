import type { ClassId, ClassName } from '../classes/classCatalog';

export type SkillId = string;
export type SkillStudioStatus = 'draft' | 'published' | 'disabled';
export type SkillStudioSource = 'legacy' | 'custom';
export type SkillKind = 'melee' | 'charge' | 'aoe' | 'buff' | 'target' | 'heal' | 'shield' | 'dash' | 'projectile' | 'ground';
export type SkillTargeting = 'self' | 'enemy' | 'ally' | 'area-self' | 'area-target' | 'line' | 'cone';
export type SkillAnimation = 'slash' | 'thrust' | 'spellcast' | 'bow' | 'attack' | 'emote';
export type SkillEffectType = 'damage' | 'heal' | 'shield' | 'buff-attack' | 'buff-defense' | 'stun' | 'slow' | 'root' | 'knockback' | 'dash' | 'dot' | 'hot' | 'resource-gain' | 'resource-drain' | 'cleanse' | 'revive';
export type SkillScalingStat = 'attack' | 'magicAttack' | 'maxHp' | 'defense' | 'none';

export type SkillEffect = {
  id: string;
  type: SkillEffectType;
  baseValue: number;
  scalingStat: SkillScalingStat;
  multiplier: number;
  durationMs: number;
  chance: number;
  radius?: number;
};

export type SkillStudioRecord = {
  version: 2;
  id: SkillId;
  numericId: number;
  key: SkillId;
  source: SkillStudioSource;
  status: SkillStudioStatus;
  classId: ClassId;
  className: ClassName;
  slot: number;
  unlockLevel: number;
  name: string;
  shortName: string;
  icon: string;
  description: string;
  kind: SkillKind;
  targeting: SkillTargeting;
  animation: SkillAnimation;
  energyCost: number;
  cooldownMs: number;
  castTimeMs: number;
  range?: number;
  radius?: number;
  damageMultiplier?: number;
  buffAttackPercent?: number;
  buffDurationMs?: number;
  effectColor?: number;
  projectileKey?: string;
  projectileSpeed?: number;
  effects: SkillEffect[];
  tags: string[];
  createdAt: number;
  updatedAt: number;
};

export type SkillDefinition = SkillStudioRecord;
export type SkillValidationIssue = { severity: 'error' | 'warning' | 'info'; code: string; message: string };
