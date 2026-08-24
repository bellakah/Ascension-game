import {
  ITEM_CATALOG,
  type EquipSlot,
  type ItemChestConfig,
  type ItemChestEntry,
  type ItemDefinition,
  type ItemRarity,
  type ItemStats,
} from './itemCatalog';
import type { ClassId } from '../classes/classCatalog';

export type ItemStudioCategory = ItemDefinition['category'];
export type ItemStudioSource = 'legacy' | 'custom';

export type ItemStudioFlags = {
  tradeable: boolean;
  sellable: boolean;
  droppable: boolean;
  destroyable: boolean;
};

export type ItemStudioRecord = {
  version: 1;
  numericId: number;
  key: string;
  source: ItemStudioSource;
  name: string;
  description: string;
  icon: string;
  iconImage?: string;
  category: ItemStudioCategory;
  rarity: ItemRarity;
  stackMax: number;
  value: number;
  equipSlot?: EquipSlot;
  stats?: ItemStats;
  heal?: number;
  manaHeal?: number;
  capacityBonus?: number;
  levelRequirement?: number;
  allowedClasses?: ClassId[];
  tags: string[];
  flags: ItemStudioFlags;
  chest?: ItemChestConfig;
  createdAt: number;
  updatedAt: number;
};

type ItemStudioFile = { version: 1; items: ItemStudioRecord[] };

const STORAGE_KEY = 'ascension.item-studio.v1';
const CHANGE_EVENT = 'ascension-item-definitions-change';
const clone = <T>(value: T): T => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
const clampInt = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.floor(Number(value) || 0)));

function defaultFlags(): ItemStudioFlags {
  return { tradeable: true, sellable: true, droppable: true, destroyable: true };
}

function readFile(): ItemStudioFile {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as Partial<ItemStudioFile>;
    if (parsed.version !== 1 || !Array.isArray(parsed.items)) return { version: 1, items: [] };
    return { version: 1, items: parsed.items.filter(Boolean).map((item) => normalizeRecord(item as ItemStudioRecord)) };
  } catch {
    return { version: 1, items: [] };
  }
}

function writeFile(file: ItemStudioFile, notify = true) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
  hydrateRuntime(file.items);
  if (notify) window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

function normalizeChest(chest?: ItemChestConfig): ItemChestConfig | undefined {
  if (!chest) return undefined;
  const mode = chest.mode === 'weighted' ? 'weighted' : 'independent';
  const entries = Array.isArray(chest.entries) ? chest.entries.map((entry) => ({
    itemId: String(entry.itemId ?? ''),
    numericId: Number.isFinite(entry.numericId) ? Math.max(1, Math.floor(Number(entry.numericId))) : undefined,
    chance: Math.max(0, Math.min(1, Number(entry.chance) || 0)),
    weight: Math.max(0, Number(entry.weight) || 0),
    min: Math.max(1, Math.floor(Number(entry.min) || 1)),
    max: Math.max(1, Math.floor(Number(entry.max) || 1)),
  })).map((entry) => ({ ...entry, max: Math.max(entry.min, entry.max) })) : [];
  return { mode, rolls: clampInt(chest.rolls ?? 1, 1, 100), entries };
}

function normalizeRecord(record: ItemStudioRecord): ItemStudioRecord {
  const now = Date.now();
  return {
    version: 1,
    numericId: Math.max(1, Math.floor(Number(record.numericId) || 1)),
    key: String(record.key || `item_${record.numericId || 1}`).trim(),
    source: record.source === 'legacy' ? 'legacy' : 'custom',
    name: String(record.name || 'Item sem nome'),
    description: String(record.description || ''),
    icon: String(record.icon || '◆'),
    ...(record.iconImage ? { iconImage: String(record.iconImage) } : {}),
    category: record.category || 'material',
    rarity: record.rarity || 'common',
    stackMax: clampInt(record.stackMax ?? 1, 1, 9999),
    value: Math.max(0, Math.floor(Number(record.value) || 0)),
    ...(record.equipSlot ? { equipSlot: record.equipSlot } : {}),
    ...(record.stats ? { stats: { ...record.stats } } : {}),
    ...(Number(record.heal) > 0 ? { heal: Math.max(0, Number(record.heal)) } : {}),
    ...(Number(record.manaHeal) > 0 ? { manaHeal: Math.max(0, Number(record.manaHeal)) } : {}),
    ...(Number(record.capacityBonus) > 0 ? { capacityBonus: Math.max(0, Math.floor(Number(record.capacityBonus))) } : {}),
    ...(Number(record.levelRequirement) > 0 ? { levelRequirement: Math.max(1, Math.floor(Number(record.levelRequirement))) } : {}),
    ...(record.allowedClasses?.length ? { allowedClasses: [...record.allowedClasses] } : {}),
    tags: Array.isArray(record.tags) ? record.tags.map(String).filter(Boolean) : [],
    flags: { ...defaultFlags(), ...(record.flags ?? {}) },
    ...(record.chest ? { chest: normalizeChest(record.chest) } : {}),
    createdAt: Number(record.createdAt) || now,
    updatedAt: Number(record.updatedAt) || now,
  };
}

function recordFromRuntime(item: ItemDefinition, numericId: number): ItemStudioRecord {
  const now = Date.now();
  return normalizeRecord({
    version: 1,
    numericId,
    key: item.id,
    source: 'legacy',
    name: item.name,
    description: item.description,
    icon: item.icon,
    iconImage: item.iconImage,
    category: item.category,
    rarity: item.rarity,
    stackMax: item.stackMax,
    value: item.value,
    equipSlot: item.equipSlot,
    stats: item.stats,
    heal: item.heal,
    manaHeal: item.manaHeal,
    capacityBonus: item.capacityBonus,
    levelRequirement: item.levelRequirement,
    allowedClasses: item.allowedClasses,
    tags: item.tags ?? [],
    flags: item.flags ?? defaultFlags(),
    chest: item.chest,
    createdAt: now,
    updatedAt: now,
  });
}

function runtimeFromRecord(record: ItemStudioRecord): ItemDefinition {
  return {
    id: record.key,
    numericId: record.numericId,
    name: record.name,
    description: record.description,
    icon: record.icon,
    ...(record.iconImage ? { iconImage: record.iconImage } : {}),
    category: record.category,
    rarity: record.rarity,
    stackMax: record.stackMax,
    value: record.value,
    ...(record.equipSlot ? { equipSlot: record.equipSlot } : {}),
    ...(record.stats ? { stats: clone(record.stats) } : {}),
    ...(record.heal ? { heal: record.heal } : {}),
    ...(record.manaHeal ? { manaHeal: record.manaHeal } : {}),
    ...(record.capacityBonus ? { capacityBonus: record.capacityBonus } : {}),
    ...(record.levelRequirement ? { levelRequirement: record.levelRequirement } : {}),
    ...(record.allowedClasses?.length ? { allowedClasses: [...record.allowedClasses] } : {}),
    tags: [...record.tags],
    flags: clone(record.flags),
    ...(record.chest ? { chest: clone(record.chest) } : {}),
  };
}

function hydrateRuntime(items: ItemStudioRecord[]) {
  for (const record of items) ITEM_CATALOG[record.key] = runtimeFromRecord(record);
}

export function ensureItemStudioMigration() {
  const file = readFile();
  const existingKeys = new Set(file.items.map((item) => item.key));
  let nextId = Math.max(0, ...file.items.map((item) => item.numericId)) + 1;
  let changed = false;

  // Migra o catálogo antigo para IDs numéricos permanentes sem trocar as chaves
  // internas usadas pelos saves/inventário existentes.
  for (const item of Object.values(ITEM_CATALOG)) {
    if (existingKeys.has(item.id)) continue;
    file.items.push(recordFromRuntime(item, nextId++));
    existingKeys.add(item.id);
    changed = true;
  }

  if (changed) writeFile(file, false);
  else hydrateRuntime(file.items);
  return file.items.map(clone).sort((a, b) => a.numericId - b.numericId);
}

export function hydrateItemStudioRuntime() {
  return ensureItemStudioMigration();
}

export function listItemStudioRecords() {
  return ensureItemStudioMigration();
}

export function getItemStudioRecordByNumericId(numericId: number) {
  const value = ensureItemStudioMigration().find((item) => item.numericId === Math.floor(Number(numericId)));
  return value ? clone(value) : null;
}

export function getItemStudioRecordByKey(key: string) {
  const value = ensureItemStudioMigration().find((item) => item.key === key);
  return value ? clone(value) : null;
}

export function findItemStudioRecord(query: string | number) {
  const raw = String(query ?? '').trim();
  if (!raw) return null;
  const numericMatch = raw.match(/^#?\s*(\d+)/);
  if (numericMatch) {
    const byId = getItemStudioRecordByNumericId(Number(numericMatch[1]));
    if (byId) return byId;
  }
  const lower = raw.toLocaleLowerCase('pt-BR');
  const items = ensureItemStudioMigration();
  const exact = items.find((item) => item.key.toLocaleLowerCase('pt-BR') === lower || item.name.toLocaleLowerCase('pt-BR') === lower);
  return exact ? clone(exact) : null;
}

export function itemStudioDisplay(item: Pick<ItemStudioRecord, 'numericId' | 'name'>) {
  return `#${item.numericId} · ${item.name}`;
}

export function nextItemNumericId() {
  return Math.max(0, ...ensureItemStudioMigration().map((item) => item.numericId)) + 1;
}

export function createItemStudioRecord(): ItemStudioRecord {
  const numericId = nextItemNumericId();
  const now = Date.now();
  return normalizeRecord({
    version: 1,
    numericId,
    key: `item_${numericId}`,
    source: 'custom',
    name: 'Novo Item',
    description: '',
    icon: '◆',
    category: 'material',
    rarity: 'common',
    stackMax: 99,
    value: 0,
    tags: [],
    flags: defaultFlags(),
    createdAt: now,
    updatedAt: now,
  });
}

export function saveItemStudioRecord(input: ItemStudioRecord) {
  const file = readFile();
  const record = normalizeRecord({ ...input, updatedAt: Date.now() });
  const idCollision = file.items.find((item) => item.numericId === record.numericId && item.key !== record.key);
  if (idCollision) throw new Error(`O Item ID ${record.numericId} já pertence a “${idCollision.name}”.`);
  const keyCollision = file.items.find((item) => item.key === record.key && item.numericId !== record.numericId);
  if (keyCollision) throw new Error(`A chave interna “${record.key}” já está em uso.`);
  const index = file.items.findIndex((item) => item.key === record.key);
  if (index >= 0) file.items[index] = record;
  else file.items.push(record);
  writeFile(file);
  return clone(record);
}

export function duplicateItemStudioRecord(source: ItemStudioRecord) {
  const copy = clone(source);
  copy.numericId = nextItemNumericId();
  copy.key = `item_${copy.numericId}`;
  copy.source = 'custom';
  copy.name = `${source.name} - Cópia`;
  copy.createdAt = Date.now();
  copy.updatedAt = copy.createdAt;
  return saveItemStudioRecord(copy);
}

export function deleteItemStudioRecord(record: ItemStudioRecord) {
  if (record.source === 'legacy') throw new Error('Itens migrados do jogo não podem ser apagados; edite-os para preservar saves antigos.');
  const file = readFile();
  file.items = file.items.filter((item) => item.key !== record.key);
  delete ITEM_CATALOG[record.key];
  writeFile(file);
}

export function resolveItemStudioRecord(itemId: string, numericId?: number) {
  if (numericId) {
    const byNumeric = getItemStudioRecordByNumericId(numericId);
    if (byNumeric) return byNumeric;
  }
  return getItemStudioRecordByKey(itemId);
}

export type RolledChestReward = { itemId: string; numericId?: number; quantity: number };

function quantityFor(entry: ItemChestEntry) {
  const min = Math.max(1, Math.floor(Number(entry.min) || 1));
  const max = Math.max(min, Math.floor(Number(entry.max) || min));
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function rollItemChest(chest?: ItemChestConfig): RolledChestReward[] {
  if (!chest?.entries?.length) return [];
  const rewards: RolledChestReward[] = [];
  const push = (entry: ItemChestEntry) => {
    if (!entry.itemId) return;
    const quantity = quantityFor(entry);
    const existing = rewards.find((reward) => reward.itemId === entry.itemId);
    if (existing) existing.quantity += quantity;
    else rewards.push({ itemId: entry.itemId, numericId: entry.numericId, quantity });
  };

  if (chest.mode === 'weighted') {
    const candidates = chest.entries.filter((entry) => entry.itemId && Number(entry.weight) > 0);
    const total = candidates.reduce((sum, entry) => sum + Math.max(0, Number(entry.weight) || 0), 0);
    if (total <= 0) return [];
    for (let roll = 0; roll < Math.max(1, Math.floor(Number(chest.rolls) || 1)); roll++) {
      let cursor = Math.random() * total;
      for (const entry of candidates) {
        cursor -= Math.max(0, Number(entry.weight) || 0);
        if (cursor <= 0) { push(entry); break; }
      }
    }
    return rewards;
  }

  for (const entry of chest.entries) {
    const chance = Math.max(0, Math.min(1, Number(entry.chance) || 0));
    if (Math.random() <= chance) push(entry);
  }
  return rewards;
}

export function onItemStudioChange(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}
