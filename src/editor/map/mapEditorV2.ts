import './mapEditorV2.css';
import { drawAssetThumbnail, drawObjectAsset, drawTerrainAsset, preloadMapAssets } from './mapAssetRenderer';
import { deleteLibraryAsset, hydrateAssetLibraryV2, isV2LibraryAsset } from './mapAssetLibraryV2';
import { openMapAssetStudio } from './mapAssetStudio';
import { MAP_PALETTE_ENTRIES, getPaletteEntry } from './mapEditorCatalog';
import { createMapPreviewPublisher } from './mapPreviewBridge';
import { createBlankMap, importMapDocument, listMapDocuments, loadMapDocument, loadOrCreateActiveMap, saveMapDocument } from './mapEditorStorage';
import type { AscensionMapDocument, EditorSnapshot, MapAssetFolder, MapLayerId, MapObject, MapPaletteEntry, MapToolId, MapZone } from './mapEditorTypes';
import { parseTileKey, tileKey } from './mapEditorTypes';

type Selection = { kind: 'object'; id: string } | { kind: 'zone'; id: string } | null;
type DragMode = 'none' | 'paint' | 'pan' | 'move';

type FolderDef = { id: MapAssetFolder | 'all' | 'favorites'; label: string; icon: string };

const FOLDERS: FolderDef[] = [
  { id: 'all', label: 'Todos', icon: '▦' },
  { id: 'favorites', label: 'Favoritos', icon: '★' },
  { id: 'terrain', label: 'Terreno', icon: '▩' },
  { id: 'nature', label: 'Natureza', icon: '♣' },
  { id: 'buildings', label: 'Construções', icon: '⌂' },
  { id: 'walls', label: 'Paredes', icon: '▥' },
  { id: 'roofs', label: 'Telhados', icon: '⌃' },
  { id: 'furniture', label: 'Móveis', icon: '▤' },
  { id: 'props', label: 'Props', icon: '◆' },
  { id: 'crafting', label: 'Crafting', icon: '⚒' },
  { id: 'npc', label: 'NPCs', icon: '◇' },
  { id: 'monster', label: 'Monstros', icon: '☠' },
  { id: 'resource', label: 'Recursos', icon: '⛏' },
  { id: 'portal', label: 'Portais', icon: '⇄' },
  { id: 'effects', label: 'Efeitos', icon: '✦' },
  { id: 'zones', label: 'Zonas', icon: '▣' },
  { id: 'raw', label: 'Outros', icon: '…' },
];

const TOOLS: Array<{ id: MapToolId; label: string; icon: string; key: string }> = [
  { id: 'select', label: 'Selecionar', icon: '⌁', key: 'V' },
  { id: 'brush', label: 'Colocar', icon: '✎', key: 'B' },
  { id: 'eraser', label: 'Apagar', icon: '⌫', key: 'E' },
  { id: 'fill', label: 'Preencher', icon: '▨', key: 'F' },
  { id: 'collision', label: 'Colisão', icon: '▧', key: 'C' },
  { id: 'pan', label: 'Mover visão', icon: '✥', key: 'H' },
];

const LAYERS: Array<{ id: MapLayerId; label: string; icon: string }> = [
  { id: 'ground', label: 'Terreno', icon: '▩' },
  { id: 'detail', label: 'Detalhes', icon: '✦' },
  { id: 'objects', label: 'Objetos', icon: '◆' },
  { id: 'collision', label: 'Colisão', icon: '▧' },
  { id: 'zones', label: 'Zonas', icon: '▣' },
];

const FAVORITES_KEY = 'ascension.map-editor.favorites.v2';
const RECENTS_KEY = 'ascension.map-editor.recents.v2';
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);

function loadStringArray(key: string) {
  try { const value = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(value) ? value.map(String) : []; }
  catch { return []; }
}

function saveStringArray(key: string, value: string[]) {
  localStorage.setItem(key, JSON.stringify(value));
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
  if (/árvore|arvore|arbusto|flor|nature|tree|bush|rock/.test(text)) return 'nature';
  if (/casa|house|building|porta|door/.test(text)) return 'buildings';
  if (/forja|alquimia|craft|anvil/.test(text)) return 'crafting';
  return entry.palette === 'doodad' ? 'props' : 'raw';
}

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function openImagePicker(onFile: (file: File) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/webp,image/jpeg';
  input.onchange = () => { const file = input.files?.[0]; if (file) onFile(file); };
  input.click();
}

export async function startMapEditorV2() {
  document.body.className = 'map-editor-v2-mode';
  document.title = 'Ascension Map Editor';
  await hydrateAssetLibraryV2();

  const mount = document.querySelector<HTMLElement>('#app') ?? document.body;
  mount.innerHTML = '';

  let mapDoc: AscensionMapDocument = loadOrCreateActiveMap();
  let tool: MapToolId = 'brush';
  let entry: MapPaletteEntry = getPaletteEntry('grass');
  let folder: FolderDef['id'] = 'all';
  let sourceFilter: 'all' | 'ascension' | 'pixel-crawler' | 'custom' = 'all';
  let layer: MapLayerId = 'ground';
  let brushSize = 1;
  let zoom = .65;
  let cameraX = 0;
  let cameraY = 0;
  let hoverTile: { x: number; y: number } | null = null;
  let selection: Selection = null;
  let dragMode: DragMode = 'none';
  let dirty = false;
  let actionOpen = false;
  let lastPaintKey = '';
  let spaceDown = false;
  let gridVisible = true;
  let collisionVisible = false;
  let minimapVisible = true;
  let initialized = false;
  let pointerStart = { x: 0, y: 0, cameraX: 0, cameraY: 0 };
  let previewTimer = 0;
  let thumbnailTimer = 0;
  let favorites = new Set(loadStringArray(FAVORITES_KEY));
  let recents = loadStringArray(RECENTS_KEY);
  const visible: Record<MapLayerId, boolean> = { ground: true, detail: true, objects: true, collision: true, zones: true };
  const locked: Record<MapLayerId, boolean> = { ground: false, detail: false, objects: false, collision: false, zones: false };
  const undoStack: EditorSnapshot[] = [];
  const redoStack: EditorSnapshot[] = [];
  const previewPublisher = createMapPreviewPublisher();

  const root = document.createElement('div');
  root.className = 'me2';
  root.innerHTML = `
    <header class="me2-topbar">
      <div class="me2-brand"><span class="me2-logo">A</span><div><strong>ASCENSION</strong><span>MAP EDITOR</span></div></div>
      <div class="me2-menu-group">
        <button id="me2-new" title="Criar novo mapa">Novo</button>
        <button id="me2-save" class="primary-soft" title="Ctrl+S">Salvar</button>
        <button id="me2-import-map">Abrir JSON</button>
        <button id="me2-export">Exportar</button>
      </div>
      <div class="me2-map-switch"><span>Mapa</span><select id="me2-map-select"></select></div>
      <div class="me2-spacer"></div>
      <button id="me2-asset-studio" class="asset-studio"><span>＋</span> Importar tileset / sprite</button>
      <button id="me2-playtest" class="playtest">▶ TESTAR MAPA</button>
      <button id="me2-game">Jogo ↗</button>
    </header>

    <div class="me2-toolstrip">
      <div class="me2-toolset"><button id="me2-undo" title="Ctrl+Z">↶</button><button id="me2-redo" title="Ctrl+Y">↷</button></div>
      <div class="me2-toolset" id="me2-tools"></div>
      <div class="me2-toolset compact"><label>Pincel<select id="me2-brush-size"><option>1</option><option>2</option><option>3</option><option>5</option><option>7</option></select></label></div>
      <div class="me2-toolset compact"><button id="me2-grid" class="active"># Grade</button><button id="me2-collision-toggle">▧ Colisão</button></div>
      <div class="me2-spacer"></div>
      <button id="me2-fit">Enquadrar</button>
      <div class="me2-zoom"><button id="me2-zoom-out">−</button><input id="me2-zoom-slider" type="range" min="20" max="250" value="65"><button id="me2-zoom-in">＋</button><span id="me2-zoom-label">65%</span></div>
    </div>

    <div class="me2-workspace">
      <aside class="me2-assets-panel">
        <div class="me2-assets-head"><div><strong>ASSETS</strong><span id="me2-assets-count"></span></div><button id="me2-collapse-assets" title="Recolher">‹</button></div>
        <div class="me2-search"><span>⌕</span><input id="me2-search" placeholder="Buscar árvore, parede, NPC..." autocomplete="off"></div>
        <div class="me2-source-filter"><button data-source="all" class="active">Todos</button><button data-source="pixel-crawler">Pixel Crawler</button><button data-source="custom">Meus</button></div>
        <div class="me2-assets-body">
          <nav class="me2-folders" id="me2-folders"></nav>
          <section class="me2-browser">
            <div class="me2-browser-title"><strong id="me2-folder-title">Todos os assets</strong><span>clique ou arraste para o mapa</span></div>
            <div class="me2-recents" id="me2-recents"></div>
            <div class="me2-asset-grid" id="me2-asset-grid"></div>
          </section>
        </div>
        <div class="me2-drop-zone" id="me2-drop-zone"><b>＋</b><span>Arraste PNG / spritesheet aqui</span></div>
      </aside>

      <main class="me2-stage-wrap">
        <div class="me2-stage-tabs"><button class="active">${escapeHtml(mapDoc.name)}</button><span>● DRAFT</span><span class="live">● PLAYTEST LIVE</span></div>
        <div class="me2-stage" id="me2-stage">
          <canvas id="me2-canvas"></canvas>
          <div class="me2-stage-chips"><span id="me2-map-chip"></span><span id="me2-hover-chip"></span></div>
          <div class="me2-drag-overlay"><strong>Solte para importar no Asset Studio</strong><span>PNG • WebP • spritesheet • tileset</span></div>
          <div class="me2-toast" id="me2-toast"></div>
        </div>
      </main>

      <aside class="me2-right-panel">
        <div class="me2-right-tabs"><button data-right-tab="layers" class="active">LAYERS</button><button data-right-tab="inspector">PROPRIEDADES</button></div>
        <div class="me2-right-content" id="me2-right-layers">
          <div class="me2-section-head"><strong>LAYERS DO MAPA</strong><span>olho • cadeado</span></div>
          <div class="me2-layers" id="me2-layers"></div>
          <div class="me2-section-head"><strong>MINIMAPA</strong><button id="me2-minimap-toggle">ocultar</button></div>
          <div class="me2-minimap-shell" id="me2-minimap-shell"><canvas id="me2-minimap"></canvas></div>
          <div class="me2-section-head"><strong>DICAS</strong></div>
          <div class="me2-shortcuts"><span><kbd>V</kbd> selecionar</span><span><kbd>B</kbd> colocar</span><span><kbd>E</kbd> apagar</span><span><kbd>Espaço</kbd> mover visão</span><span><kbd>Ctrl Z</kbd> desfazer</span><span><kbd>Del</kbd> excluir</span></div>
        </div>
        <div class="me2-right-content hidden" id="me2-right-inspector"><div id="me2-inspector"></div></div>
      </aside>
    </div>

    <footer class="me2-statusbar">
      <span id="me2-status-pos">X 0 • Y 0</span><span id="me2-status-tool">Colocar</span><span id="me2-status-layer">Terreno</span>
      <span class="me2-spacer"></span><span id="me2-count"></span><span id="me2-save-state" class="saved">● Salvo</span>
    </footer>
    <input id="me2-map-file" type="file" accept="application/json,.json" hidden>
  `;
  mount.appendChild(root);

  const stage = root.querySelector<HTMLElement>('#me2-stage')!;
  const canvas = root.querySelector<HTMLCanvasElement>('#me2-canvas')!;
  const ctx = canvas.getContext('2d')!;
  const minimap = root.querySelector<HTMLCanvasElement>('#me2-minimap')!;
  const minimapCtx = minimap.getContext('2d')!;
  const assetGrid = root.querySelector<HTMLElement>('#me2-asset-grid')!;
  const folderNode = root.querySelector<HTMLElement>('#me2-folders')!;
  const searchInput = root.querySelector<HTMLInputElement>('#me2-search')!;
  const inspector = root.querySelector<HTMLElement>('#me2-inspector')!;
  const layersNode = root.querySelector<HTMLElement>('#me2-layers')!;
  const toast = root.querySelector<HTMLElement>('#me2-toast')!;
  const mapFile = root.querySelector<HTMLInputElement>('#me2-map-file')!;
  let toastTimer = 0;

  const showToast = (text: string) => {
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2200);
  };

  const markDirty = () => {
    dirty = true;
    const node = root.querySelector<HTMLElement>('#me2-save-state')!;
    node.className = 'dirty'; node.textContent = '● Não salvo';
  };
  const markSaved = () => {
    dirty = false;
    const node = root.querySelector<HTMLElement>('#me2-save-state')!;
    node.className = 'saved'; node.textContent = '● Salvo';
  };
  const publishPreview = () => previewPublisher.publish(clone(mapDoc));
  const schedulePreview = () => { clearTimeout(previewTimer); previewTimer = window.setTimeout(publishPreview, 45); };
  const beginMutation = (label: string) => {
    if (actionOpen) return;
    undoStack.push({ document: clone(mapDoc), label });
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
    actionOpen = true;
  };
  const finishMutation = () => {
    if (actionOpen) { mapDoc.updatedAt = Date.now(); markDirty(); schedulePreview(); }
    actionOpen = false; lastPaintKey = ''; refreshChrome(); render();
  };
  const restore = (snapshot: EditorSnapshot, destination: EditorSnapshot[]) => {
    destination.push({ document: clone(mapDoc), label: snapshot.label });
    mapDoc = clone(snapshot.document); selection = null; markDirty(); schedulePreview(); refreshAll();
  };
  const undo = () => { const item = undoStack.pop(); if (item) restore(item, redoStack); };
  const redo = () => { const item = redoStack.pop(); if (item) restore(item, undoStack); };
  const save = () => { mapDoc = saveMapDocument(mapDoc); markSaved(); refreshMapSelect(); publishPreview(); showToast('Mapa salvo.'); };

  const validTile = (x: number, y: number) => x >= 0 && y >= 0 && x < mapDoc.width && y < mapDoc.height;
  const viewSize = () => ({ width: canvas.clientWidth, height: canvas.clientHeight });
  const clampCamera = () => {
    const view = viewSize();
    const maxX = Math.max(0, mapDoc.width * mapDoc.tileSize - view.width / zoom);
    const maxY = Math.max(0, mapDoc.height * mapDoc.tileSize - view.height / zoom);
    cameraX = clamp(cameraX, -100 / zoom, maxX + 100 / zoom);
    cameraY = clamp(cameraY, -100 / zoom, maxY + 100 / zoom);
  };
  const setZoom = (next: number, centerX?: number, centerY?: number) => {
    const old = zoom;
    zoom = clamp(next, .2, 2.5);
    const view = viewSize();
    const sx = centerX ?? view.width / 2, sy = centerY ?? view.height / 2;
    const worldX = sx / old + cameraX, worldY = sy / old + cameraY;
    cameraX = worldX - sx / zoom; cameraY = worldY - sy / zoom;
    clampCamera(); refreshChrome(); render();
  };
  const fitMap = () => {
    const view = viewSize();
    zoom = clamp(Math.min(view.width / (mapDoc.width * mapDoc.tileSize), view.height / (mapDoc.height * mapDoc.tileSize)) * .9, .2, 2.5);
    cameraX = mapDoc.width * mapDoc.tileSize / 2 - view.width / (2 * zoom);
    cameraY = mapDoc.height * mapDoc.tileSize / 2 - view.height / (2 * zoom);
    clampCamera(); refreshChrome(); render();
  };
  const screenToTile = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return { x: Math.floor(((clientX - rect.left) / zoom + cameraX) / mapDoc.tileSize), y: Math.floor(((clientY - rect.top) / zoom + cameraY) / mapDoc.tileSize) };
  };

  const objectAt = (x: number, y: number) => [...mapDoc.objects].reverse().find((object) => {
    const footprint = getPaletteEntry(object.assetId).footprint;
    if (!footprint) return object.x === x && object.y === y;
    const half = Math.floor(footprint.width / 2);
    return x >= object.x - half && x < object.x - half + footprint.width && y >= object.y - footprint.height + 1 && y <= object.y;
  }) ?? null;
  const zoneAt = (x: number, y: number) => [...mapDoc.zones].reverse().find((zone) => x >= zone.x && y >= zone.y && x < zone.x + zone.width && y < zone.y + zone.height) ?? null;

  const rememberAsset = (assetId: string) => {
    recents = [assetId, ...recents.filter((id) => id !== assetId)].slice(0, 8);
    saveStringArray(RECENTS_KEY, recents);
    renderRecents();
  };
  const chooseEntry = (next: MapPaletteEntry) => {
    entry = next;
    layer = next.defaultLayer;
    tool = next.palette === 'zone' ? 'brush' : 'brush';
    rememberAsset(next.id);
    renderAssets(); renderLayers(); refreshInspector(); refreshChrome(); render();
  };
  const toggleFavorite = (assetId: string) => {
    if (favorites.has(assetId)) favorites.delete(assetId); else favorites.add(assetId);
    saveStringArray(FAVORITES_KEY, [...favorites]); renderAssets(); renderRecents();
  };

  const paintTerrain = (x: number, y: number) => {
    for (let oy = 0; oy < brushSize; oy++) for (let ox = 0; ox < brushSize; ox++) {
      const tx = x + ox - Math.floor(brushSize / 2), ty = y + oy - Math.floor(brushSize / 2);
      if (!validTile(tx, ty)) continue;
      const key = tileKey(tx, ty), value = mapDoc.tiles[key] ?? {};
      if (layer === 'detail') value.detail = entry.id; else value.ground = entry.id;
      mapDoc.tiles[key] = value;
    }
  };
  const placeObject = (x: number, y: number, selectedEntry = entry) => {
    if (!selectedEntry.objectKind || !validTile(x, y)) return;
    const key = `${selectedEntry.id}:${x},${y}`;
    if (lastPaintKey === key) return;
    lastPaintKey = key;
    const footprint = selectedEntry.footprint;
    const object: MapObject = { id: uid('object'), kind: selectedEntry.objectKind, assetId: selectedEntry.id, x, y, width: footprint?.width ?? 1, height: footprint?.height ?? 1, scale: 1, rotation: 0, properties: {} };
    mapDoc.objects.push(object);
    selection = { kind: 'object', id: object.id };
  };
  const placeZone = (x: number, y: number) => {
    if (!entry.zoneKind || lastPaintKey) return;
    lastPaintKey = `${x},${y}`;
    const size = Math.max(1, brushSize);
    const zone: MapZone = { id: uid('zone'), kind: entry.zoneKind, x: clamp(x - Math.floor(size / 2), 0, mapDoc.width - 1), y: clamp(y - Math.floor(size / 2), 0, mapDoc.height - 1), width: size, height: size, name: entry.label, properties: {} };
    mapDoc.zones.push(zone); selection = { kind: 'zone', id: zone.id };
  };
  const paintCollision = (x: number, y: number) => {
    for (let oy = 0; oy < brushSize; oy++) for (let ox = 0; ox < brushSize; ox++) {
      const tx = x + ox - Math.floor(brushSize / 2), ty = y + oy - Math.floor(brushSize / 2);
      if (!validTile(tx, ty)) continue;
      const key = tileKey(tx, ty); if (!mapDoc.collision.includes(key)) mapDoc.collision.push(key);
    }
  };
  const erase = (x: number, y: number) => {
    if (layer === 'objects') { const object = objectAt(x, y); if (object) mapDoc.objects = mapDoc.objects.filter((value) => value.id !== object.id); }
    else if (layer === 'zones') { const zone = zoneAt(x, y); if (zone) mapDoc.zones = mapDoc.zones.filter((value) => value.id !== zone.id); }
    else if (layer === 'collision') mapDoc.collision = mapDoc.collision.filter((value) => value !== tileKey(x, y));
    else { const tile = mapDoc.tiles[tileKey(x, y)] ?? {}; if (layer === 'detail') delete tile.detail; else tile.ground = 'grass'; mapDoc.tiles[tileKey(x, y)] = tile; }
  };
  const floodFill = (x: number, y: number) => {
    if (entry.palette !== 'terrain' || !validTile(x, y)) return;
    const detail = layer === 'detail';
    const targetTile = mapDoc.tiles[tileKey(x, y)] ?? {};
    const target = detail ? targetTile.detail : (targetTile.ground ?? 'grass');
    if (target === entry.id) return;
    const queue = [{ x, y }], seen = new Set<string>();
    while (queue.length) {
      const point = queue.shift()!; if (!validTile(point.x, point.y)) continue;
      const key = tileKey(point.x, point.y); if (seen.has(key)) continue; seen.add(key);
      const value = mapDoc.tiles[key] ?? {};
      if ((detail ? value.detail : (value.ground ?? 'grass')) !== target) continue;
      if (detail) value.detail = entry.id; else value.ground = entry.id;
      mapDoc.tiles[key] = value;
      queue.push({ x: point.x + 1, y: point.y }, { x: point.x - 1, y: point.y }, { x: point.x, y: point.y + 1 }, { x: point.x, y: point.y - 1 });
    }
  };

  const useTool = (x: number, y: number, initial: boolean) => {
    if (!validTile(x, y)) return;
    if (locked[layer]) { if (initial) showToast('Esta layer está bloqueada.'); return; }
    if (tool === 'select') {
      if (!initial) return;
      const object = visible.objects ? objectAt(x, y) : null;
      const zone = !object && visible.zones ? zoneAt(x, y) : null;
      selection = object ? { kind: 'object', id: object.id } : zone ? { kind: 'zone', id: zone.id } : null;
      refreshInspector(); render(); return;
    }
    if (tool === 'fill') { if (initial) { beginMutation('Preencher terreno'); floodFill(x, y); } return; }
    beginMutation(tool === 'eraser' ? 'Apagar' : tool === 'collision' ? 'Colisão' : 'Pintar mapa');
    if (tool === 'eraser') erase(x, y);
    else if (tool === 'collision') paintCollision(x, y);
    else if (entry.palette === 'terrain') paintTerrain(x, y);
    else if (entry.palette === 'zone') placeZone(x, y);
    else placeObject(x, y);
    refreshInspector(); render();
  };

  const deleteSelection = () => {
    const selected = selection; if (!selected) return;
    beginMutation('Excluir seleção');
    if (selected.kind === 'object') mapDoc.objects = mapDoc.objects.filter((value) => value.id !== selected.id);
    else mapDoc.zones = mapDoc.zones.filter((value) => value.id !== selected.id);
    selection = null; finishMutation(); refreshInspector();
  };

  const render = (now = performance.now()) => {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    const targetW = Math.max(1, Math.floor(rect.width * dpr)), targetH = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) { canvas.width = targetW; canvas.height = targetH; canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, rect.width, rect.height); ctx.fillStyle = '#080c10'; ctx.fillRect(0, 0, rect.width, rect.height);
    const tilePx = mapDoc.tileSize * zoom;
    const startX = clamp(Math.floor(cameraX / mapDoc.tileSize) - 2, 0, mapDoc.width - 1);
    const startY = clamp(Math.floor(cameraY / mapDoc.tileSize) - 2, 0, mapDoc.height - 1);
    const endX = clamp(Math.ceil((cameraX + rect.width / zoom) / mapDoc.tileSize) + 2, 0, mapDoc.width - 1);
    const endY = clamp(Math.ceil((cameraY + rect.height / zoom) / mapDoc.tileSize) + 2, 0, mapDoc.height - 1);

    if (visible.ground) for (let y = startY; y <= endY; y++) for (let x = startX; x <= endX; x++) {
      const value = mapDoc.tiles[tileKey(x, y)] ?? { ground: 'grass' };
      const sx = (x * mapDoc.tileSize - cameraX) * zoom, sy = (y * mapDoc.tileSize - cameraY) * zoom;
      drawTerrainAsset(ctx, getPaletteEntry(value.ground ?? 'grass'), sx, sy, tilePx, 1, () => render(), now);
      if (visible.detail && value.detail) drawTerrainAsset(ctx, getPaletteEntry(value.detail), sx, sy, tilePx, .92, () => render(), now);
    }

    if (visible.zones) for (const zone of mapDoc.zones) {
      const sx = (zone.x * mapDoc.tileSize - cameraX) * zoom, sy = (zone.y * mapDoc.tileSize - cameraY) * zoom;
      ctx.fillStyle = zone.kind === 'safe' ? 'rgba(72,207,122,.11)' : zone.kind === 'pvp' ? 'rgba(222,76,76,.12)' : 'rgba(91,157,213,.1)';
      ctx.strokeStyle = zone.kind === 'safe' ? 'rgba(103,232,147,.65)' : 'rgba(116,184,235,.65)';
      ctx.fillRect(sx, sy, zone.width * tilePx, zone.height * tilePx); ctx.strokeRect(sx, sy, zone.width * tilePx, zone.height * tilePx);
    }

    if (visible.objects) {
      const sorted = [...mapDoc.objects].sort((a, b) => a.y - b.y);
      for (const object of sorted) {
        const selected = selection?.kind === 'object' && selection.id === object.id;
        drawObjectAsset(ctx, getPaletteEntry(object.assetId), { x: ((object.x + .5) * mapDoc.tileSize - cameraX) * zoom, y: ((object.y + 1) * mapDoc.tileSize - cameraY) * zoom, tilePixels: tilePx, scale: object.scale ?? 1, selected, onReady: () => render(), now });
      }
    }

    if (collisionVisible || (visible.collision && layer === 'collision')) {
      ctx.fillStyle = 'rgba(239,73,73,.3)';
      for (const key of mapDoc.collision) { const point = parseTileKey(key); ctx.fillRect((point.x * mapDoc.tileSize - cameraX) * zoom, (point.y * mapDoc.tileSize - cameraY) * zoom, tilePx, tilePx); }
      for (const object of mapDoc.objects) for (const cell of getPaletteEntry(object.assetId).footprint?.collision ?? []) ctx.fillRect(((object.x + cell.x) * mapDoc.tileSize - cameraX) * zoom, ((object.y + cell.y) * mapDoc.tileSize - cameraY) * zoom, tilePx, tilePx);
    }

    if (gridVisible && tilePx >= 10) {
      ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,.075)'; ctx.lineWidth = 1;
      for (let x = startX; x <= endX + 1; x++) { const sx = (x * mapDoc.tileSize - cameraX) * zoom; ctx.moveTo(sx, 0); ctx.lineTo(sx, rect.height); }
      for (let y = startY; y <= endY + 1; y++) { const sy = (y * mapDoc.tileSize - cameraY) * zoom; ctx.moveTo(0, sy); ctx.lineTo(rect.width, sy); }
      ctx.stroke();
    }

    if (hoverTile && tool === 'brush' && validTile(hoverTile.x, hoverTile.y) && !locked[layer]) {
      const x = ((hoverTile.x + .5) * mapDoc.tileSize - cameraX) * zoom, y = ((hoverTile.y + 1) * mapDoc.tileSize - cameraY) * zoom;
      if (entry.palette === 'terrain') {
        ctx.fillStyle = 'rgba(143,220,255,.18)'; ctx.strokeStyle = '#8ddcff';
        const sx = (hoverTile.x * mapDoc.tileSize - cameraX) * zoom, sy = (hoverTile.y * mapDoc.tileSize - cameraY) * zoom;
        ctx.fillRect(sx, sy, tilePx * brushSize, tilePx * brushSize); ctx.strokeRect(sx, sy, tilePx * brushSize, tilePx * brushSize);
      } else if (entry.palette !== 'zone') drawObjectAsset(ctx, entry, { x, y, tilePixels: tilePx, alpha: .55, now });
    }

    renderMinimap();
  };

  const renderMinimap = () => {
    if (!minimapVisible) return;
    const shell = minimap.parentElement!; const rect = shell.getBoundingClientRect(); const dpr = Math.min(2, devicePixelRatio || 1);
    minimap.width = Math.max(1, Math.floor(rect.width * dpr)); minimap.height = Math.max(1, Math.floor(rect.height * dpr)); minimap.style.width = `${rect.width}px`; minimap.style.height = `${rect.height}px`;
    minimapCtx.setTransform(dpr, 0, 0, dpr, 0, 0); minimapCtx.clearRect(0, 0, rect.width, rect.height);
    const sx = rect.width / mapDoc.width, sy = rect.height / mapDoc.height;
    minimapCtx.fillStyle = mapDoc.metadata.background || '#3f6b3b'; minimapCtx.fillRect(0, 0, rect.width, rect.height);
    for (const [key, value] of Object.entries(mapDoc.tiles)) { const point = parseTileKey(key); const e = getPaletteEntry(value.ground ?? 'grass'); minimapCtx.fillStyle = e.color; minimapCtx.fillRect(point.x * sx, point.y * sy, Math.ceil(sx), Math.ceil(sy)); }
    minimapCtx.fillStyle = '#e6f5ff'; for (const object of mapDoc.objects) minimapCtx.fillRect(object.x * sx - 1, object.y * sy - 1, 3, 3);
    const view = viewSize(); minimapCtx.strokeStyle = '#7fd7ff'; minimapCtx.lineWidth = 1.5; minimapCtx.strokeRect(cameraX / mapDoc.tileSize * sx, cameraY / mapDoc.tileSize * sy, view.width / zoom / mapDoc.tileSize * sx, view.height / zoom / mapDoc.tileSize * sy);
  };

  const renderFolders = () => {
    const counts = new Map<string, number>();
    for (const value of MAP_PALETTE_ENTRIES) counts.set(inferFolder(value), (counts.get(inferFolder(value)) ?? 0) + 1);
    folderNode.innerHTML = FOLDERS.map((value) => `<button data-folder="${value.id}" class="${folder === value.id ? 'active' : ''}"><span class="icon">${value.icon}</span><span>${value.label}</span><small>${value.id === 'all' ? MAP_PALETTE_ENTRIES.length : value.id === 'favorites' ? favorites.size : counts.get(value.id) ?? 0}</small></button>`).join('');
    folderNode.querySelectorAll<HTMLButtonElement>('[data-folder]').forEach((button) => button.onclick = () => { folder = button.dataset.folder as FolderDef['id']; renderFolders(); renderAssets(); });
  };

  const assetMatches = (value: MapPaletteEntry) => {
    if (folder === 'favorites' && !favorites.has(value.id)) return false;
    if (folder !== 'all' && folder !== 'favorites' && inferFolder(value) !== folder) return false;
    if (sourceFilter !== 'all' && value.source !== sourceFilter) return false;
    const query = searchInput.value.trim().toLocaleLowerCase('pt-BR');
    return !query || `${value.label} ${value.description} ${(value.tags ?? []).join(' ')}`.toLocaleLowerCase('pt-BR').includes(query);
  };

  const renderAssetCanvases = () => {
    const now = performance.now();
    root.querySelectorAll<HTMLCanvasElement>('.me2-asset-thumb canvas,.me2-recent canvas').forEach((node) => {
      const id = node.dataset.asset; const value = id ? MAP_PALETTE_ENTRIES.find((asset) => asset.id === id) : null; if (value) drawAssetThumbnail(node, value, now);
    });
  };

  const bindAssetCard = (card: HTMLElement, value: MapPaletteEntry) => {
    card.onclick = (event) => { if ((event.target as HTMLElement).closest('[data-favorite]')) return; chooseEntry(value); };
    card.draggable = value.palette !== 'zone';
    card.ondragstart = (event) => { event.dataTransfer?.setData('application/x-ascension-asset', value.id); event.dataTransfer!.effectAllowed = 'copy'; chooseEntry(value); };
    const favorite = card.querySelector<HTMLButtonElement>('[data-favorite]'); if (favorite) favorite.onclick = (event) => { event.stopPropagation(); toggleFavorite(value.id); };
  };

  const renderAssets = () => {
    const values = MAP_PALETTE_ENTRIES.filter(assetMatches);
    root.querySelector<HTMLElement>('#me2-assets-count')!.textContent = `${values.length} itens`;
    const title = FOLDERS.find((value) => value.id === folder)?.label ?? 'Assets'; root.querySelector<HTMLElement>('#me2-folder-title')!.textContent = title;
    assetGrid.innerHTML = values.length ? values.map((value) => `<article class="me2-asset-card ${entry.id === value.id ? 'active' : ''}" data-asset-card="${value.id}" title="${escapeHtml(value.description)}"><button class="star ${favorites.has(value.id) ? 'on' : ''}" data-favorite="${value.id}">★</button><div class="me2-asset-thumb"><canvas data-asset="${value.id}"></canvas>${value.sprite?.animation?.frames.length ? '<span class="animated">▶</span>' : ''}</div><strong>${escapeHtml(value.label)}</strong><small>${escapeHtml(value.source === 'pixel-crawler' ? 'Pixel Crawler' : value.source === 'custom' ? 'Meus assets' : inferFolder(value))}</small></article>`).join('') : '<div class="me2-empty"><b>Nenhum asset encontrado</b><span>Arraste um PNG aqui ou limpe os filtros.</span></div>';
    assetGrid.querySelectorAll<HTMLElement>('[data-asset-card]').forEach((card) => { const value = MAP_PALETTE_ENTRIES.find((asset) => asset.id === card.dataset.assetCard); if (value) bindAssetCard(card, value); });
    renderAssetCanvases();
  };

  const renderRecents = () => {
    const node = root.querySelector<HTMLElement>('#me2-recents')!;
    const values = recents.map((id) => MAP_PALETTE_ENTRIES.find((value) => value.id === id)).filter((value): value is MapPaletteEntry => Boolean(value)).slice(0, 6);
    node.innerHTML = values.length ? `<div class="me2-recents-title">Recentes</div><div class="me2-recents-row">${values.map((value) => `<button class="me2-recent" data-recent="${value.id}" title="${escapeHtml(value.label)}"><canvas data-asset="${value.id}"></canvas></button>`).join('')}</div>` : '';
    node.querySelectorAll<HTMLButtonElement>('[data-recent]').forEach((button) => button.onclick = () => { const value = MAP_PALETTE_ENTRIES.find((asset) => asset.id === button.dataset.recent); if (value) chooseEntry(value); });
    renderAssetCanvases();
  };

  const renderLayers = () => {
    layersNode.innerHTML = LAYERS.map((value) => `<div class="me2-layer ${layer === value.id ? 'active' : ''}" data-layer="${value.id}"><button data-eye="${value.id}" title="Mostrar/ocultar">${visible[value.id] ? '◉' : '○'}</button><span>${value.icon} ${value.label}</span><button data-lock="${value.id}" title="Bloquear">${locked[value.id] ? '🔒' : '○'}</button></div>`).join('');
    layersNode.querySelectorAll<HTMLElement>('[data-layer]').forEach((node) => node.onclick = () => { layer = node.dataset.layer as MapLayerId; renderLayers(); refreshChrome(); render(); });
    layersNode.querySelectorAll<HTMLButtonElement>('[data-eye]').forEach((button) => button.onclick = (event) => { event.stopPropagation(); const id = button.dataset.eye as MapLayerId; visible[id] = !visible[id]; renderLayers(); render(); });
    layersNode.querySelectorAll<HTMLButtonElement>('[data-lock]').forEach((button) => button.onclick = (event) => { event.stopPropagation(); const id = button.dataset.lock as MapLayerId; locked[id] = !locked[id]; renderLayers(); });
  };

  const refreshInspector = () => {
    const selected = selection;
    if (!selected) {
      inspector.innerHTML = `<div class="me2-inspector-empty"><div class="preview"><canvas id="me2-current-preview"></canvas></div><strong>${escapeHtml(entry.label)}</strong><span>${escapeHtml(entry.description)}</span><div class="badges"><b>${escapeHtml(inferFolder(entry))}</b>${entry.sprite?.animation?.frames.length ? `<b>${entry.sprite.animation.frames.length} frames</b>` : ''}${entry.source ? `<b>${escapeHtml(entry.source)}</b>` : ''}</div><p>Clique no mapa para colocar. Arraste o card do asset direto para uma posição se preferir.</p></div>`;
      const canvas = inspector.querySelector<HTMLCanvasElement>('#me2-current-preview'); if (canvas) drawAssetThumbnail(canvas, entry); return;
    }
    if (selected.kind === 'object') {
      const object = mapDoc.objects.find((value) => value.id === selected.id); if (!object) { selection = null; refreshInspector(); return; }
      const asset = getPaletteEntry(object.assetId);
      inspector.innerHTML = `<div class="me2-inspector-object"><div class="hero"><canvas id="me2-ins-preview"></canvas><div><strong>${escapeHtml(asset.label)}</strong><span>${escapeHtml(inferFolder(asset))}</span></div></div><div class="me2-property-grid"><label>X<input id="me2-ins-x" type="number" value="${object.x}"></label><label>Y<input id="me2-ins-y" type="number" value="${object.y}"></label><label>Escala<input id="me2-ins-scale" type="number" min="0.1" max="10" step="0.1" value="${object.scale ?? 1}"></label></div><div class="me2-ins-actions"><button id="me2-center">◎ Centralizar</button><button id="me2-duplicate">⧉ Duplicar</button><button class="danger" id="me2-delete">Excluir</button></div><details class="me2-advanced"><summary>Propriedades avançadas</summary><dl><dt>Asset ID</dt><dd>${escapeHtml(asset.id)}</dd><dt>Tipo</dt><dd>${escapeHtml(object.kind)}</dd><dt>Sprite</dt><dd>${asset.sprite ? `${asset.sprite.nativeWidth}×${asset.sprite.nativeHeight}` : 'placeholder'}</dd><dt>Footprint</dt><dd>${asset.footprint ? `${asset.footprint.width}×${asset.footprint.height}` : '1×1'}</dd></dl>${isV2LibraryAsset(asset) ? '<button class="danger-outline" id="me2-remove-library">Remover asset da biblioteca</button>' : ''}</details></div>`;
      const previewCanvas = inspector.querySelector<HTMLCanvasElement>('#me2-ins-preview'); if (previewCanvas) drawAssetThumbnail(previewCanvas, asset);
      const update = () => { beginMutation('Editar objeto'); object.x = clamp(Number(inspector.querySelector<HTMLInputElement>('#me2-ins-x')!.value) || 0, 0, mapDoc.width - 1); object.y = clamp(Number(inspector.querySelector<HTMLInputElement>('#me2-ins-y')!.value) || 0, 0, mapDoc.height - 1); object.scale = clamp(Number(inspector.querySelector<HTMLInputElement>('#me2-ins-scale')!.value) || 1, .1, 10); finishMutation(); };
      inspector.querySelector<HTMLInputElement>('#me2-ins-x')!.onchange = update; inspector.querySelector<HTMLInputElement>('#me2-ins-y')!.onchange = update; inspector.querySelector<HTMLInputElement>('#me2-ins-scale')!.onchange = update;
      inspector.querySelector<HTMLButtonElement>('#me2-center')!.onclick = () => { const view = viewSize(); cameraX = object.x * mapDoc.tileSize - view.width / (2 * zoom); cameraY = object.y * mapDoc.tileSize - view.height / (2 * zoom); clampCamera(); render(); };
      inspector.querySelector<HTMLButtonElement>('#me2-duplicate')!.onclick = () => { beginMutation('Duplicar objeto'); const copy = clone(object); copy.id = uid('object'); copy.x = clamp(copy.x + 1, 0, mapDoc.width - 1); mapDoc.objects.push(copy); selection = { kind: 'object', id: copy.id }; finishMutation(); refreshInspector(); };
      inspector.querySelector<HTMLButtonElement>('#me2-delete')!.onclick = deleteSelection;
      const remove = inspector.querySelector<HTMLButtonElement>('#me2-remove-library'); if (remove) remove.onclick = async () => { if (!confirm('Remover este asset da biblioteca? Objetos já colocados ficarão sem sprite até serem substituídos.')) return; await deleteLibraryAsset(asset.id); selection = null; entry = getPaletteEntry('grass'); renderFolders(); renderAssets(); refreshInspector(); render(); };
      return;
    }
    const zone = mapDoc.zones.find((value) => value.id === selected.id); if (!zone) { selection = null; refreshInspector(); return; }
    inspector.innerHTML = `<div class="me2-inspector-object"><div class="hero zone"><div class="zone-icon">▣</div><div><strong>${escapeHtml(zone.name || 'Zona')}</strong><span>${escapeHtml(zone.kind)}</span></div></div><div class="me2-property-grid"><label>Nome<input id="me2-zone-name" value="${escapeHtml(zone.name ?? '')}"></label><label>X<input id="me2-zone-x" type="number" value="${zone.x}"></label><label>Y<input id="me2-zone-y" type="number" value="${zone.y}"></label><label>Largura<input id="me2-zone-w" type="number" min="1" value="${zone.width}"></label><label>Altura<input id="me2-zone-h" type="number" min="1" value="${zone.height}"></label></div><div class="me2-ins-actions"><button class="danger" id="me2-delete">Excluir zona</button></div></div>`;
    const update = () => { beginMutation('Editar zona'); zone.name = inspector.querySelector<HTMLInputElement>('#me2-zone-name')!.value; zone.x = clamp(Number(inspector.querySelector<HTMLInputElement>('#me2-zone-x')!.value) || 0, 0, mapDoc.width - 1); zone.y = clamp(Number(inspector.querySelector<HTMLInputElement>('#me2-zone-y')!.value) || 0, 0, mapDoc.height - 1); zone.width = Math.max(1, Number(inspector.querySelector<HTMLInputElement>('#me2-zone-w')!.value) || 1); zone.height = Math.max(1, Number(inspector.querySelector<HTMLInputElement>('#me2-zone-h')!.value) || 1); finishMutation(); };
    inspector.querySelectorAll<HTMLInputElement>('input').forEach((input) => input.onchange = update); inspector.querySelector<HTMLButtonElement>('#me2-delete')!.onclick = deleteSelection;
  };

  const refreshMapSelect = () => {
    const select = root.querySelector<HTMLSelectElement>('#me2-map-select')!; const docs = listMapDocuments();
    select.innerHTML = docs.map((value) => `<option value="${value.id}" ${value.id === mapDoc.id ? 'selected' : ''}>${escapeHtml(value.name)}</option>`).join('');
  };
  const refreshChrome = () => {
    const toolDef = TOOLS.find((value) => value.id === tool); root.querySelector<HTMLElement>('#me2-status-tool')!.textContent = toolDef?.label ?? tool;
    root.querySelector<HTMLElement>('#me2-status-layer')!.textContent = LAYERS.find((value) => value.id === layer)?.label ?? layer;
    root.querySelector<HTMLElement>('#me2-count')!.textContent = `${mapDoc.objects.length} objetos • ${mapDoc.zones.length} zonas`;
    root.querySelector<HTMLInputElement>('#me2-zoom-slider')!.value = String(Math.round(zoom * 100)); root.querySelector<HTMLElement>('#me2-zoom-label')!.textContent = `${Math.round(zoom * 100)}%`;
    root.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => button.classList.toggle('active', button.dataset.tool === tool));
    root.querySelector<HTMLElement>('#me2-map-chip')!.textContent = `${mapDoc.name} • ${mapDoc.width}×${mapDoc.height}`;
  };
  const refreshAll = () => { renderFolders(); renderAssets(); renderRecents(); renderLayers(); refreshInspector(); refreshMapSelect(); refreshChrome(); render(); };

  const selectTool = (next: MapToolId) => { tool = next; refreshChrome(); render(); };
  root.querySelector<HTMLElement>('#me2-tools')!.innerHTML = TOOLS.map((value) => `<button data-tool="${value.id}" title="${value.label} (${value.key})"><span>${value.icon}</span><small>${value.label}</small></button>`).join('');
  root.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => button.onclick = () => selectTool(button.dataset.tool as MapToolId));

  canvas.onpointerdown = (event) => {
    if (event.button === 1 || spaceDown || tool === 'pan') { dragMode = 'pan'; pointerStart = { x: event.clientX, y: event.clientY, cameraX, cameraY }; canvas.setPointerCapture(event.pointerId); return; }
    const tile = screenToTile(event.clientX, event.clientY);
    if (tool === 'select') {
      useTool(tile.x, tile.y, true);
      const selected = selection;
      if (selected?.kind === 'object') { dragMode = 'move'; beginMutation('Mover objeto'); canvas.setPointerCapture(event.pointerId); }
      return;
    }
    dragMode = 'paint'; useTool(tile.x, tile.y, true); canvas.setPointerCapture(event.pointerId);
  };
  canvas.onpointermove = (event) => {
    const tile = screenToTile(event.clientX, event.clientY); hoverTile = tile; root.querySelector<HTMLElement>('#me2-status-pos')!.textContent = `X ${tile.x} • Y ${tile.y}`; root.querySelector<HTMLElement>('#me2-hover-chip')!.textContent = validTile(tile.x, tile.y) ? `${entry.label}` : '';
    if (dragMode === 'pan') { cameraX = pointerStart.cameraX - (event.clientX - pointerStart.x) / zoom; cameraY = pointerStart.cameraY - (event.clientY - pointerStart.y) / zoom; clampCamera(); render(); return; }
    if (dragMode === 'move') {
      const selected = selection; if (selected?.kind === 'object') { const object = mapDoc.objects.find((value) => value.id === selected.id); if (object && validTile(tile.x, tile.y)) { object.x = tile.x; object.y = tile.y; markDirty(); schedulePreview(); refreshInspector(); render(); } } return;
    }
    if (dragMode === 'paint') useTool(tile.x, tile.y, false); else render();
  };
  canvas.onpointerup = () => { if (dragMode === 'paint' || dragMode === 'move') finishMutation(); dragMode = 'none'; };
  canvas.onpointerleave = () => { hoverTile = null; if (dragMode === 'paint' || dragMode === 'move') finishMutation(); dragMode = 'none'; render(); };
  canvas.onwheel = (event) => { event.preventDefault(); const rect = canvas.getBoundingClientRect(); setZoom(zoom * (event.deltaY < 0 ? 1.12 : .89), event.clientX - rect.left, event.clientY - rect.top); };
  canvas.oncontextmenu = (event) => event.preventDefault();

  stage.ondragover = (event) => { event.preventDefault(); if (event.dataTransfer?.types.includes('application/x-ascension-asset')) event.dataTransfer.dropEffect = 'copy'; };
  stage.ondrop = (event) => {
    event.preventDefault();
    const id = event.dataTransfer?.getData('application/x-ascension-asset'); if (!id) return;
    const value = MAP_PALETTE_ENTRIES.find((asset) => asset.id === id); if (!value) return;
    const tile = screenToTile(event.clientX, event.clientY); chooseEntry(value); beginMutation('Colocar asset'); if (value.palette === 'terrain') paintTerrain(tile.x, tile.y); else placeObject(tile.x, tile.y, value); finishMutation(); refreshInspector();
  };

  const openStudio = (file: File) => openMapAssetStudio(file, (entries) => { renderFolders(); renderAssets(); if (entries[0]) chooseEntry(entries[0]); preloadMapAssets(entries, render); showToast(`${entries.length} asset(s) adicionado(s).`); }).catch((error) => showToast(error instanceof Error ? error.message : 'Falha ao importar imagem.'));
  root.addEventListener('dragenter', (event) => { if ([...(event.dataTransfer?.items ?? [])].some((item) => item.kind === 'file')) root.classList.add('file-dragging'); });
  root.addEventListener('dragover', (event) => { if ([...(event.dataTransfer?.items ?? [])].some((item) => item.kind === 'file')) event.preventDefault(); });
  root.addEventListener('dragleave', (event) => { if (!root.contains(event.relatedTarget as Node)) root.classList.remove('file-dragging'); });
  root.addEventListener('drop', (event) => { const file = event.dataTransfer?.files?.[0]; if (!file) return; event.preventDefault(); root.classList.remove('file-dragging'); openStudio(file); });
  root.querySelector<HTMLButtonElement>('#me2-asset-studio')!.onclick = () => openImagePicker(openStudio);

  const openNewMap = () => {
    const modal = document.createElement('div'); modal.className = 'me2-modal-backdrop'; modal.innerHTML = `<form class="me2-modal"><header><strong>Novo mapa</strong><button type="button" data-close>×</button></header><div class="body"><label>Nome<input id="new-name" value="Novo Mapa"></label><div class="row"><label>Largura<input id="new-w" type="number" min="8" max="512" value="80"></label><label>Altura<input id="new-h" type="number" min="8" max="512" value="60"></label></div><label>Tile lógico<select id="new-tile"><option value="32">32 px</option><option value="16">16 px</option><option value="64">64 px</option></select></label></div><footer><button type="button" data-close>Cancelar</button><button class="primary">Criar mapa</button></footer></form>`; document.body.appendChild(modal);
    modal.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((button) => button.onclick = () => modal.remove());
    modal.querySelector<HTMLFormElement>('form')!.onsubmit = (event) => { event.preventDefault(); mapDoc = saveMapDocument(createBlankMap(modal.querySelector<HTMLInputElement>('#new-name')!.value.trim() || 'Novo Mapa', Number(modal.querySelector<HTMLInputElement>('#new-w')!.value) || 80, Number(modal.querySelector<HTMLInputElement>('#new-h')!.value) || 60, Number(modal.querySelector<HTMLSelectElement>('#new-tile')!.value) || 32)); selection = null; undoStack.length = 0; redoStack.length = 0; initialized = false; modal.remove(); markSaved(); refreshAll(); requestAnimationFrame(fitMap); };
  };

  root.querySelector<HTMLButtonElement>('#me2-new')!.onclick = openNewMap;
  root.querySelector<HTMLButtonElement>('#me2-save')!.onclick = save;
  root.querySelector<HTMLButtonElement>('#me2-undo')!.onclick = undo; root.querySelector<HTMLButtonElement>('#me2-redo')!.onclick = redo;
  root.querySelector<HTMLButtonElement>('#me2-export')!.onclick = () => downloadText(`${mapDoc.id}.ascension-map.json`, JSON.stringify(mapDoc, null, 2));
  root.querySelector<HTMLButtonElement>('#me2-import-map')!.onclick = () => mapFile.click();
  mapFile.onchange = async () => { const file = mapFile.files?.[0]; if (!file) return; try { mapDoc = importMapDocument(await file.text()); selection = null; initialized = false; markSaved(); refreshAll(); requestAnimationFrame(fitMap); } catch (error) { showToast(error instanceof Error ? error.message : 'Mapa inválido.'); } finally { mapFile.value = ''; } };
  root.querySelector<HTMLSelectElement>('#me2-map-select')!.onchange = (event) => { const next = loadMapDocument((event.target as HTMLSelectElement).value); if (!next) return; mapDoc = next; selection = null; undoStack.length = 0; redoStack.length = 0; markSaved(); refreshAll(); requestAnimationFrame(fitMap); };
  root.querySelector<HTMLButtonElement>('#me2-playtest')!.onclick = () => { publishPreview(); window.open(`${location.pathname}?playtest=map&id=${encodeURIComponent(mapDoc.id)}`, '_blank'); };
  root.querySelector<HTMLButtonElement>('#me2-game')!.onclick = () => { if (dirty && !confirm('Existem alterações não salvas. Sair mesmo assim?')) return; location.href = location.pathname; };
  root.querySelector<HTMLButtonElement>('#me2-grid')!.onclick = (event) => { gridVisible = !gridVisible; (event.currentTarget as HTMLButtonElement).classList.toggle('active', gridVisible); render(); };
  root.querySelector<HTMLButtonElement>('#me2-collision-toggle')!.onclick = (event) => { collisionVisible = !collisionVisible; (event.currentTarget as HTMLButtonElement).classList.toggle('active', collisionVisible); render(); };
  root.querySelector<HTMLButtonElement>('#me2-fit')!.onclick = fitMap;
  root.querySelector<HTMLButtonElement>('#me2-zoom-in')!.onclick = () => setZoom(zoom * 1.15); root.querySelector<HTMLButtonElement>('#me2-zoom-out')!.onclick = () => setZoom(zoom * .87);
  root.querySelector<HTMLInputElement>('#me2-zoom-slider')!.oninput = (event) => setZoom(Number((event.target as HTMLInputElement).value) / 100);
  root.querySelector<HTMLSelectElement>('#me2-brush-size')!.onchange = (event) => { brushSize = Number((event.target as HTMLSelectElement).value) || 1; };
  root.querySelector<HTMLButtonElement>('#me2-minimap-toggle')!.onclick = (event) => { minimapVisible = !minimapVisible; root.querySelector<HTMLElement>('#me2-minimap-shell')!.classList.toggle('hidden', !minimapVisible); (event.currentTarget as HTMLButtonElement).textContent = minimapVisible ? 'ocultar' : 'mostrar'; };
  root.querySelector<HTMLButtonElement>('#me2-collapse-assets')!.onclick = () => root.classList.toggle('assets-collapsed');
  searchInput.oninput = renderAssets;
  root.querySelectorAll<HTMLButtonElement>('[data-source]').forEach((button) => button.onclick = () => { sourceFilter = button.dataset.source as typeof sourceFilter; root.querySelectorAll<HTMLButtonElement>('[data-source]').forEach((node) => node.classList.toggle('active', node === button)); renderAssets(); });
  root.querySelectorAll<HTMLButtonElement>('[data-right-tab]').forEach((button) => button.onclick = () => { const tab = button.dataset.rightTab; root.querySelectorAll<HTMLButtonElement>('[data-right-tab]').forEach((node) => node.classList.toggle('active', node === button)); root.querySelector<HTMLElement>('#me2-right-layers')!.classList.toggle('hidden', tab !== 'layers'); root.querySelector<HTMLElement>('#me2-right-inspector')!.classList.toggle('hidden', tab !== 'inspector'); if (tab === 'inspector') refreshInspector(); });

  minimap.onclick = (event) => { const rect = minimap.getBoundingClientRect(); const x = (event.clientX - rect.left) / rect.width * mapDoc.width; const y = (event.clientY - rect.top) / rect.height * mapDoc.height; const view = viewSize(); cameraX = x * mapDoc.tileSize - view.width / (2 * zoom); cameraY = y * mapDoc.tileSize - view.height / (2 * zoom); clampCamera(); render(); };

  window.addEventListener('keydown', (event) => {
    const editable = (event.target as HTMLElement | null)?.matches('input,textarea,select,[contenteditable="true"]'); if (editable) return;
    if (event.code === 'Space') { spaceDown = true; event.preventDefault(); }
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyS') { event.preventDefault(); save(); return; }
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyY') { event.preventDefault(); redo(); return; }
    const key = event.key.toUpperCase(); const toolDef = TOOLS.find((value) => value.key === key); if (toolDef) selectTool(toolDef.id);
    if ((event.key === 'Delete' || event.key === 'Backspace') && selection) { event.preventDefault(); deleteSelection(); }
    if (event.key === 'Escape') { selection = null; refreshInspector(); render(); }
  });
  window.addEventListener('keyup', (event) => { if (event.code === 'Space') spaceDown = false; });
  window.addEventListener('blur', () => { spaceDown = false; dragMode = 'none'; });
  window.addEventListener('pagehide', () => previewPublisher.close(), { once: true });

  const observer = new ResizeObserver(() => { if (!initialized) { initialized = true; requestAnimationFrame(fitMap); } else render(); }); observer.observe(stage);
  preloadMapAssets(MAP_PALETTE_ENTRIES, render);

  const animationLoop = (time: number) => {
    if (MAP_PALETTE_ENTRIES.some((value) => value.sprite?.animation?.frames.length)) render(time);
    if (time - thumbnailTimer > 100) { renderAssetCanvases(); thumbnailTimer = time; }
    requestAnimationFrame(animationLoop);
  };

  refreshAll();
  requestAnimationFrame(animationLoop);
}
