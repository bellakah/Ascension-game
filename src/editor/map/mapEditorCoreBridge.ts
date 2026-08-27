export type MapEditorTilePoint = { x: number; y: number };
export type MapEditorStampCell = { dx: number; dy: number; assetId: string };
export type MapEditorTerrainLayer = 'ground' | 'detail';

export type MapEditorCoreBridge = {
  getMapInfo(): { id: string; width: number; height: number; tileSize: number };
  screenToTile(clientX: number, clientY: number): MapEditorTilePoint | null;
  selectTerrainAsset(assetId: string, layer: MapEditorTerrainLayer): boolean;
  setTerrainLayer(layer: MapEditorTerrainLayer): void;
  getTerrainAt(x: number, y: number, layer: MapEditorTerrainLayer): string | undefined;
  applyTerrainStamp(input: {
    label: string;
    points: MapEditorTilePoint[];
    cells: MapEditorStampCell[];
    layer: MapEditorTerrainLayer;
    erase?: boolean;
  }): boolean;
  floodTerrain(input: {
    label: string;
    point: MapEditorTilePoint;
    assetId: string;
    layer: MapEditorTerrainLayer;
  }): boolean;
};

let activeBridge: MapEditorCoreBridge | null = null;

export function registerMapEditorCoreBridge(bridge: MapEditorCoreBridge) {
  activeBridge = bridge;
  return () => {
    if (activeBridge === bridge) activeBridge = null;
  };
}

export function getMapEditorCoreBridge() {
  return activeBridge;
}
