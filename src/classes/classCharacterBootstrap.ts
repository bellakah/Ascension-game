import type { CharacterProgress } from '../character/characterCreator';
import { addItem, itemQuantity } from '../items/itemCatalog';
import { getClassDefinition, type ClassId } from './classCatalog';
import { expForLevel } from './classProgression';

type ClassCharacterState = CharacterProgress & {
  classBootstrapVersion?: number;
  unlockedClassIds?: ClassId[];
  classHistory?: ClassId[];
  learnedSkillIds?: string[];
  appliedClassEventActions?: string[];
};

const DEFAULT_MAP = 'Floresta Inicial';
const DEFAULT_X = 970;
const DEFAULT_Y = 1380;

function isPristineStarter(progress: CharacterProgress) {
  return progress.level <= 1 && progress.exp <= 0 && progress.coins <= 0;
}

/**
 * Migração idempotente do estado de classe. Guerreiro/Mago não recebem mudanças
 * visíveis porque seus starter items são vazios e usam o spawn global. Classes
 * custom criadas antes desta integração recebem o starter pack uma única vez se
 * o personagem ainda estiver no estado inicial.
 */
export function ensureClassCharacterBootstrap(progress: CharacterProgress) {
  const state = progress as ClassCharacterState;
  const classDef = getClassDefinition(progress.classId);
  state.unlockedClassIds = [...new Set([...(state.unlockedClassIds ?? []), classDef.id])];
  state.classHistory = state.classHistory?.length ? [...state.classHistory] : [classDef.id];
  state.learnedSkillIds ??= [];
  state.appliedClassEventActions ??= [];

  if ((state.classBootstrapVersion ?? 0) >= 1) return state;

  if (isPristineStarter(progress)) {
    progress.expToNext = expForLevel(classDef, 1);
    for (const starter of classDef.startingItems) {
      const target = Math.max(1, Math.floor(Number(starter.quantity) || 1));
      const missing = Math.max(0, target - itemQuantity(progress, starter.itemId));
      if (missing) addItem(progress, starter.itemId, missing);
    }

    const untouchedGlobalSpawn = (progress.map || DEFAULT_MAP) === DEFAULT_MAP
      && Math.abs((progress.position?.x ?? DEFAULT_X) - DEFAULT_X) < 1
      && Math.abs((progress.position?.y ?? DEFAULT_Y) - DEFAULT_Y) < 1;
    if (classDef.spawn.mode === 'class' && untouchedGlobalSpawn) {
      progress.map = classDef.spawn.map || DEFAULT_MAP;
      if (Number.isFinite(classDef.spawn.x) && Number.isFinite(classDef.spawn.y)) {
        progress.position = { x: Number(classDef.spawn.x), y: Number(classDef.spawn.y) };
      }
    }
  }

  state.classBootstrapVersion = 1;
  return state;
}

export type { ClassCharacterState };
