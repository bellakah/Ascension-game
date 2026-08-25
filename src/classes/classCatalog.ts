import { ensureClassStudioMigration, listPublishedClasses, listSelectableClasses, normalizeClassKey, resolveClassDefinition } from './classStudioStore';
import type { ClassDefinition, ClassId, ClassName } from './classStudioTypes';

export type { ClassDefinition, ClassId, ClassName } from './classStudioTypes';

ensureClassStudioMigration();

/**
 * Snapshot compatível com consumidores legados. O Studio persiste no localStorage;
 * ao voltar ao jogo a página é recarregada e este snapshot é reconstruído.
 */
export const CLASS_CATALOG: Record<string, ClassDefinition> = Object.fromEntries(
  listPublishedClasses().map((entry) => [entry.key, entry]),
);

export const PLAYABLE_CLASSES: ClassDefinition[] = listSelectableClasses();

export function normalizeClassId(value?: string | null): ClassId {
  return normalizeClassKey(value);
}

export function getClassDefinition(classId?: string | null): ClassDefinition {
  return resolveClassDefinition(classId);
}

export function getClassName(classId?: string | null): ClassName {
  return getClassDefinition(classId).name;
}

export function listClassDefinitions(options: { publishedOnly?: boolean; selectableOnly?: boolean } = {}) {
  if (options.selectableOnly) return listSelectableClasses();
  if (options.publishedOnly !== false) return listPublishedClasses();
  return ensureClassStudioMigration();
}
