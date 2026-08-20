import type { CharacterProgress } from '../character/characterCreator';
import { getClassDefinition } from '../classes/classCatalog';
import { getSkill, getSkillsForClass, type SkillDefinition, type SkillId } from './skillCatalog';

type SkillProgress = CharacterProgress & { energy?: number; maxEnergy?: number };
type SkillAvailability = { ok: true; reason?: undefined } | { ok: false; reason: string };
type SkillActivation = { ok: true; skill: SkillDefinition; reason?: undefined } | { ok: false; reason: string; skill?: undefined };

export type SkillSnapshot = {
  energy: number;
  maxEnergy: number;
  resourceLabel: string;
  cooldowns: Partial<Record<SkillId, number>>;
  buffAttackPercent: number;
  buffRemainingMs: number;
  buffName: string;
  buffIcon: string;
};

export function ensureSkillProgress(progress: CharacterProgress) {
  const state = progress as SkillProgress;
  const classDef = getClassDefinition(progress.classId);
  if (!Number.isFinite(state.maxEnergy) || Number(state.maxEnergy) < 1) state.maxEnergy = classDef.resource.max;
  if (!Number.isFinite(state.energy)) state.energy = state.maxEnergy;
  state.energy = Math.max(0, Math.min(state.maxEnergy!, Number(state.energy)));
  return state as SkillProgress & { energy: number; maxEnergy: number };
}

export function createSkillController(progress: CharacterProgress) {
  const classDef = getClassDefinition(progress.classId);
  const skills = getSkillsForClass(classDef.id);
  const state = ensureSkillProgress(progress);
  if (progress.level <= 1 && state.maxEnergy !== classDef.resource.max) {
    state.maxEnergy = classDef.resource.max;
    state.energy = Math.min(state.energy, state.maxEnergy);
  }
  const cooldowns: Partial<Record<SkillId, number>> = Object.fromEntries(skills.map((skill) => [skill.id, 0]));
  let buffAttackPercent = 0;
  let buffRemainingMs = 0;
  let buffName = '';
  let buffIcon = '';

  const canUse = (skillId: SkillId): SkillAvailability => {
    const skill = getSkill(skillId);
    if (!skill || skill.classId !== classDef.id) return { ok: false, reason: 'Esta habilidade não pertence à sua classe.' };
    if ((cooldowns[skillId] ?? 0) > 0) return { ok: false, reason: `${skill.name} ainda está em recarga.` };
    if (state.energy < skill.energyCost) return { ok: false, reason: `${classDef.resource.label} insuficiente para ${skill.name}.` };
    return { ok: true };
  };

  const activate = (skillId: SkillId): SkillActivation => {
    const check = canUse(skillId);
    if ('reason' in check && check.reason) return { ok: false, reason: check.reason };
    const skill = getSkill(skillId);
    state.energy = Math.max(0, state.energy - skill.energyCost);
    cooldowns[skillId] = skill.cooldownMs;
    if (skill.kind === 'buff') {
      buffAttackPercent = skill.buffAttackPercent ?? 0;
      buffRemainingMs = skill.buffDurationMs ?? 0;
      buffName = skill.name;
      buffIcon = skill.icon;
    }
    return { ok: true, skill };
  };

  const tick = (deltaMs: number, paused = false) => {
    if (paused) return;
    for (const skill of skills) cooldowns[skill.id] = Math.max(0, (cooldowns[skill.id] ?? 0) - deltaMs);
    if (buffRemainingMs > 0) {
      buffRemainingMs = Math.max(0, buffRemainingMs - deltaMs);
      if (buffRemainingMs <= 0) { buffAttackPercent = 0; buffName = ''; buffIcon = ''; }
    }
    state.energy = Math.min(state.maxEnergy, state.energy + deltaMs * classDef.resource.regenPerSecond / 1000);
  };

  const refill = () => { state.energy = state.maxEnergy; };
  const attackMultiplier = () => 1 + buffAttackPercent / 100;
  const snapshot = (): SkillSnapshot => ({
    energy: state.energy,
    maxEnergy: state.maxEnergy,
    resourceLabel: classDef.resource.label,
    cooldowns: { ...cooldowns },
    buffAttackPercent,
    buffRemainingMs,
    buffName,
    buffIcon,
  });

  return { classDef, skills, state, canUse, activate, tick, refill, attackMultiplier, snapshot };
}
