import type { MapObject, MapPaletteEntry } from './mapEditorTypes';

export type AssetHitboxRect = {
  type: 'rectangle';
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AssetHitboxCircle = {
  type: 'circle';
  x: number;
  y: number;
  /** Legacy single radius kept for presets saved before oval support. */
  radius?: number;
  radiusX?: number;
  radiusY?: number;
};

export type AssetHitboxPolygon = {
  type: 'polygon';
  points: Array<{ x: number; y: number }>;
};

export type AssetHitbox = AssetHitboxRect | AssetHitboxCircle | AssetHitboxPolygon;

export type AssetLightPreset = {
  enabled: boolean;
  x: number;
  y: number;
  radius: number;
  intensity: number;
};

export type AssetStretchPreset = {
  enabled: boolean;
  axis: 'horizontal' | 'vertical';
  cap: number;
};

export type AssetDepthMode = 'ground' | 'auto' | 'foreground';

export type MapAssetPreset = {
  depthMode: AssetDepthMode;
  scaleMode: 'set' | 'custom';
  scale: number;
  shadow: boolean;
  hitbox: AssetHitbox | null;
  light: AssetLightPreset;
  stretch: AssetStretchPreset;
};

const PRESET_KEY = 'ascension.map-editor.asset-presets.v1';
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const defaults: MapAssetPreset = {
  depthMode: 'auto',
  scaleMode: 'set',
  scale: 1,
  shadow: false,
  hitbox: null,
  light: { enabled: false, x: .5, y: .55, radius: 1.6, intensity: .7 },
  stretch: { enabled: false, axis: 'horizontal', cap: .2 },
};

function loadAll() {
  try {
    const value = JSON.parse(localStorage.getItem(PRESET_KEY) ?? '{}') as Record<string, MapAssetPreset>;
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {} as Record<string, MapAssetPreset>;
  }
}

export function circleHitboxRadii(hitbox: AssetHitboxCircle) {
  const legacy = Math.max(.02, Number(hitbox.radius ?? .2));
  return {
    radiusX: Math.max(.02, Number(hitbox.radiusX ?? legacy)),
    radiusY: Math.max(.02, Number(hitbox.radiusY ?? legacy)),
  };
}

export function defaultAssetPreset(entry?: MapPaletteEntry): MapAssetPreset {
  const preset = clone(defaults);
  if (entry?.footprint?.collision?.length) {
    const width = Math.max(1, entry.footprint.width || 1);
    const height = Math.max(1, entry.footprint.height || 1);
    const xs = entry.footprint.collision.map((cell) => cell.x);
    const ys = entry.footprint.collision.map((cell) => cell.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs) + 1;
    const minY = Math.min(...ys), maxY = Math.max(...ys) + 1;
    preset.hitbox = {
      type: 'rectangle',
      x: clamp(minX / width, 0, 1),
      y: clamp(minY / height, 0, 1),
      width: clamp((maxX - minX) / width, .02, 1),
      height: clamp((maxY - minY) / height, .02, 1),
    };
  }
  return preset;
}

export function getAssetPreset(entryOrId: MapPaletteEntry | string): MapAssetPreset {
  const id = typeof entryOrId === 'string' ? entryOrId : entryOrId.id;
  const entry = typeof entryOrId === 'string' ? undefined : entryOrId;
  const stored = loadAll()[id];
  if (!stored) return defaultAssetPreset(entry);
  const base = defaultAssetPreset(entry);
  return {
    ...base,
    ...stored,
    light: { ...base.light, ...(stored.light ?? {}) },
    stretch: { ...base.stretch, ...(stored.stretch ?? {}) },
    hitbox: stored.hitbox ?? base.hitbox,
  };
}

export function saveAssetPreset(assetId: string, preset: MapAssetPreset) {
  const all = loadAll();
  all[assetId] = clone(preset);
  localStorage.setItem(PRESET_KEY, JSON.stringify(all));
  window.dispatchEvent(new CustomEvent('ascension-asset-preset-change', { detail: { assetId, preset: clone(preset) } }));
}

export function deleteAssetPreset(assetId: string) {
  const all = loadAll();
  delete all[assetId];
  localStorage.setItem(PRESET_KEY, JSON.stringify(all));
}

export function visualSizeInTiles(entry: MapPaletteEntry, object: MapObject) {
  const preset = getAssetPreset(entry);
  const baseWidth = Math.max(.1, entry.sprite?.widthTiles ?? object.width ?? entry.footprint?.width ?? 1);
  const baseHeight = Math.max(.1, entry.sprite?.heightTiles ?? object.height ?? entry.footprint?.height ?? 1);
  const scale = Math.max(.1, object.scale ?? (preset.scaleMode === 'custom' ? preset.scale : 1));
  const width = preset.stretch.enabled && preset.stretch.axis === 'horizontal' ? Math.max(.1, object.width ?? baseWidth) : baseWidth * scale;
  const height = preset.stretch.enabled && preset.stretch.axis === 'vertical' ? Math.max(.1, object.height ?? baseHeight) : baseHeight * scale;
  return { width, height, scale };
}

export function objectVisualBounds(entry: MapPaletteEntry, object: MapObject) {
  const size = visualSizeInTiles(entry, object);
  const anchorX = entry.sprite?.anchorX ?? .5;
  const anchorY = entry.sprite?.anchorY ?? 1;
  const anchorWorldX = object.x + .5;
  const anchorWorldY = object.y + 1;
  return {
    x: anchorWorldX - size.width * anchorX,
    y: anchorWorldY - size.height * anchorY,
    width: size.width,
    height: size.height,
  };
}

function pointInPolygon(px: number, py: number, points: Array<{ x: number; y: number }>) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    const crosses = ((a.y > py) !== (b.y > py)) && (px < (b.x - a.x) * (py - a.y) / ((b.y - a.y) || 1e-9) + a.x);
    if (crosses) inside = !inside;
  }
  return inside;
}

export function objectPresetBlocksPoint(entry: MapPaletteEntry, object: MapObject, worldX: number, worldY: number) {
  const preset = getAssetPreset(entry);
  if (!preset.hitbox) return false;
  const bounds = objectVisualBounds(entry, object);
  if (bounds.width <= 0 || bounds.height <= 0) return false;
  const nx = (worldX - bounds.x) / bounds.width;
  const ny = (worldY - bounds.y) / bounds.height;
  const hitbox = preset.hitbox;
  if (hitbox.type === 'rectangle') return nx >= hitbox.x && ny >= hitbox.y && nx <= hitbox.x + hitbox.width && ny <= hitbox.y + hitbox.height;
  if (hitbox.type === 'circle') {
    const { radiusX, radiusY } = circleHitboxRadii(hitbox);
    const dx = (nx - hitbox.x) / radiusX;
    const dy = (ny - hitbox.y) / radiusY;
    return dx * dx + dy * dy <= 1;
  }
  return hitbox.points.length >= 3 && pointInPolygon(nx, ny, hitbox.points);
}

export function objectBlocksPoint(entry: MapPaletteEntry, object: MapObject, worldX: number, worldY: number) {
  const preset = getAssetPreset(entry);
  if (preset.hitbox) return objectPresetBlocksPoint(entry, object, worldX, worldY);
  const collision = entry.footprint?.collision ?? [];
  return collision.some((cell) => Math.floor(worldX) === Math.floor(object.x + cell.x) && Math.floor(worldY) === Math.floor(object.y + cell.y));
}
