import { getItemStudioRecordByKey } from '../items/itemStudioStore';
import type { CraftIngredientRecord, CraftOutputRecord, CraftRecipeStudioRecord, CraftStationTypeRecord } from './craftStudioTypes';

const STORAGE_KEY = 'ascension.craft-studio.v1';
const CHANGE_EVENT = 'ascension-craft-definitions-change';
const clone = <T>(value: T): T => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;

type CraftStudioFile = { version: 1; recipes: CraftRecipeStudioRecord[]; stationTypes: CraftStationTypeRecord[] };
type LegacyRecipeSeed = {
  key: string;
  name: string;
  description: string;
  icon: string;
  stationTypeId: 'forge' | 'alchemy';
  category: string;
  ingredients: Array<{ itemId: string; quantity: number }>;
  output: { itemId: string; quantity: number };
  requiredLevel?: number;
  sortOrder?: number;
};

const LEGACY_STATIONS: Array<Pick<CraftStationTypeRecord, 'key' | 'name' | 'icon' | 'prompt' | 'interactionRadius' | 'categories'>> = [
  { key: 'forge', name: 'Forja', icon: '⚒', prompt: 'Usar forja', interactionRadius: 82, categories: ['refining', 'enhancement', 'weapon', 'armor', 'accessory'] },
  { key: 'alchemy', name: 'Alquimia', icon: '⚗', prompt: 'Preparar alquimia', interactionRadius: 78, categories: ['consumable'] },
];

const LEGACY_RECIPES: LegacyRecipeSeed[] = [
  { key: 'refine-iron-ingot', name: 'Lingote de Ferro', description: 'Refina minério bruto em metal utilizável na forja.', icon: '▰', stationTypeId: 'forge', category: 'refining', ingredients: [{ itemId: 'iron_ore', quantity: 3 }], output: { itemId: 'iron_ingot', quantity: 1 }, sortOrder: 10 },
  { key: 'refine-silver-ingot', name: 'Lingote de Prata', description: 'Prata refinada para acessórios e armas arcanas.', icon: '▱', stationTypeId: 'forge', category: 'refining', ingredients: [{ itemId: 'silver_ore', quantity: 3 }], output: { itemId: 'silver_ingot', quantity: 1 }, sortOrder: 20 },
  { key: 'forge-refinement-stone', name: 'Pedras de Refino', description: 'Condensa ferro, prata e energia lunar em catalisadores de aprimoramento.', icon: '💠', stationTypeId: 'forge', category: 'enhancement', ingredients: [{ itemId: 'iron_ingot', quantity: 1 }, { itemId: 'silver_ore', quantity: 2 }, { itemId: 'moonleaf', quantity: 1 }], output: { itemId: 'refinement_stone', quantity: 2 }, sortOrder: 21 },
  { key: 'forge-ruby-shard', name: 'Pedra Rubi', description: 'Lapida uma pedra ofensiva destinada aos soquetes de armas.', icon: '🔴', stationTypeId: 'forge', category: 'enhancement', ingredients: [{ itemId: 'silver_ingot', quantity: 1 }, { itemId: 'wolf_fang', quantity: 2 }], output: { itemId: 'ruby_shard', quantity: 1 }, sortOrder: 22 },
  { key: 'forge-sapphire-shard', name: 'Pedra Safira', description: 'Lapida uma pedra defensiva para armaduras.', icon: '🔵', stationTypeId: 'forge', category: 'enhancement', ingredients: [{ itemId: 'silver_ingot', quantity: 1 }, { itemId: 'sludge_core', quantity: 2 }], output: { itemId: 'sapphire_shard', quantity: 1 }, sortOrder: 23 },
  { key: 'forge-citrine-shard', name: 'Pedra Citrina', description: 'Lapida uma pedra vital para armaduras.', icon: '🟡', stationTypeId: 'forge', category: 'enhancement', ingredients: [{ itemId: 'silver_ingot', quantity: 1 }, { itemId: 'moonleaf', quantity: 2 }], output: { itemId: 'citrine_shard', quantity: 1 }, sortOrder: 24 },
  { key: 'forge-iron-sword', name: 'Espada de Ferro', description: 'Forja uma espada equilibrada para Guerreiros.', icon: '🗡️', stationTypeId: 'forge', category: 'weapon', ingredients: [{ itemId: 'iron_ingot', quantity: 3 }, { itemId: 'oak_wood', quantity: 1 }], output: { itemId: 'iron_sword', quantity: 1 }, sortOrder: 30 },
  { key: 'forge-arcane-staff', name: 'Cajado de Carvalho Arcano', description: 'Cajado de madeira e prata capaz de canalizar Mana com mais eficiência.', icon: '🪄', stationTypeId: 'forge', category: 'weapon', ingredients: [{ itemId: 'oak_wood', quantity: 3 }, { itemId: 'silver_ingot', quantity: 1 }, { itemId: 'moonleaf', quantity: 2 }], output: { itemId: 'oak_arcane_staff', quantity: 1 }, sortOrder: 40 },
  { key: 'forge-guard-armor', name: 'Armadura do Guarda', description: 'Cota reforçada com ferro e couro de criaturas da floresta.', icon: '🛡️', stationTypeId: 'forge', category: 'armor', ingredients: [{ itemId: 'iron_ingot', quantity: 4 }, { itemId: 'wolf_pelt', quantity: 3 }], output: { itemId: 'forged_guard_armor', quantity: 1 }, sortOrder: 50 },
  { key: 'forge-fang-charm', name: 'Amuleto da Presa', description: 'Prata refinada envolvendo presas sombrias polidas.', icon: '📿', stationTypeId: 'forge', category: 'accessory', ingredients: [{ itemId: 'silver_ingot', quantity: 1 }, { itemId: 'wolf_fang', quantity: 3 }], output: { itemId: 'fang_charm', quantity: 1 }, sortOrder: 60 },
  { key: 'alchemy-small-potion', name: 'Poção Pequena de Vida', description: 'Infusão simples feita com ervas frescas da clareira.', icon: '🧪', stationTypeId: 'alchemy', category: 'consumable', ingredients: [{ itemId: 'healing_herb', quantity: 2 }], output: { itemId: 'small_health_potion', quantity: 1 }, sortOrder: 10 },
  { key: 'alchemy-medium-potion', name: 'Poção Média de Vida', description: 'Mistura concentrada de ervas medicinais e Folha Lunar.', icon: '🧴', stationTypeId: 'alchemy', category: 'consumable', ingredients: [{ itemId: 'healing_herb', quantity: 3 }, { itemId: 'moonleaf', quantity: 1 }], output: { itemId: 'medium_health_potion', quantity: 1 }, sortOrder: 20 },
  { key: 'alchemy-large-potion', name: 'Poção Grande de Vida', description: 'Elixir potente preparado com Folha Lunar e Núcleo de Lodo.', icon: '⚗️', stationTypeId: 'alchemy', category: 'consumable', ingredients: [{ itemId: 'moonleaf', quantity: 3 }, { itemId: 'sludge_core', quantity: 1 }], output: { itemId: 'large_health_potion', quantity: 1 }, sortOrder: 30 },
];

function itemNumericId(itemId: string) { return getItemStudioRecordByKey(itemId)?.numericId; }
function normalizeIngredient(input: CraftIngredientRecord): CraftIngredientRecord {
  const itemId = String(input.itemId ?? '');
  return { itemId, ...(itemNumericId(itemId) ? { numericId: itemNumericId(itemId) } : {}), quantity: Math.max(1, Math.floor(Number(input.quantity) || 1)), consume: input.consume !== false };
}
function normalizeOutput(output: CraftOutputRecord): CraftOutputRecord {
  const itemId = String(output.itemId ?? '');
  return { itemId, ...(itemNumericId(itemId) ? { numericId: itemNumericId(itemId) } : {}), quantity: Math.max(1, Math.floor(Number(output.quantity) || 1)), chance: Math.max(0, Math.min(1, Number(output.chance) || 0)), kind: output.kind === 'byproduct' ? 'byproduct' : 'primary' };
}
function normalizeRecipe(record: CraftRecipeStudioRecord): CraftRecipeStudioRecord {
  const now = Date.now();
  return {
    version: 1,
    numericId: Math.max(1, Math.floor(Number(record.numericId) || 1)),
    key: String(record.key || `recipe_${record.numericId || 1}`).trim(),
    source: record.source === 'legacy' ? 'legacy' : 'custom',
    status: record.status === 'draft' || record.status === 'disabled' ? record.status : 'published',
    name: String(record.name || 'Receita sem nome'), description: String(record.description || ''), icon: String(record.icon || '⚒'), category: String(record.category || 'custom'), stationTypeId: String(record.stationTypeId || ''),
    ingredients: Array.isArray(record.ingredients) ? record.ingredients.map(normalizeIngredient) : [],
    outputs: Array.isArray(record.outputs) ? record.outputs.map(normalizeOutput) : [],
    requirements: {
      ...(Number(record.requirements?.minLevel) > 0 ? { minLevel: Math.max(1, Math.floor(Number(record.requirements.minLevel))) } : {}),
      ...(record.requirements?.classIds?.length ? { classIds: [...record.requirements.classIds] } : {}),
      ...(record.requirements?.completedQuests?.length ? { completedQuests: [...record.requirements.completedQuests] } : {}),
      ...(record.requirements?.eventKey ? { eventKey: String(record.requirements.eventKey) } : {}),
      learnMode: record.requirements?.learnMode ?? 'automatic',
      ...(record.requirements?.learnItemId ? { learnItemId: String(record.requirements.learnItemId) } : {}),
      ...(record.requirements?.learnQuestId ? { learnQuestId: String(record.requirements.learnQuestId) } : {}),
    },
    sortOrder: Number(record.sortOrder) || 0,
    tags: Array.isArray(record.tags) ? record.tags.map(String).filter(Boolean) : [],
    createdAt: Number(record.createdAt) || now, updatedAt: Number(record.updatedAt) || now,
  };
}
function normalizeStation(record: CraftStationTypeRecord): CraftStationTypeRecord {
  const now = Date.now();
  return {
    version: 1,
    numericId: Math.max(1, Math.floor(Number(record.numericId) || 1)),
    key: String(record.key || `station_${record.numericId || 1}`).trim(),
    source: record.source === 'legacy' ? 'legacy' : 'custom',
    status: record.status === 'draft' || record.status === 'disabled' ? record.status : 'published',
    name: String(record.name || 'Estação sem nome'), icon: String(record.icon || '⚒'), prompt: String(record.prompt || 'Fabricar'), interactionRadius: Math.max(1, Number(record.interactionRadius) || 80),
    categories: Array.isArray(record.categories) ? record.categories.map(String).filter(Boolean) : [], tags: Array.isArray(record.tags) ? record.tags.map(String).filter(Boolean) : [],
    createdAt: Number(record.createdAt) || now, updatedAt: Number(record.updatedAt) || now,
  };
}
function readFile(): CraftStudioFile {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as Partial<CraftStudioFile>;
    if (parsed.version !== 1) return { version: 1, recipes: [], stationTypes: [] };
    return { version: 1, recipes: Array.isArray(parsed.recipes) ? parsed.recipes.map((value) => normalizeRecipe(value as CraftRecipeStudioRecord)) : [], stationTypes: Array.isArray(parsed.stationTypes) ? parsed.stationTypes.map((value) => normalizeStation(value as CraftStationTypeRecord)) : [] };
  } catch { return { version: 1, recipes: [], stationTypes: [] }; }
}
function writeFile(file: CraftStudioFile, notify = true) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, recipes: file.recipes.map(normalizeRecipe), stationTypes: file.stationTypes.map(normalizeStation) }));
  if (notify) window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}
function stationFromSeed(seed: typeof LEGACY_STATIONS[number], numericId: number): CraftStationTypeRecord {
  const now = Date.now();
  return normalizeStation({ version: 1, numericId, key: seed.key, source: 'legacy', status: 'published', name: seed.name, icon: seed.icon, prompt: seed.prompt, interactionRadius: seed.interactionRadius, categories: seed.categories, tags: ['legacy'], createdAt: now, updatedAt: now });
}
function recipeFromSeed(seed: LegacyRecipeSeed, numericId: number): CraftRecipeStudioRecord {
  const now = Date.now();
  return normalizeRecipe({ version: 1, numericId, key: seed.key, source: 'legacy', status: 'published', name: seed.name, description: seed.description, icon: seed.icon, category: seed.category, stationTypeId: seed.stationTypeId, ingredients: seed.ingredients.map((entry) => ({ itemId: entry.itemId, numericId: itemNumericId(entry.itemId), quantity: entry.quantity, consume: true })), outputs: [{ itemId: seed.output.itemId, numericId: itemNumericId(seed.output.itemId), quantity: seed.output.quantity, chance: 1, kind: 'primary' }], requirements: { ...(seed.requiredLevel ? { minLevel: seed.requiredLevel } : {}), learnMode: 'automatic' }, sortOrder: seed.sortOrder ?? 0, tags: ['legacy'], createdAt: now, updatedAt: now });
}

export function ensureCraftStudioMigration() {
  const file = readFile(); let changed = false;
  const stationKeys = new Set(file.stationTypes.map((entry) => entry.key));
  let nextStationId = Math.max(0, ...file.stationTypes.map((entry) => entry.numericId)) + 1;
  for (const seed of LEGACY_STATIONS) if (!stationKeys.has(seed.key)) { file.stationTypes.push(stationFromSeed(seed, nextStationId++)); stationKeys.add(seed.key); changed = true; }
  const recipeKeys = new Set(file.recipes.map((entry) => entry.key));
  let nextRecipeId = Math.max(0, ...file.recipes.map((entry) => entry.numericId)) + 1;
  for (const seed of LEGACY_RECIPES) if (!recipeKeys.has(seed.key)) { file.recipes.push(recipeFromSeed(seed, nextRecipeId++)); recipeKeys.add(seed.key); changed = true; }
  if (changed) writeFile(file, false);
  return { recipes: file.recipes.map(clone).sort((a, b) => a.numericId - b.numericId), stationTypes: file.stationTypes.map(clone).sort((a, b) => a.numericId - b.numericId) };
}

export function listCraftRecipeRecords() { return ensureCraftStudioMigration().recipes; }
export function listPublishedCraftRecipeRecords() { return listCraftRecipeRecords().filter((entry) => entry.status === 'published'); }
export function listCraftStationTypeRecords() { return ensureCraftStudioMigration().stationTypes; }
export function listPublishedCraftStationTypeRecords() { return listCraftStationTypeRecords().filter((entry) => entry.status === 'published'); }
export function getCraftRecipeByKey(key: string) { const found = listCraftRecipeRecords().find((entry) => entry.key === key); return found ? clone(found) : null; }
export function getCraftRecipeByNumericId(id: number) { const found = listCraftRecipeRecords().find((entry) => entry.numericId === Math.floor(Number(id))); return found ? clone(found) : null; }
export function getCraftStationTypeByKey(key: string) { const found = listCraftStationTypeRecords().find((entry) => entry.key === key); return found ? clone(found) : null; }
export function getCraftStationTypeByNumericId(id: number) { const found = listCraftStationTypeRecords().find((entry) => entry.numericId === Math.floor(Number(id))); return found ? clone(found) : null; }
export function craftRecipeDisplay(record: Pick<CraftRecipeStudioRecord, 'numericId' | 'name'>) { return `#${record.numericId} · ${record.name}`; }
export function craftStationDisplay(record: Pick<CraftStationTypeRecord, 'numericId' | 'name'>) { return `#${record.numericId} · ${record.name}`; }
export function nextCraftRecipeNumericId() { return Math.max(0, ...listCraftRecipeRecords().map((entry) => entry.numericId)) + 1; }
export function nextCraftStationNumericId() { return Math.max(0, ...listCraftStationTypeRecords().map((entry) => entry.numericId)) + 1; }

export function createCraftRecipeRecord(): CraftRecipeStudioRecord {
  const numericId = nextCraftRecipeNumericId(), now = Date.now();
  return normalizeRecipe({ version: 1, numericId, key: `recipe_${numericId}`, source: 'custom', status: 'draft', name: 'Nova Receita', description: '', icon: '⚒', category: 'custom', stationTypeId: listPublishedCraftStationTypeRecords()[0]?.key ?? '', ingredients: [], outputs: [], requirements: { learnMode: 'automatic' }, sortOrder: 0, tags: [], createdAt: now, updatedAt: now });
}
export function createCraftStationTypeRecord(): CraftStationTypeRecord {
  const numericId = nextCraftStationNumericId(), now = Date.now();
  return normalizeStation({ version: 1, numericId, key: `station_${numericId}`, source: 'custom', status: 'draft', name: 'Nova Estação', icon: '⚒', prompt: 'Fabricar', interactionRadius: 80, categories: [], tags: [], createdAt: now, updatedAt: now });
}
function assertRecipeUnique(file: CraftStudioFile, record: CraftRecipeStudioRecord) {
  const idCollision = file.recipes.find((entry) => entry.numericId === record.numericId && entry.key !== record.key); if (idCollision) throw new Error(`O Recipe ID ${record.numericId} já pertence a “${idCollision.name}”.`);
  const keyCollision = file.recipes.find((entry) => entry.key === record.key && entry.numericId !== record.numericId); if (keyCollision) throw new Error(`A chave de receita “${record.key}” já está em uso.`);
}
function assertStationUnique(file: CraftStudioFile, record: CraftStationTypeRecord) {
  const idCollision = file.stationTypes.find((entry) => entry.numericId === record.numericId && entry.key !== record.key); if (idCollision) throw new Error(`O Station ID ${record.numericId} já pertence a “${idCollision.name}”.`);
  const keyCollision = file.stationTypes.find((entry) => entry.key === record.key && entry.numericId !== record.numericId); if (keyCollision) throw new Error(`A chave de estação “${record.key}” já está em uso.`);
}
export function saveCraftRecipeRecord(input: CraftRecipeStudioRecord) {
  const file = readFile(), record = normalizeRecipe({ ...input, updatedAt: Date.now() }); assertRecipeUnique(file, record);
  const index = file.recipes.findIndex((entry) => entry.key === record.key); if (index >= 0) file.recipes[index] = record; else file.recipes.push(record); writeFile(file); return clone(record);
}
export function saveCraftStationTypeRecord(input: CraftStationTypeRecord) {
  const file = readFile(), record = normalizeStation({ ...input, updatedAt: Date.now() }); assertStationUnique(file, record);
  const index = file.stationTypes.findIndex((entry) => entry.key === record.key); if (index >= 0) file.stationTypes[index] = record; else file.stationTypes.push(record); writeFile(file); return clone(record);
}
export function duplicateCraftRecipeRecord(source: CraftRecipeStudioRecord) {
  const copy = clone(source), now = Date.now(); copy.numericId = nextCraftRecipeNumericId(); copy.key = `recipe_${copy.numericId}`; copy.source = 'custom'; copy.status = 'draft'; copy.name = `${source.name} - Cópia`; copy.createdAt = now; copy.updatedAt = now; return saveCraftRecipeRecord(copy);
}
export function duplicateCraftStationTypeRecord(source: CraftStationTypeRecord) {
  const copy = clone(source), now = Date.now(); copy.numericId = nextCraftStationNumericId(); copy.key = `station_${copy.numericId}`; copy.source = 'custom'; copy.status = 'draft'; copy.name = `${source.name} - Cópia`; copy.createdAt = now; copy.updatedAt = now; return saveCraftStationTypeRecord(copy);
}
export function deleteCraftRecipeRecord(record: CraftRecipeStudioRecord) {
  if (record.source === 'legacy') throw new Error('Receitas migradas não podem ser apagadas; desative-as para preservar missões e saves.');
  const file = readFile(); file.recipes = file.recipes.filter((entry) => entry.key !== record.key); writeFile(file);
}
export function deleteCraftStationTypeRecord(record: CraftStationTypeRecord) {
  if (record.source === 'legacy') throw new Error('Estações migradas não podem ser apagadas; desative-as para preservar mapas existentes.');
  const file = readFile(); file.stationTypes = file.stationTypes.filter((entry) => entry.key !== record.key); writeFile(file);
}
export function onCraftStudioChange(listener: () => void) {
  const handler = () => listener(); window.addEventListener(CHANGE_EVENT, handler); return () => window.removeEventListener(CHANGE_EVENT, handler);
}
