export type TilePatternCell = { dx: number; dy: number; assetId: string };
export type TilePattern = {
  version: 1;
  id: string;
  name: string;
  width: number;
  height: number;
  layer: 'ground' | 'detail';
  cells: TilePatternCell[];
  createdAt: number;
  updatedAt: number;
};

const STORAGE_KEY = 'ascension.map-editor.tile-patterns.v1';
const CHANGE_EVENT = 'ascension-tile-patterns-change';
const clone = <T>(value: T): T => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;

function read(): TilePattern[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter(Boolean).map((raw) => {
      const input = raw as Partial<TilePattern>;
      return {
        version: 1 as const,
        id: String(input.id || `pattern-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
        name: String(input.name || 'Padrão'),
        width: Math.max(1, Math.floor(Number(input.width) || 1)),
        height: Math.max(1, Math.floor(Number(input.height) || 1)),
        layer: input.layer === 'detail' ? 'detail' as const : 'ground' as const,
        cells: Array.isArray(input.cells) ? input.cells.filter((cell) => cell && typeof cell.assetId === 'string').map((cell) => ({ dx: Math.floor(Number(cell.dx) || 0), dy: Math.floor(Number(cell.dy) || 0), assetId: String(cell.assetId) })) : [],
        createdAt: Number(input.createdAt) || Date.now(),
        updatedAt: Number(input.updatedAt) || Date.now(),
      };
    });
  } catch { return []; }
}

function write(patterns: TilePattern[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(patterns));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function listTilePatterns() { return read().map(clone).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')); }
export function getTilePattern(id: string | null | undefined) { const found = read().find((value) => value.id === id); return found ? clone(found) : null; }

export function saveTilePattern(input: Omit<TilePattern, 'version' | 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
  const patterns = read(), now = Date.now(), existing = input.id ? patterns.find((value) => value.id === input.id) : null;
  const record: TilePattern = {
    version: 1,
    id: input.id || `pattern-${now}-${Math.random().toString(36).slice(2, 7)}`,
    name: input.name.trim() || 'Padrão',
    width: Math.max(1, Math.floor(input.width)),
    height: Math.max(1, Math.floor(input.height)),
    layer: input.layer,
    cells: input.cells.map((cell) => ({ ...cell })),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const index = patterns.findIndex((value) => value.id === record.id);
  if (index >= 0) patterns[index] = record; else patterns.push(record);
  write(patterns); return clone(record);
}

export function deleteTilePattern(id: string) { const patterns = read(), next = patterns.filter((value) => value.id !== id); if (next.length === patterns.length) return false; write(next); return true; }
export function onTilePatternsChange(listener: () => void) { window.addEventListener(CHANGE_EVENT, listener); return () => window.removeEventListener(CHANGE_EVENT, listener); }
