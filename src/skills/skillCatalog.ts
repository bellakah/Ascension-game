import type { ClassId } from '../classes/classCatalog';
import { getClassDefinition } from '../classes/classCatalog';
import { ensureSkillStudioMigration, listPublishedSkills } from './skillStudioStore';
import type { SkillDefinition, SkillId, SkillKind } from './skillStudioTypes';

export type { SkillDefinition, SkillId, SkillKind } from './skillStudioTypes';

ensureSkillStudioMigration();

export const ALL_SKILLS: SkillDefinition[] = listPublishedSkills();
export const WARRIOR_SKILLS: SkillDefinition[] = ALL_SKILLS.filter((skill) => skill.classId === 'warrior');
export const MAGE_SKILLS: SkillDefinition[] = ALL_SKILLS.filter((skill) => skill.classId === 'mage');
export const SKILL_CATALOG: Record<string, SkillDefinition> = Object.fromEntries(ALL_SKILLS.map((skill) => [skill.id, skill]));

export function getSkill(skillId: SkillId) { return SKILL_CATALOG[skillId]; }

export function getSkillsForClass(classId: ClassId) {
  const classDef = getClassDefinition(classId);
  const configured = classDef.skillIds.map((id) => SKILL_CATALOG[id]).filter((skill): skill is SkillDefinition => Boolean(skill));
  if (configured.length) return configured.sort((a, b) => classDef.skillIds.indexOf(a.id) - classDef.skillIds.indexOf(b.id) || a.slot - b.slot);
  return ALL_SKILLS.filter((skill) => skill.classId === classId).sort((a, b) => a.slot - b.slot || a.numericId - b.numericId);
}
