export type AutotileMode = 'path16' | 'blob47';
export type AutotileLayer = 'ground' | 'detail';

export type AutotileRule = {
  version: 1;
  id: string;
  name: string;
  tilesetId: string;
  layer: AutotileLayer;
  mode: AutotileMode;
  /** Chave = máscara canônica decimal. Valor = tile ID tradicional. */
  variants: Record<string, string>;
  createdAt: number;
  updatedAt: number;
};

const STORAGE_KEY = 'ascension.map-editor.autotiles.v1';
const CHANGE_EVENT = 'ascension-map-autotiles-change';

const clone = <T>(value: T): T => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
const uid = () => `autotile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function normalize(input: Partial<AutotileRule>): AutotileRule {
  const mode: AutotileMode = input.mode === 'blob47' ? 'blob47' : 'path16';
  const variants: Record<string, string> = {};
  if (input.variants && typeof input.variants === 'object') {
    for (const [key, value] of Object.entries(input.variants)) {
      const mask = Number(key);
      if (!Number.isInteger(mask) || typeof value !== 'string' || !value) continue;
      const canonical = mode === 'blob47' ? canonicalBlobMask(mask) : (mask & 15);
      variants[String(canonical)] = value;
    }
  }
  return {
    version: 1,
    id: String(input.id || uid()),
    name: String(input.name || 'Terrain Rule').trim() || 'Terrain Rule',
    tilesetId: String(input.tilesetId || ''),
    layer: input.layer === 'detail' ? 'detail' : 'ground',
    mode,
    variants,
    createdAt: Number(input.createdAt) || Date.now(),
    updatedAt: Number(input.updatedAt) || Date.now(),
  };
}

function read(): AutotileRule[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
    return Array.isArray(parsed) ? parsed.map((value) => normalize(value as Partial<AutotileRule>)) : [];
  } catch {
    return [];
  }
}

function write(records: AutotileRule[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records.map(normalize)));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

/**
 * Bits cardinais: N=1 E=2 S=4 W=8.
 * Diagonais: NE=16 SE=32 SW=64 NW=128.
 * Uma diagonal só existe quando seus dois lados cardinais também existem.
 * Essa normalização produz exatamente as 47 topologias blob usuais.
 */
export function canonicalBlobMask(mask: number) {
  let result = mask & 255;
  const n = Boolean(result & 1), e = Boolean(result & 2), s = Boolean(result & 4), w = Boolean(result & 8);
  if (!(n && e)) result &= ~16;
  if (!(e && s)) result &= ~32;
  if (!(s && w)) result &= ~64;
  if (!(w && n)) result &= ~128;
  return result;
}

export const PATH16_MASKS = Array.from({ length: 16 }, (_, index) => index);
export const BLOB47_MASKS = [...new Set(Array.from({ length: 256 }, (_, index) => canonicalBlobMask(index)))].sort((a, b) => a - b);

export function requiredAutotileMasks(mode: AutotileMode) {
  return mode === 'blob47' ? BLOB47_MASKS : PATH16_MASKS;
}

const directionLabels: Array<[number, string]> = [[1, 'N'], [2, 'L'], [4, 'S'], [8, 'O']];
const diagonalLabels: Array<[number, string]> = [[16, 'NE'], [32, 'SE'], [64, 'SO'], [128, 'NO']];

export function autotileMaskLabel(mode: AutotileMode, mask: number) {
  const canonical = mode === 'blob47' ? canonicalBlobMask(mask) : (mask & 15);
  if (canonical === 0) return '0 · Isolado';
  const labels = [...directionLabels, ...(mode === 'blob47' ? diagonalLabels : [])].filter(([bit]) => Boolean(canonical & bit)).map(([, label]) => label);
  return `${canonical} · ${labels.join(' + ')}`;
}

export function listAutotileRules() {
  return read().map(clone).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function getAutotileRule(id: string | null | undefined) {
  const found = read().find((value) => value.id === id);
  return found ? clone(found) : null;
}

export function saveAutotileRule(input: Partial<AutotileRule> & Pick<AutotileRule, 'name' | 'tilesetId' | 'layer' | 'mode' | 'variants'>) {
  const records = read();
  const existing = input.id ? records.find((value) => value.id === input.id) : null;
  const record = normalize({ ...input, id: input.id || uid(), createdAt: existing?.createdAt ?? Date.now(), updatedAt: Date.now() });
  const index = records.findIndex((value) => value.id === record.id);
  if (index >= 0) records[index] = record; else records.push(record);
  write(records);
  return clone(record);
}

export function duplicateAutotileRule(id: string) {
  const source = getAutotileRule(id);
  if (!source) return null;
  return saveAutotileRule({ ...source, id: undefined, name: `${source.name} (cópia)`, variants: { ...source.variants } });
}

export function deleteAutotileRule(id: string) {
  const records = read();
  const next = records.filter((value) => value.id !== id);
  if (next.length === records.length) return false;
  write(next);
  return true;
}

export function autotileRuleUsesTileset(tilesetId: string) {
  return listAutotileRules().filter((rule) => rule.tilesetId === tilesetId);
}

export function onAutotileRulesChange(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}
