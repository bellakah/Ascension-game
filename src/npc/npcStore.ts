import { MAP_PALETTE_ENTRIES, getPaletteEntry } from '../editor/map/mapEditorCatalog';
import type { MapPaletteEntry } from '../editor/map/mapEditorTypes';
import type { NpcDefinition, NpcDirection, NpcInstanceRoute } from './npcTypes';

const NPC_STORAGE_KEY = 'ascension.npc.definitions.v1';
const NPC_ROUTE_KEY = 'ascension.npc.instance-routes.v1';
export const NPC_ASSET_PREFIX = 'npcdef:';

type NpcFile = { version: 1; definitions: NpcDefinition[] };
type RouteFile = { version: 1; routes: NpcInstanceRoute[] };

const clone = <T>(value: T): T => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

function loadNpcFile(): NpcFile {
  try {
    const parsed = JSON.parse(localStorage.getItem(NPC_STORAGE_KEY) ?? '') as Partial<NpcFile>;
    return { version: 1, definitions: Array.isArray(parsed.definitions) ? parsed.definitions : [] };
  } catch {
    return { version: 1, definitions: [] };
  }
}

function saveNpcFile(file: NpcFile) {
  localStorage.setItem(NPC_STORAGE_KEY, JSON.stringify(file));
  window.dispatchEvent(new CustomEvent('ascension-npc-definitions-change'));
}

function loadRouteFile(): RouteFile {
  try {
    const parsed = JSON.parse(localStorage.getItem(NPC_ROUTE_KEY) ?? '') as Partial<RouteFile>;
    return { version: 1, routes: Array.isArray(parsed.routes) ? parsed.routes : [] };
  } catch {
    return { version: 1, routes: [] };
  }
}

function saveRouteFile(file: RouteFile) {
  localStorage.setItem(NPC_ROUTE_KEY, JSON.stringify(file));
  window.dispatchEvent(new CustomEvent('ascension-npc-routes-change'));
}

function firstAppearanceAssetId() {
  return MAP_PALETTE_ENTRIES.find((entry) => !entry.id.startsWith(NPC_ASSET_PREFIX) && entry.palette === 'npc' && entry.sprite)?.id
    ?? MAP_PALETTE_ENTRIES.find((entry) => !entry.id.startsWith(NPC_ASSET_PREFIX) && entry.sprite)?.id
    ?? 'rowan';
}

export function createNpcDefinition(name = 'Novo NPC'): NpcDefinition {
  const now = Date.now();
  const appearance = firstAppearanceAssetId();
  return {
    version: 1,
    id: uid('npc'),
    name,
    title: '',
    role: 'civilian',
    category: 'Moradores',
    tags: [],
    notes: '',
    appearance: {
      fallbackAssetId: appearance,
      idle: { south: appearance },
      walk: { south: appearance },
      scale: 1,
      showShadow: true,
    },
    interaction: {
      enabled: true,
      radiusTiles: 1.6,
      facePlayer: true,
      blockPlayer: true,
      prompt: 'Conversar',
    },
    dialogue: {
      enabled: true,
      startNodeId: 'start',
      nodes: [{ id: 'start', text: 'Olá, viajante.', choices: [{ id: uid('choice'), text: 'Até logo.', action: 'close' }] }],
    },
    shop: {
      enabled: false,
      currencyId: 'coins',
      buyMultiplier: 1,
      sellMultiplier: .5,
      items: [],
    },
    quests: { offers: [], completes: [] },
    behavior: {
      mode: 'stationary',
      walkSpeed: 1.25,
      runSpeed: 2.4,
      randomRadius: 4,
      defaultWaitMs: 900,
    },
    schedule: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function listNpcDefinitions() {
  return loadNpcFile().definitions.map(clone);
}

export function getNpcDefinition(id: string) {
  const value = loadNpcFile().definitions.find((entry) => entry.id === id);
  return value ? clone(value) : null;
}

export function saveNpcDefinition(definition: NpcDefinition) {
  const file = loadNpcFile();
  const copy = clone(definition);
  copy.version = 1;
  copy.updatedAt = Date.now();
  const index = file.definitions.findIndex((entry) => entry.id === copy.id);
  if (index >= 0) file.definitions[index] = copy;
  else file.definitions.push(copy);
  saveNpcFile(file);
  syncNpcDefinitionsIntoPalette();
  return clone(copy);
}

export function deleteNpcDefinition(id: string) {
  const file = loadNpcFile();
  file.definitions = file.definitions.filter((entry) => entry.id !== id);
  saveNpcFile(file);
  const routes = loadRouteFile();
  routes.routes = routes.routes.filter((route) => route.npcId !== id);
  saveRouteFile(routes);
  syncNpcDefinitionsIntoPalette();
}

export function duplicateNpcDefinition(id: string) {
  const source = getNpcDefinition(id);
  if (!source) return null;
  const now = Date.now();
  const copy = clone(source);
  copy.id = uid('npc');
  copy.name = `${source.name} - Cópia`;
  copy.createdAt = now;
  copy.updatedAt = now;
  return saveNpcDefinition(copy);
}

export function npcAssetId(id: string) {
  return `${NPC_ASSET_PREFIX}${id}`;
}

export function npcIdFromAssetId(assetId: string) {
  return assetId.startsWith(NPC_ASSET_PREFIX) ? assetId.slice(NPC_ASSET_PREFIX.length) : null;
}

function appearanceAsset(definition: NpcDefinition) {
  const configured = [
    definition.appearance.idle.south,
    definition.appearance.walk.south,
    ...Object.values(definition.appearance.idle),
    ...Object.values(definition.appearance.walk),
  ].filter(Boolean) as string[];

  let firstConfigured: MapPaletteEntry | undefined;
  for (const id of [...new Set(configured)]) {
    const entry = MAP_PALETTE_ENTRIES.find((value) => value.id === id && !value.id.startsWith(NPC_ASSET_PREFIX));
    if (!entry) continue;
    firstConfigured ??= entry;
    // Para o preview do mapa, um sprite realmente configurado tem prioridade
    // sobre placeholders antigos como Rowan/Elandra sem imagem.
    if (entry.sprite) return entry;
  }

  const fallback = definition.appearance.fallbackAssetId
    ? MAP_PALETTE_ENTRIES.find((value) => value.id === definition.appearance.fallbackAssetId && !value.id.startsWith(NPC_ASSET_PREFIX))
    : undefined;
  if (fallback?.sprite) return fallback;
  return firstConfigured ?? fallback ?? getPaletteEntry('rowan');
}

function staticPreviewSprite(base: MapPaletteEntry) {
  if (!base.sprite) return undefined;
  const sprite = clone(base.sprite);
  const firstFrame = sprite.animation?.frames?.[0];
  if (firstFrame) sprite.sourceRect = { x: firstFrame.x, y: firstFrame.y, width: firstFrame.width, height: firstFrame.height };
  // O Map Editor precisa só de uma referência visual leve. As animações completas
  // permanecem na definição do NPC e continuam sendo usadas pelo runtime do jogo.
  delete sprite.animation;
  return sprite;
}

export function resolveNpcAppearanceAssetId(definition: NpcDefinition, state: 'idle' | 'walk', direction: NpcDirection) {
  const exact = definition.appearance[state][direction];
  if (exact) return exact;
  const cardinalFallback: Partial<Record<NpcDirection, NpcDirection>> = {
    'north-east': 'north', 'north-west': 'north', 'south-east': 'south', 'south-west': 'south',
  };
  const cardinal = cardinalFallback[direction];
  if (cardinal && definition.appearance[state][cardinal]) return definition.appearance[state][cardinal]!;
  if (definition.appearance[state].south) return definition.appearance[state].south!;
  if (state === 'walk' && definition.appearance.idle[direction]) return definition.appearance.idle[direction]!;
  return definition.appearance.fallbackAssetId || appearanceAsset(definition).id;
}

export function syncNpcDefinitionsIntoPalette() {
  for (let i = MAP_PALETTE_ENTRIES.length - 1; i >= 0; i--) {
    if (MAP_PALETTE_ENTRIES[i].id.startsWith(NPC_ASSET_PREFIX)) MAP_PALETTE_ENTRIES.splice(i, 1);
  }
  for (const definition of listNpcDefinitions()) {
    const base = appearanceAsset(definition);
    const entry: MapPaletteEntry = {
      id: npcAssetId(definition.id),
      palette: 'npc',
      label: definition.name,
      icon: '♟',
      color: base.color || '#8ac6d7',
      description: definition.title ? `${definition.title} • NPC criado no NPC Studio` : 'NPC criado no NPC Studio',
      defaultLayer: 'objects',
      objectKind: 'npc',
      tags: ['npc-studio', definition.role, ...definition.tags],
      folder: 'npc',
      sprite: staticPreviewSprite(base),
      footprint: base.footprint ? clone(base.footprint) : { width: 1, height: 1 },
      source: 'custom',
    };
    if (entry.sprite) {
      entry.sprite.widthTiles = (entry.sprite.widthTiles ?? 1) * Math.max(.1, definition.appearance.scale || 1);
      entry.sprite.heightTiles = (entry.sprite.heightTiles ?? 1) * Math.max(.1, definition.appearance.scale || 1);
    }
    MAP_PALETTE_ENTRIES.push(entry);
  }
}

export function listNpcInstanceRoutes(mapId?: string) {
  return loadRouteFile().routes.filter((route) => !mapId || route.mapId === mapId).map(clone);
}

export function getNpcInstanceRoute(mapId: string, objectId: string) {
  const value = loadRouteFile().routes.find((route) => route.mapId === mapId && route.objectId === objectId);
  return value ? clone(value) : null;
}

export function saveNpcInstanceRoute(route: NpcInstanceRoute) {
  const file = loadRouteFile();
  const copy = clone(route);
  copy.updatedAt = Date.now();
  const index = file.routes.findIndex((entry) => entry.mapId === copy.mapId && entry.objectId === copy.objectId);
  if (index >= 0) file.routes[index] = copy;
  else file.routes.push(copy);
  saveRouteFile(file);
  return clone(copy);
}

export function deleteNpcInstanceRoute(mapId: string, objectId: string) {
  const file = loadRouteFile();
  file.routes = file.routes.filter((route) => !(route.mapId === mapId && route.objectId === objectId));
  saveRouteFile(file);
}

export function hydrateNpcDefinitionsIntoPalette() {
  syncNpcDefinitionsIntoPalette();
}
