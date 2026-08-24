import type { SpawnGroupConfig } from './spawnGroupConfig';

const KEY = 'ascension.spawn-groups.v1';

type Entry = SpawnGroupConfig & { mapId: string; objectId: string };
type FileData = { version: 1; entries: Entry[] };

function read(): FileData {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '') as Partial<FileData>;
    return { version: 1, entries: Array.isArray(value.entries) ? value.entries : [] };
  } catch {
    return { version: 1, entries: [] };
  }
}

function write(value: FileData) {
  localStorage.setItem(KEY, JSON.stringify(value));
  window.dispatchEvent(new Event('ascension-spawn-groups-change'));
}

export function getSpawnGroup(mapId: string, objectId: string) {
  return read().entries.find((entry) => entry.mapId === mapId && entry.objectId === objectId) ?? null;
}

export function saveSpawnGroup(mapId: string, objectId: string, config: SpawnGroupConfig) {
  const file = read();
  const next: Entry = { mapId, objectId, ...config };
  const index = file.entries.findIndex((entry) => entry.mapId === mapId && entry.objectId === objectId);
  if (index >= 0) file.entries[index] = next;
  else file.entries.push(next);
  write(file);
  return next;
}

export function removeSpawnGroup(mapId: string, objectId: string) {
  const file = read();
  file.entries = file.entries.filter((entry) => !(entry.mapId === mapId && entry.objectId === objectId));
  write(file);
}
