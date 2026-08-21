import './mapEditorV2.css';
import './mapEditorProductivity.css';
import { drawAssetThumbnail, drawObjectAsset, drawTerrainAsset, preloadMapAssets } from './mapAssetRenderer';
import { hydrateAssetLibraryV2 } from './mapAssetLibraryV2';
import { openMapAssetStudio } from './mapAssetStudio';
import { MAP_PALETTE_ENTRIES, getPaletteEntry } from './mapEditorCatalog';
import { createMapPreviewPublisher } from './mapPreviewBridge';
import { createBlankMap, importMapDocument, listMapDocuments, loadMapDocument, loadOrCreateActiveMap, saveMapDocument } from './mapEditorStorage';
import type { AscensionMapDocument, EditorSnapshot, MapAssetFolder, MapLayerId, MapObject, MapPaletteEntry, MapToolId, MapZone } from './mapEditorTypes';
import { parseTileKey, tileKey } from './mapEditorTypes';

type SelectionItem = { kind: 'object' | 'zone'; id: string };
type DragMode = 'none' | 'paint' | 'pan' | 'move' | 'marquee' | 'shape';
type Point = { x: number; y: number };
type ClipboardData = { objects: MapObject[]; zones: MapZone[] };
type FolderDef = { id: MapAssetFolder | 'all' | 'favorites'; label: string; icon: string };
type SnapMode = 'grid' | 'half' | 'free';

const FOLDERS: FolderDef[] = [
  { id: 'all', label: 'Todos', icon: '▦' }, { id: 'favorites', label: 'Favoritos', icon: '★' },
  { id: 'terrain', label: 'Terreno', icon: '▩' }, { id: 'nature', label: 'Natureza', icon: '♣' },
  { id: 'buildings', label: 'Construções', icon: '⌂' }, { id: 'walls', label: 'Paredes', icon: '▥' },
  { id: 'roofs', label: 'Telhados', icon: '⌃' }, { id: 'furniture', label: 'Móveis', icon: '▤' },
  { id: 'props', label: 'Props', icon: '◆' }, { id: 'crafting', label: 'Crafting', icon: '⚒' },
  { id: 'npc', label: 'NPCs', icon: '◇' }, { id: 'monster', label: 'Monstros', icon: '☠' },
  { id: 'resource', label: 'Recursos', icon: '⛏' }, { id: 'portal', label: 'Portais', icon: '⇄' },
  { id: 'effects', label: 'Efeitos', icon: '✦' }, { id: 'zones', label: 'Zonas', icon: '▣' },
  { id: 'raw', label: 'Outros', icon: '…' },
];

const TOOLS: Array<{ id: MapToolId; label: string; icon: string; key: string }> = [
  { id: 'select', label: 'Selecionar', icon: '⌁', key: 'V' },
  { id: 'brush', label: 'Pincel', icon: '✎', key: 'B' },
  { id: 'line', label: 'Linha', icon: '╱', key: 'L' },
  { id: 'rect', label: 'Retângulo', icon: '▭', key: 'T' },
  { id: 'random', label: 'Random', icon: '🎲', key: 'R' },
  { id: 'eraser', label: 'Apagar', icon: '⌫', key: 'E' },
  { id: 'fill', label: 'Preencher', icon: '▨', key: 'F' },
  { id: 'collision', label: 'Colisão', icon: '▧', key: 'C' },
  { id: 'pan', label: 'Mover visão', icon: '✥', key: 'H' },
];

const LAYERS: Array<{ id: MapLayerId; label: string; icon: string }> = [
  { id: 'ground', label: 'Terreno', icon: '▩' }, { id: 'detail', label: 'Detalhes', icon: '✦' },
  { id: 'objects', label: 'Objetos', icon: '◆' }, { id: 'collision', label: 'Colisão', icon: '▧' },
  { id: 'zones', label: 'Zonas', icon: '▣' },
];

const FAVORITES_KEY = 'ascension.map-editor.favorites.v2';
const RECENTS_KEY = 'ascension.map-editor.recents.v2';
const RANDOM_KEY = 'ascension.map-editor.random-pool.v1';
const SNAP_KEY = 'ascension.map-editor.snap.v1';
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);

function loadArray(key: string) {
  try { const value = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(value) ? value.map(String) : []; }
  catch { return []; }
}
function saveArray(key: string, value: string[]) { localStorage.setItem(key, JSON.stringify(value)); }
function inferFolder(entry: MapPaletteEntry): MapAssetFolder {
  if (entry.folder) return entry.folder;
  if (entry.palette === 'terrain') return 'terrain';
  if (entry.palette === 'npc') return 'npc';
  if (entry.palette === 'monster') return 'monster';
  if (entry.palette === 'resource') return 'resource';
  if (entry.palette === 'portal') return 'portal';
  if (entry.palette === 'zone') return 'zones';
  const text = `${entry.label} ${(entry.tags ?? []).join(' ')}`.toLowerCase();
  if (/árvore|arvore|arbusto|flor|nature|tree|bush|rock/.test(text)) return 'nature';
  if (/casa|house|building|porta|door/.test(text)) return 'buildings';
  if (/forja|alquimia|craft|anvil/.test(text)) return 'crafting';
  return entry.palette === 'doodad' ? 'props' : 'raw';
}
function openImagePicker(onFile: (file: File) => void) {
  const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/png,image/webp,image/jpeg';
  input.onchange = () => { const file = input.files?.[0]; if (file) onFile(file); }; input.click();
}
function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}
function bresenham(a: Point, b: Point) {
  const points: Point[] = []; let x0 = Math.round(a.x), y0 = Math.round(a.y), x1 = Math.round(b.x), y1 = Math.round(b.y);
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1; const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1; let err = dx + dy;
  while (true) { points.push({ x: x0, y: y0 }); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  return points;
}
function rectPoints(a: Point, b: Point, filled: boolean) {
  const minX = Math.min(Math.round(a.x), Math.round(b.x)), maxX = Math.max(Math.round(a.x), Math.round(b.x));
  const minY = Math.min(Math.round(a.y), Math.round(b.y)), maxY = Math.max(Math.round(a.y), Math.round(b.y));
  const points: Point[] = [];
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) if (filled || x === minX || x === maxX || y === minY || y === maxY) points.push({ x, y });
  return points;
}
function intersects(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export async function startMapEditor() {
  document.body.className = 'map-editor-v2-mode'; document.title = 'Ascension Map Editor'; await hydrateAssetLibraryV2();
  const mount = document.querySelector<HTMLElement>('#app') ?? document.body; mount.innerHTML = '';

  let mapDoc: AscensionMapDocument = loadOrCreateActiveMap();
  let tool: MapToolId = 'brush', entry = getPaletteEntry('grass'), folder: FolderDef['id'] = 'all';
  let sourceFilter: 'all' | 'ascension' | 'pixel-crawler' | 'custom' = 'all', layer: MapLayerId = 'ground';
  let brushSize = 1, zoom = .65, cameraX = 0, cameraY = 0, hoverTile: Point | null = null, hoverMap: Point | null = null;
  let dragMode: DragMode = 'none', dirty = false, actionOpen = false, lastPaintKey = '', spaceDown = false;
  let gridVisible = true, collisionVisible = false, minimapVisible = true, initialized = false;
  let pointerStart = { x: 0, y: 0, cameraX: 0, cameraY: 0 }, dragStartMap: Point = { x: 0, y: 0 };
  let marquee: { start: Point; end: Point; additive: boolean; toggle: boolean } | null = null;
  let shape: { start: Point; end: Point } | null = null;
  let selection: SelectionItem[] = [], moveOrigins = new Map<string, Point>(), clipboard: ClipboardData | null = null;
  let previewTimer = 0, thumbnailTimer = 0, autosaveTimer = 0, toastTimer = 0;
  let favorites = new Set(loadArray(FAVORITES_KEY)), recents = loadArray(RECENTS_KEY), randomPool = new Set(loadArray(RANDOM_KEY));
  let snapMode: SnapMode = (localStorage.getItem(SNAP_KEY) as SnapMode) || 'grid';
  const visible: Record<MapLayerId, boolean> = { ground: true, detail: true, objects: true, collision: true, zones: true };
  const locked: Record<MapLayerId, boolean> = { ground: false, detail: false, objects: false, collision: false, zones: false };
  const undoStack: EditorSnapshot[] = [], redoStack: EditorSnapshot[] = [];
  const previewPublisher = createMapPreviewPublisher();

  const root = document.createElement('div'); root.className = 'me2';
  root.innerHTML = `
  <header class="me2-topbar">
    <div class="me2-brand"><span class="me2-logo">A</span><div><strong>ASCENSION</strong><span>MAP EDITOR</span></div></div>
    <div class="me2-menu-group"><button id="me2-new">Novo</button><button id="me2-save" class="primary-soft" title="Ctrl+S">Salvar</button><button id="me2-import-map">Abrir JSON</button><button id="me2-export">Exportar</button></div>
    <div class="me2-map-switch"><span>Mapa</span><select id="me2-map-select"></select></div><div class="me2-spacer"></div>
    <button id="me2-asset-studio" class="asset-studio"><span>＋</span> Importar tileset / sprite</button><button id="me2-playtest" class="playtest">▶ TESTAR MAPA</button><button id="me2-game">Jogo ↗</button>
  </header>
  <div class="me2-toolstrip">
    <div class="me2-toolset"><button id="me2-undo" title="Ctrl+Z">↶</button><button id="me2-redo" title="Ctrl+Y">↷</button></div><div class="me2-toolset" id="me2-tools"></div>
    <div class="me2-toolset compact"><label>Pincel<select id="me2-brush-size"><option>1</option><option>2</option><option>3</option><option>5</option><option>7</option></select></label></div>
    <div class="me2-toolset compact"><label>Snap<select id="me2-snap"><option value="grid">1 tile</option><option value="half">½ tile</option><option value="free">Livre</option></select></label></div>
    <div class="me2-toolset compact"><button id="me2-random-pool" title="Shift+clique nos assets para montar o Random Brush">🎲 Pool 0</button><button id="me2-grid" class="active"># Grade</button><button id="me2-collision-toggle">▧ Colisão</button></div>
    <div class="me2-spacer"></div><button id="me2-fit">Enquadrar</button><div class="me2-zoom"><button id="me2-zoom-out">−</button><input id="me2-zoom-slider" type="range" min="20" max="250" value="65"><button id="me2-zoom-in">＋</button><span id="me2-zoom-label">65%</span></div>
  </div>
  <div class="me2-workspace">
    <aside class="me2-assets-panel"><div class="me2-assets-head"><div><strong>ASSETS</strong><span id="me2-assets-count"></span></div><button id="me2-collapse-assets">‹</button></div>
      <div class="me2-search"><span>⌕</span><input id="me2-search" placeholder="Buscar árvore, parede, NPC..." autocomplete="off"></div>
      <div class="me2-source-filter"><button data-source="all" class="active">Todos</button><button data-source="pixel-crawler">Pixel Crawler</button><button data-source="custom">Meus</button></div>
      <div class="me2-assets-body"><nav class="me2-folders" id="me2-folders"></nav><section class="me2-browser"><div class="me2-browser-title"><strong id="me2-folder-title">Todos</strong><span>clique • Shift+clique = Random</span></div><div class="me2-recents" id="me2-recents"></div><div class="me2-asset-grid" id="me2-asset-grid"></div></section></div>
      <div class="me2-drop-zone"><b>＋</b><span>Arraste PNG / spritesheet aqui</span></div>
    </aside>
    <main class="me2-stage-wrap"><div class="me2-stage-tabs"><button class="active">${esc(mapDoc.name)}</button><span>● DRAFT</span><span class="live">● PLAYTEST LIVE</span></div>
      <div class="me2-stage" id="me2-stage"><canvas id="me2-canvas"></canvas><div class="me2-stage-chips"><span id="me2-map-chip"></span><span id="me2-hover-chip"></span></div>
        <div id="me2-selection-bar" class="me2-selection-bar hidden"><strong id="me2-selection-count"></strong><button data-selection-action="copy">Copiar</button><button data-selection-action="duplicate">Duplicar</button><button data-selection-action="left">Alinhar X</button><button data-selection-action="top">Alinhar Y</button><button class="danger" data-selection-action="delete">Excluir</button></div>
        <div class="me2-drag-overlay"><strong>Solte para importar no Asset Studio</strong><span>PNG • WebP • spritesheet • tileset</span></div><div class="me2-toast" id="me2-toast"></div>
      </div></main>
    <aside class="me2-right-panel"><div class="me2-right-tabs"><button data-right-tab="layers" class="active">LAYERS</button><button data-right-tab="inspector">PROPRIEDADES</button></div>
      <div class="me2-right-content" id="me2-right-layers"><div class="me2-section-head"><strong>LAYERS DO MAPA</strong><span>olho • cadeado</span></div><div class="me2-layers" id="me2-layers"></div><div class="me2-section-head"><strong>MINIMAPA</strong><button id="me2-minimap-toggle">ocultar</button></div><div class="me2-minimap-shell" id="me2-minimap-shell"><canvas id="me2-minimap"></canvas></div><div class="me2-section-head"><strong>ATALHOS</strong></div><div class="me2-shortcuts"><span><kbd>V</kbd> selecionar</span><span><kbd>Shift</kbd> adicionar</span><span><kbd>Ctrl C/V</kbd> copiar/colar</span><span><kbd>Ctrl D</kbd> duplicar</span><span><kbd>L</kbd> linha</span><span><kbd>T</kbd> retângulo</span><span><kbd>R</kbd> random</span><span><kbd>Del</kbd> excluir</span></div></div>
      <div class="me2-right-content hidden" id="me2-right-inspector"><div id="me2-inspector"></div></div>
    </aside>
  </div>
  <footer class="me2-statusbar"><span id="me2-status-pos">X 0 • Y 0</span><span id="me2-status-tool">Pincel</span><span id="me2-status-layer">Terreno</span><span class="me2-spacer"></span><span id="me2-count"></span><span id="me2-save-state" class="saved">● Salvo</span></footer>
  <input id="me2-map-file" type="file" accept="application/json,.json" hidden>`;
  mount.appendChild(root);

  const stage = root.querySelector<HTMLElement>('#me2-stage')!, canvas = root.querySelector<HTMLCanvasElement>('#me2-canvas')!, ctx = canvas.getContext('2d')!;
  const minimap = root.querySelector<HTMLCanvasElement>('#me2-minimap')!, minimapCtx = minimap.getContext('2d')!;
  const assetGrid = root.querySelector<HTMLElement>('#me2-asset-grid')!, folderNode = root.querySelector<HTMLElement>('#me2-folders')!, searchInput = root.querySelector<HTMLInputElement>('#me2-search')!;
  const inspector = root.querySelector<HTMLElement>('#me2-inspector')!, layersNode = root.querySelector<HTMLElement>('#me2-layers')!, toast = root.querySelector<HTMLElement>('#me2-toast')!, mapFile = root.querySelector<HTMLInputElement>('#me2-map-file')!;

  const showToast = (text: string) => { toast.textContent = text; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2200); };
  const markDirty = () => { dirty = true; const node = root.querySelector<HTMLElement>('#me2-save-state')!; node.className = 'dirty'; node.textContent = '● Alterado'; clearTimeout(autosaveTimer); autosaveTimer = window.setTimeout(() => save(true), 1400); };
  const markSaved = (auto = false) => { dirty = false; const node = root.querySelector<HTMLElement>('#me2-save-state')!; node.className = 'saved'; node.textContent = auto ? '● Autosave' : '● Salvo'; };
  const publishPreview = () => previewPublisher.publish(clone(mapDoc));
  const schedulePreview = () => { clearTimeout(previewTimer); previewTimer = window.setTimeout(publishPreview, 45); };
  const beginMutation = (label: string) => { if (actionOpen) return; undoStack.push({ document: clone(mapDoc), label }); if (undoStack.length > 100) undoStack.shift(); redoStack.length = 0; actionOpen = true; };
  const finishMutation = () => { if (actionOpen) { mapDoc.updatedAt = Date.now(); markDirty(); schedulePreview(); } actionOpen = false; lastPaintKey = ''; refreshChrome(); refreshInspector(); render(); };
  const save = (auto = false) => { mapDoc = saveMapDocument(mapDoc); markSaved(auto); refreshMapSelect(); publishPreview(); if (!auto) showToast('Mapa salvo.'); };
  const restore = (snapshot: EditorSnapshot, destination: EditorSnapshot[]) => { destination.push({ document: clone(mapDoc), label: snapshot.label }); mapDoc = clone(snapshot.document); selection = []; markDirty(); schedulePreview(); refreshAll(); };
  const undo = () => { const item = undoStack.pop(); if (item) restore(item, redoStack); }, redo = () => { const item = redoStack.pop(); if (item) restore(item, undoStack); };

  const validTile = (x: number, y: number) => x >= 0 && y >= 0 && x < mapDoc.width && y < mapDoc.height;
  const viewSize = () => ({ width: canvas.clientWidth, height: canvas.clientHeight });
  const clampCamera = () => { const view = viewSize(); cameraX = clamp(cameraX, -100 / zoom, Math.max(0, mapDoc.width * mapDoc.tileSize - view.width / zoom) + 100 / zoom); cameraY = clamp(cameraY, -100 / zoom, Math.max(0, mapDoc.height * mapDoc.tileSize - view.height / zoom) + 100 / zoom); };
  const screenToMap = (clientX: number, clientY: number) => { const rect = canvas.getBoundingClientRect(); return { x: ((clientX - rect.left) / zoom + cameraX) / mapDoc.tileSize, y: ((clientY - rect.top) / zoom + cameraY) / mapDoc.tileSize }; };
  const screenToTile = (clientX: number, clientY: number) => { const p = screenToMap(clientX, clientY); return { x: Math.floor(p.x), y: Math.floor(p.y) }; };
  const snapPoint = (p: Point) => snapMode === 'grid' ? { x: Math.floor(p.x), y: Math.floor(p.y) } : snapMode === 'half' ? { x: Math.round(p.x * 2) / 2, y: Math.round(p.y * 2) / 2 } : { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
  const setZoom = (next: number, sx?: number, sy?: number) => { const old = zoom, view = viewSize(), px = sx ?? view.width / 2, py = sy ?? view.height / 2; const wx = px / old + cameraX, wy = py / old + cameraY; zoom = clamp(next, .2, 2.5); cameraX = wx - px / zoom; cameraY = wy - py / zoom; clampCamera(); refreshChrome(); render(); };
  const fitMap = () => { const view = viewSize(); zoom = clamp(Math.min(view.width / (mapDoc.width * mapDoc.tileSize), view.height / (mapDoc.height * mapDoc.tileSize)) * .9, .2, 2.5); cameraX = mapDoc.width * mapDoc.tileSize / 2 - view.width / (2 * zoom); cameraY = mapDoc.height * mapDoc.tileSize / 2 - view.height / (2 * zoom); clampCamera(); refreshChrome(); render(); };

  const selectionHas = (kind: SelectionItem['kind'], id: string) => selection.some((item) => item.kind === kind && item.id === id);
  const objectRect = (object: MapObject) => { const fp = getPaletteEntry(object.assetId).footprint; const w = fp?.width ?? object.width ?? 1, h = fp?.height ?? object.height ?? 1; return { x: object.x - Math.floor(w / 2), y: object.y - h + 1, width: w, height: h }; };
  const objectAt = (x: number, y: number) => [...mapDoc.objects].reverse().find((object) => { const r = objectRect(object); return x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height; }) ?? null;
  const zoneAt = (x: number, y: number) => [...mapDoc.zones].reverse().find((zone) => x >= zone.x && y >= zone.y && x < zone.x + zone.width && y < zone.y + zone.height) ?? null;
  const selectedObjects = () => mapDoc.objects.filter((object) => selectionHas('object', object.id));
  const selectedZones = () => mapDoc.zones.filter((zone) => selectionHas('zone', zone.id));
  const normalizeBox = (a: Point, b: Point) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x) + 1, height: Math.abs(b.y - a.y) + 1 });

  const chooseEntry = (next: MapPaletteEntry) => { entry = next; layer = next.defaultLayer; tool = 'brush'; recents = [next.id, ...recents.filter((id) => id !== next.id)].slice(0, 8); saveArray(RECENTS_KEY, recents); renderAssets(); renderRecents(); renderLayers(); refreshInspector(); refreshChrome(); render(); };
  const toggleFavorite = (id: string) => { favorites.has(id) ? favorites.delete(id) : favorites.add(id); saveArray(FAVORITES_KEY, [...favorites]); renderAssets(); };
  const toggleRandom = (id: string) => { randomPool.has(id) ? randomPool.delete(id) : randomPool.add(id); saveArray(RANDOM_KEY, [...randomPool]); refreshChrome(); renderAssets(); showToast(randomPool.size ? `Random Brush: ${randomPool.size} assets.` : 'Random Brush limpo.'); };
  const randomCandidates = () => { const explicit = [...randomPool].map((id) => MAP_PALETTE_ENTRIES.find((value) => value.id === id)).filter((value): value is MapPaletteEntry => Boolean(value)); if (explicit.length) return explicit; const f = inferFolder(entry); return MAP_PALETTE_ENTRIES.filter((value) => inferFolder(value) === f && value.palette === entry.palette && value.objectKind === entry.objectKind); };
  const randomEntry = () => { const pool = randomCandidates(); return pool.length ? pool[Math.floor(Math.random() * pool.length)] : entry; };

  const paintTerrainOne = (x: number, y: number, selectedEntry = entry) => { if (!validTile(x, y)) return; const key = tileKey(x, y), value = mapDoc.tiles[key] ?? {}; if (layer === 'detail') value.detail = selectedEntry.id; else value.ground = selectedEntry.id; mapDoc.tiles[key] = value; };
  const paintTerrain = (x: number, y: number, random = false) => { for (let oy = 0; oy < brushSize; oy++) for (let ox = 0; ox < brushSize; ox++) paintTerrainOne(x + ox - Math.floor(brushSize / 2), y + oy - Math.floor(brushSize / 2), random ? randomEntry() : entry); };
  const placeObject = (p: Point, selectedEntry = entry) => { if (!selectedEntry.objectKind || !validTile(Math.floor(p.x), Math.floor(p.y))) return; const key = `${selectedEntry.id}:${p.x},${p.y}`; if (lastPaintKey === key) return; lastPaintKey = key; const fp = selectedEntry.footprint; const object: MapObject = { id: uid('object'), kind: selectedEntry.objectKind, assetId: selectedEntry.id, x: p.x, y: p.y, width: fp?.width ?? 1, height: fp?.height ?? 1, scale: 1, rotation: 0, properties: {} }; mapDoc.objects.push(object); selection = [{ kind: 'object', id: object.id }]; };
  const placeZone = (a: Point, b?: Point) => { if (!entry.zoneKind) return; const box = b ? normalizeBox(a, b) : { x: Math.round(a.x), y: Math.round(a.y), width: Math.max(1, brushSize), height: Math.max(1, brushSize) }; const zone: MapZone = { id: uid('zone'), kind: entry.zoneKind, x: clamp(Math.round(box.x), 0, mapDoc.width - 1), y: clamp(Math.round(box.y), 0, mapDoc.height - 1), width: Math.max(1, Math.round(box.width)), height: Math.max(1, Math.round(box.height)), name: entry.label, properties: {} }; mapDoc.zones.push(zone); selection = [{ kind: 'zone', id: zone.id }]; };
  const paintCollision = (x: number, y: number) => { for (let oy = 0; oy < brushSize; oy++) for (let ox = 0; ox < brushSize; ox++) { const tx = x + ox - Math.floor(brushSize / 2), ty = y + oy - Math.floor(brushSize / 2); if (validTile(tx, ty) && !mapDoc.collision.includes(tileKey(tx, ty))) mapDoc.collision.push(tileKey(tx, ty)); } };
  const erase = (x: number, y: number) => { if (layer === 'objects') { const object = objectAt(x, y); if (object) mapDoc.objects = mapDoc.objects.filter((value) => value.id !== object.id); } else if (layer === 'zones') { const zone = zoneAt(x, y); if (zone) mapDoc.zones = mapDoc.zones.filter((value) => value.id !== zone.id); } else if (layer === 'collision') mapDoc.collision = mapDoc.collision.filter((value) => value !== tileKey(x, y)); else { const tile = mapDoc.tiles[tileKey(x, y)] ?? {}; if (layer === 'detail') delete tile.detail; else tile.ground = 'grass'; mapDoc.tiles[tileKey(x, y)] = tile; } };
  const floodFill = (x: number, y: number) => { if (entry.palette !== 'terrain' || !validTile(x, y)) return; const detail = layer === 'detail', start = mapDoc.tiles[tileKey(x, y)] ?? {}, target = detail ? start.detail : (start.ground ?? 'grass'); if (target === entry.id) return; const queue = [{ x, y }], seen = new Set<string>(); while (queue.length) { const point = queue.shift()!; if (!validTile(point.x, point.y)) continue; const key = tileKey(point.x, point.y); if (seen.has(key)) continue; seen.add(key); const value = mapDoc.tiles[key] ?? {}; if ((detail ? value.detail : (value.ground ?? 'grass')) !== target) continue; if (detail) value.detail = entry.id; else value.ground = entry.id; mapDoc.tiles[key] = value; queue.push({ x: point.x + 1, y: point.y }, { x: point.x - 1, y: point.y }, { x: point.x, y: point.y + 1 }, { x: point.x, y: point.y - 1 }); } };

  const paintAt = (tile: Point, random = false) => { if (entry.palette === 'terrain') paintTerrain(tile.x, tile.y, random); else if (entry.palette === 'zone') placeZone(tile); else placeObject(snapPoint({ x: tile.x, y: tile.y }), random ? randomEntry() : entry); };
  const applyShape = () => { if (!shape) return; const a = shape.start, b = shape.end; if (entry.palette === 'zone' && tool === 'rect') { placeZone(a, b); return; } const points = tool === 'line' ? bresenham(a, b) : rectPoints(a, b, entry.palette === 'terrain'); for (const p of points) paintAt(p); };
  const usePaintTool = (tile: Point, initial: boolean) => { if (!validTile(tile.x, tile.y)) return; if (locked[layer]) { if (initial) showToast('Esta layer está bloqueada.'); return; } if (tool === 'fill') { if (initial) { beginMutation('Preencher terreno'); floodFill(tile.x, tile.y); finishMutation(); } return; } beginMutation(tool === 'eraser' ? 'Apagar' : tool === 'collision' ? 'Colisão' : tool === 'random' ? 'Random Brush' : 'Pintar mapa'); if (tool === 'eraser') erase(tile.x, tile.y); else if (tool === 'collision') paintCollision(tile.x, tile.y); else paintAt(tile, tool === 'random'); refreshInspector(); render(); };

  const deleteSelection = () => { if (!selection.length) return; beginMutation(selection.length > 1 ? 'Excluir seleção' : 'Excluir'); const objectIds = new Set(selection.filter((item) => item.kind === 'object').map((item) => item.id)), zoneIds = new Set(selection.filter((item) => item.kind === 'zone').map((item) => item.id)); mapDoc.objects = mapDoc.objects.filter((value) => !objectIds.has(value.id)); mapDoc.zones = mapDoc.zones.filter((value) => !zoneIds.has(value.id)); selection = []; finishMutation(); };
  const copySelection = () => { const objects = selectedObjects().map(clone), zones = selectedZones().map(clone); if (!objects.length && !zones.length) return; clipboard = { objects, zones }; showToast(`${objects.length + zones.length} item(ns) copiados.`); };
  const pasteSelection = (offset?: Point) => { if (!clipboard) return; const all = [...clipboard.objects.map((value) => ({ x: value.x, y: value.y })), ...clipboard.zones.map((value) => ({ x: value.x, y: value.y }))]; if (!all.length) return; const anchor = { x: Math.min(...all.map((p) => p.x)), y: Math.min(...all.map((p) => p.y)) }; const target = offset ?? (hoverMap ? snapPoint(hoverMap) : { x: anchor.x + 1, y: anchor.y + 1 }); const dx = target.x - anchor.x, dy = target.y - anchor.y; beginMutation('Colar seleção'); const next: SelectionItem[] = []; for (const source of clipboard.objects) { const value = clone(source); value.id = uid('object'); value.x = clamp(value.x + dx, 0, mapDoc.width - 1); value.y = clamp(value.y + dy, 0, mapDoc.height - 1); mapDoc.objects.push(value); next.push({ kind: 'object', id: value.id }); } for (const source of clipboard.zones) { const value = clone(source); value.id = uid('zone'); value.x = clamp(Math.round(value.x + dx), 0, mapDoc.width - 1); value.y = clamp(Math.round(value.y + dy), 0, mapDoc.height - 1); mapDoc.zones.push(value); next.push({ kind: 'zone', id: value.id }); } selection = next; finishMutation(); };
  const duplicateSelection = () => { copySelection(); if (clipboard) pasteSelection({ x: Math.min(...[...clipboard.objects.map((v) => v.x), ...clipboard.zones.map((v) => v.x)]) + 1, y: Math.min(...[...clipboard.objects.map((v) => v.y), ...clipboard.zones.map((v) => v.y)]) + 1 }); };
  const alignSelection = (axis: 'x' | 'y') => { const objects = selectedObjects(), zones = selectedZones(), points = [...objects, ...zones]; if (points.length < 2) return; const value = Math.min(...points.map((item) => item[axis])); beginMutation('Alinhar seleção'); objects.forEach((item) => { item[axis] = value; }); zones.forEach((item) => { item[axis] = Math.round(value); }); finishMutation(); };
  const nudgeSelection = (dx: number, dy: number) => { if (!selection.length) return; beginMutation('Mover seleção'); const step = snapMode === 'half' ? .5 : snapMode === 'free' ? .1 : 1; selectedObjects().forEach((item) => { item.x = clamp(item.x + dx * step, 0, mapDoc.width - 1); item.y = clamp(item.y + dy * step, 0, mapDoc.height - 1); }); selectedZones().forEach((item) => { item.x = clamp(item.x + Math.sign(dx), 0, mapDoc.width - 1); item.y = clamp(item.y + Math.sign(dy), 0, mapDoc.height - 1); }); finishMutation(); };

  const renderMinimap = () => { if (!minimapVisible) return; const shell = minimap.parentElement!, rect = shell.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); minimap.width = Math.max(1, Math.floor(rect.width * dpr)); minimap.height = Math.max(1, Math.floor(rect.height * dpr)); minimap.style.width = `${rect.width}px`; minimap.style.height = `${rect.height}px`; minimapCtx.setTransform(dpr, 0, 0, dpr, 0, 0); minimapCtx.clearRect(0, 0, rect.width, rect.height); const sx = rect.width / mapDoc.width, sy = rect.height / mapDoc.height; minimapCtx.fillStyle = mapDoc.metadata.background || '#3f6b3b'; minimapCtx.fillRect(0, 0, rect.width, rect.height); for (const [key, value] of Object.entries(mapDoc.tiles)) { const p = parseTileKey(key), asset = getPaletteEntry(value.ground ?? 'grass'); minimapCtx.fillStyle = asset.color; minimapCtx.fillRect(p.x * sx, p.y * sy, Math.ceil(sx), Math.ceil(sy)); } minimapCtx.fillStyle = '#e6f5ff'; mapDoc.objects.forEach((object) => minimapCtx.fillRect(object.x * sx - 1, object.y * sy - 1, 3, 3)); const view = viewSize(); minimapCtx.strokeStyle = '#7fd7ff'; minimapCtx.lineWidth = 1.5; minimapCtx.strokeRect(cameraX / mapDoc.tileSize * sx, cameraY / mapDoc.tileSize * sy, view.width / zoom / mapDoc.tileSize * sx, view.height / zoom / mapDoc.tileSize * sy); };

  const render = (now = performance.now()) => {
    const rect = stage.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1), targetW = Math.max(1, Math.floor(rect.width * dpr)), targetH = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) { canvas.width = targetW; canvas.height = targetH; canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, rect.width, rect.height); ctx.fillStyle = '#080c10'; ctx.fillRect(0, 0, rect.width, rect.height);
    const tilePx = mapDoc.tileSize * zoom, startX = clamp(Math.floor(cameraX / mapDoc.tileSize) - 2, 0, mapDoc.width - 1), startY = clamp(Math.floor(cameraY / mapDoc.tileSize) - 2, 0, mapDoc.height - 1), endX = clamp(Math.ceil((cameraX + rect.width / zoom) / mapDoc.tileSize) + 2, 0, mapDoc.width - 1), endY = clamp(Math.ceil((cameraY + rect.height / zoom) / mapDoc.tileSize) + 2, 0, mapDoc.height - 1);
    if (visible.ground) for (let y = startY; y <= endY; y++) for (let x = startX; x <= endX; x++) { const value = mapDoc.tiles[tileKey(x, y)] ?? { ground: 'grass' }, sx = (x * mapDoc.tileSize - cameraX) * zoom, sy = (y * mapDoc.tileSize - cameraY) * zoom; drawTerrainAsset(ctx, getPaletteEntry(value.ground ?? 'grass'), sx, sy, tilePx, 1, () => render(), now); if (visible.detail && value.detail) drawTerrainAsset(ctx, getPaletteEntry(value.detail), sx, sy, tilePx, .92, () => render(), now); }
    if (visible.zones) for (const zone of mapDoc.zones) { const sx = (zone.x * mapDoc.tileSize - cameraX) * zoom, sy = (zone.y * mapDoc.tileSize - cameraY) * zoom, selected = selectionHas('zone', zone.id); ctx.fillStyle = zone.kind === 'safe' ? 'rgba(72,207,122,.11)' : zone.kind === 'pvp' ? 'rgba(222,76,76,.12)' : 'rgba(91,157,213,.1)'; ctx.strokeStyle = selected ? '#dff8ff' : zone.kind === 'safe' ? 'rgba(103,232,147,.65)' : 'rgba(116,184,235,.65)'; ctx.lineWidth = selected ? 2.5 : 1; ctx.fillRect(sx, sy, zone.width * tilePx, zone.height * tilePx); ctx.strokeRect(sx, sy, zone.width * tilePx, zone.height * tilePx); }
    if (visible.objects) for (const object of [...mapDoc.objects].sort((a, b) => a.y - b.y)) drawObjectAsset(ctx, getPaletteEntry(object.assetId), { x: ((object.x + .5) * mapDoc.tileSize - cameraX) * zoom, y: ((object.y + 1) * mapDoc.tileSize - cameraY) * zoom, tilePixels: tilePx, scale: object.scale ?? 1, selected: selectionHas('object', object.id), onReady: () => render(), now });
    if (collisionVisible || (visible.collision && layer === 'collision')) { ctx.fillStyle = 'rgba(239,73,73,.3)'; mapDoc.collision.forEach((key) => { const p = parseTileKey(key); ctx.fillRect((p.x * mapDoc.tileSize - cameraX) * zoom, (p.y * mapDoc.tileSize - cameraY) * zoom, tilePx, tilePx); }); }
    if (gridVisible && tilePx >= 10) { ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,.075)'; ctx.lineWidth = 1; for (let x = startX; x <= endX + 1; x++) { const sx = (x * mapDoc.tileSize - cameraX) * zoom; ctx.moveTo(sx, 0); ctx.lineTo(sx, rect.height); } for (let y = startY; y <= endY + 1; y++) { const sy = (y * mapDoc.tileSize - cameraY) * zoom; ctx.moveTo(0, sy); ctx.lineTo(rect.width, sy); } ctx.stroke(); }
    if (marquee) { const box = normalizeBox(marquee.start, marquee.end), sx = (box.x * mapDoc.tileSize - cameraX) * zoom, sy = (box.y * mapDoc.tileSize - cameraY) * zoom; ctx.fillStyle = 'rgba(89,190,240,.13)'; ctx.strokeStyle = '#78d5ff'; ctx.setLineDash([6, 4]); ctx.fillRect(sx, sy, box.width * tilePx, box.height * tilePx); ctx.strokeRect(sx, sy, box.width * tilePx, box.height * tilePx); ctx.setLineDash([]); }
    if (shape) { const points = tool === 'line' ? bresenham(shape.start, shape.end) : rectPoints(shape.start, shape.end, entry.palette === 'terrain'); ctx.fillStyle = 'rgba(115,216,255,.22)'; ctx.strokeStyle = '#85ddff'; for (const p of points) { const sx = (p.x * mapDoc.tileSize - cameraX) * zoom, sy = (p.y * mapDoc.tileSize - cameraY) * zoom; ctx.fillRect(sx, sy, tilePx, tilePx); ctx.strokeRect(sx, sy, tilePx, tilePx); } }
    if (hoverTile && (tool === 'brush' || tool === 'random') && validTile(hoverTile.x, hoverTile.y) && !locked[layer]) { const sx = (hoverTile.x * mapDoc.tileSize - cameraX) * zoom, sy = (hoverTile.y * mapDoc.tileSize - cameraY) * zoom; if (entry.palette === 'terrain') { ctx.fillStyle = 'rgba(143,220,255,.18)'; ctx.strokeStyle = '#8ddcff'; ctx.fillRect(sx, sy, tilePx * brushSize, tilePx * brushSize); ctx.strokeRect(sx, sy, tilePx * brushSize, tilePx * brushSize); } else if (entry.palette !== 'zone') { const p = hoverMap ? snapPoint(hoverMap) : hoverTile; drawObjectAsset(ctx, tool === 'random' ? randomEntry() : entry, { x: ((p.x + .5) * mapDoc.tileSize - cameraX) * zoom, y: ((p.y + 1) * mapDoc.tileSize - cameraY) * zoom, tilePixels: tilePx, alpha: .55, now }); } }
    renderMinimap();
  };

  const renderFolders = () => { const counts = new Map<string, number>(); MAP_PALETTE_ENTRIES.forEach((value) => counts.set(inferFolder(value), (counts.get(inferFolder(value)) ?? 0) + 1)); folderNode.innerHTML = FOLDERS.map((value) => `<button data-folder="${value.id}" class="${folder === value.id ? 'active' : ''}"><span class="icon">${value.icon}</span><span>${value.label}</span><small>${value.id === 'all' ? MAP_PALETTE_ENTRIES.length : value.id === 'favorites' ? favorites.size : counts.get(value.id) ?? 0}</small></button>`).join(''); folderNode.querySelectorAll<HTMLButtonElement>('[data-folder]').forEach((button) => button.onclick = () => { folder = button.dataset.folder as FolderDef['id']; renderFolders(); renderAssets(); }); };
  const assetMatches = (value: MapPaletteEntry) => { if (folder === 'favorites' && !favorites.has(value.id)) return false; if (folder !== 'all' && folder !== 'favorites' && inferFolder(value) !== folder) return false; if (sourceFilter !== 'all' && value.source !== sourceFilter) return false; const query = searchInput.value.trim().toLocaleLowerCase('pt-BR'); return !query || `${value.label} ${value.description} ${(value.tags ?? []).join(' ')}`.toLocaleLowerCase('pt-BR').includes(query); };
  const renderAssetCanvases = () => { const now = performance.now(); root.querySelectorAll<HTMLCanvasElement>('.me2-asset-thumb canvas,.me2-recent canvas').forEach((node) => { const id = node.dataset.asset, value = id ? MAP_PALETTE_ENTRIES.find((asset) => asset.id === id) : null; if (value) drawAssetThumbnail(node, value, now); }); };
  const renderAssets = () => { const values = MAP_PALETTE_ENTRIES.filter(assetMatches); root.querySelector<HTMLElement>('#me2-assets-count')!.textContent = `${values.length} itens`; root.querySelector<HTMLElement>('#me2-folder-title')!.textContent = FOLDERS.find((value) => value.id === folder)?.label ?? 'Assets'; assetGrid.innerHTML = values.length ? values.map((value) => `<article class="me2-asset-card ${entry.id === value.id ? 'active' : ''} ${randomPool.has(value.id) ? 'random-selected' : ''}" data-asset-card="${value.id}" title="${esc(value.description)}"><button class="star ${favorites.has(value.id) ? 'on' : ''}" data-favorite="${value.id}">★</button>${randomPool.has(value.id) ? '<span class="random-mark">🎲</span>' : ''}<div class="me2-asset-thumb"><canvas data-asset="${value.id}"></canvas>${value.sprite?.animation?.frames.length ? '<span class="animated">▶</span>' : ''}</div><strong>${esc(value.label)}</strong><small>${esc(value.source === 'pixel-crawler' ? 'Pixel Crawler' : value.source === 'custom' ? 'Meus assets' : inferFolder(value))}</small></article>`).join('') : '<div class="me2-empty"><b>Nenhum asset encontrado</b><span>Arraste um PNG aqui ou limpe os filtros.</span></div>'; assetGrid.querySelectorAll<HTMLElement>('[data-asset-card]').forEach((card) => { const value = MAP_PALETTE_ENTRIES.find((asset) => asset.id === card.dataset.assetCard); if (!value) return; card.onclick = (event) => { if ((event.target as HTMLElement).closest('button')) return; if ((event as MouseEvent).shiftKey) { toggleRandom(value.id); return; } chooseEntry(value); }; card.draggable = value.palette !== 'zone'; card.ondragstart = (event) => { event.dataTransfer?.setData('application/x-ascension-asset', value.id); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'; chooseEntry(value); }; const star = card.querySelector<HTMLButtonElement>('[data-favorite]'); if (star) star.onclick = (event) => { event.stopPropagation(); toggleFavorite(value.id); }; }); renderAssetCanvases(); };
  const renderRecents = () => { const node = root.querySelector<HTMLElement>('#me2-recents')!, values = recents.map((id) => MAP_PALETTE_ENTRIES.find((value) => value.id === id)).filter((value): value is MapPaletteEntry => Boolean(value)).slice(0, 6); node.innerHTML = values.length ? `<div class="me2-recents-title">Recentes</div><div class="me2-recents-row">${values.map((value) => `<button class="me2-recent" data-recent="${value.id}" title="${esc(value.label)}"><canvas data-asset="${value.id}"></canvas></button>`).join('')}</div>` : ''; node.querySelectorAll<HTMLButtonElement>('[data-recent]').forEach((button) => button.onclick = () => { const value = MAP_PALETTE_ENTRIES.find((asset) => asset.id === button.dataset.recent); if (value) chooseEntry(value); }); renderAssetCanvases(); };
  const renderLayers = () => { layersNode.innerHTML = LAYERS.map((value) => `<div class="me2-layer ${layer === value.id ? 'active' : ''}" data-layer="${value.id}"><button data-eye="${value.id}">${visible[value.id] ? '◉' : '○'}</button><span>${value.icon} ${value.label}</span><button data-lock="${value.id}">${locked[value.id] ? '🔒' : '○'}</button></div>`).join(''); layersNode.querySelectorAll<HTMLElement>('[data-layer]').forEach((node) => node.onclick = () => { layer = node.dataset.layer as MapLayerId; renderLayers(); refreshChrome(); render(); }); layersNode.querySelectorAll<HTMLButtonElement>('[data-eye]').forEach((button) => button.onclick = (event) => { event.stopPropagation(); const id = button.dataset.eye as MapLayerId; visible[id] = !visible[id]; renderLayers(); render(); }); layersNode.querySelectorAll<HTMLButtonElement>('[data-lock]').forEach((button) => button.onclick = (event) => { event.stopPropagation(); const id = button.dataset.lock as MapLayerId; locked[id] = !locked[id]; renderLayers(); }); };

  const switchRightTab = (tab: 'layers' | 'inspector') => { root.querySelectorAll<HTMLButtonElement>('[data-right-tab]').forEach((button) => button.classList.toggle('active', button.dataset.rightTab === tab)); root.querySelector<HTMLElement>('#me2-right-layers')!.classList.toggle('hidden', tab !== 'layers'); root.querySelector<HTMLElement>('#me2-right-inspector')!.classList.toggle('hidden', tab !== 'inspector'); if (tab === 'inspector') refreshInspector(); };
  const refreshInspector = () => {
    if (selection.length > 1) { inspector.innerHTML = `<div class="me2-multi-inspector"><div class="multi-icon">⌗</div><strong>${selection.length} itens selecionados</strong><span>${selectedObjects().length} objetos • ${selectedZones().length} zonas</span><div class="multi-actions"><button data-mi="copy">Copiar</button><button data-mi="duplicate">Duplicar</button><button data-mi="left">Alinhar X</button><button data-mi="top">Alinhar Y</button><button class="danger" data-mi="delete">Excluir</button></div><p>Arraste qualquer item selecionado para mover o grupo. Shift adiciona à seleção; Ctrl alterna itens.</p></div>`; inspector.querySelectorAll<HTMLButtonElement>('[data-mi]').forEach((button) => button.onclick = () => runSelectionAction(button.dataset.mi ?? '')); return; }
    const selected = selection[0];
    if (!selected) { inspector.innerHTML = `<div class="me2-inspector-empty"><div class="preview"><canvas id="me2-current-preview" data-asset="${esc(entry.id)}"></canvas></div><strong>${esc(entry.label)}</strong><span>${esc(entry.description)}</span><div class="badges"><b>${esc(inferFolder(entry))}</b>${entry.sprite?.animation?.frames.length ? `<b>${entry.sprite.animation.frames.length} frames</b>` : ''}</div><p>Clique no mapa para colocar. Shift+clique em cards adiciona ao Random Brush.</p></div>`; const preview = inspector.querySelector<HTMLCanvasElement>('#me2-current-preview'); if (preview) drawAssetThumbnail(preview, entry); return; }
    if (selected.kind === 'object') { const object = mapDoc.objects.find((value) => value.id === selected.id); if (!object) { selection = []; refreshInspector(); return; } const asset = getPaletteEntry(object.assetId); inspector.innerHTML = `<div class="me2-inspector-object"><div class="hero"><canvas id="me2-ins-preview" data-asset="${esc(asset.id)}"></canvas><div><strong>${esc(asset.label)}</strong><span>${esc(inferFolder(asset))}</span></div></div><div class="me2-property-grid"><label>X<input id="me2-ins-x" type="number" step="0.1" value="${object.x}"></label><label>Y<input id="me2-ins-y" type="number" step="0.1" value="${object.y}"></label><label>Escala<input id="me2-ins-scale" type="number" min="0.1" max="10" step="0.1" value="${object.scale ?? 1}"></label></div><div class="me2-ins-actions"><button id="me2-center">◎ Centralizar</button><button id="me2-duplicate">⧉ Duplicar</button><button class="danger" id="me2-delete">Excluir</button></div></div>`; const preview = inspector.querySelector<HTMLCanvasElement>('#me2-ins-preview'); if (preview) drawAssetThumbnail(preview, asset); const update = () => { beginMutation('Editar objeto'); object.x = clamp(Number(inspector.querySelector<HTMLInputElement>('#me2-ins-x')!.value) || 0, 0, mapDoc.width - 1); object.y = clamp(Number(inspector.querySelector<HTMLInputElement>('#me2-ins-y')!.value) || 0, 0, mapDoc.height - 1); object.scale = clamp(Number(inspector.querySelector<HTMLInputElement>('#me2-ins-scale')!.value) || 1, .1, 10); finishMutation(); }; inspector.querySelectorAll<HTMLInputElement>('input').forEach((input) => input.onchange = update); inspector.querySelector<HTMLButtonElement>('#me2-center')!.onclick = () => { const view = viewSize(); cameraX = object.x * mapDoc.tileSize - view.width / (2 * zoom); cameraY = object.y * mapDoc.tileSize - view.height / (2 * zoom); clampCamera(); render(); }; inspector.querySelector<HTMLButtonElement>('#me2-duplicate')!.onclick = duplicateSelection; inspector.querySelector<HTMLButtonElement>('#me2-delete')!.onclick = deleteSelection; return; }
    const zone = mapDoc.zones.find((value) => value.id === selected.id); if (!zone) { selection = []; refreshInspector(); return; } inspector.innerHTML = `<div class="me2-inspector-object"><div class="hero zone"><div class="zone-icon">▣</div><div><strong>${esc(zone.name || 'Zona')}</strong><span>${esc(zone.kind)}</span></div></div><div class="me2-property-grid"><label>Nome<input id="me2-zone-name" value="${esc(zone.name ?? '')}"></label><label>X<input id="me2-zone-x" type="number" value="${zone.x}"></label><label>Y<input id="me2-zone-y" type="number" value="${zone.y}"></label><label>Largura<input id="me2-zone-w" type="number" min="1" value="${zone.width}"></label><label>Altura<input id="me2-zone-h" type="number" min="1" value="${zone.height}"></label></div><div class="me2-ins-actions"><button class="danger" id="me2-delete">Excluir zona</button></div></div>`; const update = () => { beginMutation('Editar zona'); zone.name = inspector.querySelector<HTMLInputElement>('#me2-zone-name')!.value; zone.x = clamp(Number(inspector.querySelector<HTMLInputElement>('#me2-zone-x')!.value) || 0, 0, mapDoc.width - 1); zone.y = clamp(Number(inspector.querySelector<HTMLInputElement>('#me2-zone-y')!.value) || 0, 0, mapDoc.height - 1); zone.width = Math.max(1, Number(inspector.querySelector<HTMLInputElement>('#me2-zone-w')!.value) || 1); zone.height = Math.max(1, Number(inspector.querySelector<HTMLInputElement>('#me2-zone-h')!.value) || 1); finishMutation(); }; inspector.querySelectorAll<HTMLInputElement>('input').forEach((input) => input.onchange = update); inspector.querySelector<HTMLButtonElement>('#me2-delete')!.onclick = deleteSelection;
  };
  const runSelectionAction = (action: string) => { if (action === 'copy') copySelection(); else if (action === 'duplicate') duplicateSelection(); else if (action === 'left') alignSelection('x'); else if (action === 'top') alignSelection('y'); else if (action === 'delete') deleteSelection(); };
  const refreshMapSelect = () => { const select = root.querySelector<HTMLSelectElement>('#me2-map-select')!, docs = listMapDocuments(); select.innerHTML = docs.map((value) => `<option value="${value.id}" ${value.id === mapDoc.id ? 'selected' : ''}>${esc(value.name)}</option>`).join(''); };
  const refreshChrome = () => { const toolDef = TOOLS.find((value) => value.id === tool); root.querySelector<HTMLElement>('#me2-status-tool')!.textContent = toolDef?.label ?? tool; root.querySelector<HTMLElement>('#me2-status-layer')!.textContent = LAYERS.find((value) => value.id === layer)?.label ?? layer; root.querySelector<HTMLElement>('#me2-count')!.textContent = `${mapDoc.objects.length} objetos • ${mapDoc.zones.length} zonas`; root.querySelector<HTMLInputElement>('#me2-zoom-slider')!.value = String(Math.round(zoom * 100)); root.querySelector<HTMLElement>('#me2-zoom-label')!.textContent = `${Math.round(zoom * 100)}%`; root.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => button.classList.toggle('active', button.dataset.tool === tool)); root.querySelector<HTMLElement>('#me2-map-chip')!.textContent = `${mapDoc.name} • ${mapDoc.width}×${mapDoc.height}`; root.querySelector<HTMLButtonElement>('#me2-random-pool')!.textContent = `🎲 Pool ${randomPool.size}`; const bar = root.querySelector<HTMLElement>('#me2-selection-bar')!; bar.classList.toggle('hidden', selection.length === 0); root.querySelector<HTMLElement>('#me2-selection-count')!.textContent = `${selection.length} selecionado${selection.length === 1 ? '' : 's'}`; };
  const refreshAll = () => { renderFolders(); renderAssets(); renderRecents(); renderLayers(); refreshInspector(); refreshMapSelect(); refreshChrome(); render(); };
  const selectTool = (next: MapToolId) => { tool = next; shape = null; marquee = null; refreshChrome(); render(); };

  root.querySelector<HTMLElement>('#me2-tools')!.innerHTML = TOOLS.map((value) => `<button data-tool="${value.id}" title="${value.label} (${value.key})"><span>${value.icon}</span><small>${value.label}</small></button>`).join('');
  root.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => button.onclick = () => selectTool(button.dataset.tool as MapToolId));
  root.querySelectorAll<HTMLButtonElement>('[data-selection-action]').forEach((button) => button.onclick = () => runSelectionAction(button.dataset.selectionAction ?? ''));

  canvas.onpointerdown = (event) => {
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
        if (selectionHas(hit.kind, hit.id)) { dragMode = 'move'; dragStartMap = snapPoint(mapPoint); moveOrigins = new Map<string, Point>(); selectedObjects().forEach((item) => moveOrigins.set(`object:${item.id}`, { x: item.x, y: item.y })); selectedZones().forEach((item) => moveOrigins.set(`zone:${item.id}`, { x: item.x, y: item.y })); beginMutation(selection.length > 1 ? 'Mover grupo' : 'Mover item'); canvas.setPointerCapture(event.pointerId); }
      } else { dragMode = 'marquee'; marquee = { start: tile, end: tile, additive: event.shiftKey, toggle: event.ctrlKey || event.metaKey }; if (!event.shiftKey && !event.ctrlKey && !event.metaKey) selection = []; canvas.setPointerCapture(event.pointerId); }
      refreshInspector(); refreshChrome(); render(); return;
    }
    if (tool === 'line' || tool === 'rect') { if (locked[layer]) { showToast('Esta layer está bloqueada.'); return; } dragMode = 'shape'; shape = { start: tile, end: tile }; beginMutation(tool === 'line' ? 'Desenhar linha' : 'Desenhar retângulo'); canvas.setPointerCapture(event.pointerId); render(); return; }
    dragMode = 'paint'; usePaintTool(tile, true); canvas.setPointerCapture(event.pointerId);
  };

  canvas.onpointermove = (event) => {
    const tile = screenToTile(event.clientX, event.clientY), mapPoint = screenToMap(event.clientX, event.clientY); hoverTile = tile; hoverMap = mapPoint; root.querySelector<HTMLElement>('#me2-status-pos')!.textContent = `X ${mapPoint.x.toFixed(snapMode === 'grid' ? 0 : 1)} • Y ${mapPoint.y.toFixed(snapMode === 'grid' ? 0 : 1)}`; root.querySelector<HTMLElement>('#me2-hover-chip')!.textContent = validTile(tile.x, tile.y) ? entry.label : '';
    if (dragMode === 'pan') { cameraX = pointerStart.cameraX - (event.clientX - pointerStart.x) / zoom; cameraY = pointerStart.cameraY - (event.clientY - pointerStart.y) / zoom; clampCamera(); render(); return; }
    if (dragMode === 'move') { const current = snapPoint(mapPoint), dx = current.x - dragStartMap.x, dy = current.y - dragStartMap.y; selectedObjects().forEach((item) => { const origin = moveOrigins.get(`object:${item.id}`); if (origin) { item.x = clamp(origin.x + dx, 0, mapDoc.width - 1); item.y = clamp(origin.y + dy, 0, mapDoc.height - 1); } }); selectedZones().forEach((item) => { const origin = moveOrigins.get(`zone:${item.id}`); if (origin) { item.x = clamp(Math.round(origin.x + dx), 0, mapDoc.width - 1); item.y = clamp(Math.round(origin.y + dy), 0, mapDoc.height - 1); } }); markDirty(); schedulePreview(); refreshInspector(); render(); return; }
    if (dragMode === 'marquee' && marquee) { marquee.end = tile; render(); return; }
    if (dragMode === 'shape' && shape) { shape.end = tile; render(); return; }
    if (dragMode === 'paint') usePaintTool(tile, false); else render();
  };

  const finishPointer = () => {
    if (dragMode === 'marquee' && marquee) { const box = normalizeBox(marquee.start, marquee.end), hits: SelectionItem[] = []; mapDoc.objects.forEach((object) => { if (visible.objects && intersects(objectRect(object), box)) hits.push({ kind: 'object', id: object.id }); }); mapDoc.zones.forEach((zone) => { if (visible.zones && intersects({ x: zone.x, y: zone.y, width: zone.width, height: zone.height }, box)) hits.push({ kind: 'zone', id: zone.id }); }); if (marquee.toggle) { for (const hit of hits) selection = selectionHas(hit.kind, hit.id) ? selection.filter((item) => !(item.kind === hit.kind && item.id === hit.id)) : [...selection, hit]; } else if (marquee.additive) { for (const hit of hits) if (!selectionHas(hit.kind, hit.id)) selection.push(hit); } else selection = hits; marquee = null; refreshInspector(); refreshChrome(); render(); }
    else if (dragMode === 'shape') { applyShape(); shape = null; finishMutation(); }
    else if (dragMode === 'paint' || dragMode === 'move') finishMutation();
    dragMode = 'none';
  };
  canvas.onpointerup = finishPointer; canvas.onpointercancel = finishPointer; canvas.onpointerleave = () => { hoverTile = null; hoverMap = null; if (dragMode === 'paint') finishPointer(); else if (dragMode === 'none') render(); };
  canvas.onwheel = (event) => { event.preventDefault(); const rect = canvas.getBoundingClientRect(); setZoom(zoom * (event.deltaY < 0 ? 1.12 : .89), event.clientX - rect.left, event.clientY - rect.top); }; canvas.oncontextmenu = (event) => event.preventDefault();

  stage.ondragover = (event) => { event.preventDefault(); if (event.dataTransfer?.types.includes('application/x-ascension-asset')) event.dataTransfer.dropEffect = 'copy'; };
  stage.ondrop = (event) => { event.preventDefault(); const id = event.dataTransfer?.getData('application/x-ascension-asset'); if (!id) return; const value = MAP_PALETTE_ENTRIES.find((asset) => asset.id === id); if (!value) return; const tile = screenToTile(event.clientX, event.clientY), p = snapPoint(screenToMap(event.clientX, event.clientY)); chooseEntry(value); beginMutation('Colocar asset'); if (value.palette === 'terrain') paintTerrain(tile.x, tile.y); else placeObject(p, value); finishMutation(); };

  const openStudio = (file: File) => openMapAssetStudio(file, (entries) => { renderFolders(); renderAssets(); if (entries[0]) chooseEntry(entries[0]); preloadMapAssets(entries, render); showToast(`${entries.length} asset(s) adicionado(s).`); }).catch((error) => showToast(error instanceof Error ? error.message : 'Falha ao importar imagem.'));
  root.addEventListener('dragenter', (event) => { if ([...(event.dataTransfer?.items ?? [])].some((item) => item.kind === 'file')) root.classList.add('file-dragging'); }); root.addEventListener('dragover', (event) => { if ([...(event.dataTransfer?.items ?? [])].some((item) => item.kind === 'file')) event.preventDefault(); }); root.addEventListener('dragleave', (event) => { if (!root.contains(event.relatedTarget as Node)) root.classList.remove('file-dragging'); }); root.addEventListener('drop', (event) => { const file = event.dataTransfer?.files?.[0]; if (!file) return; event.preventDefault(); root.classList.remove('file-dragging'); openStudio(file); });

  const openNewMap = () => { const modal = document.createElement('div'); modal.className = 'me2-modal-backdrop'; modal.innerHTML = `<form class="me2-modal"><header><strong>Novo mapa</strong><button type="button" data-close>×</button></header><div class="body"><label>Nome<input id="new-name" value="Novo Mapa"></label><div class="row"><label>Largura<input id="new-w" type="number" min="8" max="512" value="80"></label><label>Altura<input id="new-h" type="number" min="8" max="512" value="60"></label></div><label>Tile lógico<select id="new-tile"><option value="32">32 px</option><option value="16">16 px</option><option value="64">64 px</option></select></label></div><footer><button type="button" data-close>Cancelar</button><button class="primary">Criar mapa</button></footer></form>`; document.body.appendChild(modal); modal.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((button) => button.onclick = () => modal.remove()); modal.querySelector<HTMLFormElement>('form')!.onsubmit = (event) => { event.preventDefault(); mapDoc = saveMapDocument(createBlankMap(modal.querySelector<HTMLInputElement>('#new-name')!.value.trim() || 'Novo Mapa', Number(modal.querySelector<HTMLInputElement>('#new-w')!.value) || 80, Number(modal.querySelector<HTMLInputElement>('#new-h')!.value) || 60, Number(modal.querySelector<HTMLSelectElement>('#new-tile')!.value) || 32)); selection = []; undoStack.length = 0; redoStack.length = 0; initialized = false; modal.remove(); markSaved(); refreshAll(); requestAnimationFrame(fitMap); }; };

  root.querySelector<HTMLButtonElement>('#me2-new')!.onclick = openNewMap; root.querySelector<HTMLButtonElement>('#me2-save')!.onclick = () => save(false); root.querySelector<HTMLButtonElement>('#me2-undo')!.onclick = undo; root.querySelector<HTMLButtonElement>('#me2-redo')!.onclick = redo;
  root.querySelector<HTMLButtonElement>('#me2-export')!.onclick = () => downloadText(`${mapDoc.id}.ascension-map.json`, JSON.stringify(mapDoc, null, 2)); root.querySelector<HTMLButtonElement>('#me2-import-map')!.onclick = () => mapFile.click();
  mapFile.onchange = async () => { const file = mapFile.files?.[0]; if (!file) return; try { mapDoc = importMapDocument(await file.text()); selection = []; initialized = false; markSaved(); refreshAll(); requestAnimationFrame(fitMap); } catch (error) { showToast(error instanceof Error ? error.message : 'Mapa inválido.'); } finally { mapFile.value = ''; } };
  root.querySelector<HTMLSelectElement>('#me2-map-select')!.onchange = (event) => { const next = loadMapDocument((event.target as HTMLSelectElement).value); if (!next) return; mapDoc = next; selection = []; undoStack.length = 0; redoStack.length = 0; markSaved(); refreshAll(); requestAnimationFrame(fitMap); };
  root.querySelector<HTMLButtonElement>('#me2-playtest')!.onclick = () => { publishPreview(); window.open(`${location.pathname}?playtest=map&id=${encodeURIComponent(mapDoc.id)}`, '_blank'); }; root.querySelector<HTMLButtonElement>('#me2-game')!.onclick = () => { if (dirty && !confirm('Existem alterações não salvas. Sair mesmo assim?')) return; location.href = location.pathname; };
  root.querySelector<HTMLButtonElement>('#me2-asset-studio')!.onclick = () => openImagePicker(openStudio); root.querySelector<HTMLButtonElement>('#me2-grid')!.onclick = (event) => { gridVisible = !gridVisible; (event.currentTarget as HTMLButtonElement).classList.toggle('active', gridVisible); render(); }; root.querySelector<HTMLButtonElement>('#me2-collision-toggle')!.onclick = (event) => { collisionVisible = !collisionVisible; (event.currentTarget as HTMLButtonElement).classList.toggle('active', collisionVisible); render(); };
  root.querySelector<HTMLButtonElement>('#me2-random-pool')!.onclick = () => { if (!randomPool.size) { showToast('Shift+clique em assets para montar o Random Brush.'); return; } if (confirm(`Limpar ${randomPool.size} assets do Random Brush?`)) { randomPool.clear(); saveArray(RANDOM_KEY, []); refreshChrome(); renderAssets(); } };
  root.querySelector<HTMLSelectElement>('#me2-snap')!.value = snapMode; root.querySelector<HTMLSelectElement>('#me2-snap')!.onchange = (event) => { snapMode = (event.target as HTMLSelectElement).value as SnapMode; localStorage.setItem(SNAP_KEY, snapMode); };
  root.querySelector<HTMLButtonElement>('#me2-fit')!.onclick = fitMap; root.querySelector<HTMLButtonElement>('#me2-zoom-in')!.onclick = () => setZoom(zoom * 1.15); root.querySelector<HTMLButtonElement>('#me2-zoom-out')!.onclick = () => setZoom(zoom * .87); root.querySelector<HTMLInputElement>('#me2-zoom-slider')!.oninput = (event) => setZoom(Number((event.target as HTMLInputElement).value) / 100); root.querySelector<HTMLSelectElement>('#me2-brush-size')!.onchange = (event) => { brushSize = Number((event.target as HTMLSelectElement).value) || 1; };
  root.querySelector<HTMLButtonElement>('#me2-minimap-toggle')!.onclick = (event) => { minimapVisible = !minimapVisible; root.querySelector<HTMLElement>('#me2-minimap-shell')!.classList.toggle('hidden', !minimapVisible); (event.currentTarget as HTMLButtonElement).textContent = minimapVisible ? 'ocultar' : 'mostrar'; }; root.querySelector<HTMLButtonElement>('#me2-collapse-assets')!.onclick = () => root.classList.toggle('assets-collapsed'); searchInput.oninput = renderAssets;
  root.querySelectorAll<HTMLButtonElement>('[data-source]').forEach((button) => button.onclick = () => { sourceFilter = button.dataset.source as typeof sourceFilter; root.querySelectorAll<HTMLButtonElement>('[data-source]').forEach((node) => node.classList.toggle('active', node === button)); renderAssets(); }); root.querySelectorAll<HTMLButtonElement>('[data-right-tab]').forEach((button) => button.onclick = () => switchRightTab(button.dataset.rightTab === 'inspector' ? 'inspector' : 'layers'));
  minimap.onclick = (event) => { const rect = minimap.getBoundingClientRect(), x = (event.clientX - rect.left) / rect.width * mapDoc.width, y = (event.clientY - rect.top) / rect.height * mapDoc.height, view = viewSize(); cameraX = x * mapDoc.tileSize - view.width / (2 * zoom); cameraY = y * mapDoc.tileSize - view.height / (2 * zoom); clampCamera(); render(); };

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
    if (mod && event.code === 'KeyA') { event.preventDefault(); selection = layer === 'zones' ? mapDoc.zones.map((item) => ({ kind: 'zone' as const, id: item.id })) : mapDoc.objects.map((item) => ({ kind: 'object' as const, id: item.id })); refreshInspector(); refreshChrome(); render(); return; }
    if (event.key === 'ArrowLeft') { event.preventDefault(); nudgeSelection(-1, 0); return; } if (event.key === 'ArrowRight') { event.preventDefault(); nudgeSelection(1, 0); return; } if (event.key === 'ArrowUp') { event.preventDefault(); nudgeSelection(0, -1); return; } if (event.key === 'ArrowDown') { event.preventDefault(); nudgeSelection(0, 1); return; }
    const key = event.key.toUpperCase(), toolDef = TOOLS.find((value) => value.key === key); if (toolDef) { selectTool(toolDef.id); return; }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selection.length) { event.preventDefault(); deleteSelection(); }
    if (event.key === 'Escape') { selection = []; marquee = null; shape = null; refreshInspector(); refreshChrome(); render(); }
  });
  window.addEventListener('keyup', (event) => { if (event.code === 'Space') spaceDown = false; }); window.addEventListener('blur', () => { spaceDown = false; dragMode = 'none'; }); window.addEventListener('pagehide', () => previewPublisher.close(), { once: true });

  const observer = new ResizeObserver(() => { if (!initialized) { initialized = true; requestAnimationFrame(fitMap); } else render(); }); observer.observe(stage); preloadMapAssets(MAP_PALETTE_ENTRIES, render);
  const animationLoop = (time: number) => { if (MAP_PALETTE_ENTRIES.some((value) => value.sprite?.animation?.frames.length)) render(time); if (time - thumbnailTimer > 100) { renderAssetCanvases(); thumbnailTimer = time; } requestAnimationFrame(animationLoop); };
  refreshAll(); requestAnimationFrame(animationLoop);
}
