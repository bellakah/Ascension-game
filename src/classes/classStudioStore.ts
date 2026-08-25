import type { ClassDefinition, ClassId, ClassStudioRecord } from './classStudioTypes';

const STORAGE_KEY = 'ascension.class-studio.v2';
const CHANGE_EVENT = 'ascension-class-definitions-change';
type ClassFile = { version: 2; records: ClassStudioRecord[] };

const clone = <T>(value: T): T => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
const now = () => Date.now();

function legacyRecords(): ClassStudioRecord[] {
  const stamp = 1;
  return [
    {
      version: 2,
      numericId: 1,
      key: 'warrior',
      source: 'legacy',
      status: 'published',
      selectable: true,
      name: 'Guerreiro',
      shortName: 'Guerreiro',
      icon: '⚔️',
      colorHint: '#d59a54',
      tagline: 'Combate corpo a corpo',
      description: 'Resistente e direto. Usa espadas, investidas e golpes em área para dominar a linha de frente.',
      archetype: 'dps',
      tags: ['melee', 'physical', 'starter'],
      priority: 10,
      allowedSexes: ['male', 'female'],
      baseStats: { maxHp: 100, attack: 34, defense: 5, magicAttack: 0, magicDefense: 2, accuracy: 100, evasion: 5, critChance: 5, critDamage: 150, attackSpeed: 1, castSpeed: 1, moveSpeed: 1, hpRegen: 0 },
      resource: { key: 'energy', label: 'Energia', mode: 'regenerate', max: 100, startingValue: 100, regenPerSecond: 12, regenInCombat: true, regenOutOfCombat: true, gainOnBasicAttack: 0, gainOnDamageTaken: 0, drainOutOfCombatPerSecond: 0, resetOnCombatEnd: false },
      basicAttack: { type: 'melee', animation: 'slash', damageType: 'physical', range: 110, cooldownTicks: 30, damageMultiplier: 1, effectColor: 0xffc2b8 },
      progression: { maxLevel: 100, baseExp: 100, expGrowthPercent: 35, growthMode: 'fixed', maxHpPerLevel: 12, attackPerLevel: 4, defensePerLevel: 1, magicAttackPerLevel: 0, magicDefensePerLevel: 1, resourcePerLevel: 0 },
      startingEquipment: { weapon: 'basic_sword', armor: 'chainmail', boots: 'basic_boots', head: null, legs: null, accessory1: null, accessory2: null },
      startingItems: [],
      allowedEquipmentTags: ['weapon:sword', 'armor:heavy', 'armor:medium', 'armor:universal'],
      skillIds: ['warrior.power_strike', 'warrior.charge', 'warrior.whirlwind', 'warrior.war_cry'],
      spawn: { mode: 'global', map: 'Floresta Inicial' },
      nextClassIds: [],
      createdAt: stamp,
      updatedAt: stamp,
    },
    {
      version: 2,
      numericId: 2,
      key: 'mage',
      source: 'legacy',
      status: 'published',
      selectable: true,
      name: 'Mago',
      shortName: 'Mago',
      icon: '🔮',
      colorHint: '#7aa7f2',
      tagline: 'Magia de longo alcance',
      description: 'Atacante arcano de longo alcance. Tem menos resistência, mas mais alcance, Mana e explosões mágicas.',
      archetype: 'dps',
      tags: ['ranged', 'magic', 'starter'],
      priority: 20,
      allowedSexes: ['male', 'female'],
      baseStats: { maxHp: 82, attack: 38, defense: 2, magicAttack: 38, magicDefense: 6, accuracy: 100, evasion: 4, critChance: 5, critDamage: 150, attackSpeed: .9, castSpeed: 1, moveSpeed: 1, hpRegen: 0 },
      resource: { key: 'mana', label: 'Mana', mode: 'regenerate', max: 120, startingValue: 120, regenPerSecond: 16, regenInCombat: true, regenOutOfCombat: true, gainOnBasicAttack: 0, gainOnDamageTaken: 0, drainOutOfCombatPerSecond: 0, resetOnCombatEnd: false },
      basicAttack: { type: 'magic-projectile', animation: 'spellcast', damageType: 'magical', range: 390, cooldownTicks: 38, damageMultiplier: 1, projectileKey: 'arcane_bolt', projectileSpeed: 720, projectileColor: 0x82b7ff, effectColor: 0x9ddcff },
      progression: { maxLevel: 100, baseExp: 100, expGrowthPercent: 35, growthMode: 'fixed', maxHpPerLevel: 8, attackPerLevel: 5, defensePerLevel: 1, magicAttackPerLevel: 5, magicDefensePerLevel: 2, resourcePerLevel: 0 },
      startingEquipment: { weapon: 'apprentice_staff', armor: null, boots: 'basic_boots', head: null, legs: null, accessory1: null, accessory2: null },
      startingItems: [],
      allowedEquipmentTags: ['weapon:staff', 'armor:cloth', 'armor:light', 'armor:universal'],
      skillIds: ['mage.arcane_bolt', 'mage.fireball', 'mage.arcane_wave', 'mage.arcane_focus'],
      spawn: { mode: 'global', map: 'Floresta Inicial' },
      nextClassIds: [],
      createdAt: stamp,
      updatedAt: stamp,
    },
  ];
}

function normalizeRecord(input: Partial<ClassStudioRecord> & Pick<ClassStudioRecord, 'key' | 'name' | 'numericId'>): ClassStudioRecord {
  const fallback = legacyRecords().find((entry) => entry.key === input.key) ?? legacyRecords()[0];
  const baseStats = { ...fallback.baseStats, ...(input.baseStats ?? {}) };
  const resource = { ...fallback.resource, ...(input.resource ?? {}) };
  const basicAttack = { ...fallback.basicAttack, ...(input.basicAttack ?? {}) };
  const progression = { ...fallback.progression, ...(input.progression ?? {}) };
  const startingEquipment = { ...fallback.startingEquipment, ...(input.startingEquipment ?? {}) };
  return {
    ...clone(fallback),
    ...input,
    version: 2,
    numericId: Math.max(1, Math.floor(Number(input.numericId) || 1)),
    key: String(input.key || '').trim(),
    name: String(input.name || '').trim() || 'Nova Classe',
    shortName: String(input.shortName ?? input.name ?? '').trim() || 'Classe',
    status: input.status ?? 'draft',
    selectable: Boolean(input.selectable),
    tags: Array.isArray(input.tags) ? input.tags.map(String).filter(Boolean) : [],
    allowedSexes: Array.isArray(input.allowedSexes) && input.allowedSexes.length ? input.allowedSexes.filter((value) => value === 'male' || value === 'female') : ['male', 'female'],
    baseStats,
    resource: { ...resource, max: Math.max(1, Number(resource.max) || 1), startingValue: Math.max(0, Math.min(Math.max(1, Number(resource.max) || 1), Number(resource.startingValue) || 0)) },
    basicAttack: { ...basicAttack, range: Math.max(20, Number(basicAttack.range) || 20), cooldownTicks: Math.max(1, Math.floor(Number(basicAttack.cooldownTicks) || 1)), damageMultiplier: Math.max(0, Number(basicAttack.damageMultiplier) || 0) },
    progression: { ...progression, maxLevel: Math.max(1, Math.floor(Number(progression.maxLevel) || 100)), baseExp: Math.max(1, Math.floor(Number(progression.baseExp) || 100)), expGrowthPercent: Math.max(0, Number(progression.expGrowthPercent) || 0) },
    startingEquipment,
    startingItems: Array.isArray(input.startingItems) ? input.startingItems.map((entry) => ({ itemId: String(entry.itemId), quantity: Math.max(1, Math.floor(Number(entry.quantity) || 1)) })) : [],
    allowedEquipmentTags: Array.isArray(input.allowedEquipmentTags) ? input.allowedEquipmentTags.map(String).filter(Boolean) : [],
    skillIds: Array.isArray(input.skillIds) ? input.skillIds.map(String).filter(Boolean) : [],
    spawn: { ...fallback.spawn, ...(input.spawn ?? {}) },
    nextClassIds: Array.isArray(input.nextClassIds) ? input.nextClassIds.map(String).filter(Boolean) : [],
    createdAt: Number(input.createdAt) || now(),
    updatedAt: Number(input.updatedAt) || now(),
  };
}

function readFile(): ClassFile {
  let parsed: Partial<ClassFile> | null = null;
  try { parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<ClassFile> | null; } catch { parsed = null; }
  const source = Array.isArray(parsed?.records) ? parsed!.records! : [];
  const records = source.map((record) => normalizeRecord(record));
  let changed = !source.length || parsed?.version !== 2;
  for (const legacy of legacyRecords()) {
    if (!records.some((record) => record.key === legacy.key)) { records.push(legacy); changed = true; }
  }
  records.sort((a, b) => a.priority - b.priority || a.numericId - b.numericId);
  const file: ClassFile = { version: 2, records };
  if (changed) writeFile(file, false);
  return file;
}

function writeFile(file: ClassFile, notify = true) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
  if (notify) window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function ensureClassStudioMigration() { return readFile().records.map(clone); }
export function listClassStudioRecords() { return readFile().records.map(clone); }
export function listPublishedClasses() { return listClassStudioRecords().filter((record) => record.status === 'published'); }
export function listSelectableClasses() { return listPublishedClasses().filter((record) => record.selectable).sort((a, b) => a.priority - b.priority || a.numericId - b.numericId); }
export function getClassStudioRecord(key: string | null | undefined) { const found = readFile().records.find((record) => record.key === key); return found ? clone(found) : null; }
export function getClassStudioRecordByNumericId(numericId: number) { const found = readFile().records.find((record) => record.numericId === numericId); return found ? clone(found) : null; }

export function nextClassNumericId() {
  return Math.max(0, ...readFile().records.map((record) => record.numericId)) + 1;
}

export function createClassStudioRecord(name = 'Nova Classe'): ClassStudioRecord {
  const numericId = nextClassNumericId();
  const key = `class_${numericId}`;
  const base = clone(legacyRecords()[0]);
  return normalizeRecord({
    ...base,
    numericId,
    key,
    name,
    shortName: name,
    source: 'custom',
    status: 'draft',
    selectable: false,
    icon: '✦',
    tagline: 'Nova classe',
    description: '',
    tags: [],
    priority: numericId * 10,
    skillIds: [],
    startingItems: [],
    startingEquipment: { weapon: null, armor: null, boots: null, head: null, legs: null, accessory1: null, accessory2: null },
    createdAt: now(),
    updatedAt: now(),
  });
}

export function saveClassStudioRecord(record: ClassStudioRecord) {
  const file = readFile();
  const copy = normalizeRecord({ ...clone(record), updatedAt: now() });
  if (!copy.key) throw new Error('A classe precisa de uma chave interna.');
  const keyCollision = file.records.find((entry) => entry.key === copy.key && entry.numericId !== copy.numericId);
  if (keyCollision) throw new Error(`A chave ${copy.key} já pertence à classe #${keyCollision.numericId}.`);
  const idCollision = file.records.find((entry) => entry.numericId === copy.numericId && entry.key !== copy.key);
  if (idCollision) throw new Error(`O Class ID #${copy.numericId} já está em uso.`);
  const index = file.records.findIndex((entry) => entry.numericId === copy.numericId);
  if (index >= 0) file.records[index] = copy; else file.records.push(copy);
  writeFile(file);
  return clone(copy);
}

export function duplicateClassStudioRecord(recordOrKey: ClassStudioRecord | string) {
  const source = typeof recordOrKey === 'string' ? getClassStudioRecord(recordOrKey) : clone(recordOrKey);
  if (!source) return null;
  const copy = normalizeRecord({ ...source, numericId: nextClassNumericId(), key: `${source.key}_copy_${Date.now().toString(36)}`, name: `${source.name} - Cópia`, shortName: `${source.shortName} Cópia`, source: 'custom', status: 'draft', selectable: false, createdAt: now(), updatedAt: now() });
  return saveClassStudioRecord(copy);
}

export function deleteClassStudioRecord(key: string) {
  const file = readFile();
  const target = file.records.find((record) => record.key === key);
  if (!target) return false;
  if (target.source === 'legacy') throw new Error('Guerreiro e Mago são classes migradas e não podem ser apagadas. Desative-as se necessário.');
  file.records = file.records.filter((record) => record.key !== key);
  writeFile(file);
  return true;
}

export function resolveClassDefinition(value?: string | null): ClassDefinition {
  const records = readFile().records;
  const exact = records.find((record) => record.key === value || record.name === value);
  if (exact) return clone(exact);
  return clone(records.find((record) => record.key === 'warrior') ?? legacyRecords()[0]);
}

export function normalizeClassKey(value?: string | null): ClassId {
  return resolveClassDefinition(value).key;
}

export function onClassDefinitionsChange(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}
