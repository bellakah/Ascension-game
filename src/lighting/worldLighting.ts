import { getAssetPreset, objectVisualBounds, type AssetLightActivation } from '../editor/map/mapAssetPresets';
import { getPaletteEntry } from '../editor/map/mapEditorCatalog';
import type { AscensionMapDocument, MapObject } from '../editor/map/mapEditorTypes';

export const LIGHT_POINT_ASSET_ID = 'light_point';

export type WorldLightingSettings = {
  enabled: boolean;
  dayLengthMinutes: number;
  nightDarkness: number;
  startHour: number;
};

export type WorldLight = {
  id: string;
  x: number;
  y: number;
  color: string;
  radius: number;
  intensity: number;
  softness: number;
  activation: AssetLightActivation;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp((value - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

export function getWorldLightingSettings(map: AscensionMapDocument): WorldLightingSettings {
  const stored = map.metadata.dayNight ?? {};
  return {
    enabled: stored.enabled ?? true,
    dayLengthMinutes: clamp(Number(stored.dayLengthMinutes ?? 30), 2, 1440),
    nightDarkness: clamp(Number(stored.nightDarkness ?? .62), 0, .9),
    startHour: ((Number(stored.startHour ?? 12) % 24) + 24) % 24,
  };
}

export function currentWorldHour(settings: WorldLightingSettings, now = Date.now()) {
  if (!settings.enabled) return 12;
  const cycleMs = Math.max(120_000, settings.dayLengthMinutes * 60_000);
  const phase = ((now % cycleMs) / cycleMs) * 24;
  return (settings.startHour + phase) % 24;
}

export function nightFactorForHour(hour: number) {
  const value = ((hour % 24) + 24) % 24;
  if (value >= 20 || value < 5) return 1;
  if (value >= 18 && value < 20) return smoothstep(18, 20, value);
  if (value >= 5 && value < 7) return 1 - smoothstep(5, 7, value);
  return 0;
}

export function darknessForHour(settings: WorldLightingSettings, hour: number) {
  return settings.enabled ? settings.nightDarkness * nightFactorForHour(hour) : 0;
}

export function activationFactor(activation: AssetLightActivation, hour: number) {
  return activation === 'always' ? 1 : nightFactorForHour(hour);
}

function numberProperty(object: MapObject, key: string, fallback: number) {
  const value = Number(object.properties?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

function stringProperty(object: MapObject, key: string, fallback: string) {
  const value = object.properties?.[key];
  return typeof value === 'string' && value ? value : fallback;
}

export function lightPointDefaults(object: MapObject) {
  return {
    color: stringProperty(object, 'lightColor', '#ffd88a'),
    radius: clamp(numberProperty(object, 'lightRadius', 4.5), .2, 24),
    intensity: clamp(numberProperty(object, 'lightIntensity', .85), .05, 2),
    softness: clamp(numberProperty(object, 'lightSoftness', .75), .05, 1),
    activation: stringProperty(object, 'lightActivation', 'night') === 'always' ? 'always' as const : 'night' as const,
  };
}

export function collectMapLights(map: AscensionMapDocument): WorldLight[] {
  const lights: WorldLight[] = [];
  const tileSize = map.tileSize;
  for (const object of map.objects) {
    if (object.assetId === LIGHT_POINT_ASSET_ID) {
      const value = lightPointDefaults(object);
      lights.push({
        id: object.id,
        x: (object.x + .5) * tileSize,
        y: (object.y + .5) * tileSize,
        color: value.color,
        radius: value.radius * tileSize,
        intensity: value.intensity,
        softness: value.softness,
        activation: value.activation,
      });
      continue;
    }

    const entry = getPaletteEntry(object.assetId);
    const preset = getAssetPreset(entry);
    if (!preset.light.enabled) continue;
    const bounds = objectVisualBounds(entry, object);
    lights.push({
      id: object.id,
      x: (bounds.x + preset.light.x * bounds.width) * tileSize,
      y: (bounds.y + preset.light.y * bounds.height) * tileSize,
      color: preset.light.color || '#ffd88a',
      radius: Math.max(.2, preset.light.radius) * tileSize,
      intensity: clamp(preset.light.intensity, .05, 2),
      softness: clamp(preset.light.softness, .05, 1),
      activation: preset.light.activation === 'always' ? 'always' : 'night',
    });
  }
  return lights;
}

function parseHexColor(value: string) {
  const normalized = value.trim().replace('#', '');
  const full = normalized.length === 3 ? normalized.split('').map((part) => part + part).join('') : normalized;
  const number = Number.parseInt(full, 16);
  if (!Number.isFinite(number) || full.length !== 6) return { r: 255, g: 216, b: 138 };
  return { r: (number >> 16) & 255, g: (number >> 8) & 255, b: number & 255 };
}

export function createGameLightingOverlay(map: AscensionMapDocument) {
  const canvas = document.createElement('canvas');
  canvas.className = 'ascension-world-lighting';
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '3',
  });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  let lights = collectMapLights(map);
  let lastWidth = 0, lastHeight = 0;
  let settings = getWorldLightingSettings(map);

  const refresh = () => {
    lights = collectMapLights(map);
    settings = getWorldLightingSettings(map);
  };

  const update = (worldX: number, worldY: number, hour = currentWorldHour(settings)) => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.floor(window.innerWidth * dpr));
    const height = Math.max(1, Math.floor(window.innerHeight * dpr));
    if (width !== lastWidth || height !== lastHeight) {
      lastWidth = width; lastHeight = height;
      canvas.width = width; canvas.height = height;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    const darkness = darknessForHour(settings, hour);
    if (darkness <= .001 && !lights.some((light) => light.activation === 'always')) return;

    ctx.fillStyle = `rgba(5,10,24,${darkness})`;
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    for (const light of lights) {
      const factor = activationFactor(light.activation, hour);
      if (factor <= .002) continue;
      const x = worldX + light.x;
      const y = worldY + light.y;
      const radius = light.radius;
      if (x + radius < 0 || y + radius < 0 || x - radius > window.innerWidth || y - radius > window.innerHeight) continue;
      const strength = clamp(light.intensity * factor, 0, 2);
      const innerStop = clamp(1 - light.softness, .02, .9);

      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      const cut = ctx.createRadialGradient(x, y, 0, x, y, radius);
      cut.addColorStop(0, `rgba(0,0,0,${clamp(.92 * strength, 0, 1)})`);
      cut.addColorStop(innerStop, `rgba(0,0,0,${clamp(.72 * strength, 0, 1)})`);
      cut.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = cut;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      ctx.restore();

      const color = parseHexColor(light.color);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, `rgba(${color.r},${color.g},${color.b},${clamp(.30 * strength, 0, .6)})`);
      glow.addColorStop(innerStop, `rgba(${color.r},${color.g},${color.b},${clamp(.12 * strength, 0, .3)})`);
      glow.addColorStop(1, `rgba(${color.r},${color.g},${color.b},0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      ctx.restore();
    }
  };

  return { canvas, update, refresh, settings: () => settings, destroy: () => canvas.remove() };
}
