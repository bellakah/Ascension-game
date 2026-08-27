import type { AscensionMapDocument, MapBaseSurface, MapObject, MapZone } from './mapEditorTypes';
import { tileKey } from './mapEditorTypes';
import { DEFAULT_COLOR_SURFACE, normalizeBaseSurface } from './mapBaseSurface';

const LEGACY_STORAGE_KEY = 'ascension.map-editor.documents.v1';
const INDEX_KEY = 'ascension.map-editor.documents.v2.index';
const DOCUMENT_PREFIX = 'ascension.map-editor.document.v2.';
const ACTIVE_KEY = 'ascension.map-editor.active.v1';

type MapFile = { version: 1; documents: AscensionMapDocument[] };
type MapIndex = { version: 2; ids: string[] };
type StorageMode = 'v2' | 'legacy';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
let documentCache: Map<string, AscensionMapDocument> | null = null;
let storageMode: StorageMode = 'v2';

function makeId(prefix: string) {
  if ('randomUUID' in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeDocument(document: AscensionMapDocument): AscensionMapDocument {
  const copy = clone(document);
  copy.metadata ??= { background: '#527b45' };
  copy.metadata.background ||= '#527b45';
  copy.metadata.baseSurface = normalizeBaseSurface(copy.metadata.baseSurface, copy.metadata.background);
  return copy;
}

function readLegacyDocuments() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) ?? '') as Partial<MapFile>;
    return Array.isArray(parsed.documents) ? parsed.documents.map((value) => normalizeDocument(value as AscensionMapDocument)) : [];
  } catch {
    return [] as AscensionMapDocument[];
  }
}

function readV2Index(): MapIndex | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(INDEX_KEY) ?? '') as Partial<MapIndex>;
    if (parsed.version !== 2 || !Array.isArray(parsed.ids)) return null;
    return { version: 2, ids: parsed.ids.map(String) };
  } catch {
    return null;
  }
}

function cleanupV2(ids: Iterable<string>) {
  for (const id of ids) localStorage.removeItem(`${DOCUMENT_PREFIX}${id}`);
  localStorage.removeItem(INDEX_KEY);
}

function tryMigrateLegacy(documents: AscensionMapDocument[]) {
  if (!documents.length) return true;
  const written: string[] = [];
  try {
    for (const document of documents) {
      localStorage.setItem(`${DOCUMENT_PREFIX}${document.id}`, JSON.stringify(document));
      written.push(document.id);
    }
    const index: MapIndex = { version: 2, ids: documents.map((document) => document.id) };
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
    // O arquivo antigo só é removido depois que todos os documentos e o índice
    // foram gravados. Se houver quota insuficiente, o catch mantém o legado.
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return true;
  } catch {
    cleanupV2(written);
    return false;
  }
}

function ensureDocumentCache() {
  if (documentCache) return documentCache;
  const next = new Map<string, AscensionMapDocument>();
  const index = readV2Index();

  if (index) {
    storageMode = 'v2';
    for (const id of index.ids) {
      try {
        const raw = localStorage.getItem(`${DOCUMENT_PREFIX}${id}`);
        if (!raw) continue;
        const document = normalizeDocument(JSON.parse(raw) as AscensionMapDocument);
        next.set(document.id, document);
      } catch { /* ignora somente o documento corrompido */ }
    }
    documentCache = next;
    return next;
  }

  const legacy = readLegacyDocuments();
  for (const document of legacy) next.set(document.id, document);
  storageMode = tryMigrateLegacy(legacy) ? 'v2' : 'legacy';
  documentCache = next;
  return next;
}

function persistLegacy(cache: Map<string, AscensionMapDocument>) {
  const file: MapFile = { version: 1, documents: [...cache.values()].map(normalizeDocument) };
  localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(file));
}

function persistIndex(cache: Map<string, AscensionMapDocument>) {
  const index: MapIndex = { version: 2, ids: [...cache.keys()] };
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

function fallbackToLegacy(cache: Map<string, AscensionMapDocument>) {
  // Se um save isolado falhar por quota, reconstruímos o arquivo legado a
  // partir do cache vivo e removemos o índice V2. No próximo reload o editor
  // volta ao modo antigo com todos os mapas intactos.
  persistLegacy(cache);
  cleanupV2(cache.keys());
  storageMode = 'legacy';
}

function persistDocument(document: AscensionMapDocument) {
  const cache = ensureDocumentCache();
  if (storageMode === 'legacy') {
    persistLegacy(cache);
    return;
  }
  try {
    localStorage.setItem(`${DOCUMENT_PREFIX}${document.id}`, JSON.stringify(document));
    persistIndex(cache);
  } catch {
    fallbackToLegacy(cache);
  }
}

export function createBlankMap(
  name = 'Novo Mapa',
  width = 69,
  height = 50,
  tileSize = 32,
  baseSurface: Partial<MapBaseSurface> = DEFAULT_COLOR_SURFACE,
  fillGround = false,
): AscensionMapDocument {
  const now = Date.now();
  const surface = normalizeBaseSurface(baseSurface, baseSurface.color || '#527b45');
  const document: AscensionMapDocument = {
    version: 1,
    id: makeId('map'),
    name,
    width: Math.max(8, Math.min(512, Math.floor(width))),
    height: Math.max(8, Math.min(512, Math.floor(height))),
    tileSize: Math.max(8, Math.min(128, Math.floor(tileSize))),
    createdAt: now,
    updatedAt: now,
    tiles: {},
    objects: [],
    collision: [],
    zones: [],
    metadata: { background: surface.color, baseSurface: surface, recommendedLevel: '1–15', notes: '' },
  };
  if (fillGround) {
    for (let y = 0; y < document.height; y++) {
      for (let x = 0; x < document.width; x++) document.tiles[tileKey(x, y)] = { ground: 'grass' };
    }
  }
  return document;
}

function object(assetId: string, kind: MapObject['kind'], x: number, y: number, width = 1, height = 1): MapObject {
  return { id: makeId('object'), kind, assetId, x, y, width, height, scale: 1, rotation: 0, properties: {} };
}

function zone(kind: MapZone['kind'], x: number, y: number, width: number, height: number, name: string): MapZone {
  return { id: makeId('zone'), kind, x, y, width, height, name, properties: {} };
}

export function createStarterMap(): AscensionMapDocument {
  const map = createBlankMap('Floresta Inicial', 69, 50, 32, DEFAULT_COLOR_SURFACE, true);
  map.id = 'floresta-inicial-editor';

  for (let y = 0; y < map.height; y++) {
    for (let x = 24; x <= 36; x++) map.tiles[tileKey(x, y)] = { ground: 'road' };
  }

  for (let y = 31; y <= 48; y++) {
    for (let x = 18; x <= 41; x++) map.tiles[tileKey(x, y)] = { ground: 'forest_grass' };
  }
  for (let y = 33; y <= 47; y++) {
    for (let x = 29; x <= 31; x++) map.tiles[tileKey(x, y)] = { ground: 'dirt' };
  }
  for (let y = 41; y <= 43; y++) {
    for (let x = 20; x <= 39; x++) map.tiles[tileKey(x, y)] = { ground: 'dirt' };
  }

  map.objects.push(
    object('house', 'doodad', 22, 36, 3, 2),
    object('house', 'doodad', 38, 36, 3, 2),
    object('well', 'doodad', 34, 46),
    object('campfire', 'doodad', 26, 46),
    object('anvil_station', 'doodad', 20, 41, 2, 1),
    object('alchemy_station', 'doodad', 40, 41, 2, 1),
    object('rowan', 'npc', 22, 40),
    object('mira', 'npc', 38, 40),
    object('silas', 'npc', 23, 45),
    object('theo', 'npc', 38, 45),
    object('elandra', 'npc', 30, 16),
    object('pc_knight_npc', 'npc', 31, 44),
    object('wolf', 'monster', 12, 14),
    object('wolf', 'monster', 50, 14),
    object('sludge', 'monster', 12, 27),
    object('sludge', 'monster', 52, 29),
    object('pc_orc', 'monster', 57, 18),
    object('herb', 'resource', 8, 35),
    object('iron_vein', 'resource', 58, 37),
    object('wood_node', 'resource', 10, 43),
  );

  const trees: Array<[number, number]> = [[7,7],[13,12],[19,7],[9,22],[18,27],[7,37],[16,43],[44,7],[51,12],[59,8],[46,24],[57,26],[45,38],[55,43],[33,9],[22,18],[41,17]];
  for (const [x, y] of trees) map.objects.push(object('tree_oak', 'doodad', x, y));

  map.zones.push(zone('safe', 18, 31, 24, 18, 'Vila da Clareira'));
  map.zones.push(zone('respawn', 29, 42, 3, 3, 'Santuário de Renascimento'));
  map.metadata.notes = 'Mapa de demonstração do Editor. Inclui assets Pixel Crawler usados apenas no fluxo Draft/Playtest.';
  map.updatedAt = Date.now();
  return map;
}

export function listMapDocuments() {
  return [...ensureDocumentCache().values()].map(clone);
}

export function loadMapDocument(id: string) {
  const document = ensureDocumentCache().get(id);
  return document ? clone(document) : null;
}

export function saveMapDocument(document: AscensionMapDocument) {
  const cache = ensureDocumentCache();
  const copy = normalizeDocument(document);
  copy.updatedAt = Date.now();
  cache.set(copy.id, copy);
  persistDocument(copy);
  localStorage.setItem(ACTIVE_KEY, copy.id);
  return clone(copy);
}

export function deleteMapDocument(id: string) {
  const cache = ensureDocumentCache();
  cache.delete(id);
  if (storageMode === 'v2') {
    try {
      localStorage.removeItem(`${DOCUMENT_PREFIX}${id}`);
      persistIndex(cache);
    } catch {
      fallbackToLegacy(cache);
    }
  } else persistLegacy(cache);
  if (localStorage.getItem(ACTIVE_KEY) === id) localStorage.removeItem(ACTIVE_KEY);
}

export function loadOrCreateActiveMap() {
  const activeId = localStorage.getItem(ACTIVE_KEY);
  if (activeId) {
    const active = loadMapDocument(activeId);
    if (active) return active;
  }
  const existing = listMapDocuments()[0];
  if (existing) return existing;
  return saveMapDocument(createStarterMap());
}

export function importMapDocument(raw: string): AscensionMapDocument {
  const value = JSON.parse(raw) as Partial<AscensionMapDocument>;
  if (value.version !== 1 || !value.id || !value.name || !Number.isFinite(value.width) || !Number.isFinite(value.height)) throw new Error('Arquivo de mapa inválido ou incompatível.');
  const background = value.metadata?.background || '#527b45';
  const document: AscensionMapDocument = {
    version: 1,
    id: String(value.id),
    name: String(value.name),
    width: Math.max(8, Math.floor(Number(value.width))),
    height: Math.max(8, Math.floor(Number(value.height))),
    tileSize: Math.max(8, Math.floor(Number(value.tileSize) || 32)),
    createdAt: Number(value.createdAt) || Date.now(),
    updatedAt: Date.now(),
    tiles: value.tiles && typeof value.tiles === 'object' ? value.tiles : {},
    objects: Array.isArray(value.objects) ? value.objects : [],
    collision: Array.isArray(value.collision) ? value.collision : [],
    zones: Array.isArray(value.zones) ? value.zones : [],
    metadata: {
      background,
      baseSurface: normalizeBaseSurface(value.metadata?.baseSurface, background),
      musicId: value.metadata?.musicId,
      ambientId: value.metadata?.ambientId,
      recommendedLevel: value.metadata?.recommendedLevel,
      notes: value.metadata?.notes,
      dayNight: value.metadata?.dayNight,
    },
  };
  return saveMapDocument(document);
}
