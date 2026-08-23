import { MAP_PALETTE_ENTRIES, getPaletteEntry } from '../editor/map/mapEditorCatalog';
import type { MapPaletteEntry } from '../editor/map/mapEditorTypes';
import type { MonsterAnimationState, MonsterDefinition, MonsterDirection } from './monsterTypes';

const MONSTER_STORAGE_KEY = 'ascension.monster.definitions.v1';
export const MONSTER_ASSET_PREFIX = 'monsterdef:';

type MonsterFile = { version: 1; definitions: MonsterDefinition[] };
const clone = <T>(value: T): T => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

function loadFile(): MonsterFile {
  try {
    const parsed = JSON.parse(localStorage.getItem(MONSTER_STORAGE_KEY) ?? '') as Partial<MonsterFile>;
    return { version: 1, definitions: Array.isArray(parsed.definitions) ? parsed.definitions : [] };
  } catch {
    return { version: 1, definitions: [] };
  }
}

function saveFile(file: MonsterFile) {
  localStorage.setItem(MONSTER_STORAGE_KEY, JSON.stringify(file));
  window.dispatchEvent(new CustomEvent('ascension-monster-definitions-change'));
}

function firstAppearanceAssetId() {
  return MAP_PALETTE_ENTRIES.find((entry) => !entry.id.startsWith(MONSTER_ASSET_PREFIX) && entry.palette === 'monster' && entry.sprite)?.id
    ?? MAP_PALETTE_ENTRIES.find((entry) => !entry.id.startsWith(MONSTER_ASSET_PREFIX) && entry.sprite)?.id
    ?? 'wolf';
}

export function createMonsterDefinition(name = 'Novo Monstro'): MonsterDefinition {
  const now = Date.now();
  const appearance = firstAppearanceAssetId();
  return {
    version: 1,
    id: uid('monster'),
    name,
    title: '',
    category: 'Criaturas',
    rank: 'normal',
    level: 1,
    tags: [],
    notes: '',
    appearance: {
      fallbackAssetId: appearance,
      idle: {}, walk: {}, attack: {}, hurt: {}, death: {},
      scale: 1,
      showShadow: true,
    },
    stats: {
      maxHp: 100,
      attack: 10,
      defense: 0,
      moveSpeed: 1.8,
      attackRange: 1.25,
      attackCooldownMs: 1000,
      expReward: 20,
      coinReward: 2,
    },
    ai: {
      temperament: 'aggressive',
      aggroRadius: 6,
      leashRadius: 10,
      wanderRadius: 3,
      respawnMs: 7000,
      idleMinMs: 800,
      idleMaxMs: 2200,
    },
    drops: [],
    skills: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function listMonsterDefinitions() { return loadFile().definitions.map(clone); }
export function getMonsterDefinition(id: string) {
  const value = loadFile().definitions.find((entry) => entry.id === id);
  return value ? clone(value) : null;
}
export function saveMonsterDefinition(definition: MonsterDefinition) {
  const file = loadFile();
  const copy = clone(definition); copy.updatedAt = Date.now();
  const index = file.definitions.findIndex((entry) => entry.id === copy.id);
  if (index >= 0) file.definitions[index] = copy; else file.definitions.push(copy);
  saveFile(file); syncMonsterDefinitionsIntoPalette(); return clone(copy);
}
export function deleteMonsterDefinition(id: string) {
  const file = loadFile(); file.definitions = file.definitions.filter((entry) => entry.id !== id); saveFile(file); syncMonsterDefinitionsIntoPalette();
}
export function duplicateMonsterDefinition(id: string) {
  const source = getMonsterDefinition(id); if (!source) return null;
  const copy = clone(source); const now = Date.now(); copy.id = uid('monster'); copy.name = `${source.name} - Cópia`; copy.createdAt = now; copy.updatedAt = now;
  return saveMonsterDefinition(copy);
}
export function monsterAssetId(id: string) { return `${MONSTER_ASSET_PREFIX}${id}`; }
export function monsterIdFromAssetId(assetId: string) { return assetId.startsWith(MONSTER_ASSET_PREFIX) ? assetId.slice(MONSTER_ASSET_PREFIX.length) : null; }

function appearanceAsset(definition: MonsterDefinition) {
  const candidates = [
    definition.appearance.idle.south,
    definition.appearance.walk.south,
    definition.appearance.fallbackAssetId,
    ...Object.values(definition.appearance.idle),
    ...Object.values(definition.appearance.walk),
    ...Object.values(definition.appearance.attack),
  ].filter(Boolean) as string[];
  for (const id of candidates) {
    const entry = MAP_PALETTE_ENTRIES.find((value) => value.id === id && !value.id.startsWith(MONSTER_ASSET_PREFIX));
    if (entry) return entry;
  }
  return getPaletteEntry('wolf');
}

export function resolveMonsterAppearanceAssetId(definition: MonsterDefinition, state: MonsterAnimationState, direction: MonsterDirection) {
  const exact = definition.appearance[state][direction]; if (exact) return exact;
  const cardinalFallback: Partial<Record<MonsterDirection, MonsterDirection>> = {
    'north-east': 'north', 'north-west': 'north', 'south-east': 'south', 'south-west': 'south',
  };
  const cardinal = cardinalFallback[direction];
  if (cardinal && definition.appearance[state][cardinal]) return definition.appearance[state][cardinal]!;
  if (definition.appearance[state].south) return definition.appearance[state].south!;
  if (state !== 'idle' && definition.appearance.idle[direction]) return definition.appearance.idle[direction]!;
  return definition.appearance.fallbackAssetId || appearanceAsset(definition).id;
}

export function syncMonsterDefinitionsIntoPalette() {
  for (let i = MAP_PALETTE_ENTRIES.length - 1; i >= 0; i--) if (MAP_PALETTE_ENTRIES[i].id.startsWith(MONSTER_ASSET_PREFIX)) MAP_PALETTE_ENTRIES.splice(i, 1);
  for (const definition of listMonsterDefinitions()) {
    const base = appearanceAsset(definition);
    const entry: MapPaletteEntry = {
      id: monsterAssetId(definition.id),
      palette: 'monster',
      label: definition.name,
      icon: definition.rank === 'boss' ? '👑' : definition.rank === 'elite' ? '◆' : '☠',
      color: base.color || '#b96767',
      description: `${definition.title ? `${definition.title} • ` : ''}Nv. ${definition.level} • ${definition.rank}`,
      defaultLayer: 'objects',
      objectKind: 'monster',
      tags: ['monster-studio', definition.rank, definition.category, ...definition.tags],
      folder: 'monster',
      sprite: base.sprite ? clone(base.sprite) : undefined,
      footprint: base.footprint ? clone(base.footprint) : { width: 1, height: 1 },
      source: 'custom',
    };
    if (entry.sprite) {
      entry.sprite.widthTiles = (entry.sprite.widthTiles ?? 1) * Math.max(.1, definition.appearance.scale || 1);
      entry.sprite.heightTiles = (entry.sprite.heightTiles ?? 1) * Math.max(.1, definition.appearance.scale || 1);
      const firstFrame = entry.sprite.animation?.frames?.[0];
      if (firstFrame) entry.sprite.sourceRect = { x: firstFrame.x, y: firstFrame.y, width: firstFrame.width, height: firstFrame.height };
    }
    MAP_PALETTE_ENTRIES.push(entry);
  }
}

export function hydrateMonsterDefinitionsIntoPalette() { syncMonsterDefinitionsIntoPalette(); }
