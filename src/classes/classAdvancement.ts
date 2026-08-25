import type { CharacterProgress } from '../character/characterCreator';
import { ensureInventoryState, getItem, inventorySlotsUsed, itemQuantity, unequipItem, type EquipmentSlot } from '../items/itemCatalog';
import { getQuestState } from '../quests/questEngine';
import { getSkill } from '../skills/skillCatalog';
import { getClassDefinition, listClassDefinitions, type ClassDefinition, type ClassId } from './classCatalog';
import { ensureClassCharacterBootstrap, type ClassCharacterState } from './classCharacterBootstrap';
import { classStatsAtLevel, expForLevel, type ClassRuntimeProgress } from './classProgression';

export type ClassAdvancementCheck = {
  ok: boolean;
  reason?: string;
  target: ClassDefinition;
  requirements: Array<{ label: string; met: boolean }>;
};

const EQUIPMENT_SLOTS: EquipmentSlot[] = ['weapon', 'armor', 'boots', 'head', 'legs', 'accessory1', 'accessory2'];

function publishedClass(classId: string) {
  return listClassDefinitions({ publishedOnly: true }).find((entry) => entry.id === classId || entry.key === classId) ?? null;
}

export function classCharacterState(progress: CharacterProgress) {
  return ensureClassCharacterBootstrap(progress) as ClassCharacterState;
}

export function unlockedClasses(progress: CharacterProgress) {
  const state = classCharacterState(progress);
  const unlocked = new Set(state.unlockedClassIds ?? [progress.classId]);
  return listClassDefinitions({ publishedOnly: true }).filter((entry) => unlocked.has(entry.id));
}

export function advancementTargets(progress: CharacterProgress) {
  const classes = listClassDefinitions({ publishedOnly: true });
  const current = getClassDefinition(progress.classId);
  return classes.filter((entry) => entry.id !== current.id && (entry.parentClassId === current.id || current.nextClassIds.includes(entry.id)));
}

export function checkClassAdvancement(progress: CharacterProgress, targetId: string, options: { allowUnlockedSwitch?: boolean; force?: boolean } = {}): ClassAdvancementCheck {
  const target = publishedClass(targetId) ?? getClassDefinition(progress.classId);
  if (!publishedClass(targetId)) return { ok: false, reason: 'A classe de destino não está publicada.', target, requirements: [] };
  if (target.id === progress.classId) return { ok: false, reason: 'Esta já é sua classe atual.', target, requirements: [] };

  const state = classCharacterState(progress);
  const unlocked = state.unlockedClassIds?.includes(target.id) ?? false;
  const current = getClassDefinition(progress.classId);
  const isDirectAdvancement = target.parentClassId === current.id || current.nextClassIds.includes(target.id);
  if (!options.force && !(options.allowUnlockedSwitch && unlocked) && !isDirectAdvancement) {
    return { ok: false, reason: `${target.name} não é uma evolução direta de ${current.name}.`, target, requirements: [] };
  }

  const req = target.advancementRequirements;
  const requirements: Array<{ label: string; met: boolean }> = [];
  if (req) {
    requirements.push({ label: `Nível ${Math.max(1, req.level)}`, met: progress.level >= Math.max(1, req.level) });
    if (req.questId) requirements.push({ label: `Missão: ${req.questId}`, met: getQuestState(progress, req.questId)?.status === 'completed' });
    if (req.itemId) requirements.push({ label: `Item: ${getItem(req.itemId)?.name ?? req.itemId}`, met: itemQuantity(progress, req.itemId) >= 1 });
  }
  const failed = requirements.find((entry) => !entry.met);
  if (!options.force && !unlocked && failed) return { ok: false, reason: `Requisito pendente: ${failed.label}.`, target, requirements };
  return { ok: true, target, requirements };
}

function incompatibleEquipment(progress: CharacterProgress, target: ClassDefinition) {
  const inventory = ensureInventoryState(progress);
  return EQUIPMENT_SLOTS.filter((slot) => {
    const itemId = inventory.equipment[slot];
    if (!itemId) return false;
    const item = getItem(itemId);
    return Boolean(item?.allowedClasses?.length && !item.allowedClasses.includes(target.id));
  });
}

function switchStats(progress: CharacterProgress, previous: ClassDefinition, target: ClassDefinition) {
  const state = progress as ClassRuntimeProgress & { energy?: number; maxEnergy?: number };
  const oldBase = classStatsAtLevel(previous, progress.level);
  const nextBase = classStatsAtLevel(target, progress.level);
  const hpRatio = progress.maxHp > 0 ? Math.max(0, Math.min(1, progress.hp / progress.maxHp)) : 1;
  progress.maxHp = Math.max(1, progress.maxHp - oldBase.maxHp + nextBase.maxHp);
  progress.attack = Math.max(0, progress.attack - oldBase.attack + nextBase.attack);
  progress.defense = Math.max(0, progress.defense - oldBase.defense + nextBase.defense);
  state.magicAttack = Math.max(0, (state.magicAttack ?? oldBase.magicAttack) - oldBase.magicAttack + nextBase.magicAttack);
  state.magicDefense = Math.max(0, (state.magicDefense ?? oldBase.magicDefense) - oldBase.magicDefense + nextBase.magicDefense);
  state.accuracy = nextBase.accuracy;
  state.evasion = nextBase.evasion;
  state.critChance = nextBase.critChance;
  state.critDamage = nextBase.critDamage;
  state.attackSpeed = nextBase.attackSpeed;
  state.castSpeed = nextBase.castSpeed;
  state.moveSpeed = nextBase.moveSpeed;
  state.hpRegen = nextBase.hpRegen;
  progress.hp = Math.max(1, Math.round(progress.maxHp * hpRatio));
  progress.expToNext = expForLevel(target, progress.level);
  state.maxEnergy = nextBase.resourceMax;
  const resourceRatio = target.resource.max > 0 ? target.resource.startingValue / target.resource.max : 1;
  state.energy = Math.max(0, Math.min(nextBase.resourceMax, nextBase.resourceMax * resourceRatio));
}

export function unlockClass(progress: CharacterProgress, targetId: string) {
  const target = publishedClass(targetId);
  if (!target) return { ok: false as const, reason: 'Classe não encontrada ou não publicada.' };
  const state = classCharacterState(progress);
  state.unlockedClassIds = [...new Set([...(state.unlockedClassIds ?? []), target.id])];
  return { ok: true as const, target };
}

export function learnSkill(progress: CharacterProgress, skillId: string) {
  const skill = getSkill(skillId);
  if (!skill || skill.status !== 'published') return { ok: false as const, reason: 'Skill não encontrada ou não publicada.' };
  const state = classCharacterState(progress);
  state.learnedSkillIds = [...new Set([...(state.learnedSkillIds ?? []), skill.id])];
  return { ok: true as const, skill };
}

export function changeClass(progress: CharacterProgress, targetId: string, options: { force?: boolean; allowUnlockedSwitch?: boolean } = {}) {
  const check = checkClassAdvancement(progress, targetId, { force: options.force, allowUnlockedSwitch: options.allowUnlockedSwitch ?? true });
  if (!check.ok) return { ok: false as const, reason: check.reason ?? 'Não foi possível trocar de classe.', check };
  const previous = getClassDefinition(progress.classId);
  const target = check.target;
  const incompatible = incompatibleEquipment(progress, target);
  const inventory = ensureInventoryState(progress);
  if (incompatible.length && inventorySlotsUsed(inventory) >= inventory.inventoryCapacity) return { ok: false as const, reason: 'Libere ao menos um espaço no inventário para guardar equipamentos incompatíveis.', check };
  for (const slot of incompatible) {
    const result = unequipItem(progress, slot);
    if (!result.ok) return { ok: false as const, reason: result.reason ?? 'Não foi possível remover um equipamento incompatível.', check };
  }

  switchStats(progress, previous, target);
  progress.classId = target.id;
  progress.className = target.name;
  const state = classCharacterState(progress);
  state.unlockedClassIds = [...new Set([...(state.unlockedClassIds ?? []), target.id])];
  state.classHistory = [...(state.classHistory ?? [previous.id]), target.id];
  state.classBootstrapVersion = 1;
  for (const skillId of target.skillIds) {
    const skill = getSkill(skillId);
    if (skill?.status === 'published' && skill.unlockLevel <= progress.level) state.learnedSkillIds = [...new Set([...(state.learnedSkillIds ?? []), skill.id])];
  }
  return { ok: true as const, previous, target, check, unequippedSlots: incompatible };
}
