import { MAP_PALETTE_ENTRIES, getPaletteEntry } from '../editor/map/mapEditorCatalog';
import type { MapPaletteEntry } from '../editor/map/mapEditorTypes';
import type { CollectibleDefinition, CollectibleKind } from './collectibleTypes';

const STORAGE_KEY = 'ascension.collectible.definitions.v1';
const CHANGE_EVENT = 'ascension-collectible-definitions-change';
export const COLLECTIBLE_ASSET_PREFIX = 'collectibledef:';

type CollectibleFile = { version: 1; definitions: CollectibleDefinition[] };
const clone = <T>(value: T): T => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
const uid = () => `collectible-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

function defaultDefinition(numericId: number, id: string, name: string, kind: CollectibleKind, appearance: string, output: string, tool: string, playerAnimation: CollectibleDefinition['playerAnimation'], icon: string): CollectibleDefinition {
  const now = Date.now();
  return {
    version: 1, id, numericId, name, kind,
    category: kind === 'woodcutting' ? 'Árvores' : kind === 'mining' ? 'Minérios' : 'Plantas',
    description: '', tags: [], icon,
    hint: kind === 'woodcutting' ? 'Cortar' : kind === 'mining' ? 'Minerar' : 'Coletar',
    interactionRadiusTiles: kind === 'woodcutting' ? 1.9 : 1.55,
    harvestDurationMs: kind === 'herbalism' ? 900 : 1500,
    respawnMs: kind === 'herbalism' ? 12000 : kind === 'mining' ? 18000 : 22000,
    respawnJitterMs: 2500,
    requiredToolItemId: tool,
    playerAnimation,
    appearance: { fallbackAssetId: appearance, idle: appearance, scale: 1, showShadow: true },
    drops: [{ itemId: output, chance: 1, min: 1, max: kind === 'herbalism' ? 2 : 3 }],
    createdAt: now, updatedAt: now,
  };
}

const DEFAULTS: CollectibleDefinition[] = [
  defaultDefinition(1, 'oak_tree', 'Carvalho Jovem', 'woodcutting', 'tree_oak', 'oak_wood', 'woodcutting_axe', 'chop', '🪓'),
  defaultDefinition(2, 'iron_vein', 'Veio de Ferro', 'mining', 'rock', 'iron_ore', 'mining_pickaxe', 'mine', '⛏'),
  defaultDefinition(3, 'silver_vein', 'Veio de Prata', 'mining', 'rock', 'silver_ore', 'mining_pickaxe', 'mine', '◇'),
  defaultDefinition(4, 'healing_herb', 'Erva-da-Clareira', 'herbalism', 'bush', 'healing_herb', 'herbalism_shovel', 'gather', '✿'),
  defaultDefinition(5, 'moonleaf', 'Folha Lunar', 'herbalism', 'bush', 'moonleaf', 'herbalism_shovel', 'gather', '✦'),
];

function normalize(definition: CollectibleDefinition): CollectibleDefinition {
  const now = Date.now();
  const drops = Array.isArray(definition.drops) ? definition.drops.map((drop) => ({
    itemId: String(drop.itemId ?? ''),
    ...(Number.isFinite(drop.numericId) ? { numericId: Math.max(1, Math.floor(Number(drop.numericId))) } : {}),
    chance: Math.max(0, Math.min(1, Number(drop.chance) || 0)),
    min: Math.max(1, Math.floor(Number(drop.min) || 1)),
    max: Math.max(1, Math.floor(Number(drop.max) || 1)),
  })).map((drop) => ({ ...drop, max: Math.max(drop.min, drop.max) })) : [];
  return {
    version: 1,
    id: String(definition.id || uid()),
    numericId: Math.max(1, Math.floor(Number(definition.numericId) || 1)),
    name: String(definition.name || 'Novo coletável'),
    kind: definition.kind || 'custom',
    category: String(definition.category || 'Outros'),
    description: String(definition.description || ''),
    tags: Array.isArray(definition.tags) ? definition.tags.map(String).filter(Boolean) : [],
    icon: String(definition.icon || '◆'),
    hint: String(definition.hint || 'Coletar'),
    interactionRadiusTiles: Math.max(.3, Math.min(8, Number(definition.interactionRadiusTiles) || 1.5)),
    harvestDurationMs: Math.max(150, Math.min(30000, Math.floor(Number(definition.harvestDurationMs) || 1000))),
    respawnMs: Math.max(250, Math.floor(Number(definition.respawnMs) || 10000)),
    respawnJitterMs: Math.max(0, Math.floor(Number(definition.respawnJitterMs) || 0)),
    ...(definition.requiredToolItemId ? { requiredToolItemId: String(definition.requiredToolItemId) } : {}),
    ...(Number.isFinite(definition.requiredToolNumericId) ? { requiredToolNumericId: Math.max(1, Math.floor(Number(definition.requiredToolNumericId))) } : {}),
    playerAnimation: definition.playerAnimation || 'gather',
    appearance: {
      fallbackAssetId: String(definition.appearance?.fallbackAssetId || 'rock'),
      ...(definition.appearance?.idle ? { idle: String(definition.appearance.idle) } : {}),
      ...(definition.appearance?.harvest ? { harvest: String(definition.appearance.harvest) } : {}),
      ...(definition.appearance?.break ? { break: String(definition.appearance.break) } : {}),
      ...(definition.appearance?.depleted ? { depleted: String(definition.appearance.depleted) } : {}),
      ...(definition.appearance?.respawn ? { respawn: String(definition.appearance.respawn) } : {}),
      scale: Math.max(.1, Math.min(10, Number(definition.appearance?.scale) || 1)),
      showShadow: definition.appearance?.showShadow !== false,
    },
    drops,
    createdAt: Number(definition.createdAt) || now,
    updatedAt: Number(definition.updatedAt) || now,
  };
}

function readFile(): CollectibleFile {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as Partial<CollectibleFile>;
    if (parsed.version !== 1 || !Array.isArray(parsed.definitions)) return { version: 1, definitions: [] };
    return { version: 1, definitions: parsed.definitions.filter(Boolean).map((entry) => normalize(entry as CollectibleDefinition)) };
  } catch { return { version: 1, definitions: [] }; }
}

function writeFile(file: CollectibleFile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
  syncCollectibleDefinitionsIntoPalette(file.definitions);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function ensureCollectibleMigration() {
  const file = readFile();
  const ids = new Set(file.definitions.map((entry) => entry.id));
  let changed = false;
  for (const value of DEFAULTS) {
    if (ids.has(value.id)) continue;
    file.definitions.push(clone(value)); changed = true;
  }
  if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
  syncCollectibleDefinitionsIntoPalette(file.definitions);
  return file.definitions.map(clone).sort((a, b) => a.numericId - b.numericId);
}

export function listCollectibleDefinitions() { return ensureCollectibleMigration(); }
export function getCollectibleDefinition(id: string) { return listCollectibleDefinitions().find((entry) => entry.id === id) ?? null; }
export function collectibleAssetId(id: string) { return `${COLLECTIBLE_ASSET_PREFIX}${id}`; }
export function collectibleIdFromAssetId(assetId: string) { return assetId.startsWith(COLLECTIBLE_ASSET_PREFIX) ? assetId.slice(COLLECTIBLE_ASSET_PREFIX.length) : null; }

export function nextCollectibleNumericId() { return Math.max(0, ...listCollectibleDefinitions().map((entry) => entry.numericId)) + 1; }
export function createCollectibleDefinition(): CollectibleDefinition {
  const now = Date.now(); const numericId = nextCollectibleNumericId();
  return normalize({
    version: 1, id: uid(), numericId, name: 'Novo Coletável', kind: 'custom', category: 'Outros', description: '', tags: [], icon: '◆', hint: 'Coletar',
    interactionRadiusTiles: 1.5, harvestDurationMs: 1000, respawnMs: 15000, respawnJitterMs: 0, playerAnimation: 'gather',
    appearance: { fallbackAssetId: 'rock', idle: 'rock', scale: 1, showShadow: true }, drops: [], createdAt: now, updatedAt: now,
  });
}

export function saveCollectibleDefinition(input: CollectibleDefinition) {
  const file = readFile(); const value = normalize({ ...input, updatedAt: Date.now() });
  const numericCollision = file.definitions.find((entry) => entry.numericId === value.numericId && entry.id !== value.id);
  if (numericCollision) throw new Error(`O ID de coletável ${value.numericId} já está em uso.`);
  const index = file.definitions.findIndex((entry) => entry.id === value.id);
  if (index >= 0) file.definitions[index] = value; else file.definitions.push(value);
  writeFile(file); return clone(value);
}

export function duplicateCollectibleDefinition(id: string) {
  const source = getCollectibleDefinition(id); if (!source) return null;
  const copy = clone(source); copy.id = uid(); copy.numericId = nextCollectibleNumericId(); copy.name = `${source.name} - Cópia`; copy.createdAt = Date.now(); copy.updatedAt = copy.createdAt;
  return saveCollectibleDefinition(copy);
}

export function deleteCollectibleDefinition(id: string) {
  if (DEFAULTS.some((entry) => entry.id === id)) throw new Error('Coletáveis migrados do jogo não podem ser apagados; edite-os para preservar mapas antigos.');
  const file = readFile(); file.definitions = file.definitions.filter((entry) => entry.id !== id); writeFile(file);
}

function appearanceEntry(definition: CollectibleDefinition) {
  const candidates = [definition.appearance.idle, definition.appearance.harvest, definition.appearance.break, definition.appearance.depleted, definition.appearance.respawn, definition.appearance.fallbackAssetId].filter(Boolean) as string[];
  for (const id of candidates) {
    const entry = MAP_PALETTE_ENTRIES.find((value) => value.id === id && !value.id.startsWith(COLLECTIBLE_ASSET_PREFIX));
    if (entry?.sprite) return entry;
  }
  for (const id of candidates) {
    const entry = MAP_PALETTE_ENTRIES.find((value) => value.id === id && !value.id.startsWith(COLLECTIBLE_ASSET_PREFIX));
    if (entry) return entry;
  }
  return getPaletteEntry('rock');
}

export function resolveCollectibleAppearanceAssetId(definition: CollectibleDefinition, state: keyof CollectibleDefinition['appearance']) {
  if (state !== 'fallbackAssetId' && state !== 'scale' && state !== 'showShadow') {
    const exact = definition.appearance[state]; if (typeof exact === 'string' && exact) return exact;
  }
  return definition.appearance.idle || definition.appearance.fallbackAssetId || appearanceEntry(definition).id;
}

export function syncCollectibleDefinitionsIntoPalette(definitions = readFile().definitions) {
  for (let index = MAP_PALETTE_ENTRIES.length - 1; index >= 0; index--) if (MAP_PALETTE_ENTRIES[index].id.startsWith(COLLECTIBLE_ASSET_PREFIX)) MAP_PALETTE_ENTRIES.splice(index, 1);
  for (const definition of definitions.map(normalize)) {
    const base = appearanceEntry(definition);
    const sprite = base.sprite ? clone(base.sprite) : undefined;
    if (sprite) {
      const first = sprite.animation?.frames?.[0];
      if (first) { sprite.sourceRect = { x: first.x, y: first.y, width: first.width, height: first.height }; delete sprite.animation; }
      sprite.widthTiles = (sprite.widthTiles ?? 1) * definition.appearance.scale;
      sprite.heightTiles = (sprite.heightTiles ?? 1) * definition.appearance.scale;
    }
    const entry: MapPaletteEntry = {
      id: collectibleAssetId(definition.id), palette: 'resource', folder: 'resource', label: definition.name, icon: definition.icon,
      color: base.color || '#72a66b', description: `${definition.category} • Coletável #${definition.numericId}`,
      defaultLayer: 'objects', objectKind: 'resource', tags: ['collectible-studio', definition.kind, definition.category, ...definition.tags], source: 'custom',
      sprite, footprint: base.footprint ? clone(base.footprint) : { width: 1, height: 1 },
    };
    MAP_PALETTE_ENTRIES.push(entry);
  }
}

export function onCollectibleDefinitionsChange(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener); return () => window.removeEventListener(CHANGE_EVENT, listener);
}
