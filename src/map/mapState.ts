import type { CharacterProgress } from '../character/characterCreator';

export const MAP_FILTER_KEYS = [
  'npc', 'quests', 'shops', 'bank', 'crafting', 'herbs', 'mining', 'wood',
  'monsters', 'landmarks', 'safeZones', 'respawn', 'portals',
] as const;

export type MapFilterKey = typeof MAP_FILTER_KEYS[number];

export type MapSaveData = {
  version: 1;
  filters: Record<MapFilterKey, boolean>;
  minimapRange: number;
  fullZoom: number;
};

type MapProgress = CharacterProgress & { mapData?: MapSaveData };

const DEFAULT_FILTERS: Record<MapFilterKey, boolean> = {
  npc: true,
  quests: true,
  shops: true,
  bank: true,
  crafting: true,
  herbs: true,
  mining: true,
  wood: true,
  monsters: true,
  landmarks: true,
  safeZones: true,
  respawn: true,
  portals: true,
};

export function createDefaultMapData(): MapSaveData {
  return { version: 1, filters: { ...DEFAULT_FILTERS }, minimapRange: 520, fullZoom: 1 };
}

export function ensureMapState(progress: CharacterProgress): MapSaveData {
  const target = progress as MapProgress;
  const source = target.mapData;
  if (!source || typeof source !== 'object') {
    target.mapData = createDefaultMapData();
    return target.mapData;
  }

  source.version = 1;
  if (!source.filters || typeof source.filters !== 'object') source.filters = { ...DEFAULT_FILTERS };
  for (const key of MAP_FILTER_KEYS) {
    if (typeof source.filters[key] !== 'boolean') source.filters[key] = DEFAULT_FILTERS[key];
  }
  source.minimapRange = Math.max(320, Math.min(900, Number(source.minimapRange) || 520));
  source.fullZoom = Math.max(.75, Math.min(3, Number(source.fullZoom) || 1));
  target.mapData = source;
  return source;
}

export function setMapFilter(progress: CharacterProgress, key: MapFilterKey, enabled: boolean) {
  ensureMapState(progress).filters[key] = enabled;
}

export function setMapZoom(progress: CharacterProgress, zoom: number) {
  ensureMapState(progress).fullZoom = Math.max(.75, Math.min(3, zoom));
}

export function setMinimapRange(progress: CharacterProgress, range: number) {
  ensureMapState(progress).minimapRange = Math.max(320, Math.min(900, range));
}
