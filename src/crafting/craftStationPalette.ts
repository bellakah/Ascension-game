import { getPaletteEntry, MAP_PALETTE_ENTRIES } from '../editor/map/mapEditorCatalog';
import type { MapPaletteEntry } from '../editor/map/mapEditorTypes';
import { listPublishedCraftStationTypeRecords } from './craftStudioStore';

export const CRAFT_STATION_ASSET_PREFIX = 'craftstation:';
const clone = <T>(value: T): T => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;

export function craftStationAssetId(stationTypeId: string) { return `${CRAFT_STATION_ASSET_PREFIX}${stationTypeId}`; }
export function stationTypeFromAssetId(assetId: string) { return assetId.startsWith(CRAFT_STATION_ASSET_PREFIX) ? assetId.slice(CRAFT_STATION_ASSET_PREFIX.length) : null; }

function baseEntry(stationTypeId: string) {
  if (stationTypeId === 'alchemy') return getPaletteEntry('alchemy_station');
  return getPaletteEntry('anvil_station');
}

export function hydrateCraftStationTypesIntoPalette() {
  for (let index = MAP_PALETTE_ENTRIES.length - 1; index >= 0; index--) if (MAP_PALETTE_ENTRIES[index].id.startsWith(CRAFT_STATION_ASSET_PREFIX)) MAP_PALETTE_ENTRIES.splice(index, 1);
  for (const station of listPublishedCraftStationTypeRecords()) {
    const base = baseEntry(station.key);
    const entry: MapPaletteEntry = {
      id: craftStationAssetId(station.key),
      palette: 'doodad',
      folder: 'crafting',
      label: station.name,
      icon: station.icon,
      color: base.color || '#b58b5c',
      description: `Craft Station #${station.numericId} • ${station.prompt}`,
      defaultLayer: 'objects',
      objectKind: 'prop',
      tags: ['craft-station', station.key, ...station.categories, ...station.tags],
      source: 'custom',
      sprite: base.sprite ? clone(base.sprite) : undefined,
      footprint: base.footprint ? clone(base.footprint) : { width: 1, height: 1 },
    };
    MAP_PALETTE_ENTRIES.push(entry);
  }
}
