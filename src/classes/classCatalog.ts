import { ensureClassStudioMigration, listPublishedClasses, listSelectableClasses, normalizeClassKey, resolveClassDefinition } from './classStudioStore';
import type { ClassDefinition, ClassId, ClassName } from './classStudioTypes';

export type { ClassDefinition, ClassId, ClassName } from './classStudioTypes';

ensureClassStudioMigration();

/** Classes publicadas disponíveis para requisitos, lojas, crafting, missões e outros conteúdos. */
export const CONTENT_CLASSES: ClassDefinition[] = listPublishedClasses();
/** Classes que podem ser escolhidas ao criar um personagem novo. */
export const SELECTABLE_CLASSES: ClassDefinition[] = listSelectableClasses();

/**
 * Snapshot compatível com consumidores legados. O Studio persiste no localStorage;
 * ao voltar ao jogo a página é recarregada e este snapshot é reconstruído.
 */
export const CLASS_CATALOG: Record<string, ClassDefinition> = Object.fromEntries(
  CONTENT_CLASSES.map((entry) => [entry.key, entry]),
);

/**
 * Alias legado usado pelos Studios antigos como catálogo de classes. Agora contém
 * todas as classes publicadas, inclusive evoluções. A tela de criação usa
 * SELECTABLE_CLASSES para não expor classes avançadas indevidamente.
 */
export const PLAYABLE_CLASSES: ClassDefinition[] = CONTENT_CLASSES;

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
