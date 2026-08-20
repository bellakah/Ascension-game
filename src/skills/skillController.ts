import type { CharacterProgress } from '../character/characterCreator';
import { WARRIOR_SKILLS, getSkill, type SkillDefinition, type SkillId } from './skillCatalog';

type SkillProgress = CharacterProgress & {
  energy?: number;
  maxEnergy?: number;
};

type SkillAvailability =
  | { ok: true; reason?: undefined }
  | { ok: false; reason: string };

type SkillActivation =
  | { ok: true; skill: SkillDefinition; reason?: undefined }
  | { ok: false; reason: string; skill?: undefined };

export type SkillSnapshot = {
  energy: number;
  maxEnergy: number;
  cooldowns: Record<SkillId, number>;
  buffAttackPercent: number;
  buffRemainingMs: number;
};

export function ensureSkillProgress(progress: CharacterProgress) {
  const state = progress as SkillProgress;
  if (!Number.isFinite(state.maxEnergy) || Number(state.maxEnergy) < 1) state.maxEnergy = 100;
  if (!Number.isFinite(state.energy)) state.energy = state.maxEnergy;
  state.energy = Math.max(0, Math.min(state.maxEnergy!, Number(state.energy)));
  return state as SkillProgress & { energy: number; maxEnergy: number };
}

export function createSkillController(progress: CharacterProgress) {
  const state = ensureSkillProgress(progress);
  const cooldowns = Object.fromEntries(WARRIOR_SKILLS.map((skill) => [skill.id, 0])) as Record<SkillId, number>;
  let buffAttackPercent = 0;
  let buffRemainingMs = 0;

  const canUse = (skillId: SkillId): SkillAvailability => {
    const skill = getSkill(skillId);
    if (cooldowns[skillId] > 0) return { ok: false, reason: `${skill.name} ainda está em recarga.` };
    if (state.energy < skill.energyCost) return { ok: false, reason: `Energia insuficiente para ${skill.name}.` };
    return { ok: true };
  };

  const activate = (skillId: SkillId): SkillActivation => {
    const check = canUse(skillId);
    if (!check.ok) return { ok: false, reason: check.reason };
    const skill = getSkill(skillId);
    state.energy = Math.max(0, state.energy - skill.energyCost);
    cooldowns[skillId] = skill.cooldownMs;
    if (skill.kind === 'buff') {
      buffAttackPercent = skill.buffAttackPercent ?? 0;
      buffRemainingMs = skill.buffDurationMs ?? 0;
    }
    return { ok: true, skill };
  };

  const tick = (deltaMs: number, paused = false) => {
    if (paused) return;
    for (const skill of WARRIOR_SKILLS) cooldowns[skill.id] = Math.max(0, cooldowns[skill.id] - deltaMs);
    if (buffRemainingMs > 0) {
      buffRemainingMs = Math.max(0, buffRemainingMs - deltaMs);
      if (buffRemainingMs <= 0) buffAttackPercent = 0;
    }
    state.energy = Math.min(state.maxEnergy, state.energy + deltaMs * 0.012);
  };

  const refill = () => { state.energy = state.maxEnergy; };
  const attackMultiplier = () => 1 + buffAttackPercent / 100;
  const snapshot = (): SkillSnapshot => ({
    energy: state.energy,
    maxEnergy: state.maxEnergy,
    cooldowns: { ...cooldowns },
    buffAttackPercent,
    buffRemainingMs,
  });

  return { state, canUse, activate, tick, refill, attackMultiplier, snapshot };
}
