import './mapEditorPro.css';
import './mapEditorProOverrides.css';
import { drawAssetThumbnail, preloadMapAssets } from './mapAssetRenderer';
import { deleteLibraryAsset, hydrateAssetLibraryV2, isV2LibraryAsset } from './mapAssetLibraryV2';
import { openMapAssetStudio } from './mapAssetStudio';
import { openAutoObjectSlicer } from './mapAutoSlicer';
import { openMapAssetConfigurator } from './mapAssetConfigurator';
import { drawConfiguredObject } from './mapObjectRenderer';
import { drawBlendedTerrainTile } from './mapTerrainBlend';
import { getAssetPreset, objectVisualBounds } from './mapAssetPresets';
import { MAP_PALETTE_ENTRIES, getPaletteEntry } from './mapEditorCatalog';
import { createMapPreviewPublisher } from './mapPreviewBridge';
import { createBlankMap, importMapDocument, listMapDocuments, loadMapDocument, loadOrCreateActiveMap, saveMapDocument } from './mapEditorStorage';
import { loadWorldLayout, moveWorldMap, saveWorldLayout, type AscensionWorldLayout } from './mapWorldStore';
import { loadPublishedMap, publishMap } from '../../map/publishedMapStore';
import type { AscensionMapDocument, EditorSnapshot, MapAssetFolder, MapLayerId, MapObject, MapPaletteEntry, MapToolId, MapZone } from './mapEditorTypes';
import { parseTileKey, tileKey } from './mapEditorTypes';

type Point = { x: number; y: number };
type SelectionItem = { kind: 'object' | 'zone'; id: string };
type DragMode = 'none' | 'pan' | 'paint' | 'move' | 'marquee' | 'shape';
type PanelMode = 'terrain' | 'objects' | 'assets' | 'zones' | null;
type RightMode = 'selection' | 'layers' | null;
type SnapMode = 'grid' | 'half' | 'free';
type EditorMode = 'map' | 'world';

type AssetCategory = {
  id: MapAssetFolder | 'all' | 'favorites';
  label: string;
};

const FAVORITES_KEY = 'ascension.map-editor.favorites.v2';
const RECENTS_KEY = 'ascension.map-editor.recents.v2';
const RANDOM_KEY = 'ascension.map-editor.random-pool.v1';
const SNAP_KEY = 'ascension.map-editor.snap.v1';
const UI_PANEL_KEY = 'ascension.map-editor.pro.panel.v1';

const CATEGORIES: AssetCategory[] = [
  { id: 'all', label: 'Todos' }, { id: 'favorites', label: 'Favoritos' }, { id: 'terrain', label: 'Terreno' },
  { id: 'nature', label: 'Natureza' }, { id: 'buildings', label: 'Construções' }, { id: 'walls', label: 'Paredes' },
  { id: 'roofs', label: 'Telhados' }, { id: 'furniture', label: 'Móveis' }, { id: 'props', label: 'Props' },
  { id: 'crafting', label: 'Crafting' }, { id: 'npc', label: 'NPCs' }, { id: 'monster', label: 'Monstros' },
  { id: 'resource', label: 'Recursos' }, { id: 'portal', label: 'Portais' }, { id: 'effects', label: 'Efeitos' },
  { id: 'zones', label: 'Zonas' }, { id: 'raw', label: 'Outros' },
];

const LAYERS: Array<{ id: MapLayerId; label: string }> = [
  { id: 'ground', label: 'Terreno' }, { id: 'detail', label: 'Detalhes' }, { id: 'objects', label: 'Objetos' },
  { id: 'collision', label: 'Colisão' }, { id: 'zones', label: 'Zonas' },
];

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);

function loadArray(key: string) {
  try { const value = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(value) ? value.map(String) : []; }
  catch { return [] as string[]; }
}

function saveArray(key: string, values: Iterable<string>) {
  localStorage.setItem(key, JSON.stringify([...values]));
}

function inferFolder(entry: MapPaletteEntry): MapAssetFolder {
  if (entry.folder) return entry.folder;
  if (entry.palette === 'terrain') return 'terrain';
  if (entry.palette === 'npc') return 'npc';
  if (entry.palette === 'monster') return 'monster';
  if (entry.palette === 'resource') return 'resource';
  if (entry.palette === 'portal') return 'portal';
  if (entry.palette === 'zone') return 'zones';
  const text = `${entry.label} ${(entry.tags ?? []).join(' ')}`.toLowerCase();
  if (/tree|arvore|árvore|bush|arbusto|rock|pedra|flor|nature/.test(text)) return 'nature';
  if (/house|casa|building|porta|door/.test(text)) return 'buildings';
  if (/wall|parede|fence|cerca/.test(text)) return 'walls';
  if (/roof|telhado/.test(text)) return 'roofs';
  if (/chair|table|bed|móvel|movel|furniture/.test(text)) return 'furniture';
  if (/forge|forja|craft|anvil|alchemy|alquimia/.test(text)) return 'crafting';
  return entry.palette === 'doodad' ? 'props' : 'raw';
}

function bresenham(a: Point, b: Point) {
  const points: Point[] = [];
  let x0 = Math.round(a.x), y0 = Math.round(a.y), x1 = Math.round(b.x), y1 = Math.round(b.y);
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  while (true) {
    points.push({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return points;
}

function rectPoints(a: Point, b: Point, filled: boolean) {
  const minX = Math.min(Math.round(a.x), Math.round(b.x));
  const maxX = Math.max(Math.round(a.x), Math.round(b.x));
  const minY = Math.min(Math.round(a.y), Math.round(b.y));
  const maxY = Math.max(Math.round(a.y), Math.round(b.y));
  const points: Point[] = [];
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    if (filled || x === minX || x === maxX || y === minY || y === maxY) points.push({ x, y });
  }
  return points;
}

function normalizeBox(a: Point, b: Point) {
  return {
    x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x) + 1, height: Math.abs(b.y - a.y) + 1,
  };
}

function intersects(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function downloadText(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  URL.revokeObjectURL(url);
}

function openFilePicker(accept: string, onFile: (file: File) => void) {
  const input = document.createElement('input'); input.type = 'file'; input.accept = accept;
  input.onchange = () => { const file = input.files?.[0]; if (file) onFile(file); };
  input.click();
}

export async function startMapEditor() {
  document.body.className = 'map-editor-pro-mode';
  document.title = 'Ascension Map Editor';
  await hydrateAssetLibraryV2();

  const mount = document.querySelector<HTMLElement>('#app') ?? document.body;
  mount.innerHTML = '';

  let mapDoc = loadOrCreateActiveMap();
  let worldLayout = loadWorldLayout(listMapDocuments());
  let editorMode: EditorMode = 'map';
  let panelMode: PanelMode = (localStorage.getItem(UI_PANEL_KEY) as PanelMode) || 'terrain';
  let rightMode: RightMode = null;
  let category: AssetCategory['id'] = 'terrain';
  let layer: MapLayerId = 'ground';
  let tool: MapToolId = 'brush';
  let entry = getPaletteEntry('grass');
  let brushSize = 1;
  let snapMode: SnapMode = (localStorage.getItem(SNAP_KEY) as SnapMode) || 'grid';
  let gridVisible = true;
  let collisionVisible = false;
  let minimapVisible = true;
  let zoom = .7;
  let cameraX = 0;
  let cameraY = 0;
  let hoverTile: Point | null = null;
  let hoverMap: Point | null = null;
  let dragMode: DragMode = 'none';
  let pointerStart = { x: 0, y: 0, cameraX: 0, cameraY: 0 };
  let dragStartMap: Point = { x: 0, y: 0 };
  let shape: { start: Point; end: Point } | null = null;
  let marquee: { start: Point; end: Point; additive: boolean; toggle: boolean } | null = null;
  let selection: SelectionItem[] = [];
  let moveOrigins = new Map<string, Point>();
  let clipboard: { objects: MapObject[]; zones: MapZone[] } | null = null;
  let dirty = false;
  let actionOpen = false;
  let lastPaintKey = '';
  let spaceDown = false;
  let initialized = false;
  let autosaveTimer = 0;
  let toastTimer = 0;
  let thumbnailTimer = 0;
  let previewTimer = 0;
  let assetSearch = '';
  let favorites = new Set(loadArray(FAVORITES_KEY));
  let recents = loadArray(RECENTS_KEY);
  let randomPool = new Set(loadArray(RANDOM_KEY));
  const undoStack: EditorSnapshot[] = [];
  const redoStack: EditorSnapshot[] = [];
  const visible: Record<MapLayerId, boolean> = { ground: true, detail: true, objects: true, collision: true, zones: true };
  const locked: Record<MapLayerId, boolean> = { ground: false, detail: false, objects: false, collision: false, zones: false };
  const previewPublisher = createMapPreviewPublisher();

  const root = document.createElement('div');
  root.className = 'mep';
  root.innerHTML = `
    <header class="mep-top">
      <div class="mep-brand"><span class="mep-logo">A</span><div><strong>ASCENSION</strong><span>MAP EDITOR</span></div></div>
      <div class="mep-mode"><button id="mep-mode-world">Mundo</button><button id="mep-mode-map" class="active">Mapa</button></div>
      <div class="mep-map-select"><span>Mapa</span><select id="mep-map-select"></select></div>
      <button id="mep-undo" class="icon" title="Desfazer">↶</button><button id="mep-redo" class="icon" title="Refazer">↷</button>
      <div class="mep-spacer"></div>
      <button id="mep-save" class="save">Salvar</button><button id="mep-publish" class="publish">Publicar</button><button id="mep-test" class="test">▶ <span>Testar</span></button>
      <div class="mep-menu-wrap"><button id="mep-more" class="icon">•••</button><div id="mep-more-menu" class="mep-more-menu hidden"><button id="mep-new-map">＋ Novo mapa</button><button id="mep-import-map">Abrir mapa JSON</button><button id="mep-export-map">Exportar mapa JSON</button><button id="mep-import-asset">Importar imagem / spritesheet</button><button id="mep-open-game">Abrir jogo</button></div></div>
    </header>
    <div class="mep-context" id="mep-context"></div>
    <div class="mep-work">
      <nav class="mep-rail">
        <button data-rail="select" data-tip="Selecionar">⌁</button>
        <button data-rail="terrain" data-tip="Pintar terreno" class="active">▩</button>
        <button data-rail="objects" data-tip="Objetos">◆</button>
        <button data-rail="zones" data-tip="Zonas">▣</button>
        <button data-rail="collision" data-tip="Colisão">▧</button>
        <button data-rail="pan" data-tip="Mover visão">✥</button>
        <button data-rail="assets" data-tip="Biblioteca">▦</button>
        <button class="bottom" data-rail="layers" data-tip="Camadas">☷</button>
        <button data-rail="minimap" data-tip="Minimapa">◫</button>
      </nav>
      <main class="mep-stage-wrap">
        <div class="mep-stage" id="mep-stage"><canvas id="mep-canvas"></canvas><div id="mep-map-chip" class="mep-chip"></div><div id="mep-selection-bar" class="mep-selection-bar hidden"></div><div id="mep-toast" class="mep-toast"></div></div>
        <section id="mep-world" class="mep-world hidden"><div class="mep-world-head"><div><strong>Mundo</strong><span>Arraste mapas para encostar um no outro. A ligação é criada automaticamente.</span></div><div class="mep-spacer"></div><button id="mep-world-organize">Organizar</button><button id="mep-world-new" class="primary">＋ Criar mapa</button></div><div id="mep-world-board" class="mep-world-board"><svg id="mep-world-lines" class="mep-world-lines"></svg><div id="mep-world-cards"></div></div></section>
        <aside id="mep-panel" class="mep-panel"><div class="mep-panel-head"><strong id="mep-panel-title">TERRENO</strong><button id="mep-panel-import">＋</button><button id="mep-panel-close">×</button></div><div class="mep-search"><input id="mep-search" placeholder="Buscar..."></div><div id="mep-filter-row" class="mep-filter-row"></div><div id="mep-asset-grid" class="mep-asset-grid"></div></aside>
        <aside id="mep-inspector" class="mep-inspector hidden"><div class="mep-inspector-head"><strong id="mep-inspector-title">PROPRIEDADES</strong><button id="mep-inspector-close">×</button></div><div id="mep-inspector-body" class="mep-inspector-body"></div></aside>
        <div id="mep-minimap" class="mep-minimap-float"><canvas id="mep-minimap-canvas"></canvas></div>
      </main>
    </div>
    <footer class="mep-status"><span id="mep-position">X 0 • Y 0</span><span id="mep-tool-status">Pincel</span><span id="mep-layer-status">Terreno</span><span class="mep-spacer"></span><span id="mep-count"></span><span id="mep-save-state" class="saved">● Salvo</span></footer>`;
  mount.appendChild(root);

  const stage = root.querySelector<HTMLElement>('#mep-stage')!;
  const canvas = root.querySelector<HTMLCanvasElement>('#mep-canvas')!;
  const ctx = canvas.getContext('2d')!;
  const minimapShell = root.querySelector<HTMLElement>('#mep-minimap')!;
  const minimap = root.querySelector<HTMLCanvasElement>('#mep-minimap-canvas')!;
  const minimapCtx = minimap.getContext('2d')!;
  const panel = root.querySelector<HTMLElement>('#mep-panel')!;
  const inspector = root.querySelector<HTMLElement>('#mep-inspector')!;
  const inspectorBody = root.querySelector<HTMLElement>('#mep-inspector-body')!;
  const assetGrid = root.querySelector<HTMLElement>('#mep-asset-grid')!;
  const searchInput = root.querySelector<HTMLInputElement>('#mep-search')!;
  const contextBar = root.querySelector<HTMLElement>('#mep-context')!;
  const toast = root.querySelector<HTMLElement>('#mep-toast')!;
  const worldView = root.querySelector<HTMLElement>('#mep-world')!;
  const worldBoard = root.querySelector<HTMLElement>('#mep-world-board')!;
  const worldCards = root.querySelector<HTMLElement>('#mep-world-cards')!;
  const worldLines = root.querySelector<SVGSVGElement>('#mep-world-lines')!;

  const showToast = (message: string) => {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2200);
  };

  const publishPreview = () => previewPublisher.publish(clone(mapDoc));
  const schedulePreview = () => { clearTimeout(previewTimer); previewTimer = window.setTimeout(publishPreview, 50); };

  const markDirty = () => {
    dirty = true;
    const node = root.querySelector<HTMLElement>('#mep-save-state')!;
    node.className = 'dirty'; node.textContent = '● Alterado';
    clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => save(true), 1200);
  };

  const markSaved = (automatic = false) => {
    dirty = false;
    const node = root.querySelector<HTMLElement>('#mep-save-state')!;
    node.className = 'saved'; node.textContent = automatic ? '● Salvo automaticamente' : '● Salvo';
  };

  const beginMutation = (label: string) => {
    if (actionOpen) return;
    undoStack.push({ document: clone(mapDoc), label });
    if (undoStack.length > 120) undoStack.shift();
    redoStack.length = 0;
    actionOpen = true;
  };

  const finishMutation = () => {
    if (actionOpen) {
      mapDoc.updatedAt = Date.now();
      markDirty(); schedulePreview();
    }
    actionOpen = false; lastPaintKey = '';
    refreshChrome(); renderInspector(); render();
  };

  const save = (automatic = false) => {
    mapDoc = saveMapDocument(mapDoc);
    worldLayout = saveWorldLayout(loadWorldLayout(listMapDocuments()));
    markSaved(automatic);
    renderMapSelect();
    publishPreview();
    if (!automatic) showToast('Mapa salvo.');
  };

  const restore = (snapshot: EditorSnapshot, target: EditorSnapshot[]) => {
    target.push({ document: clone(mapDoc), label: snapshot.label });
    mapDoc = clone(snapshot.document); selection = []; markDirty(); schedulePreview(); refreshAll();
  };
  const undo = () => { const item = undoStack.pop(); if (item) restore(item, redoStack); };
  const redo = () => { const item = redoStack.pop(); if (item) restore(item, undoStack); };

  const validTile = (x: number, y: number) => x >= 0 && y >= 0 && x < mapDoc.width && y < mapDoc.height;
  const viewSize = () => ({ width: canvas.clientWidth, height: canvas.clientHeight });
  const clampCamera = () => {
    const view = viewSize();
    cameraX = clamp(cameraX, -100 / zoom, Math.max(0, mapDoc.width * mapDoc.tileSize - view.width / zoom) + 100 / zoom);
    cameraY = clamp(cameraY, -100 / zoom, Math.max(0, mapDoc.height * mapDoc.tileSize - view.height / zoom) + 100 / zoom);
  };
  const screenToMap = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return { x: ((clientX - rect.left) / zoom + cameraX) / mapDoc.tileSize, y: ((clientY - rect.top) / zoom + cameraY) / mapDoc.tileSize };
  };
  const screenToTile = (clientX: number, clientY: number) => { const point = screenToMap(clientX, clientY); return { x: Math.floor(point.x), y: Math.floor(point.y) }; };
  const snapPoint = (point: Point) => snapMode === 'grid'
    ? { x: Math.floor(point.x), y: Math.floor(point.y) }
    : snapMode === 'half'
      ? { x: Math.round(point.x * 2) / 2, y: Math.round(point.y * 2) / 2 }
      : { x: Math.round(point.x * 10) / 10, y: Math.round(point.y * 10) / 10 };

  const setZoom = (next: number, screenX?: number, screenY?: number) => {
    const old = zoom, view = viewSize();
    const px = screenX ?? view.width / 2, py = screenY ?? view.height / 2;
    const worldX = px / old + cameraX, worldY = py / old + cameraY;
    zoom = clamp(next, .2, 3);
    cameraX = worldX - px / zoom; cameraY = worldY - py / zoom;
    clampCamera(); renderContext(); refreshChrome(); render();
  };

  const fitMap = () => {
    const view = viewSize();
    zoom = clamp(Math.min(view.width / (mapDoc.width * mapDoc.tileSize), view.height / (mapDoc.height * mapDoc.tileSize)) * .92, .2, 2.5);
    cameraX = mapDoc.width * mapDoc.tileSize / 2 - view.width / (2 * zoom);
    cameraY = mapDoc.height * mapDoc.tileSize / 2 - view.height / (2 * zoom);
    clampCamera(); renderContext(); render();
  };

  const selectionHas = (kind: SelectionItem['kind'], id: string) => selection.some((item) => item.kind === kind && item.id === id);
  const selectedObjects = () => mapDoc.objects.filter((object) => selectionHas('object', object.id));
  const selectedZones = () => mapDoc.zones.filter((zone) => selectionHas('zone', zone.id));
  const objectRect = (object: MapObject) => objectVisualBounds(getPaletteEntry(object.assetId), object);
  const objectAt = (x: number, y: number) => [...mapDoc.objects].reverse().find((object) => {
    const rect = objectRect(object); return x >= rect.x && y >= rect.y && x <= rect.x + rect.width && y <= rect.y + rect.height;
  }) ?? null;
  const zoneAt = (x: number, y: number) => [...mapDoc.zones].reverse().find((zone) => x >= zone.x && y >= zone.y && x < zone.x + zone.width && y < zone.y + zone.height) ?? null;

  const chooseEntry = (next: MapPaletteEntry) => {
    entry = next;
    recents = [next.id, ...recents.filter((id) => id !== next.id)].slice(0, 10); saveArray(RECENTS_KEY, recents);
    if (next.palette === 'terrain') { layer = layer === 'detail' ? 'detail' : 'ground'; tool = 'brush'; panelMode = 'terrain'; }
    else if (next.palette === 'zone') { layer = 'zones'; tool = 'rect'; panelMode = 'zones'; }
    else { layer = 'objects'; tool = 'brush'; panelMode = 'objects'; }
    selection = [];
    renderAssets(); renderContext(); refreshChrome(); renderInspector(); render();
  };

  const toggleFavorite = (id: string) => {
    favorites.has(id) ? favorites.delete(id) : favorites.add(id);
    saveArray(FAVORITES_KEY, favorites); renderAssets();
  };

  const toggleRandom = (id: string) => {
    randomPool.has(id) ? randomPool.delete(id) : randomPool.add(id);
    saveArray(RANDOM_KEY, randomPool); renderAssets(); renderContext();
    showToast(randomPool.size ? `${randomPool.size} objetos no pincel aleatório.` : 'Pincel aleatório limpo.');
  };

  const randomCandidates = () => {
    const explicit = [...randomPool].map((id) => MAP_PALETTE_ENTRIES.find((value) => value.id === id)).filter((value): value is MapPaletteEntry => Boolean(value));
    if (explicit.length) return explicit;
    const folder = inferFolder(entry);
    return MAP_PALETTE_ENTRIES.filter((value) => inferFolder(value) === folder && value.palette === entry.palette && value.objectKind === entry.objectKind);
  };
  const randomEntry = () => { const values = randomCandidates(); return values.length ? values[Math.floor(Math.random() * values.length)] : entry; };

  const paintTerrainOne = (x: number, y: number, selected = entry) => {
    if (!validTile(x, y)) return;
    const key = tileKey(x, y), value = mapDoc.tiles[key] ?? {};
    if (layer === 'detail') value.detail = selected.id; else value.ground = selected.id;
    mapDoc.tiles[key] = value;
  };
  const paintTerrain = (x: number, y: number, random = false) => {
    const radius = Math.floor(brushSize / 2);
    for (let oy = -radius; oy <= radius; oy++) for (let ox = -radius; ox <= radius; ox++) paintTerrainOne(x + ox, y + oy, random ? randomEntry() : entry);
  };
  const eraseTerrain = (x: number, y: number) => {
    const radius = Math.floor(brushSize / 2);
    for (let oy = -radius; oy <= radius; oy++) for (let ox = -radius; ox <= radius; ox++) {
      if (!validTile(x + ox, y + oy)) continue;
      const key = tileKey(x + ox, y + oy), value = mapDoc.tiles[key] ?? {};
      if (layer === 'detail') delete value.detail; else value.ground = 'grass';
      mapDoc.tiles[key] = value;
    }
  };
  const floodFill = (x: number, y: number) => {
    if (entry.palette !== 'terrain' || !validTile(x, y)) return;
    const detail = layer === 'detail', start = mapDoc.tiles[tileKey(x, y)] ?? {};
    const target = detail ? start.detail : start.ground ?? 'grass';
    if (target === entry.id) return;
    const queue = [{ x, y }], seen = new Set<string>();
    while (queue.length) {
      const point = queue.shift()!; if (!validTile(point.x, point.y)) continue;
      const key = tileKey(point.x, point.y); if (seen.has(key)) continue; seen.add(key);
      const value = mapDoc.tiles[key] ?? {};
      if ((detail ? value.detail : value.ground ?? 'grass') !== target) continue;
      if (detail) value.detail = entry.id; else value.ground = entry.id;
      mapDoc.tiles[key] = value;
      queue.push({ x: point.x + 1, y: point.y }, { x: point.x - 1, y: point.y }, { x: point.x, y: point.y + 1 }, { x: point.x, y: point.y - 1 });
    }
  };

  const placeObject = (point: Point, selected = entry) => {
    if (!selected.objectKind || !validTile(Math.floor(point.x), Math.floor(point.y))) return;
    const key = `${selected.id}:${point.x.toFixed(1)},${point.y.toFixed(1)}`; if (lastPaintKey === key) return; lastPaintKey = key;
    const preset = getAssetPreset(selected);
    const width = selected.sprite?.widthTiles ?? selected.footprint?.width ?? 1;
    const height = selected.sprite?.heightTiles ?? selected.footprint?.height ?? 1;
    const object: MapObject = {
      id: uid('object'), kind: selected.objectKind, assetId: selected.id, x: point.x, y: point.y,
      width, height, scale: preset.scaleMode === 'custom' ? preset.scale : 1, rotation: 0, properties: {},
    };
    mapDoc.objects.push(object); selection = [{ kind: 'object', id: object.id }]; rightMode = 'selection';
  };

  const placeZone = (a: Point, b: Point) => {
    const selected = entry.palette === 'zone' ? entry : MAP_PALETTE_ENTRIES.find((value) => value.palette === 'zone') ?? entry;
    if (!selected.zoneKind) return;
    const box = normalizeBox(a, b);
    const zone: MapZone = {
      id: uid('zone'), kind: selected.zoneKind, x: clamp(Math.round(box.x), 0, mapDoc.width - 1), y: clamp(Math.round(box.y), 0, mapDoc.height - 1),
      width: Math.max(1, Math.round(box.width)), height: Math.max(1, Math.round(box.height)), name: selected.label, properties: {},
    };
    mapDoc.zones.push(zone); selection = [{ kind: 'zone', id: zone.id }]; rightMode = 'selection';
  };

  const paintCollision = (x: number, y: number, remove = false) => {
    const radius = Math.floor(brushSize / 2);
    for (let oy = -radius; oy <= radius; oy++) for (let ox = -radius; ox <= radius; ox++) {
      const tx = x + ox, ty = y + oy; if (!validTile(tx, ty)) continue;
      const key = tileKey(tx, ty);
      if (remove) mapDoc.collision = mapDoc.collision.filter((value) => value !== key);
      else if (!mapDoc.collision.includes(key)) mapDoc.collision.push(key);
    }
  };

  const deleteSelection = () => {
    if (!selection.length) return;
    beginMutation('Excluir seleção');
    const objectIds = new Set(selection.filter((item) => item.kind === 'object').map((item) => item.id));
    const zoneIds = new Set(selection.filter((item) => item.kind === 'zone').map((item) => item.id));
    mapDoc.objects = mapDoc.objects.filter((value) => !objectIds.has(value.id));
    mapDoc.zones = mapDoc.zones.filter((value) => !zoneIds.has(value.id));
    selection = []; rightMode = null; finishMutation();
  };

  const copySelection = () => {
    const objects = selectedObjects().map(clone), zones = selectedZones().map(clone);
    if (!objects.length && !zones.length) return;
    clipboard = { objects, zones }; showToast(`${objects.length + zones.length} item(ns) copiados.`);
  };

  const pasteSelection = () => {
    if (!clipboard) return;
    const points = [...clipboard.objects, ...clipboard.zones]; if (!points.length) return;
    const minX = Math.min(...points.map((value) => value.x)), minY = Math.min(...points.map((value) => value.y));
    const target = hoverMap ? snapPoint(hoverMap) : { x: minX + 1, y: minY + 1 };
    const dx = target.x - minX, dy = target.y - minY;
    beginMutation('Colar'); const next: SelectionItem[] = [];
    clipboard.objects.forEach((source) => { const value = clone(source); value.id = uid('object'); value.x = clamp(value.x + dx, 0, mapDoc.width - 1); value.y = clamp(value.y + dy, 0, mapDoc.height - 1); mapDoc.objects.push(value); next.push({ kind: 'object', id: value.id }); });
    clipboard.zones.forEach((source) => { const value = clone(source); value.id = uid('zone'); value.x = clamp(Math.round(value.x + dx), 0, mapDoc.width - 1); value.y = clamp(Math.round(value.y + dy), 0, mapDoc.height - 1); mapDoc.zones.push(value); next.push({ kind: 'zone', id: value.id }); });
    selection = next; rightMode = 'selection'; finishMutation();
  };

  const duplicateSelection = () => { copySelection(); pasteSelection(); };

  const renderMinimap = () => {
    if (!minimapVisible || editorMode !== 'map') return;
    const rect = minimapShell.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    minimap.width = Math.max(1, Math.floor(rect.width * dpr)); minimap.height = Math.max(1, Math.floor(rect.height * dpr));
    minimap.style.width = `${rect.width}px`; minimap.style.height = `${rect.height}px`;
    minimapCtx.setTransform(dpr, 0, 0, dpr, 0, 0); minimapCtx.clearRect(0, 0, rect.width, rect.height);
    const sx = rect.width / mapDoc.width, sy = rect.height / mapDoc.height;
    minimapCtx.fillStyle = mapDoc.metadata.background || '#456f42'; minimapCtx.fillRect(0, 0, rect.width, rect.height);
    for (const [key, tile] of Object.entries(mapDoc.tiles)) {
      const point = parseTileKey(key), terrain = getPaletteEntry(tile.ground ?? 'grass'); minimapCtx.fillStyle = terrain.color;
      minimapCtx.fillRect(point.x * sx, point.y * sy, Math.ceil(sx), Math.ceil(sy));
    }
    minimapCtx.fillStyle = '#e9f7ff'; mapDoc.objects.forEach((object) => minimapCtx.fillRect(object.x * sx - 1, object.y * sy - 1, 3, 3));
    const view = viewSize(); minimapCtx.strokeStyle = '#72d5ff'; minimapCtx.lineWidth = 1.5;
    minimapCtx.strokeRect(cameraX / mapDoc.tileSize * sx, cameraY / mapDoc.tileSize * sy, view.width / zoom / mapDoc.tileSize * sx, view.height / zoom / mapDoc.tileSize * sy);
  };

  const render = (now = performance.now()) => {
    if (editorMode !== 'map') return;
    const rect = stage.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    const width = Math.max(1, Math.floor(rect.width * dpr)), height = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, rect.width, rect.height); ctx.fillStyle = '#050a0f'; ctx.fillRect(0, 0, rect.width, rect.height);
    const tilePx = mapDoc.tileSize * zoom;
    const startX = clamp(Math.floor(cameraX / mapDoc.tileSize) - 2, 0, mapDoc.width - 1), startY = clamp(Math.floor(cameraY / mapDoc.tileSize) - 2, 0, mapDoc.height - 1);
    const endX = clamp(Math.ceil((cameraX + rect.width / zoom) / mapDoc.tileSize) + 2, 0, mapDoc.width - 1), endY = clamp(Math.ceil((cameraY + rect.height / zoom) / mapDoc.tileSize) + 2, 0, mapDoc.height - 1);

    if (visible.ground) for (let y = startY; y <= endY; y++) for (let x = startX; x <= endX; x++) {
      const sx = (x * mapDoc.tileSize - cameraX) * zoom, sy = (y * mapDoc.tileSize - cameraY) * zoom;
      drawBlendedTerrainTile(ctx, mapDoc, { x, y, screenX: sx, screenY: sy, tilePixels: tilePx, layer: 'ground', onReady: () => render(), now });
      if (visible.detail && mapDoc.tiles[tileKey(x, y)]?.detail) drawBlendedTerrainTile(ctx, mapDoc, { x, y, screenX: sx, screenY: sy, tilePixels: tilePx, layer: 'detail', alpha: .88, onReady: () => render(), now });
    }

    if (visible.zones) for (const zone of mapDoc.zones) {
      const sx = (zone.x * mapDoc.tileSize - cameraX) * zoom, sy = (zone.y * mapDoc.tileSize - cameraY) * zoom;
      ctx.fillStyle = zone.kind === 'safe' ? 'rgba(67,210,116,.11)' : zone.kind === 'pvp' ? 'rgba(235,76,76,.11)' : 'rgba(77,160,218,.1)';
      ctx.strokeStyle = selectionHas('zone', zone.id) ? '#e7f8ff' : 'rgba(109,194,235,.7)'; ctx.lineWidth = selectionHas('zone', zone.id) ? 2 : 1;
      ctx.fillRect(sx, sy, zone.width * tilePx, zone.height * tilePx); ctx.strokeRect(sx, sy, zone.width * tilePx, zone.height * tilePx);
    }

    if (visible.objects) for (const object of [...mapDoc.objects].sort((a, b) => a.y - b.y)) {
      const asset = getPaletteEntry(object.assetId);
      drawConfiguredObject(ctx, asset, {
        object, x: ((object.x + .5) * mapDoc.tileSize - cameraX) * zoom, y: ((object.y + 1) * mapDoc.tileSize - cameraY) * zoom,
        tilePixels: tilePx, scale: object.scale ?? 1, selected: selectionHas('object', object.id), showHitbox: collisionVisible || layer === 'collision', showLight: true, onReady: () => render(), now,
      });
    }

    if (collisionVisible || (visible.collision && layer === 'collision')) {
      ctx.fillStyle = 'rgba(239,67,67,.29)';
      mapDoc.collision.forEach((key) => { const point = parseTileKey(key); ctx.fillRect((point.x * mapDoc.tileSize - cameraX) * zoom, (point.y * mapDoc.tileSize - cameraY) * zoom, tilePx, tilePx); });
    }

    if (gridVisible && tilePx >= 11) {
      ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,.065)'; ctx.lineWidth = 1;
      for (let x = startX; x <= endX + 1; x++) { const sx = (x * mapDoc.tileSize - cameraX) * zoom; ctx.moveTo(sx, 0); ctx.lineTo(sx, rect.height); }
      for (let y = startY; y <= endY + 1; y++) { const sy = (y * mapDoc.tileSize - cameraY) * zoom; ctx.moveTo(0, sy); ctx.lineTo(rect.width, sy); }
      ctx.stroke();
    }

    if (marquee) {
      const box = normalizeBox(marquee.start, marquee.end), sx = (box.x * mapDoc.tileSize - cameraX) * zoom, sy = (box.y * mapDoc.tileSize - cameraY) * zoom;
      ctx.fillStyle = 'rgba(87,191,236,.12)'; ctx.strokeStyle = '#7bdcff'; ctx.setLineDash([6, 4]); ctx.fillRect(sx, sy, box.width * tilePx, box.height * tilePx); ctx.strokeRect(sx, sy, box.width * tilePx, box.height * tilePx); ctx.setLineDash([]);
    }

    if (shape) {
      const points = tool === 'line' ? bresenham(shape.start, shape.end) : rectPoints(shape.start, shape.end, entry.palette === 'terrain');
      ctx.fillStyle = 'rgba(111,210,255,.18)'; ctx.strokeStyle = '#82dcff';
      points.forEach((point) => { const sx = (point.x * mapDoc.tileSize - cameraX) * zoom, sy = (point.y * mapDoc.tileSize - cameraY) * zoom; ctx.fillRect(sx, sy, tilePx, tilePx); ctx.strokeRect(sx, sy, tilePx, tilePx); });
    }

    if (hoverTile && validTile(hoverTile.x, hoverTile.y) && dragMode === 'none') {
      const sx = (hoverTile.x * mapDoc.tileSize - cameraX) * zoom, sy = (hoverTile.y * mapDoc.tileSize - cameraY) * zoom;
      if (entry.palette === 'terrain' || tool === 'collision' || tool === 'eraser') {
        const radius = Math.floor(brushSize / 2), start = { x: hoverTile.x - radius, y: hoverTile.y - radius };
        const hx = (start.x * mapDoc.tileSize - cameraX) * zoom, hy = (start.y * mapDoc.tileSize - cameraY) * zoom;
        ctx.fillStyle = 'rgba(133,219,255,.13)'; ctx.strokeStyle = '#8ddcff'; ctx.fillRect(hx, hy, tilePx * brushSize, tilePx * brushSize); ctx.strokeRect(hx, hy, tilePx * brushSize, tilePx * brushSize);
      } else if (entry.objectKind && (tool === 'brush' || tool === 'random')) {
        const point = hoverMap ? snapPoint(hoverMap) : hoverTile, selected = tool === 'random' ? randomEntry() : entry;
        const ghost: MapObject = { id: 'ghost', kind: selected.objectKind ?? 'doodad', assetId: selected.id, x: point.x, y: point.y, scale: getAssetPreset(selected).scaleMode === 'custom' ? getAssetPreset(selected).scale : 1, properties: {} };
        drawConfiguredObject(ctx, selected, { object: ghost, x: ((point.x + .5) * mapDoc.tileSize - cameraX) * zoom, y: ((point.y + 1) * mapDoc.tileSize - cameraY) * zoom, tilePixels: tilePx, scale: ghost.scale, alpha: .58, now });
      } else if (tool === 'select') {
        ctx.strokeStyle = 'rgba(142,220,255,.42)'; ctx.strokeRect(sx, sy, tilePx, tilePx);
      }
    }
    renderMinimap();
  };

  const assetVisibleForPanel = (value: MapPaletteEntry) => {
    if (panelMode === 'terrain' && value.palette !== 'terrain') return false;
    if (panelMode === 'objects' && (value.palette === 'terrain' || value.palette === 'zone')) return false;
    if (panelMode === 'zones' && value.palette !== 'zone') return false;
    if (category === 'favorites' && !favorites.has(value.id)) return false;
    if (category !== 'all' && category !== 'favorites' && inferFolder(value) !== category) return false;
    const query = assetSearch.trim().toLocaleLowerCase('pt-BR');
    return !query || `${value.label} ${value.description} ${(value.tags ?? []).join(' ')}`.toLocaleLowerCase('pt-BR').includes(query);
  };

  const renderAssetCanvases = () => {
    const now = performance.now();
    assetGrid.querySelectorAll<HTMLCanvasElement>('canvas[data-asset]').forEach((canvasNode) => {
      const value = MAP_PALETTE_ENTRIES.find((asset) => asset.id === canvasNode.dataset.asset); if (value) drawAssetThumbnail(canvasNode, value, now);
    });
    inspectorBody.querySelectorAll<HTMLCanvasElement>('canvas[data-asset]').forEach((canvasNode) => {
      const value = MAP_PALETTE_ENTRIES.find((asset) => asset.id === canvasNode.dataset.asset); if (value) drawAssetThumbnail(canvasNode, value, now);
    });
  };

  const renderFilters = () => {
    const filter = root.querySelector<HTMLElement>('#mep-filter-row')!;
    let values = CATEGORIES;
    if (panelMode === 'terrain') values = CATEGORIES.filter((value) => ['all', 'favorites', 'terrain'].includes(value.id));
    if (panelMode === 'zones') values = CATEGORIES.filter((value) => ['all', 'favorites', 'zones'].includes(value.id));
    if (panelMode === 'objects') values = CATEGORIES.filter((value) => !['terrain', 'zones'].includes(value.id));
    filter.innerHTML = values.map((value) => `<button data-category="${value.id}" class="${category === value.id ? 'active' : ''}">${value.label}</button>`).join('');
    filter.querySelectorAll<HTMLButtonElement>('[data-category]').forEach((button) => button.onclick = () => { category = button.dataset.category as AssetCategory['id']; renderFilters(); renderAssets(); });
  };

  const renderAssets = () => {
    if (!panelMode) return;
    const values = MAP_PALETTE_ENTRIES.filter(assetVisibleForPanel);
    assetGrid.innerHTML = values.length ? values.map((value) => `
      <article class="mep-card ${entry.id === value.id ? 'active' : ''}" data-card="${esc(value.id)}" title="${esc(value.description)}">
        <button class="star" data-star="${esc(value.id)}">${favorites.has(value.id) ? '★' : '☆'}</button>${isV2LibraryAsset(value) ? `<button class="delete" data-delete-asset="${esc(value.id)}">×</button>` : ''}
        <canvas data-asset="${esc(value.id)}"></canvas><strong>${esc(value.label)}</strong><small>${esc(value.source === 'custom' ? 'Meu asset' : inferFolder(value))}</small>
      </article>`).join('') : '<div class="mep-empty"><strong>Nada encontrado</strong><span>Importe uma imagem ou limpe a busca.</span></div>';
    assetGrid.querySelectorAll<HTMLElement>('[data-card]').forEach((card) => {
      const value = MAP_PALETTE_ENTRIES.find((asset) => asset.id === card.dataset.card); if (!value) return;
      card.onclick = (event) => { if ((event.target as HTMLElement).closest('button')) return; if ((event as MouseEvent).shiftKey) toggleRandom(value.id); else chooseEntry(value); };
      card.ondblclick = () => { if (value.palette !== 'terrain' && value.palette !== 'zone') void openMapAssetConfigurator(value).then(() => { renderInspector(); render(); }); };
    });
    assetGrid.querySelectorAll<HTMLButtonElement>('[data-star]').forEach((button) => button.onclick = (event) => { event.stopPropagation(); toggleFavorite(button.dataset.star!); });
    assetGrid.querySelectorAll<HTMLButtonElement>('[data-delete-asset]').forEach((button) => button.onclick = async (event) => {
      event.stopPropagation(); const id = button.dataset.deleteAsset!; const value = MAP_PALETTE_ENTRIES.find((asset) => asset.id === id); if (!value) return;
      if (!confirm(`Excluir “${value.label}” da biblioteca?`)) return;
      await deleteLibraryAsset(id); if (entry.id === id) entry = getPaletteEntry('grass'); renderAssets(); render(); showToast('Asset excluído.');
    });
    renderAssetCanvases();
  };

  const openPanel = (mode: Exclude<PanelMode, null>) => {
    panelMode = mode; localStorage.setItem(UI_PANEL_KEY, mode); panel.classList.remove('hidden');
    category = mode === 'terrain' ? 'terrain' : mode === 'zones' ? 'zones' : 'all';
    root.querySelector<HTMLElement>('#mep-panel-title')!.textContent = mode === 'terrain' ? 'TERRENO' : mode === 'objects' ? 'OBJETOS' : mode === 'zones' ? 'ZONAS' : 'BIBLIOTECA';
    searchInput.placeholder = mode === 'terrain' ? 'Buscar terreno...' : mode === 'zones' ? 'Buscar zona...' : 'Buscar objeto...';
    renderFilters(); renderAssets(); refreshRail();
  };
  const closePanel = () => { panelMode = null; panel.classList.add('hidden'); localStorage.removeItem(UI_PANEL_KEY); refreshRail(); };

  const setRightMode = (mode: RightMode) => {
    rightMode = mode; inspector.classList.toggle('hidden', !mode);
    root.querySelector<HTMLElement>('#mep-inspector-title')!.textContent = mode === 'layers' ? 'CAMADAS' : 'PROPRIEDADES';
    renderInspector(); refreshRail();
  };

  const renderLayers = () => {
    inspectorBody.innerHTML = `<div class="mep-layers">${LAYERS.map((value) => `<div class="mep-layer ${layer === value.id ? 'active' : ''}" data-layer="${value.id}"><button data-eye="${value.id}">${visible[value.id] ? '◉' : '○'}</button><span>${value.label}</span><button data-lock="${value.id}">${locked[value.id] ? '🔒' : '○'}</button></div>`).join('')}</div><div class="mep-section"><h4>Visualização</h4><div class="mep-action-row"><button id="mep-layer-grid">${gridVisible ? '✓ ' : ''}Grade</button><button id="mep-layer-collision">${collisionVisible ? '✓ ' : ''}Colisões</button></div></div>`;
    inspectorBody.querySelectorAll<HTMLElement>('[data-layer]').forEach((node) => node.onclick = () => { layer = node.dataset.layer as MapLayerId; renderLayers(); renderContext(); refreshChrome(); render(); });
    inspectorBody.querySelectorAll<HTMLButtonElement>('[data-eye]').forEach((button) => button.onclick = (event) => { event.stopPropagation(); const id = button.dataset.eye as MapLayerId; visible[id] = !visible[id]; renderLayers(); render(); });
    inspectorBody.querySelectorAll<HTMLButtonElement>('[data-lock]').forEach((button) => button.onclick = (event) => { event.stopPropagation(); const id = button.dataset.lock as MapLayerId; locked[id] = !locked[id]; renderLayers(); });
    inspectorBody.querySelector<HTMLButtonElement>('#mep-layer-grid')!.onclick = () => { gridVisible = !gridVisible; renderLayers(); render(); };
    inspectorBody.querySelector<HTMLButtonElement>('#mep-layer-collision')!.onclick = () => { collisionVisible = !collisionVisible; renderLayers(); render(); };
  };

  const renderObjectInspector = (object: MapObject) => {
    const asset = getPaletteEntry(object.assetId), preset = getAssetPreset(asset), stretch = preset.stretch.enabled;
    const portal = object.kind === 'portal';
    const mapOptions = listMapDocuments().map((document) => `<option value="${esc(document.id)}" ${String(object.properties?.targetMapId ?? '') === document.id ? 'selected' : ''}>${esc(document.name)}</option>`).join('');
    inspectorBody.innerHTML = `
      <div class="mep-inspector-hero"><canvas data-asset="${esc(asset.id)}"></canvas><div><strong>${esc(asset.label)}</strong><span>${esc(inferFolder(asset))}${preset.hitbox ? ' • colisão pronta' : ''}${preset.light.enabled ? ' • luz' : ''}</span></div></div>
      <div class="mep-form-grid"><label>X<input id="mep-obj-x" type="number" step="0.1" value="${object.x}"></label><label>Y<input id="mep-obj-y" type="number" step="0.1" value="${object.y}"></label><label>Escala<input id="mep-obj-scale" type="number" min="0.1" max="10" step="0.1" value="${object.scale ?? 1}"></label><label>Rotação<input id="mep-obj-rotation" type="number" step="1" value="${object.rotation ?? 0}"></label>${stretch ? `<label>Largura<input id="mep-obj-width" type="number" min="0.2" max="50" step="0.2" value="${object.width ?? asset.sprite?.widthTiles ?? 1}"></label><label>Altura<input id="mep-obj-height" type="number" min="0.2" max="50" step="0.2" value="${object.height ?? asset.sprite?.heightTiles ?? 1}"></label>` : ''}</div>
      ${portal ? `<div class="mep-section"><h4>Destino do portal</h4><label class="mep-field">Mapa<select id="mep-portal-map"><option value="">Escolher mapa...</option>${mapOptions}</select></label><div class="mep-form-grid"><label>X de chegada<input id="mep-portal-x" type="number" step="0.1" value="${Number(object.properties?.targetX ?? 1)}"></label><label>Y de chegada<input id="mep-portal-y" type="number" step="0.1" value="${Number(object.properties?.targetY ?? 1)}"></label></div></div>` : ''}
      <div class="mep-section"><h4>Configuração reutilizável</h4><div class="mep-action-row"><button id="mep-config-asset">⚙ Colisão, luz e sombra</button></div></div>
      <div class="mep-action-row"><button id="mep-duplicate-object">Duplicar</button><button id="mep-delete-object" class="danger">Excluir</button></div>`;
    renderAssetCanvases();
    const update = () => {
      beginMutation('Editar objeto');
      object.x = clamp(Number(inspectorBody.querySelector<HTMLInputElement>('#mep-obj-x')!.value) || 0, 0, mapDoc.width - 1);
      object.y = clamp(Number(inspectorBody.querySelector<HTMLInputElement>('#mep-obj-y')!.value) || 0, 0, mapDoc.height - 1);
      object.scale = clamp(Number(inspectorBody.querySelector<HTMLInputElement>('#mep-obj-scale')!.value) || 1, .1, 10);
      object.rotation = Number(inspectorBody.querySelector<HTMLInputElement>('#mep-obj-rotation')!.value) || 0;
      const width = inspectorBody.querySelector<HTMLInputElement>('#mep-obj-width'), height = inspectorBody.querySelector<HTMLInputElement>('#mep-obj-height');
      if (width) object.width = clamp(Number(width.value) || 1, .2, 50); if (height) object.height = clamp(Number(height.value) || 1, .2, 50);
      if (portal) {
        object.properties ??= {};
        object.properties.targetMapId = inspectorBody.querySelector<HTMLSelectElement>('#mep-portal-map')!.value;
        object.properties.targetX = Number(inspectorBody.querySelector<HTMLInputElement>('#mep-portal-x')!.value) || 1;
        object.properties.targetY = Number(inspectorBody.querySelector<HTMLInputElement>('#mep-portal-y')!.value) || 1;
      }
      finishMutation();
    };
    inspectorBody.querySelectorAll<HTMLInputElement>('input').forEach((input) => input.onchange = update);
    inspectorBody.querySelectorAll<HTMLSelectElement>('select').forEach((select) => select.onchange = update);
    inspectorBody.querySelector<HTMLButtonElement>('#mep-config-asset')!.onclick = () => void openMapAssetConfigurator(asset).then((result) => { if (result.saved) { if (result.preset.scaleMode === 'custom') object.scale = result.preset.scale; renderInspector(); render(); showToast('Configuração salva para todas as cópias deste objeto.'); } });
    inspectorBody.querySelector<HTMLButtonElement>('#mep-duplicate-object')!.onclick = duplicateSelection;
    inspectorBody.querySelector<HTMLButtonElement>('#mep-delete-object')!.onclick = deleteSelection;
  };

  const renderZoneInspector = (zone: MapZone) => {
    inspectorBody.innerHTML = `<div class="mep-inspector-hero"><div style="width:68px;height:68px;display:grid;place-items:center;font-size:28px;background:#142736;border-radius:6px">▣</div><div><strong>${esc(zone.name || 'Zona')}</strong><span>${esc(zone.kind)}</span></div></div><label class="mep-field">Nome<input id="mep-zone-name" value="${esc(zone.name ?? '')}"></label><div class="mep-form-grid"><label>X<input id="mep-zone-x" type="number" value="${zone.x}"></label><label>Y<input id="mep-zone-y" type="number" value="${zone.y}"></label><label>Largura<input id="mep-zone-w" type="number" min="1" value="${zone.width}"></label><label>Altura<input id="mep-zone-h" type="number" min="1" value="${zone.height}"></label></div><div class="mep-action-row"><button id="mep-delete-zone" class="danger">Excluir zona</button></div>`;
    const update = () => { beginMutation('Editar zona'); zone.name = inspectorBody.querySelector<HTMLInputElement>('#mep-zone-name')!.value; zone.x = clamp(Number(inspectorBody.querySelector<HTMLInputElement>('#mep-zone-x')!.value) || 0, 0, mapDoc.width - 1); zone.y = clamp(Number(inspectorBody.querySelector<HTMLInputElement>('#mep-zone-y')!.value) || 0, 0, mapDoc.height - 1); zone.width = Math.max(1, Number(inspectorBody.querySelector<HTMLInputElement>('#mep-zone-w')!.value) || 1); zone.height = Math.max(1, Number(inspectorBody.querySelector<HTMLInputElement>('#mep-zone-h')!.value) || 1); finishMutation(); };
    inspectorBody.querySelectorAll<HTMLInputElement>('input').forEach((input) => input.onchange = update);
    inspectorBody.querySelector<HTMLButtonElement>('#mep-delete-zone')!.onclick = deleteSelection;
  };

  const renderInspector = () => {
    if (rightMode === 'layers') { inspector.classList.remove('hidden'); renderLayers(); return; }
    if (rightMode !== 'selection' || !selection.length) { if (rightMode === 'selection') rightMode = null; inspector.classList.add('hidden'); return; }
    inspector.classList.remove('hidden');
    if (selection.length > 1) {
      inspectorBody.innerHTML = `<div class="mep-section"><h4>Seleção</h4><p>${selection.length} itens selecionados.</p><div class="mep-action-row"><button id="mep-multi-copy">Copiar</button><button id="mep-multi-duplicate">Duplicar</button></div><div class="mep-action-row"><button id="mep-multi-delete" class="danger">Excluir</button></div></div>`;
      inspectorBody.querySelector<HTMLButtonElement>('#mep-multi-copy')!.onclick = copySelection; inspectorBody.querySelector<HTMLButtonElement>('#mep-multi-duplicate')!.onclick = duplicateSelection; inspectorBody.querySelector<HTMLButtonElement>('#mep-multi-delete')!.onclick = deleteSelection; return;
    }
    const selected = selection[0];
    if (selected.kind === 'object') { const object = mapDoc.objects.find((value) => value.id === selected.id); if (object) renderObjectInspector(object); else selection = []; }
    else { const zone = mapDoc.zones.find((value) => value.id === selected.id); if (zone) renderZoneInspector(zone); else selection = []; }
  };

  const renderSelectionBar = () => {
    const bar = root.querySelector<HTMLElement>('#mep-selection-bar')!;
    bar.classList.toggle('hidden', !selection.length);
    if (!selection.length) return;
    bar.innerHTML = `<strong>${selection.length} selecionado${selection.length === 1 ? '' : 's'}</strong><button data-sel="copy">Copiar</button><button data-sel="duplicate">Duplicar</button><button data-sel="delete" class="danger">Excluir</button>`;
    bar.querySelectorAll<HTMLButtonElement>('[data-sel]').forEach((button) => button.onclick = () => { if (button.dataset.sel === 'copy') copySelection(); if (button.dataset.sel === 'duplicate') duplicateSelection(); if (button.dataset.sel === 'delete') deleteSelection(); });
  };

  const renderContext = () => {
    if (editorMode === 'world') {
      contextBar.innerHTML = `<strong>MUNDO</strong><span style="font-size:10px;color:#7f9bab">Encoste mapas para criar passagem pela borda. Separe para remover a passagem.</span>`; return;
    }
    const zoomControl = `<div class="group desktop-soft"><button id="mep-fit">Enquadrar</button><button id="mep-zoom-out">−</button><input id="mep-zoom" type="range" min="20" max="300" value="${Math.round(zoom * 100)}"><button id="mep-zoom-in">＋</button></div>`;
    if (tool === 'select') contextBar.innerHTML = `<strong>SELECIONAR</strong><div class="group"><label>Snap<select id="mep-snap"><option value="grid">1 tile</option><option value="half">½ tile</option><option value="free">Livre</option></select></label></div><div class="group"><span style="font-size:9px;color:#7795a4">Arraste para selecionar vários • Shift adiciona</span></div><div class="mep-spacer"></div>${zoomControl}`;
    else if (layer === 'collision' || tool === 'collision') contextBar.innerHTML = `<strong>COLISÃO</strong><div class="group"><button data-context-tool="collision" class="${tool === 'collision' ? 'active' : ''}">Pintar</button><button data-context-tool="eraser" class="${tool === 'eraser' ? 'active' : ''}">Apagar</button></div><div class="group"><label>Tamanho<select id="mep-brush-size"><option>1</option><option>3</option><option>5</option><option>7</option></select></label></div><div class="mep-spacer"></div>${zoomControl}`;
    else if (entry.palette === 'terrain' || panelMode === 'terrain') contextBar.innerHTML = `<strong>TERRENO</strong><div class="group"><button data-context-tool="brush" class="${tool === 'brush' ? 'active' : ''}">Pincel</button><button data-context-tool="line" class="${tool === 'line' ? 'active' : ''}">Linha</button><button data-context-tool="rect" class="${tool === 'rect' ? 'active' : ''}">Retângulo</button><button data-context-tool="fill" class="${tool === 'fill' ? 'active' : ''}">Preencher</button><button data-context-tool="random" class="${tool === 'random' ? 'active' : ''}">Aleatório ${randomPool.size ? `(${randomPool.size})` : ''}</button><button data-context-tool="eraser" class="${tool === 'eraser' ? 'active' : ''}">Apagar</button></div><div class="group"><label>Tamanho<select id="mep-brush-size"><option>1</option><option>3</option><option>5</option><option>7</option></select></label><label>Camada<select id="mep-terrain-layer"><option value="ground">Chão</option><option value="detail">Detalhe</option></select></label></div><div class="mep-spacer"></div>${zoomControl}`;
    else if (entry.palette === 'zone' || panelMode === 'zones') contextBar.innerHTML = `<strong>ZONA</strong><div class="group"><span style="font-size:9px;color:#7b9aa9">Arraste no mapa para desenhar a área</span></div><div class="mep-spacer"></div>${zoomControl}`;
    else contextBar.innerHTML = `<strong>OBJETOS</strong><div class="group"><button data-context-tool="brush" class="${tool === 'brush' ? 'active' : ''}">Colocar</button><button data-context-tool="random" class="${tool === 'random' ? 'active' : ''}">Aleatório ${randomPool.size ? `(${randomPool.size})` : ''}</button><button data-context-tool="select">Selecionar</button></div><div class="group"><label>Snap<select id="mep-snap"><option value="grid">1 tile</option><option value="half">½ tile</option><option value="free">Livre</option></select></label></div><div class="mep-spacer"></div>${zoomControl}`;

    const brush = contextBar.querySelector<HTMLSelectElement>('#mep-brush-size'); if (brush) { brush.value = String(brushSize); brush.onchange = () => { brushSize = Number(brush.value) || 1; }; }
    const snap = contextBar.querySelector<HTMLSelectElement>('#mep-snap'); if (snap) { snap.value = snapMode; snap.onchange = () => { snapMode = snap.value as SnapMode; localStorage.setItem(SNAP_KEY, snapMode); }; }
    const terrainLayer = contextBar.querySelector<HTMLSelectElement>('#mep-terrain-layer'); if (terrainLayer) { terrainLayer.value = layer === 'detail' ? 'detail' : 'ground'; terrainLayer.onchange = () => { layer = terrainLayer.value === 'detail' ? 'detail' : 'ground'; refreshChrome(); render(); }; }
    contextBar.querySelectorAll<HTMLButtonElement>('[data-context-tool]').forEach((button) => button.onclick = () => { tool = button.dataset.contextTool as MapToolId; if (tool === 'collision') layer = 'collision'; renderContext(); refreshChrome(); render(); });
    contextBar.querySelector<HTMLButtonElement>('#mep-fit')?.addEventListener('click', fitMap);
    contextBar.querySelector<HTMLButtonElement>('#mep-zoom-in')?.addEventListener('click', () => setZoom(zoom * 1.15));
    contextBar.querySelector<HTMLButtonElement>('#mep-zoom-out')?.addEventListener('click', () => setZoom(zoom * .87));
    const zoomInput = contextBar.querySelector<HTMLInputElement>('#mep-zoom'); if (zoomInput) zoomInput.oninput = () => setZoom(Number(zoomInput.value) / 100);
  };

  const refreshRail = () => {
    root.querySelectorAll<HTMLButtonElement>('[data-rail]').forEach((button) => {
      const id = button.dataset.rail;
      const active = id === 'select' ? tool === 'select' : id === 'collision' ? layer === 'collision' : id === 'terrain' ? panelMode === 'terrain' : id === 'objects' ? panelMode === 'objects' : id === 'zones' ? panelMode === 'zones' : id === 'assets' ? panelMode === 'assets' : id === 'layers' ? rightMode === 'layers' : id === 'minimap' ? minimapVisible : id === 'pan' ? tool === 'pan' : false;
      button.classList.toggle('active', active);
    });
  };

  const refreshChrome = () => {
    root.querySelector<HTMLElement>('#mep-map-chip')!.textContent = `${mapDoc.name} • ${mapDoc.width}×${mapDoc.height}`;
    root.querySelector<HTMLElement>('#mep-count')!.textContent = `${mapDoc.objects.length} objetos • ${mapDoc.zones.length} zonas`;
    root.querySelector<HTMLElement>('#mep-tool-status')!.textContent = tool === 'brush' ? 'Pincel' : tool === 'select' ? 'Selecionar' : tool === 'collision' ? 'Colisão' : tool === 'eraser' ? 'Apagar' : tool;
    root.querySelector<HTMLElement>('#mep-layer-status')!.textContent = LAYERS.find((value) => value.id === layer)?.label ?? layer;
    const published = loadPublishedMap();
    const publishButton = root.querySelector<HTMLButtonElement>('#mep-publish')!;
    const isCurrent = Boolean(published && published.document.id === mapDoc.id && published.document.updatedAt >= mapDoc.updatedAt);
    publishButton.textContent = isCurrent ? '✓ Publicado' : 'Publicar'; publishButton.classList.toggle('active', isCurrent);
    renderSelectionBar(); refreshRail();
  };

  const renderMapSelect = () => {
    const select = root.querySelector<HTMLSelectElement>('#mep-map-select')!, documents = listMapDocuments();
    select.innerHTML = documents.map((document) => `<option value="${esc(document.id)}" ${document.id === mapDoc.id ? 'selected' : ''}>${esc(document.name)}</option>`).join('');
  };

  const renderWorldThumbnail = (canvasNode: HTMLCanvasElement, document: AscensionMapDocument) => {
    const width = 210, height = 103; canvasNode.width = width; canvasNode.height = height;
    const c = canvasNode.getContext('2d')!; c.fillStyle = document.metadata.background || '#456f42'; c.fillRect(0, 0, width, height);
    const sx = width / document.width, sy = height / document.height;
    for (const [key, tile] of Object.entries(document.tiles)) { const point = parseTileKey(key); c.fillStyle = getPaletteEntry(tile.ground ?? 'grass').color; c.fillRect(point.x * sx, point.y * sy, Math.ceil(sx), Math.ceil(sy)); }
    c.fillStyle = '#eef8ff'; document.objects.forEach((object) => c.fillRect(object.x * sx, object.y * sy, 2, 2));
  };

  const renderWorld = () => {
    const documents = listMapDocuments(); worldLayout = loadWorldLayout(documents);
    if (!documents.length) { worldCards.innerHTML = '<div class="mep-world-empty">Crie seu primeiro mapa.</div>'; worldLines.innerHTML = ''; return; }
    const nodes = worldLayout.nodes;
    const minCol = Math.min(...nodes.map((node) => node.col), 0), minRow = Math.min(...nodes.map((node) => node.row), 0);
    const maxCol = Math.max(...nodes.map((node) => node.col), 0), maxRow = Math.max(...nodes.map((node) => node.row), 0);
    const cellW = 250, cellH = 180, baseX = 40 - minCol * cellW, baseY = 40 - minRow * cellH;
    worldBoard.style.minWidth = `${Math.max(1000, (maxCol - minCol + 1) * cellW + 120)}px`; worldBoard.style.minHeight = `${Math.max(700, (maxRow - minRow + 1) * cellH + 120)}px`;
    worldCards.innerHTML = nodes.map((node) => { const document = documents.find((value) => value.id === node.mapId); if (!document) return ''; const left = baseX + node.col * cellW, top = baseY + node.row * cellH; return `<article class="mep-world-card" data-world-map="${esc(document.id)}" style="left:${left}px;top:${top}px"><canvas data-world-thumb="${esc(document.id)}"></canvas><footer><strong>${esc(document.name)}</strong><button data-world-edit="${esc(document.id)}">Editar</button></footer></article>`; }).join('');
    worldCards.querySelectorAll<HTMLCanvasElement>('[data-world-thumb]').forEach((node) => { const document = documents.find((value) => value.id === node.dataset.worldThumb); if (document) renderWorldThumbnail(node, document); });

    const lineParts: string[] = [];
    for (const link of worldLayout.links.filter((value) => value.direction === 'east' || value.direction === 'south')) {
      const a = nodes.find((node) => node.mapId === link.fromMapId), b = nodes.find((node) => node.mapId === link.toMapId); if (!a || !b) continue;
      const ax = baseX + a.col * cellW + 105, ay = baseY + a.row * cellH + 70, bx = baseX + b.col * cellW + 105, by = baseY + b.row * cellH + 70;
      lineParts.push(`<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="#56b8dc" stroke-width="4" opacity=".65"/><circle cx="${(ax + bx) / 2}" cy="${(ay + by) / 2}" r="6" fill="#8ee3ff"/>`);
    }
    worldLines.setAttribute('width', worldBoard.style.minWidth); worldLines.setAttribute('height', worldBoard.style.minHeight); worldLines.innerHTML = lineParts.join('');

    worldCards.querySelectorAll<HTMLButtonElement>('[data-world-edit]').forEach((button) => button.onclick = (event) => { event.stopPropagation(); selectMap(button.dataset.worldEdit!); setEditorMode('map'); });
    worldCards.querySelectorAll<HTMLElement>('[data-world-map]').forEach((card) => {
      card.ondblclick = () => { selectMap(card.dataset.worldMap!); setEditorMode('map'); };
      card.onpointerdown = (event) => {
        if ((event.target as HTMLElement).closest('button')) return;
        const mapId = card.dataset.worldMap!, startLeft = parseFloat(card.style.left), startTop = parseFloat(card.style.top), startX = event.clientX, startY = event.clientY;
        card.classList.add('dragging'); card.setPointerCapture(event.pointerId);
        card.onpointermove = (move) => { card.style.left = `${startLeft + move.clientX - startX}px`; card.style.top = `${startTop + move.clientY - startY}px`; };
        const finish = (up: PointerEvent) => {
          card.releasePointerCapture(up.pointerId); card.classList.remove('dragging'); card.onpointermove = null; card.onpointerup = null; card.onpointercancel = null;
          const col = Math.round((parseFloat(card.style.left) - baseX) / cellW), row = Math.round((parseFloat(card.style.top) - baseY) / cellH);
          const moved = moveWorldMap(mapId, col, row, documents);
          if (!moved.moved) showToast('Já existe um mapa nessa posição.');
          worldLayout = moved.layout; renderWorld();
        };
        card.onpointerup = finish; card.onpointercancel = finish;
      };
    });
  };

  const setEditorMode = (mode: EditorMode) => {
    if (editorMode === mode) return;
    if (dirty) save(true);
    editorMode = mode;
    root.querySelector<HTMLButtonElement>('#mep-mode-map')!.classList.toggle('active', mode === 'map'); root.querySelector<HTMLButtonElement>('#mep-mode-world')!.classList.toggle('active', mode === 'world');
    stage.classList.toggle('hidden', mode !== 'map'); worldView.classList.toggle('hidden', mode !== 'world'); panel.classList.toggle('hidden', mode !== 'map' || !panelMode); inspector.classList.toggle('hidden', mode !== 'map' || !rightMode); minimapShell.classList.toggle('hidden', mode !== 'map' || !minimapVisible);
    if (mode === 'world') { renderWorld(); } else requestAnimationFrame(fitMap);
    renderContext(); refreshChrome();
  };

  const selectMap = (id: string) => {
    const next = loadMapDocument(id); if (!next) return;
    if (dirty) save(true);
    mapDoc = next; selection = []; rightMode = null; undoStack.length = 0; redoStack.length = 0; markSaved(); renderMapSelect(); renderInspector(); refreshChrome(); publishPreview(); requestAnimationFrame(fitMap);
  };

  const openNewMap = () => {
    const modal = document.createElement('div'); modal.className = 'pro-modal-backdrop';
    modal.innerHTML = `<form class="pro-config-window" style="width:min(480px,94vw);height:auto;grid-template-rows:52px auto 54px"><header class="pro-config-head"><div><strong>Novo mapa</strong><span>Crie uma nova área do mundo</span></div><button type="button" data-close>×</button></header><div style="padding:16px"><label class="mep-field">Nome<input id="pro-new-name" value="Novo Mapa"></label><div class="mep-form-grid" style="margin-top:10px"><label>Largura<input id="pro-new-width" type="number" min="8" max="512" value="80"></label><label>Altura<input id="pro-new-height" type="number" min="8" max="512" value="60"></label></div></div><footer class="pro-config-footer"><span></span><button type="button" data-close>Cancelar</button><button class="primary" type="submit">Criar mapa</button></footer></form>`;
    document.body.appendChild(modal);
    modal.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((button) => button.onclick = () => modal.remove());
    modal.querySelector<HTMLFormElement>('form')!.onsubmit = (event) => {
      event.preventDefault(); const name = modal.querySelector<HTMLInputElement>('#pro-new-name')!.value.trim() || 'Novo Mapa';
      const width = Number(modal.querySelector<HTMLInputElement>('#pro-new-width')!.value) || 80, height = Number(modal.querySelector<HTMLInputElement>('#pro-new-height')!.value) || 60;
      const created = saveMapDocument(createBlankMap(name, width, height, 32)); modal.remove(); worldLayout = loadWorldLayout(listMapDocuments()); saveWorldLayout(worldLayout); selectMap(created.id); if (editorMode === 'world') renderWorld(); else requestAnimationFrame(fitMap);
    };
  };

  const openImportChoice = (file: File) => {
    const modal = document.createElement('div'); modal.className = 'pro-modal-backdrop';
    modal.innerHTML = `<section class="pro-config-window" style="width:min(620px,94vw);height:auto;grid-template-rows:52px auto 54px"><header class="pro-config-head"><div><strong>Importar imagem</strong><span>${esc(file.name)}</span></div><button data-close>×</button></header><div class="mep-import-choice"><button id="mep-import-manual"><strong>Recortar manualmente</strong><span>Use grade, recorte livre ou criação de animações. Melhor para spritesheets organizados.</span></button><button id="mep-import-auto"><strong>Detectar objetos</strong><span>O editor procura árvores, pedras, móveis e outros elementos separados e cria os objetos de uma vez.</span></button></div><footer class="pro-config-footer"><span>Você pode configurar colisão, luz e sombra depois.</span><button data-close>Cancelar</button></footer></section>`;
    document.body.appendChild(modal);
    const onCreated = (entries: MapPaletteEntry[]) => { void hydrateAssetLibraryV2().then(() => { renderAssets(); preloadMapAssets(entries, render); if (entries[0]) chooseEntry(entries[0]); showToast(`${entries.length} asset(s) criado(s).`); }); };
    modal.querySelector<HTMLButtonElement>('#mep-import-manual')!.onclick = () => { modal.remove(); void openMapAssetStudio(file, onCreated).catch((error) => showToast(error instanceof Error ? error.message : 'Falha ao importar.')); };
    modal.querySelector<HTMLButtonElement>('#mep-import-auto')!.onclick = () => { modal.remove(); void openAutoObjectSlicer(file, onCreated).catch((error) => showToast(error instanceof Error ? error.message : 'Falha ao detectar objetos.')); };
    modal.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((button) => button.onclick = () => modal.remove());
  };

  const runPaint = (tile: Point, initial: boolean) => {
    if (!validTile(tile.x, tile.y)) return;
    if (locked[layer]) { if (initial) showToast('Esta camada está bloqueada.'); return; }
    if (tool === 'fill') { if (!initial) return; beginMutation('Preencher terreno'); floodFill(tile.x, tile.y); finishMutation(); return; }
    beginMutation(tool === 'eraser' ? 'Apagar' : tool === 'collision' ? 'Pintar colisão' : tool === 'random' ? 'Pincel aleatório' : 'Pintar mapa');
    if (layer === 'collision' || tool === 'collision') paintCollision(tile.x, tile.y, tool === 'eraser');
    else if (tool === 'eraser') {
      if (layer === 'ground' || layer === 'detail') eraseTerrain(tile.x, tile.y);
      else if (layer === 'objects') { const hit = objectAt(tile.x + .5, tile.y + .5); if (hit) mapDoc.objects = mapDoc.objects.filter((value) => value.id !== hit.id); }
    } else if (entry.palette === 'terrain') paintTerrain(tile.x, tile.y, tool === 'random');
    else if (entry.objectKind) placeObject(snapPoint({ x: tile.x, y: tile.y }), tool === 'random' ? randomEntry() : entry);
    renderInspector(); refreshChrome(); render();
  };

  const applyShape = () => {
    if (!shape) return;
    if (entry.palette === 'zone') { placeZone(shape.start, shape.end); return; }
    const points = tool === 'line' ? bresenham(shape.start, shape.end) : rectPoints(shape.start, shape.end, entry.palette === 'terrain');
    if (entry.palette === 'terrain') points.forEach((point) => paintTerrainOne(point.x, point.y));
  };

  canvas.onpointerdown = (event) => {
    if (editorMode !== 'map') return;
    if (event.button === 1 || spaceDown || tool === 'pan') { dragMode = 'pan'; pointerStart = { x: event.clientX, y: event.clientY, cameraX, cameraY }; canvas.setPointerCapture(event.pointerId); return; }
    const tile = screenToTile(event.clientX, event.clientY), mapPoint = screenToMap(event.clientX, event.clientY); hoverMap = mapPoint;
    if (tool === 'select') {
      const hitObject = visible.objects ? objectAt(mapPoint.x, mapPoint.y) : null, hitZone = !hitObject && visible.zones ? zoneAt(mapPoint.x, mapPoint.y) : null;
      const hit: SelectionItem | null = hitObject ? { kind: 'object', id: hitObject.id } : hitZone ? { kind: 'zone', id: hitZone.id } : null;
      if (hit) {
        const exists = selectionHas(hit.kind, hit.id);
        if (event.ctrlKey || event.metaKey) selection = exists ? selection.filter((item) => !(item.kind === hit.kind && item.id === hit.id)) : [...selection, hit];
        else if (event.shiftKey) { if (!exists) selection = [...selection, hit]; }
        else if (!exists) selection = [hit];
        if (selectionHas(hit.kind, hit.id)) {
          dragMode = 'move'; dragStartMap = snapPoint(mapPoint); moveOrigins = new Map();
          selectedObjects().forEach((object) => moveOrigins.set(`object:${object.id}`, { x: object.x, y: object.y })); selectedZones().forEach((zone) => moveOrigins.set(`zone:${zone.id}`, { x: zone.x, y: zone.y }));
          beginMutation(selection.length > 1 ? 'Mover grupo' : 'Mover item'); canvas.setPointerCapture(event.pointerId);
        }
      } else {
        dragMode = 'marquee'; marquee = { start: tile, end: tile, additive: event.shiftKey, toggle: event.ctrlKey || event.metaKey };
        if (!event.shiftKey && !event.ctrlKey && !event.metaKey) selection = [];
        canvas.setPointerCapture(event.pointerId);
      }
      rightMode = selection.length ? 'selection' : null; setRightMode(rightMode); refreshChrome(); render(); return;
    }
    if (entry.palette === 'zone') { dragMode = 'shape'; shape = { start: tile, end: tile }; beginMutation('Criar zona'); canvas.setPointerCapture(event.pointerId); render(); return; }
    if ((tool === 'line' || tool === 'rect') && entry.palette === 'terrain') { dragMode = 'shape'; shape = { start: tile, end: tile }; beginMutation(tool === 'line' ? 'Desenhar linha' : 'Desenhar retângulo'); canvas.setPointerCapture(event.pointerId); render(); return; }
    dragMode = 'paint'; runPaint(tile, true); canvas.setPointerCapture(event.pointerId);
  };

  canvas.onpointermove = (event) => {
    const tile = screenToTile(event.clientX, event.clientY), mapPoint = screenToMap(event.clientX, event.clientY); hoverTile = tile; hoverMap = mapPoint;
    root.querySelector<HTMLElement>('#mep-position')!.textContent = `X ${mapPoint.x.toFixed(snapMode === 'grid' ? 0 : 1)} • Y ${mapPoint.y.toFixed(snapMode === 'grid' ? 0 : 1)}`;
    if (dragMode === 'pan') { cameraX = pointerStart.cameraX - (event.clientX - pointerStart.x) / zoom; cameraY = pointerStart.cameraY - (event.clientY - pointerStart.y) / zoom; clampCamera(); render(); return; }
    if (dragMode === 'move') {
      const current = snapPoint(mapPoint), dx = current.x - dragStartMap.x, dy = current.y - dragStartMap.y;
      selectedObjects().forEach((object) => { const origin = moveOrigins.get(`object:${object.id}`); if (origin) { object.x = clamp(origin.x + dx, 0, mapDoc.width - 1); object.y = clamp(origin.y + dy, 0, mapDoc.height - 1); } });
      selectedZones().forEach((zone) => { const origin = moveOrigins.get(`zone:${zone.id}`); if (origin) { zone.x = clamp(Math.round(origin.x + dx), 0, mapDoc.width - 1); zone.y = clamp(Math.round(origin.y + dy), 0, mapDoc.height - 1); } });
      markDirty(); schedulePreview(); renderInspector(); render(); return;
    }
    if (dragMode === 'marquee' && marquee) { marquee.end = tile; render(); return; }
    if (dragMode === 'shape' && shape) { shape.end = tile; render(); return; }
    if (dragMode === 'paint') runPaint(tile, false); else render();
  };

  const finishPointer = () => {
    if (dragMode === 'marquee' && marquee) {
      const box = normalizeBox(marquee.start, marquee.end), hits: SelectionItem[] = [];
      mapDoc.objects.forEach((object) => { if (visible.objects && intersects(objectRect(object), box)) hits.push({ kind: 'object', id: object.id }); });
      mapDoc.zones.forEach((zone) => { if (visible.zones && intersects(zone, box)) hits.push({ kind: 'zone', id: zone.id }); });
      if (marquee.toggle) for (const hit of hits) selection = selectionHas(hit.kind, hit.id) ? selection.filter((item) => !(item.kind === hit.kind && item.id === hit.id)) : [...selection, hit];
      else if (marquee.additive) for (const hit of hits) { if (!selectionHas(hit.kind, hit.id)) selection.push(hit); }
      else selection = hits;
      marquee = null; rightMode = selection.length ? 'selection' : null; setRightMode(rightMode); refreshChrome(); render();
    } else if (dragMode === 'shape') { applyShape(); shape = null; finishMutation(); }
    else if (dragMode === 'paint' || dragMode === 'move') finishMutation();
    dragMode = 'none';
  };
  canvas.onpointerup = finishPointer; canvas.onpointercancel = finishPointer;
  canvas.onpointerleave = () => { hoverTile = null; hoverMap = null; if (dragMode === 'paint') finishPointer(); else if (dragMode === 'none') render(); };
  canvas.onwheel = (event) => { event.preventDefault(); const rect = canvas.getBoundingClientRect(); setZoom(zoom * (event.deltaY < 0 ? 1.12 : .89), event.clientX - rect.left, event.clientY - rect.top); };
  canvas.oncontextmenu = (event) => event.preventDefault();

  minimap.onclick = (event) => {
    const rect = minimap.getBoundingClientRect(), x = (event.clientX - rect.left) / rect.width * mapDoc.width, y = (event.clientY - rect.top) / rect.height * mapDoc.height, view = viewSize();
    cameraX = x * mapDoc.tileSize - view.width / (2 * zoom); cameraY = y * mapDoc.tileSize - view.height / (2 * zoom); clampCamera(); render();
  };

  root.querySelectorAll<HTMLButtonElement>('[data-rail]').forEach((button) => button.onclick = () => {
    const action = button.dataset.rail;
    if (action === 'select') { tool = 'select'; layer = 'objects'; closePanel(); }
    if (action === 'terrain') { tool = 'brush'; layer = 'ground'; if (entry.palette !== 'terrain') entry = getPaletteEntry('grass'); openPanel('terrain'); }
    if (action === 'objects') { tool = 'brush'; layer = 'objects'; if (!entry.objectKind) entry = MAP_PALETTE_ENTRIES.find((value) => Boolean(value.objectKind) && value.palette !== 'zone') ?? entry; openPanel('objects'); }
    if (action === 'zones') { layer = 'zones'; tool = 'rect'; entry = MAP_PALETTE_ENTRIES.find((value) => value.palette === 'zone') ?? entry; openPanel('zones'); }
    if (action === 'collision') { layer = 'collision'; tool = 'collision'; collisionVisible = true; closePanel(); }
    if (action === 'pan') { tool = 'pan'; closePanel(); }
    if (action === 'assets') openPanel('assets');
    if (action === 'layers') setRightMode(rightMode === 'layers' ? null : 'layers');
    if (action === 'minimap') { minimapVisible = !minimapVisible; minimapShell.classList.toggle('hidden', !minimapVisible); }
    renderContext(); refreshChrome(); render();
  });

  root.querySelector<HTMLButtonElement>('#mep-panel-close')!.onclick = closePanel;
  root.querySelector<HTMLButtonElement>('#mep-inspector-close')!.onclick = () => setRightMode(null);
  root.querySelector<HTMLButtonElement>('#mep-panel-import')!.onclick = () => openFilePicker('image/png,image/webp,image/jpeg', openImportChoice);
  searchInput.oninput = () => { assetSearch = searchInput.value; renderAssets(); };

  root.querySelector<HTMLButtonElement>('#mep-mode-map')!.onclick = () => setEditorMode('map'); root.querySelector<HTMLButtonElement>('#mep-mode-world')!.onclick = () => setEditorMode('world');
  root.querySelector<HTMLButtonElement>('#mep-undo')!.onclick = undo; root.querySelector<HTMLButtonElement>('#mep-redo')!.onclick = redo;
  root.querySelector<HTMLButtonElement>('#mep-save')!.onclick = () => save(false);
  root.querySelector<HTMLButtonElement>('#mep-test')!.onclick = () => { save(true); publishPreview(); window.open(`${location.pathname}?playtest=map&id=${encodeURIComponent(mapDoc.id)}`, '_blank'); };
  root.querySelector<HTMLButtonElement>('#mep-publish')!.onclick = () => { save(true); if (!confirm(`Publicar “${mapDoc.name}” como mapa ativo do jogo?`)) return; publishMap(mapDoc); refreshChrome(); showToast('Mapa publicado no jogo.'); };
  root.querySelector<HTMLSelectElement>('#mep-map-select')!.onchange = (event) => selectMap((event.target as HTMLSelectElement).value);
  root.querySelector<HTMLButtonElement>('#mep-more')!.onclick = () => root.querySelector<HTMLElement>('#mep-more-menu')!.classList.toggle('hidden');
  root.querySelector<HTMLButtonElement>('#mep-new-map')!.onclick = openNewMap; root.querySelector<HTMLButtonElement>('#mep-world-new')!.onclick = openNewMap;
  root.querySelector<HTMLButtonElement>('#mep-import-asset')!.onclick = () => openFilePicker('image/png,image/webp,image/jpeg', openImportChoice);
  root.querySelector<HTMLButtonElement>('#mep-export-map')!.onclick = () => downloadText(`${mapDoc.id}.ascension-map.json`, JSON.stringify(mapDoc, null, 2));
  root.querySelector<HTMLButtonElement>('#mep-import-map')!.onclick = () => openFilePicker('application/json,.json', async (file) => { try { const imported = importMapDocument(await file.text()); selectMap(imported.id); showToast('Mapa importado.'); } catch (error) { showToast(error instanceof Error ? error.message : 'Mapa inválido.'); } });
  root.querySelector<HTMLButtonElement>('#mep-open-game')!.onclick = () => { if (dirty && !confirm('Existem alterações não salvas. Abrir o jogo mesmo assim?')) return; window.open(location.pathname, '_blank'); };
  root.querySelector<HTMLButtonElement>('#mep-world-organize')!.onclick = () => {
    const documents = listMapDocuments(), columns = Math.max(1, Math.ceil(Math.sqrt(documents.length)));
    worldLayout = loadWorldLayout(documents); worldLayout.nodes = documents.map((document, index) => ({ mapId: document.id, col: index % columns, row: Math.floor(index / columns) })); saveWorldLayout(worldLayout); renderWorld();
  };

  window.addEventListener('keydown', (event) => {
    const editable = (event.target as HTMLElement | null)?.matches('input,textarea,select,[contenteditable="true"]'); if (editable) return;
    const mod = event.ctrlKey || event.metaKey;
    if (event.code === 'Space') { spaceDown = true; event.preventDefault(); }
    if (mod && event.code === 'KeyS') { event.preventDefault(); save(false); return; }
    if (mod && event.code === 'KeyZ') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
    if (mod && event.code === 'KeyY') { event.preventDefault(); redo(); return; }
    if (mod && event.code === 'KeyC') { event.preventDefault(); copySelection(); return; }
    if (mod && event.code === 'KeyV') { event.preventDefault(); pasteSelection(); return; }
    if (mod && event.code === 'KeyD') { event.preventDefault(); duplicateSelection(); return; }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selection.length) { event.preventDefault(); deleteSelection(); return; }
    if (event.key === 'Escape') { selection = []; rightMode = null; marquee = null; shape = null; setRightMode(null); refreshChrome(); render(); return; }
    if (event.key.toUpperCase() === 'V') { tool = 'select'; layer = 'objects'; closePanel(); renderContext(); refreshChrome(); render(); }
    if (event.key.toUpperCase() === 'B') { tool = 'brush'; renderContext(); refreshChrome(); }
  });
  window.addEventListener('keyup', (event) => { if (event.code === 'Space') spaceDown = false; });
  window.addEventListener('blur', () => { spaceDown = false; if (dragMode !== 'none') finishPointer(); });
  window.addEventListener('pagehide', () => previewPublisher.close(), { once: true });
  window.addEventListener('ascension-asset-preset-change', () => render());

  root.addEventListener('dragover', (event) => { if ([...(event.dataTransfer?.items ?? [])].some((item) => item.kind === 'file')) event.preventDefault(); });
  root.addEventListener('drop', (event) => { const file = event.dataTransfer?.files?.[0]; if (!file || !file.type.startsWith('image/')) return; event.preventDefault(); openImportChoice(file); });

  const refreshAll = () => {
    renderMapSelect();
    if (panelMode) openPanel(panelMode); else closePanel();
    renderContext(); renderInspector(); refreshChrome(); render();
  };

  const observer = new ResizeObserver(() => { if (!initialized) { initialized = true; requestAnimationFrame(fitMap); } else render(); }); observer.observe(stage);
  preloadMapAssets(MAP_PALETTE_ENTRIES, render);
  const animationLoop = (time: number) => {
    if (MAP_PALETTE_ENTRIES.some((value) => value.sprite?.animation?.frames.length)) render(time);
    if (time - thumbnailTimer > 120) { renderAssetCanvases(); thumbnailTimer = time; }
    requestAnimationFrame(animationLoop);
  };
  refreshAll(); requestAnimationFrame(animationLoop);
}
