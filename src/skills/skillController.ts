import type { CharacterProgress } from '../character/characterCreator';
import { classCharacterState } from '../classes/classAdvancement';
import { getClassDefinition } from '../classes/classCatalog';
import { ensureClassCharacterBootstrap } from '../classes/classCharacterBootstrap';
import { applyActiveClassEventActions } from '../classes/classEventRuntime';
import { classStatsAtLevel } from '../classes/classProgression';
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
  ensureClassCharacterBootstrap(progress);
  const state = progress as SkillProgress;
  const classDef = getClassDefinition(progress.classId);
  const expectedMax = classStatsAtLevel(classDef, progress.level).resourceMax;
  if (!Number.isFinite(state.maxEnergy) || Number(state.maxEnergy) < 1) state.maxEnergy = expectedMax;
  if (!Number.isFinite(state.energy)) {
    const ratio = classDef.resource.max > 0 ? classDef.resource.startingValue / classDef.resource.max : 1;
    state.energy = Math.max(0, Math.min(expectedMax, expectedMax * ratio));
  }
  if (state.maxEnergy !== expectedMax) {
    const ratio = state.maxEnergy! > 0 ? Number(state.energy) / state.maxEnergy! : 1;
    state.maxEnergy = expectedMax;
    state.energy = Math.max(0, Math.min(expectedMax, expectedMax * ratio));
  }
  state.energy = Math.max(0, Math.min(state.maxEnergy!, Number(state.energy)));
  return state as SkillProgress & { energy: number; maxEnergy: number };
}

export function createSkillController(progress: CharacterProgress) {
  ensureClassCharacterBootstrap(progress);
  applyActiveClassEventActions(progress);
  const classDef = getClassDefinition(progress.classId);
  const characterState = classCharacterState(progress);
  const learned = (characterState.learnedSkillIds ?? []).map((id) => getSkill(id)).filter((skill): skill is SkillDefinition => Boolean(skill));
  const allClassSkills = [...new Map([...getSkillsForClass(classDef.id), ...learned].map((skill) => [skill.id, skill])).values()].sort((a, b) => a.slot - b.slot || a.numericId - b.numericId);
  const skills = allClassSkills.filter((skill) => skill.unlockLevel <= progress.level);
  const state = ensureSkillProgress(progress);
  const cooldowns: Partial<Record<SkillId, number>> = Object.fromEntries(allClassSkills.map((skill) => [skill.id, 0]));
  let buffAttackPercent = 0;
  let buffRemainingMs = 0;
  let buffName = '';
  let buffIcon = '';

  const belongsToClass = (skillId: string) => classDef.skillIds.includes(skillId) || getSkill(skillId)?.classId === classDef.id || (characterState.learnedSkillIds ?? []).includes(skillId);

  const canUse = (skillId: SkillId): SkillAvailability => {
    const skill = getSkill(skillId);
    if (!skill || !belongsToClass(skillId)) return { ok: false, reason: 'Esta habilidade não pertence à sua classe nem foi aprendida.' };
    if (skill.unlockLevel > progress.level) return { ok: false, reason: `${skill.name} requer nível ${skill.unlockLevel}.` };
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
    const attackBuff = skill.effects.find((effect) => effect.type === 'buff-attack');
    if (skill.kind === 'buff' || attackBuff) {
      buffAttackPercent = attackBuff?.baseValue ?? skill.buffAttackPercent ?? 0;
      buffRemainingMs = attackBuff?.durationMs ?? skill.buffDurationMs ?? 0;
      buffName = skill.name;
      buffIcon = skill.icon;
    }
    return { ok: true, skill };
  };

  const addResource = (amount: number) => { state.energy = Math.max(0, Math.min(state.maxEnergy, state.energy + amount)); };
  const onBasicAttack = () => addResource(classDef.resource.gainOnBasicAttack);
  const onDamageTaken = () => addResource(classDef.resource.gainOnDamageTaken);

  const tick = (deltaMs: number, paused = false) => {
    if (paused) return;
    for (const skill of allClassSkills) cooldowns[skill.id] = Math.max(0, (cooldowns[skill.id] ?? 0) - deltaMs);
    if (buffRemainingMs > 0) {
      buffRemainingMs = Math.max(0, buffRemainingMs - deltaMs);
      if (buffRemainingMs <= 0) { buffAttackPercent = 0; buffName = ''; buffIcon = ''; }
    }
    if (classDef.resource.mode !== 'none' && classDef.resource.regenPerSecond !== 0) addResource(deltaMs * classDef.resource.regenPerSecond / 1000);
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

  return { classDef, skills, allClassSkills, state, canUse, activate, tick, refill, addResource, onBasicAttack, onDamageTaken, attackMultiplier, snapshot };
}
