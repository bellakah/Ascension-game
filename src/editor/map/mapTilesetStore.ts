import { addAssetSource, getAssetSourceUrl } from './mapAssetLibraryV2';
import { MAP_PALETTE_ENTRIES } from './mapEditorCatalog';
import { listMapDocuments } from './mapEditorStorage';
import type { MapPaletteEntry, MapSpriteRect } from './mapEditorTypes';

const STORAGE_KEY = 'ascension.map-tilesets.v1';
const CHANGE_EVENT = 'ascension-map-tilesets-change';
const ENTRY_PREFIX = 'tileset:';

export type TilesetDefinition = {
  version: 1;
  id: string;
  name: string;
  sourceId: string;
  imageWidth: number;
  imageHeight: number;
  tileWidth: number;
  tileHeight: number;
  margin: number;
  spacing: number;
  offsetX: number;
  offsetY: number;
  columns: number;
  rows: number;
  createdAt: number;
  updatedAt: number;
};

type TilesetFile = { version: 1; tilesets: TilesetDefinition[] };

const clone = <T>(value: T): T => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
const clampInt = (value: number, minimum = 0) => Math.max(minimum, Math.floor(Number(value) || 0));
const uid = () => `ts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function dimensions(input: Pick<TilesetDefinition, 'imageWidth' | 'imageHeight' | 'tileWidth' | 'tileHeight' | 'margin' | 'spacing' | 'offsetX' | 'offsetY'>) {
  const tileWidth = Math.max(1, clampInt(input.tileWidth, 1));
  const tileHeight = Math.max(1, clampInt(input.tileHeight, 1));
  const margin = clampInt(input.margin), spacing = clampInt(input.spacing), offsetX = clampInt(input.offsetX), offsetY = clampInt(input.offsetY);
  const usableWidth = Math.max(0, clampInt(input.imageWidth) - offsetX - margin * 2), usableHeight = Math.max(0, clampInt(input.imageHeight) - offsetY - margin * 2);
  return { columns: Math.max(0, Math.floor((usableWidth + spacing) / (tileWidth + spacing))), rows: Math.max(0, Math.floor((usableHeight + spacing) / (tileHeight + spacing))) };
}

function normalize(input: TilesetDefinition): TilesetDefinition {
  const base = { ...input, version: 1 as const, id: String(input.id || uid()), name: String(input.name || 'Tileset').trim() || 'Tileset', sourceId: String(input.sourceId || ''), imageWidth: Math.max(1, clampInt(input.imageWidth, 1)), imageHeight: Math.max(1, clampInt(input.imageHeight, 1)), tileWidth: Math.max(1, clampInt(input.tileWidth, 1)), tileHeight: Math.max(1, clampInt(input.tileHeight, 1)), margin: clampInt(input.margin), spacing: clampInt(input.spacing), offsetX: clampInt(input.offsetX), offsetY: clampInt(input.offsetY), createdAt: Number(input.createdAt) || Date.now(), updatedAt: Number(input.updatedAt) || Date.now() };
  return { ...base, ...dimensions(base) };
}

function readFile(): TilesetFile {
  try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as Partial<TilesetFile>; return { version: 1, tilesets: Array.isArray(value.tilesets) ? value.tilesets.map((record) => normalize(record as TilesetDefinition)) : [] }; }
  catch { return { version: 1, tilesets: [] }; }
}
function writeFile(file: TilesetFile) { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, tilesets: file.tilesets.map(normalize) })); window.dispatchEvent(new CustomEvent(CHANGE_EVENT)); }

export function listTilesets() { return readFile().tilesets.map(clone).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')); }
export function getTileset(id: string | null | undefined) { const value = readFile().tilesets.find((entry) => entry.id === id); return value ? clone(value) : null; }
export function saveTileset(input: TilesetDefinition) { const file = readFile(), record = normalize({ ...input, updatedAt: Date.now() }); const index = file.tilesets.findIndex((entry) => entry.id === record.id); if (index >= 0) file.tilesets[index] = record; else file.tilesets.push(record); writeFile(file); return clone(record); }
export function deleteTileset(id: string) { const file = readFile(), before = file.tilesets.length; file.tilesets = file.tilesets.filter((entry) => entry.id !== id); if (file.tilesets.length === before) return false; writeFile(file); return true; }

export async function createTilesetFromFile(file: File, imageWidth: number, imageHeight: number, grid: { name?: string; tileWidth: number; tileHeight: number; margin?: number; spacing?: number; offsetX?: number; offsetY?: number }) {
  const sourceId = await addAssetSource(file, file.name, imageWidth, imageHeight), now = Date.now();
  return saveTileset(normalize({ version: 1, id: uid(), name: grid.name || file.name.replace(/\.[^.]+$/, '') || 'Tileset', sourceId, imageWidth, imageHeight, tileWidth: grid.tileWidth, tileHeight: grid.tileHeight, margin: grid.margin ?? 0, spacing: grid.spacing ?? 0, offsetX: grid.offsetX ?? 0, offsetY: grid.offsetY ?? 0, columns: 0, rows: 0, createdAt: now, updatedAt: now }));
}

export function tilesetTileRect(tileset: TilesetDefinition, column: number, row: number): MapSpriteRect | null {
  if (column < 0 || row < 0 || column >= tileset.columns || row >= tileset.rows) return null;
  const x = tileset.offsetX + tileset.margin + column * (tileset.tileWidth + tileset.spacing), y = tileset.offsetY + tileset.margin + row * (tileset.tileHeight + tileset.spacing);
  if (x + tileset.tileWidth > tileset.imageWidth || y + tileset.tileHeight > tileset.imageHeight) return null;
  return { x, y, width: tileset.tileWidth, height: tileset.tileHeight };
}
export function tilesetTileId(tileset: TilesetDefinition, column: number, row: number) { const rect = tilesetTileRect(tileset, column, row); return rect ? `${ENTRY_PREFIX}${tileset.id}:${rect.x}:${rect.y}:${rect.width}:${rect.height}` : ''; }
export function parseTilesetTileId(id: string | null | undefined) {
  if (!id?.startsWith(ENTRY_PREFIX)) return null;
  const parts = id.split(':'); if (parts.length < 6) return null;
  const [x, y, width, height] = parts.slice(-4).map(Number), tilesetId = parts.slice(1, -4).join(':');
  if (![x, y, width, height].every(Number.isFinite) || !tilesetId) return null;
  return { tilesetId, rect: { x, y, width, height } satisfies MapSpriteRect };
}
export function isTraditionalTileEntry(entry: MapPaletteEntry | null | undefined) { return Boolean(entry?.tags?.includes('traditional-tile')); }

function usedTileIds(extraIds: Iterable<string> = []) {
  const ids = new Set<string>(extraIds);
  for (const map of listMapDocuments()) for (const tile of Object.values(map.tiles)) {
    if (tile.ground?.startsWith(ENTRY_PREFIX)) ids.add(tile.ground);
    if (tile.detail?.startsWith(ENTRY_PREFIX)) ids.add(tile.detail);
  }
  return ids;
}

async function entryForId(id: string, tilesetMap: Map<string, TilesetDefinition>, urlMap: Map<string, string | null>) {
  const parsed = parseTilesetTileId(id); if (!parsed) return null;
  const tileset = tilesetMap.get(parsed.tilesetId); if (!tileset) return null;
  let src = urlMap.get(tileset.id);
  if (src === undefined) { src = await getAssetSourceUrl(tileset.sourceId); urlMap.set(tileset.id, src); }
  if (!src) return null;
  const entry: MapPaletteEntry = {
    id, palette: 'terrain', label: `${tileset.name} · ${parsed.rect.x},${parsed.rect.y}`, icon: '▦', color: '#557586',
    description: `Tile tradicional ${parsed.rect.width}×${parsed.rect.height} · ${tileset.name}`, defaultLayer: 'ground', folder: 'terrain', source: 'custom',
    tags: ['traditional-tile', `tileset:${tileset.id}`, id, tileset.name],
    sprite: { src, nativeWidth: tileset.imageWidth, nativeHeight: tileset.imageHeight, sourceRect: parsed.rect, widthTiles: 1, heightTiles: 1, anchorX: 0, anchorY: 0, pixelated: true },
  };
  return entry;
}

/** Hidrata apenas tiles usados ou explicitamente pedidos; o spritesheet inteiro fica no browser dedicado. */
export async function hydrateTilesetsIntoPalette(extraIds: Iterable<string> = []) {
  for (let index = MAP_PALETTE_ENTRIES.length - 1; index >= 0; index--) if (MAP_PALETTE_ENTRIES[index].id.startsWith(ENTRY_PREFIX)) MAP_PALETTE_ENTRIES.splice(index, 1);
  const definitions = listTilesets(), tilesetMap = new Map(definitions.map((value) => [value.id, value])), urlMap = new Map<string, string | null>(), created: MapPaletteEntry[] = [];
  for (const id of usedTileIds(extraIds)) { const entry = await entryForId(id, tilesetMap, urlMap); if (entry) created.push(entry); }
  MAP_PALETTE_ENTRIES.push(...created); return created;
}

export async function ensureTilesetEntries(ids: Iterable<string>) {
  const needed = [...new Set(ids)].filter((id) => id.startsWith(ENTRY_PREFIX) && !MAP_PALETTE_ENTRIES.some((entry) => entry.id === id));
  if (!needed.length) return [];
  const definitions = listTilesets(), tilesetMap = new Map(definitions.map((value) => [value.id, value])), urlMap = new Map<string, string | null>(), created: MapPaletteEntry[] = [];
  for (const id of needed) { const entry = await entryForId(id, tilesetMap, urlMap); if (entry) created.push(entry); }
  MAP_PALETTE_ENTRIES.push(...created); return created;
}

export function onTilesetsChange(listener: () => void) { window.addEventListener(CHANGE_EVENT, listener); return () => window.removeEventListener(CHANGE_EVENT, listener); }
