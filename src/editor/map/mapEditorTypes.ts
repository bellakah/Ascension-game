export type MapToolId = 'select' | 'brush' | 'eraser' | 'fill' | 'collision' | 'pan' | 'line' | 'rect' | 'random';
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
  scale?: number;
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

export type DayNightMetadata = {
  enabled?: boolean;
  dayLengthMinutes?: number;
  nightDarkness?: number;
  startHour?: number;
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
    dayNight?: DayNightMetadata;
  };
};

export type MapSpriteRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MapAnimationFrame = MapSpriteRect & {
  /** Duração opcional deste frame. Quando omitida, usa o FPS da animação. */
  durationMs?: number;
};

export type MapAnimationDefinition = {
  frames: MapAnimationFrame[];
  fps: number;
  loop: boolean;
};

export type MapSpriteDefinition = {
  src: string;
  nativeWidth: number;
  nativeHeight: number;
  /** Recorte estático dentro do PNG/spritesheet. */
  sourceRect?: MapSpriteRect;
  /** Sequência visual usada pelo Editor, Playtest e futuramente pelo jogo. */
  animation?: MapAnimationDefinition;
  /** Tamanho visual em tiles. Se omitido, usa 1x1. */
  widthTiles?: number;
  heightTiles?: number;
  /** Ponto do sprite preso ao tile: 0 esquerda/topo, 0.5 centro, 1 direita/base. */
  anchorX?: number;
  anchorY?: number;
  pixelated?: boolean;
};

export type MapFootprintDefinition = {
  width: number;
  height: number;
  /** Tiles relativos ao ponto de colocação que contam como bloqueados. */
  collision?: Array<{ x: number; y: number }>;
};

export type MapAssetSource = 'ascension' | 'pixel-crawler' | 'custom';
export type MapAssetFolder =
  | 'terrain'
  | 'nature'
  | 'buildings'
  | 'walls'
  | 'roofs'
  | 'furniture'
  | 'props'
  | 'crafting'
  | 'npc'
  | 'monster'
  | 'resource'
  | 'portal'
  | 'effects'
  | 'zones'
  | 'raw';

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
  folder?: MapAssetFolder;
  sprite?: MapSpriteDefinition;
  footprint?: MapFootprintDefinition;
  source?: MapAssetSource;
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
