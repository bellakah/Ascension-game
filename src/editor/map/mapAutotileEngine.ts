import type { AscensionMapDocument } from './mapEditorTypes';
import { tileKey } from './mapEditorTypes';
import { canonicalBlobMask, requiredAutotileMasks, type AutotileRule } from './mapAutotileStore';

export type AutotilePoint = { x: number; y: number };
export type AutotileApplyResult = { changed: number; usedAssetIds: string[]; missingMasks: number[] };

const CARDINALS: Array<{ dx: number; dy: number; bit: number }> = [
  { dx: 0, dy: -1, bit: 1 },
  { dx: 1, dy: 0, bit: 2 },
  { dx: 0, dy: 1, bit: 4 },
  { dx: -1, dy: 0, bit: 8 },
];
const DIAGONALS: Array<{ dx: number; dy: number; bit: number }> = [
  { dx: 1, dy: -1, bit: 16 },
  { dx: 1, dy: 1, bit: 32 },
  { dx: -1, dy: 1, bit: 64 },
  { dx: -1, dy: -1, bit: 128 },
];

const inside = (map: AscensionMapDocument, x: number, y: number) => x >= 0 && y >= 0 && x < map.width && y < map.height;

function layerValue(map: AscensionMapDocument, rule: AutotileRule, x: number, y: number) {
  if (!inside(map, x, y)) return '';
  const tile = map.tiles[tileKey(x, y)];
  return rule.layer === 'detail' ? (tile?.detail ?? '') : (tile?.ground ?? '');
}

function setLayerValue(map: AscensionMapDocument, rule: AutotileRule, x: number, y: number, assetId: string | null) {
  if (!inside(map, x, y)) return false;
  const key = tileKey(x, y);
  const tile = map.tiles[key] ?? {};
  const previous = rule.layer === 'detail' ? (tile.detail ?? '') : (tile.ground ?? '');
  const next = assetId ?? '';
  if (previous === next) return false;
  if (rule.layer === 'detail') {
    if (assetId) tile.detail = assetId; else delete tile.detail;
  } else {
    if (assetId) tile.ground = assetId; else delete tile.ground;
  }
  if (!tile.ground && !tile.detail) delete map.tiles[key]; else map.tiles[key] = tile;
  return true;
}

export function autotileVariantIds(rule: AutotileRule) {
  return new Set([...Object.values(rule.variants).filter(Boolean), ...(rule.legacyAssetIds ?? []).filter(Boolean)]);
}

export function isAutotileMember(map: AscensionMapDocument, rule: AutotileRule, variants: Set<string>, x: number, y: number) {
  return variants.has(layerValue(map, rule, x, y));
}

export function calculateAutotileMask(map: AscensionMapDocument, rule: AutotileRule, variants: Set<string>, x: number, y: number) {
  let mask = 0;
  for (const neighbor of CARDINALS) if (isAutotileMember(map, rule, variants, x + neighbor.dx, y + neighbor.dy)) mask |= neighbor.bit;
  if (rule.mode === 'blob47') {
    for (const neighbor of DIAGONALS) if (isAutotileMember(map, rule, variants, x + neighbor.dx, y + neighbor.dy)) mask |= neighbor.bit;
    return canonicalBlobMask(mask);
  }
  return mask & 15;
}

export function configuredAutotileMasks(rule: AutotileRule) {
  return requiredAutotileMasks(rule.mode).filter((mask) => Boolean(rule.variants[String(mask)]));
}

export function missingAutotileMasks(rule: AutotileRule) {
  return requiredAutotileMasks(rule.mode).filter((mask) => !rule.variants[String(mask)]);
}

export function autotileVariantForMask(rule: AutotileRule, mask: number) {
  const canonical = rule.mode === 'blob47' ? canonicalBlobMask(mask) : (mask & 15);
  const exact = rule.variants[String(canonical)];
  if (exact) return exact;
  if (rule.mode === 'blob47') {
    const cardinalOnly = canonical & 15;
    if (rule.variants[String(cardinalOnly)]) return rule.variants[String(cardinalOnly)];
  }
  if (rule.variants['0']) return rule.variants['0'];
  return Object.values(rule.variants).find(Boolean) ?? '';
}

function expandedCells(map: AscensionMapDocument, points: Iterable<AutotilePoint>) {
  const result = new Map<string, AutotilePoint>();
  for (const point of points) {
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const x = point.x + ox, y = point.y + oy;
      if (inside(map, x, y)) result.set(tileKey(x, y), { x, y });
    }
  }
  return [...result.values()];
}

/**
 * Pinta/apaga células pertencentes a uma Terrain Rule e recalcula somente a
 * vizinhança 3×3 afetada. Assim curvas, cantos, T e cruzamentos se atualizam
 * em uma única passagem sem varrer o mapa inteiro.
 */
export function applyAutotilePoints(map: AscensionMapDocument, rule: AutotileRule, points: AutotilePoint[], erase = false): AutotileApplyResult {
  const seed = autotileVariantForMask(rule, 0);
  if (!seed && !erase) return { changed: 0, usedAssetIds: [], missingMasks: missingAutotileMasks(rule) };
  const variants = autotileVariantIds(rule);
  if (seed) variants.add(seed);
  const unique = new Map<string, AutotilePoint>();
  for (const point of points) if (inside(map, point.x, point.y)) unique.set(tileKey(point.x, point.y), point);
  let changed = 0;

  for (const point of unique.values()) {
    if (erase) {
      if (isAutotileMember(map, rule, variants, point.x, point.y)) changed += setLayerValue(map, rule, point.x, point.y, null) ? 1 : 0;
    } else {
      changed += setLayerValue(map, rule, point.x, point.y, seed) ? 1 : 0;
    }
  }

  const affected = expandedCells(map, unique.values());
  const used = new Set<string>();
  for (const point of affected) {
    if (!isAutotileMember(map, rule, variants, point.x, point.y)) continue;
    const mask = calculateAutotileMask(map, rule, variants, point.x, point.y);
    const assetId = autotileVariantForMask(rule, mask);
    if (!assetId) continue;
    used.add(assetId);
    changed += setLayerValue(map, rule, point.x, point.y, assetId) ? 1 : 0;
  }
  return { changed, usedAssetIds: [...used], missingMasks: missingAutotileMasks(rule) };
}

/** Recalcula todas as células atuais ou legadas pertencentes à regra. */
export function reflowAutotileMap(map: AscensionMapDocument, rule: AutotileRule): AutotileApplyResult {
  const variants = autotileVariantIds(rule);
  const points: AutotilePoint[] = [];
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (isAutotileMember(map, rule, variants, x, y)) points.push({ x, y });
  let changed = 0;
  const used = new Set<string>();
  for (const point of points) {
    const mask = calculateAutotileMask(map, rule, variants, point.x, point.y);
    const assetId = autotileVariantForMask(rule, mask);
    if (!assetId) continue;
    used.add(assetId);
    changed += setLayerValue(map, rule, point.x, point.y, assetId) ? 1 : 0;
  }
  return { changed, usedAssetIds: [...used], missingMasks: missingAutotileMasks(rule) };
}
