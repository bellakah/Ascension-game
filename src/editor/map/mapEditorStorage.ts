import type { AscensionMapDocument, MapBaseSurface, MapObject, MapZone } from './mapEditorTypes';
import { tileKey } from './mapEditorTypes';
import { DEFAULT_COLOR_SURFACE, normalizeBaseSurface } from './mapBaseSurface';

const STORAGE_KEY = 'ascension.map-editor.documents.v1';
const ACTIVE_KEY = 'ascension.map-editor.active.v1';

type MapFile = { version: 1; documents: AscensionMapDocument[] };

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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

function loadFile(): MapFile {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as Partial<MapFile>;
    const documents = Array.isArray(parsed.documents) ? parsed.documents.map((value) => normalizeDocument(value as AscensionMapDocument)) : [];
    return { version: 1, documents };
  } catch {
    return { version: 1, documents: [] };
  }
}

function saveFile(file: MapFile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, documents: file.documents.map(normalizeDocument) }));
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
  return loadFile().documents.map(clone);
}

export function loadMapDocument(id: string) {
  const document = loadFile().documents.find((entry) => entry.id === id);
  return document ? clone(document) : null;
}

export function saveMapDocument(document: AscensionMapDocument) {
  const file = loadFile();
  const copy = normalizeDocument(document);
  copy.updatedAt = Date.now();
  const index = file.documents.findIndex((entry) => entry.id === copy.id);
  if (index >= 0) file.documents[index] = copy;
  else file.documents.push(copy);
  saveFile(file);
  localStorage.setItem(ACTIVE_KEY, copy.id);
  return clone(copy);
}

export function deleteMapDocument(id: string) {
  const file = loadFile();
  file.documents = file.documents.filter((entry) => entry.id !== id);
  saveFile(file);
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
