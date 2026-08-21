export type MapToolId = 'select' | 'brush' | 'eraser' | 'fill' | 'collision' | 'pan';
export type MapPaletteId = 'terrain' | 'doodad' | 'npc' | 'monster' | 'resource' | 'zone' | 'portal' | 'raw';
export type MapLayerId = 'ground' | 'detail' | 'objects' | 'collision' | 'zones';

export type MapTile = {
  ground?: string;
  detail?: string;
};

export type MapObject = {
  id: string;
  kind: 'doodad' | 'npc' | 'monster' | 'resource' | 'portal' | 'raw';
  assetId: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  properties?: Record<string, string | number | boolean>;
};

export type MapZone = {
  id: string;
  kind: 'safe' | 'respawn' | 'pvp' | 'no_logout' | 'quest' | 'custom';
  x: number;
  y: number;
  width: number;
  height: number;
  name?: string;
  properties?: Record<string, string | number | boolean>;
};

export type AscensionMapDocument = {
  version: 1;
  id: string;
  name: string;
  width: number;
  height: number;
  tileSize: number;
  createdAt: number;
  updatedAt: number;
  tiles: Record<string, MapTile>;
  objects: MapObject[];
  collision: string[];
  zones: MapZone[];
  metadata: {
    background: string;
    musicId?: string;
    ambientId?: string;
    recommendedLevel?: string;
    notes?: string;
  };
};

export type MapPaletteEntry = {
  id: string;
  palette: MapPaletteId;
  label: string;
  icon: string;
  color: string;
  description: string;
  defaultLayer: MapLayerId;
  objectKind?: MapObject['kind'];
  zoneKind?: MapZone['kind'];
  tags?: string[];
};

export type EditorSnapshot = {
  document: AscensionMapDocument;
  label: string;
};

export const tileKey = (x: number, y: number) => `${x},${y}`;

export function parseTileKey(key: string) {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}
