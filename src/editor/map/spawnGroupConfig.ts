import type { MapObject } from './mapEditorTypes';

export type SpawnGroupConfig = {
  count: number;
  radiusTiles: number;
  minDistanceTiles: number;
  respawnMs: number;
  respawnJitterMs: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const DEFAULT_SPAWN_GROUP: SpawnGroupConfig = {
  count: 1,
  radiusTiles: 0,
  minDistanceTiles: 0,
  respawnMs: 0,
  respawnJitterMs: 0,
};

export function readSpawnGroupConfig(object: Pick<MapObject, 'properties'>, fallbackRespawnMs = 0): SpawnGroupConfig {
  const properties = object.properties ?? {};
  return {
    count: Math.max(1, Math.floor(Number(properties.spawnCount ?? 1) || 1)),
    radiusTiles: clamp(Number(properties.spawnRadiusTiles ?? 0) || 0, 0, 100),
    minDistanceTiles: clamp(Number(properties.spawnMinDistanceTiles ?? 0) || 0, 0, 50),
    respawnMs: Math.max(0, Math.floor(Number(properties.spawnRespawnMs ?? fallbackRespawnMs) || 0)),
    respawnJitterMs: Math.max(0, Math.floor(Number(properties.spawnRespawnJitterMs ?? 0) || 0)),
  };
}

export function writeSpawnGroupConfig(object: MapObject, config: SpawnGroupConfig) {
  object.properties ??= {};
  object.properties.spawnCount = Math.max(1, Math.floor(config.count || 1));
  object.properties.spawnRadiusTiles = clamp(config.radiusTiles || 0, 0, 100);
  object.properties.spawnMinDistanceTiles = clamp(config.minDistanceTiles || 0, 0, 50);
  object.properties.spawnRespawnMs = Math.max(0, Math.floor(config.respawnMs || 0));
  object.properties.spawnRespawnJitterMs = Math.max(0, Math.floor(config.respawnJitterMs || 0));
}

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomFactory(seedText: string) {
  let state = hashSeed(seedText) || 1;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function generateSpawnOffsets(config: SpawnGroupConfig, seed: string) {
  if (config.count <= 1 || config.radiusTiles <= 0) return [{ x: 0, y: 0 }];
  const random = randomFactory(seed);
  const points = [{ x: 0, y: 0 }];
  const maxAttempts = Math.max(80, config.count * 80);
  let attempts = 0;
  while (points.length < config.count && attempts++ < maxAttempts) {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * config.radiusTiles;
    const point = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    if (config.minDistanceTiles > 0 && points.some((other) => Math.hypot(other.x - point.x, other.y - point.y) < config.minDistanceTiles)) continue;
    points.push(point);
  }
  while (points.length < config.count) {
    const angle = (points.length / config.count) * Math.PI * 2;
    const radius = Math.max(config.minDistanceTiles, config.radiusTiles * .72);
    points.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }
  return points;
}

export function spawnRespawnDelay(config: SpawnGroupConfig, baseRespawnMs: number, random = Math.random) {
  const base = config.respawnMs > 0 ? config.respawnMs : Math.max(0, baseRespawnMs);
  if (!config.respawnJitterMs) return base;
  const jitter = (random() * 2 - 1) * config.respawnJitterMs;
  return Math.max(250, Math.round(base + jitter));
}
