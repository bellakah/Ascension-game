import './mapEditor.css';
import { MAP_PALETTES, MAP_PALETTE_ENTRIES, getPaletteEntry } from './mapEditorCatalog';
import { createBlankMap, importMapDocument, listMapDocuments, loadMapDocument, loadOrCreateActiveMap, saveMapDocument } from './mapEditorStorage';
import type { AscensionMapDocument, EditorSnapshot, MapLayerId, MapObject, MapPaletteEntry, MapPaletteId, MapToolId, MapZone } from './mapEditorTypes';
import { parseTileKey, tileKey } from './mapEditorTypes';

type Selection =
  | { kind: 'object'; id: string }
  | { kind: 'zone'; id: string }
  | { kind: 'tile'; x: number; y: number }
  | null;
type DragMode = 'none' | 'paint' | 'pan' | 'move';

type ToolDef = { id: MapToolId; icon: string; label: string; key: string };

const TOOLS: ToolDef[] = [
  { id: 'select', icon: '⌁', label: 'Selecionar', key: 'V' },
  { id: 'brush', icon: '✎', label: 'Pincel', key: 'B' },
  { id: 'eraser', icon: '⌫', label: 'Borracha', key: 'E' },
  { id: 'fill', icon: '▨', label: 'Preencher', key: 'F' },
  { id: 'collision', icon: '▧', label: 'Colisão', key: 'C' },
  { id: 'pan', icon: '✥', label: 'Mover visão', key: 'H' },
];
const LAYERS: Array<{ id: MapLayerId; label: string; icon: string }> = [
  { id: 'ground', label: 'Terreno', icon: '▦' },
  { id: 'detail', label: 'Detalhes', icon: '✦' },
  { id: 'objects', label: 'Objetos', icon: '◆' },
  { id: 'collision', label: 'Colisão', icon: '▧' },
  { id: 'zones', label: 'Zonas', icon: '▣' },
];

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char] ?? char);

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function startMapEditor() {
  document.body.className = 'map-editor-mode';
  document.title = 'Ascension Map Editor';
  const mount = document.querySelector<HTMLElement>('#app') ?? document.body;
  mount.innerHTML = '';

  let mapDoc: AscensionMapDocument = loadOrCreateActiveMap();
  let tool: MapToolId = 'brush';
  let palette: MapPaletteId = 'terrain';
  let entry: MapPaletteEntry = getPaletteEntry('grass');
  let layer: MapLayerId = 'ground';
  let brushSize = 1;
  let zoom = .55;
  let cameraX = 0;
  let cameraY = 0;
  let selection: Selection = null;
  let dragMode: DragMode = 'none';
  let dirty = false;
  let actionOpen = false;
  let lastPaintKey = '';
  let gridVisible = true;
  let spaceDown = false;
  let initializedViewport = false;
  let pointerStart = { x: 0, y: 0, cameraX: 0, cameraY: 0 };
  const undoStack: EditorSnapshot[] = [];
  const redoStack: EditorSnapshot[] = [];
  const visible: Record<MapLayerId, boolean> = { ground: true, detail: true, objects: true, collision: true, zones: true };

  const root = document.createElement('div');
  root.className = 'map-editor';
  root.innerHTML = `
    <div class="me-menubar">
      <div class="me-brand"><span class="me-brand-badge">A</span>ASCENSION MAP EDITOR</div>
      <button id="me-new">Arquivo</button><button id="me-save">Salvar</button><button id="me-import">Importar</button><button id="me-export">Exportar</button>
      <button class="optional" id="me-map-settings">Mapa</button><button class="optional" id="me-fit">Enquadrar</button>
      <div class="me-spacer"></div><span class="me-doc-name" id="me-doc-name"></span><button id="me-back-game">↗ Jogo</button>
    </div>
    <div class="me-toolbar">
      <div class="me-tool-group"><button id="me-undo" title="Ctrl+Z">↶</button><button id="me-redo" title="Ctrl+Y">↷</button></div>
      <div class="me-tool-group" id="me-tools"></div>
      <div class="me-tool-group"><label>Brush <select id="me-brush-size"><option value="1">1×1</option><option value="2">2×2</option><option value="3">3×3</option><option value="5">5×5</option><option value="7">7×7</option></select></label></div>
      <div class="me-tool-group optional"><label>Mapa <select id="me-map-select"></select></label></div>
      <div class="me-spacer"></div><div class="me-tool-group"><button id="me-grid" class="active"># <span class="tool-label">Grade</span></button><button id="me-minimap-toggle" class="active">▤ <span class="tool-label">Minimapa</span></button></div>
    </div>
    <div class="me-workspace">
      <aside class="me-sidebar"><div class="me-panel-head"><strong>Paletas</strong><span>RME workflow</span></div><div class="me-palette-tabs" id="me-palette-tabs"></div><div class="me-search"><input id="me-search" placeholder="Buscar na paleta..." autocomplete="off"></div><div class="me-palette-list" id="me-palette-list"></div></aside>
      <main class="me-canvas-area" id="me-canvas-area"><canvas class="me-canvas" id="me-canvas"></canvas><div class="me-canvas-overlay"><span class="me-chip" id="me-map-chip"></span><span class="me-chip" id="me-selection-chip"></span></div><div class="me-toast" id="me-toast"></div></main>
      <aside class="me-sidebar right"><div class="me-right-scroll">
        <section class="me-section"><div class="me-panel-head"><strong>Layers</strong><span>visibilidade</span></div><div class="me-section-body me-layers" id="me-layers"></div></section>
        <section class="me-section"><div class="me-panel-head"><strong>Inspector</strong><span id="me-inspector-type">seleção</span></div><div class="me-section-body" id="me-inspector"></div></section>
        <section class="me-section" id="me-minimap-section"><div class="me-panel-head"><strong>Minimapa</strong><span>clique para navegar</span></div><div class="me-minimap-wrap"><div class="me-minimap-shell"><canvas class="me-minimap" id="me-minimap"></canvas></div></div></section>
        <section class="me-section"><div class="me-panel-head"><strong>Atalhos</strong><span>rápidos</span></div><div class="me-help"><div><span>Selecionar</span><kbd>V</kbd></div><div><span>Pincel</span><kbd>B</kbd></div><div><span>Borracha</span><kbd>E</kbd></div><div><span>Fill</span><kbd>F</kbd></div><div><span>Colisão</span><kbd>C</kbd></div><div><span>Pan</span><kbd>Espaço</kbd></div><div><span>Salvar</span><kbd>Ctrl+S</kbd></div><div><span>Undo</span><kbd>Ctrl+Z</kbd></div></div></section>
      </div></aside>
    </div>
    <div class="me-statusbar"><span id="me-status-coord">X 0 • Y 0</span><span>Zoom <strong id="me-status-zoom">55%</strong></span><span>Tool <strong id="me-status-tool">Pincel</strong></span><span>Layer <strong id="me-status-layer">Terreno</strong></span><div class="status-right"><span id="me-object-count"></span><span class="me-save-state saved" id="me-save-state">● Salvo</span></div></div>
    <input id="me-file-input" type="file" accept="application/json,.json" hidden>`;
  mount.appendChild(root);

  const canvasArea = root.querySelector<HTMLElement>('#me-canvas-area')!;
  const canvas = root.querySelector<HTMLCanvasElement>('#me-canvas')!;
  const ctx = canvas.getContext('2d')!;
  const minimap = root.querySelector<HTMLCanvasElement>('#me-minimap')!;
  const minimapCtx = minimap.getContext('2d')!;
  const paletteTabs = root.querySelector<HTMLElement>('#me-palette-tabs')!;
  const paletteList = root.querySelector<HTMLElement>('#me-palette-list')!;
  const searchInput = root.querySelector<HTMLInputElement>('#me-search')!;
  const layersNode = root.querySelector<HTMLElement>('#me-layers')!;
  const inspector = root.querySelector<HTMLElement>('#me-inspector')!;
  const inspectorType = root.querySelector<HTMLElement>('#me-inspector-type')!;
  const mapSelect = root.querySelector<HTMLSelectElement>('#me-map-select')!;
  const fileInput = root.querySelector<HTMLInputElement>('#me-file-input')!;
  const saveState = root.querySelector<HTMLElement>('#me-save-state')!;
  const mapChip = root.querySelector<HTMLElement>('#me-map-chip')!;
  const selectionChip = root.querySelector<HTMLElement>('#me-selection-chip')!;
  const coordStatus = root.querySelector<HTMLElement>('#me-status-coord')!;
  const zoomStatus = root.querySelector<HTMLElement>('#me-status-zoom')!;
  const toolStatus = root.querySelector<HTMLElement>('#me-status-tool')!;
  const layerStatus = root.querySelector<HTMLElement>('#me-status-layer')!;
  const objectCount = root.querySelector<HTMLElement>('#me-object-count')!;
  const toast = root.querySelector<HTMLElement>('#me-toast')!;
  let toastTimer = 0;

  const viewSize = () => ({ width: canvas.clientWidth, height: canvas.clientHeight });
  const validTile = (x: number, y: number) => x >= 0 && y >= 0 && x < mapDoc.width && y < mapDoc.height;
  const objectAt = (x: number, y: number) => [...mapDoc.objects].reverse().find((value) => value.x === x && value.y === y) ?? null;
  const zoneAt = (x: number, y: number) => [...mapDoc.zones].reverse().find((value) => x >= value.x && y >= value.y && x < value.x + value.width && y < value.y + value.height) ?? null;

  const showToast = (message: string) => {
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2200);
  };
  const markDirty = () => { dirty = true; saveState.className = 'me-save-state dirty'; saveState.textContent = '● Alterações não salvas'; };
  const markSaved = () => { dirty = false; saveState.className = 'me-save-state saved'; saveState.textContent = '● Salvo'; };
  const beginMutation = (label: string) => {
    if (actionOpen) return;
    undoStack.push({ document: clone(mapDoc), label });
    if (undoStack.length > 80) undoStack.shift();
    redoStack.length = 0;
    actionOpen = true;
  };
  const finishMutation = () => {
    if (actionOpen) { mapDoc.updatedAt = Date.now(); markDirty(); }
    actionOpen = false;
    lastPaintKey = '';
    refreshChrome();
    render();
  };

  const restore = (snapshot: EditorSnapshot, target: EditorSnapshot[]) => {
    target.push({ document: clone(mapDoc), label: snapshot.label });
    mapDoc = clone(snapshot.document);
    selection = null;
    markDirty();
    refreshAll();
  };
  const undo = () => { const snapshot = undoStack.pop(); if (snapshot) { restore(snapshot, redoStack); showToast(`Desfeito: ${snapshot.label}`); } };
  const redo = () => { const snapshot = redoStack.pop(); if (snapshot) { restore(snapshot, undoStack); showToast('Alteração refeita.'); } };
  const save = () => { mapDoc = saveMapDocument(mapDoc); markSaved(); refreshMapSelect(); refreshChrome(); showToast('Mapa salvo no navegador.'); };

  const clampCamera = () => {
    const view = viewSize();
    const maxX = Math.max(0, mapDoc.width * mapDoc.tileSize - view.width / zoom);
    const maxY = Math.max(0, mapDoc.height * mapDoc.tileSize - view.height / zoom);
    cameraX = clamp(cameraX, -120 / zoom, maxX + 120 / zoom);
    cameraY = clamp(cameraY, -120 / zoom, maxY + 120 / zoom);
  };
  const centerTile = (x: number, y: number) => {
    const view = viewSize();
    cameraX = x * mapDoc.tileSize - view.width / (2 * zoom);
    cameraY = y * mapDoc.tileSize - view.height / (2 * zoom);
    clampCamera();
    render();
  };
  const fitMap = () => {
    const view = viewSize();
    const worldW = mapDoc.width * mapDoc.tileSize;
    const worldH = mapDoc.height * mapDoc.tileSize;
    zoom = clamp(Math.min(view.width / worldW, view.height / worldH) * .9, .18, 2.5);
    centerTile(mapDoc.width / 2, mapDoc.height / 2);
    refreshChrome();
  };
  const screenToTile = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    const worldX = (clientX - rect.left) / zoom + cameraX;
    const worldY = (clientY - rect.top) / zoom + cameraY;
    return { x: Math.floor(worldX / mapDoc.tileSize), y: Math.floor(worldY / mapDoc.tileSize) };
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
  const paintObject = (x: number, y: number) => {
    if (!entry.objectKind || !validTile(x, y)) return;
    const paintKey = `${entry.id}:${x},${y}`;
    if (lastPaintKey === paintKey) return;
    lastPaintKey = paintKey;
    if (mapDoc.objects.some((value) => value.x === x && value.y === y && value.assetId === entry.id)) return;
    const value: MapObject = { id: uid('object'), kind: entry.objectKind, assetId: entry.id, x, y, rotation: 0, properties: {} };
    mapDoc.objects.push(value);
    selection = { kind: 'object', id: value.id };
  };
  const paintZone = (x: number, y: number) => {
    if (!entry.zoneKind || lastPaintKey) return;
    lastPaintKey = tileKey(x, y);
    const size = Math.max(1, brushSize);
    const value: MapZone = { id: uid('zone'), kind: entry.zoneKind, x: clamp(x - Math.floor(size / 2), 0, mapDoc.width - 1), y: clamp(y - Math.floor(size / 2), 0, mapDoc.height - 1), width: Math.min(size, mapDoc.width), height: Math.min(size, mapDoc.height), name: entry.label, properties: {} };
    mapDoc.zones.push(value);
    selection = { kind: 'zone', id: value.id };
  };
  const paintCollision = (x: number, y: number) => {
    for (let oy = 0; oy < brushSize; oy++) for (let ox = 0; ox < brushSize; ox++) {
      const tx = x + ox - Math.floor(brushSize / 2), ty = y + oy - Math.floor(brushSize / 2);
      if (!validTile(tx, ty)) continue;
      const key = tileKey(tx, ty);
      if (!mapDoc.collision.includes(key)) mapDoc.collision.push(key);
    }
  };
  const eraseAt = (x: number, y: number) => {
    if (!validTile(x, y)) return;
    if (layer === 'objects') mapDoc.objects = mapDoc.objects.filter((value) => value.x !== x || value.y !== y);
    else if (layer === 'zones') { const value = zoneAt(x, y); if (value) mapDoc.zones = mapDoc.zones.filter((item) => item.id !== value.id); }
    else if (layer === 'collision') mapDoc.collision = mapDoc.collision.filter((key) => key !== tileKey(x, y));
    else { const value = mapDoc.tiles[tileKey(x, y)] ?? {}; if (layer === 'detail') delete value.detail; else value.ground = 'grass'; mapDoc.tiles[tileKey(x, y)] = value; }
  };
  const floodFill = (x: number, y: number) => {
    if (!validTile(x, y) || entry.palette !== 'terrain') return;
    const detail = layer === 'detail';
    const start = mapDoc.tiles[tileKey(x, y)] ?? {};
    const target = detail ? start.detail : (start.ground ?? 'grass');
    if (target === entry.id) return;
    const queue = [{ x, y }], seen = new Set<string>();
    while (queue.length) {
      const point = queue.shift()!;
      if (!validTile(point.x, point.y)) continue;
      const key = tileKey(point.x, point.y);
      if (seen.has(key)) continue;
      seen.add(key);
      const value = mapDoc.tiles[key] ?? {};
      if ((detail ? value.detail : (value.ground ?? 'grass')) !== target) continue;
      if (detail) value.detail = entry.id; else value.ground = entry.id;
      mapDoc.tiles[key] = value;
      queue.push({ x: point.x + 1, y: point.y }, { x: point.x - 1, y: point.y }, { x: point.x, y: point.y + 1 }, { x: point.x, y: point.y - 1 });
    }
  };
  const useToolAt = (x: number, y: number, initial: boolean) => {
    if (!validTile(x, y)) return;
    if (tool === 'select') {
      if (!initial) return;
      const object = visible.objects ? objectAt(x, y) : null;
      const zone = !object && visible.zones ? zoneAt(x, y) : null;
      selection = object ? { kind: 'object', id: object.id } : zone ? { kind: 'zone', id: zone.id } : { kind: 'tile', x, y };
      refreshInspector(); refreshChrome(); render(); return;
    }
    if (tool === 'fill') { if (initial) { beginMutation('Preencher terreno'); floodFill(x, y); } return; }
    beginMutation(tool === 'eraser' ? 'Apagar' : tool === 'collision' ? 'Pintar colisão' : 'Pintar mapa');
    if (tool === 'eraser') eraseAt(x, y);
    else if (tool === 'collision') paintCollision(x, y);
    else if (tool === 'brush') { if (entry.palette === 'terrain') paintTerrain(x, y); else if (entry.palette === 'zone') paintZone(x, y); else paintObject(x, y); }
    refreshInspector(); render();
  };

  const selectTool = (next: MapToolId) => {
    tool = next;
    root.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => button.classList.toggle('active', button.dataset.tool === tool));
    canvas.classList.toggle('tool-pan', tool === 'pan');
    canvas.classList.toggle('tool-select', tool === 'select');
    refreshChrome();
  };
  const selectPalette = (next: MapPaletteId) => {
    palette = next;
    const first = MAP_PALETTE_ENTRIES.find((value) => value.palette === next);
    if (first) { entry = first; layer = first.defaultLayer; if (next !== 'terrain') tool = 'brush'; }
    renderPalette(); renderLayers(); selectTool(tool); refreshInspector();
  };
  const selectEntry = (next: MapPaletteEntry) => { entry = next; layer = next.defaultLayer; if (next.palette !== 'terrain') tool = 'brush'; renderPalette(); renderLayers(); selectTool(tool); refreshInspector(); };

  const renderPalette = () => {
    paletteTabs.innerHTML = MAP_PALETTES.map((value) => `<button data-palette="${value.id}" class="${value.id === palette ? 'active' : ''}" title="${escapeHtml(value.description)}">${value.icon}<span>${escapeHtml(value.label)}</span></button>`).join('');
    paletteTabs.querySelectorAll<HTMLButtonElement>('[data-palette]').forEach((button) => button.onclick = () => selectPalette(button.dataset.palette as MapPaletteId));
    const query = searchInput.value.trim().toLocaleLowerCase('pt-BR');
    const values = MAP_PALETTE_ENTRIES.filter((value) => value.palette === palette && (!query || `${value.label} ${value.description} ${(value.tags ?? []).join(' ')}`.toLocaleLowerCase('pt-BR').includes(query)));
    paletteList.innerHTML = values.length ? values.map((value) => `<button class="me-palette-item ${entry.id === value.id ? 'active' : ''}" data-entry="${value.id}"><span class="me-palette-preview" style="background:${value.color}">${value.icon}</span><span><strong>${escapeHtml(value.label)}</strong><small>${escapeHtml(value.description)}</small></span></button>`).join('') : '<div class="me-inspector-empty">Nenhum elemento encontrado.</div>';
    paletteList.querySelectorAll<HTMLButtonElement>('[data-entry]').forEach((button) => button.onclick = () => selectEntry(getPaletteEntry(button.dataset.entry!)));
  };
  const renderLayers = () => {
    layersNode.innerHTML = LAYERS.map((value) => `<div class="me-layer ${layer === value.id ? 'active' : ''}" data-layer="${value.id}"><button data-visible="${value.id}">${visible[value.id] ? '◉' : '○'}</button><span>${value.icon} ${value.label}</span><span>${layer === value.id ? '●' : ''}</span></div>`).join('');
    layersNode.querySelectorAll<HTMLElement>('[data-layer]').forEach((node) => node.onclick = () => { layer = node.dataset.layer as MapLayerId; renderLayers(); refreshChrome(); render(); });
    layersNode.querySelectorAll<HTMLButtonElement>('[data-visible]').forEach((button) => button.onclick = (event) => { event.stopPropagation(); const id = button.dataset.visible as MapLayerId; visible[id] = !visible[id]; renderLayers(); render(); });
  };

  const deleteSelection = () => {
    const selected = selection;
    if (!selected) return;
    beginMutation('Excluir seleção');
    if (selected.kind === 'object') mapDoc.objects = mapDoc.objects.filter((value) => value.id !== selected.id);
    else if (selected.kind === 'zone') mapDoc.zones = mapDoc.zones.filter((value) => value.id !== selected.id);
    else eraseAt(selected.x, selected.y);
    selection = null;
    finishMutation();
    refreshInspector();
  };

  const refreshInspector = () => {
    const selected = selection;
    if (!selected) { inspectorType.textContent = 'seleção'; inspector.innerHTML = `<div class="me-inspector-empty">Selecione um tile, objeto ou zona para editar propriedades.<br><br><strong>${escapeHtml(entry.label)}</strong><br>${escapeHtml(entry.description)}</div>`; return; }
    if (selected.kind === 'object') {
      const value = mapDoc.objects.find((item) => item.id === selected.id);
      if (!value) { selection = null; refreshInspector(); return; }
      const catalog = getPaletteEntry(value.assetId);
      inspectorType.textContent = value.kind;
      inspector.innerHTML = `<div class="me-inspector-grid"><div class="me-field wide"><label>Objeto</label><input value="${escapeHtml(catalog.label)}" readonly></div><div class="me-field"><label>X</label><input id="me-ins-x" type="number" min="0" max="${mapDoc.width - 1}" value="${value.x}"></div><div class="me-field"><label>Y</label><input id="me-ins-y" type="number" min="0" max="${mapDoc.height - 1}" value="${value.y}"></div><div class="me-field"><label>Rotação</label><input id="me-ins-r" type="number" step="15" value="${value.rotation ?? 0}"></div><div class="me-field"><label>Asset ID</label><input value="${escapeHtml(value.assetId)}" readonly></div></div><div class="me-inspector-actions"><button class="me-small-btn" id="me-center-selection">Centralizar</button><button class="me-small-btn danger" id="me-delete-selection">Excluir</button></div>`;
      const update = () => { beginMutation('Editar objeto'); value.x = clamp(Number(root.querySelector<HTMLInputElement>('#me-ins-x')!.value) || 0, 0, mapDoc.width - 1); value.y = clamp(Number(root.querySelector<HTMLInputElement>('#me-ins-y')!.value) || 0, 0, mapDoc.height - 1); value.rotation = Number(root.querySelector<HTMLInputElement>('#me-ins-r')!.value) || 0; finishMutation(); };
      root.querySelector<HTMLInputElement>('#me-ins-x')!.onchange = update; root.querySelector<HTMLInputElement>('#me-ins-y')!.onchange = update; root.querySelector<HTMLInputElement>('#me-ins-r')!.onchange = update;
      root.querySelector<HTMLButtonElement>('#me-center-selection')!.onclick = () => centerTile(value.x, value.y); root.querySelector<HTMLButtonElement>('#me-delete-selection')!.onclick = deleteSelection; return;
    }
    if (selected.kind === 'zone') {
      const value = mapDoc.zones.find((item) => item.id === selected.id);
      if (!value) { selection = null; refreshInspector(); return; }
      inspectorType.textContent = 'zona';
      inspector.innerHTML = `<div class="me-inspector-grid"><div class="me-field wide"><label>Nome</label><input id="me-zone-name" maxlength="80" value="${escapeHtml(value.name ?? '')}"></div><div class="me-field"><label>X</label><input id="me-zone-x" type="number" min="0" value="${value.x}"></div><div class="me-field"><label>Y</label><input id="me-zone-y" type="number" min="0" value="${value.y}"></div><div class="me-field"><label>Largura</label><input id="me-zone-w" type="number" min="1" value="${value.width}"></div><div class="me-field"><label>Altura</label><input id="me-zone-h" type="number" min="1" value="${value.height}"></div><div class="me-field wide"><label>Tipo</label><input value="${escapeHtml(value.kind)}" readonly></div></div><div class="me-inspector-actions"><button class="me-small-btn" id="me-center-selection">Centralizar</button><button class="me-small-btn danger" id="me-delete-selection">Excluir</button></div>`;
      const update = () => { beginMutation('Editar zona'); value.name = root.querySelector<HTMLInputElement>('#me-zone-name')!.value; value.x = clamp(Number(root.querySelector<HTMLInputElement>('#me-zone-x')!.value) || 0, 0, mapDoc.width - 1); value.y = clamp(Number(root.querySelector<HTMLInputElement>('#me-zone-y')!.value) || 0, 0, mapDoc.height - 1); value.width = clamp(Number(root.querySelector<HTMLInputElement>('#me-zone-w')!.value) || 1, 1, mapDoc.width - value.x); value.height = clamp(Number(root.querySelector<HTMLInputElement>('#me-zone-h')!.value) || 1, 1, mapDoc.height - value.y); finishMutation(); };
      root.querySelectorAll<HTMLInputElement>('#me-zone-name,#me-zone-x,#me-zone-y,#me-zone-w,#me-zone-h').forEach((input) => input.onchange = update);
      root.querySelector<HTMLButtonElement>('#me-center-selection')!.onclick = () => centerTile(value.x + value.width / 2, value.y + value.height / 2); root.querySelector<HTMLButtonElement>('#me-delete-selection')!.onclick = deleteSelection; return;
    }
    const tile = mapDoc.tiles[tileKey(selected.x, selected.y)] ?? {};
    inspectorType.textContent = 'tile';
    inspector.innerHTML = `<div class="me-inspector-grid"><div class="me-field"><label>X</label><input value="${selected.x}" readonly></div><div class="me-field"><label>Y</label><input value="${selected.y}" readonly></div><div class="me-field wide"><label>Ground</label><input value="${escapeHtml(tile.ground ?? 'grass')}" readonly></div><div class="me-field wide"><label>Detail</label><input value="${escapeHtml(tile.detail ?? '—')}" readonly></div><div class="me-field wide"><label>Colisão</label><input value="${mapDoc.collision.includes(tileKey(selected.x, selected.y)) ? 'Bloqueado' : 'Livre'}" readonly></div></div><div class="me-inspector-actions"><button class="me-small-btn danger" id="me-delete-selection">Limpar layer</button></div>`;
    root.querySelector<HTMLButtonElement>('#me-delete-selection')!.onclick = deleteSelection;
  };

  const refreshMapSelect = () => { mapSelect.innerHTML = listMapDocuments().map((value) => `<option value="${value.id}" ${value.id === mapDoc.id ? 'selected' : ''}>${escapeHtml(value.name)}</option>`).join(''); };
  const refreshChrome = () => {
    const toolDef = TOOLS.find((value) => value.id === tool) ?? TOOLS[0];
    const layerDef = LAYERS.find((value) => value.id === layer) ?? LAYERS[0];
    root.querySelector<HTMLElement>('#me-doc-name')!.textContent = `${mapDoc.name} • ${mapDoc.width}×${mapDoc.height}`;
    mapChip.textContent = `${mapDoc.name} · ${mapDoc.width}×${mapDoc.height} · ${mapDoc.tileSize}px`;
    zoomStatus.textContent = `${Math.round(zoom * 100)}%`; toolStatus.textContent = toolDef.label; layerStatus.textContent = layerDef.label;
    objectCount.textContent = `${mapDoc.objects.length} objetos • ${mapDoc.zones.length} zonas`;
    root.querySelector<HTMLButtonElement>('#me-undo')!.disabled = !undoStack.length; root.querySelector<HTMLButtonElement>('#me-redo')!.disabled = !redoStack.length;
    const selected = selection;
    selectionChip.textContent = !selected ? `${entry.icon} ${entry.label}` : selected.kind === 'tile' ? `Tile ${selected.x}, ${selected.y}` : selected.kind === 'object' ? 'Objeto selecionado' : 'Zona selecionada';
  };
  const refreshAll = () => { refreshMapSelect(); renderPalette(); renderLayers(); refreshInspector(); refreshChrome(); render(); };

  const renderMinimap = () => {
    const width = 560, height = 400, sx = width / mapDoc.width, sy = height / mapDoc.height;
    minimap.width = width; minimap.height = height; minimapCtx.fillStyle = mapDoc.metadata.background || '#527b45'; minimapCtx.fillRect(0, 0, width, height);
    for (const [key, tile] of Object.entries(mapDoc.tiles)) { const point = parseTileKey(key); minimapCtx.fillStyle = getPaletteEntry(tile.ground ?? 'grass').color; minimapCtx.fillRect(point.x * sx, point.y * sy, sx + 1, sy + 1); }
    if (visible.zones) for (const value of mapDoc.zones) { const catalog = MAP_PALETTE_ENTRIES.find((item) => item.zoneKind === value.kind); minimapCtx.fillStyle = `${catalog?.color ?? '#7dd29b'}66`; minimapCtx.fillRect(value.x * sx, value.y * sy, value.width * sx, value.height * sy); }
    if (visible.objects) for (const value of mapDoc.objects) { minimapCtx.fillStyle = getPaletteEntry(value.assetId).color; minimapCtx.fillRect(value.x * sx - 1.5, value.y * sy - 1.5, 4, 4); }
    const view = viewSize(); minimapCtx.strokeStyle = '#e5f6ff'; minimapCtx.lineWidth = 2; minimapCtx.strokeRect(cameraX / mapDoc.tileSize * sx, cameraY / mapDoc.tileSize * sy, view.width / zoom / mapDoc.tileSize * sx, view.height / zoom / mapDoc.tileSize * sy);
  };

  const render = () => {
    const view = viewSize(), ts = mapDoc.tileSize, screenTile = ts * zoom;
    ctx.clearRect(0, 0, view.width, view.height); ctx.fillStyle = '#070b0f'; ctx.fillRect(0, 0, view.width, view.height);
    const startX = clamp(Math.floor(cameraX / ts) - 1, 0, mapDoc.width - 1), startY = clamp(Math.floor(cameraY / ts) - 1, 0, mapDoc.height - 1);
    const endX = clamp(Math.ceil((cameraX + view.width / zoom) / ts) + 1, 0, mapDoc.width - 1), endY = clamp(Math.ceil((cameraY + view.height / zoom) / ts) + 1, 0, mapDoc.height - 1);
    for (let y = startY; y <= endY; y++) for (let x = startX; x <= endX; x++) {
      const tile = mapDoc.tiles[tileKey(x, y)] ?? { ground: 'grass' }, sx = (x * ts - cameraX) * zoom, sy = (y * ts - cameraY) * zoom;
      ctx.fillStyle = visible.ground ? getPaletteEntry(tile.ground ?? 'grass').color : '#192027'; ctx.fillRect(sx, sy, screenTile + .5, screenTile + .5);
      if (visible.detail && tile.detail) { ctx.globalAlpha = .55; ctx.fillStyle = getPaletteEntry(tile.detail).color; ctx.fillRect(sx + screenTile * .15, sy + screenTile * .15, screenTile * .7, screenTile * .7); ctx.globalAlpha = 1; }
    }
    if (visible.zones) for (const value of mapDoc.zones) {
      const catalog = MAP_PALETTE_ENTRIES.find((item) => item.zoneKind === value.kind), sx = (value.x * ts - cameraX) * zoom, sy = (value.y * ts - cameraY) * zoom, sw = value.width * screenTile, sh = value.height * screenTile;
      ctx.fillStyle = `${catalog?.color ?? '#7dd29b'}32`; ctx.fillRect(sx, sy, sw, sh); ctx.strokeStyle = catalog?.color ?? '#7dd29b'; ctx.lineWidth = selection?.kind === 'zone' && selection.id === value.id ? 3 : 1.5; ctx.strokeRect(sx + 1, sy + 1, sw - 2, sh - 2);
    }
    if (visible.collision) { ctx.fillStyle = 'rgba(230,80,80,.23)'; ctx.strokeStyle = 'rgba(255,120,120,.55)'; for (const key of mapDoc.collision) { const point = parseTileKey(key); if (point.x < startX || point.x > endX || point.y < startY || point.y > endY) continue; const sx = (point.x * ts - cameraX) * zoom, sy = (point.y * ts - cameraY) * zoom; ctx.fillRect(sx, sy, screenTile, screenTile); ctx.strokeRect(sx + 1, sy + 1, screenTile - 2, screenTile - 2); } }
    if (visible.objects) for (const value of mapDoc.objects) {
      const catalog = getPaletteEntry(value.assetId), cx = ((value.x + .5) * ts - cameraX) * zoom, cy = ((value.y + .5) * ts - cameraY) * zoom, radius = clamp(screenTile * .36, 7, 19);
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fillStyle = catalog.color; ctx.fill(); ctx.strokeStyle = selection?.kind === 'object' && selection.id === value.id ? '#fff' : 'rgba(0,0,0,.45)'; ctx.lineWidth = selection?.kind === 'object' && selection.id === value.id ? 3 : 1.5; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = `800 ${clamp(screenTile * .34, 8, 14)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(catalog.icon.slice(0, 2), cx, cy);
    }
    if (gridVisible && screenTile >= 8) { ctx.beginPath(); ctx.strokeStyle = screenTile >= 18 ? 'rgba(255,255,255,.105)' : 'rgba(255,255,255,.055)'; ctx.lineWidth = 1; for (let x = startX; x <= endX + 1; x++) { const sx = (x * ts - cameraX) * zoom; ctx.moveTo(Math.round(sx) + .5, 0); ctx.lineTo(Math.round(sx) + .5, view.height); } for (let y = startY; y <= endY + 1; y++) { const sy = (y * ts - cameraY) * zoom; ctx.moveTo(0, Math.round(sy) + .5); ctx.lineTo(view.width, Math.round(sy) + .5); } ctx.stroke(); }
    const selected = selection; if (selected?.kind === 'tile') { const sx = (selected.x * ts - cameraX) * zoom, sy = (selected.y * ts - cameraY) * zoom; ctx.strokeStyle = '#dff4ff'; ctx.lineWidth = 2; ctx.strokeRect(sx + 1, sy + 1, screenTile - 2, screenTile - 2); }
    renderMinimap();
  };

  const resizeCanvas = () => {
    const rect = canvasArea.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr)); canvas.height = Math.max(1, Math.floor(rect.height * dpr)); canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!initializedViewport && rect.width > 0 && rect.height > 0) { initializedViewport = true; fitMap(); } else render();
  };

  const openNewMap = () => {
    const backdrop = document.createElement('div'); backdrop.className = 'me-modal-backdrop'; backdrop.innerHTML = `<div class="me-modal"><header><h3>Novo mapa</h3><p>O tamanho é definido em tiles.</p></header><form id="me-new-form"><div class="me-field wide"><label>Nome</label><input id="me-new-name" value="Novo Mapa" maxlength="60" required></div><div class="me-field"><label>Largura</label><input id="me-new-width" type="number" min="8" max="512" value="69"></div><div class="me-field"><label>Altura</label><input id="me-new-height" type="number" min="8" max="512" value="50"></div><footer><button type="button" id="me-new-cancel">Cancelar</button><button class="primary" type="submit">Criar mapa</button></footer></form></div>`; document.body.appendChild(backdrop);
    backdrop.querySelector<HTMLButtonElement>('#me-new-cancel')!.onclick = () => backdrop.remove();
    backdrop.querySelector<HTMLFormElement>('#me-new-form')!.onsubmit = (event) => { event.preventDefault(); const name = backdrop.querySelector<HTMLInputElement>('#me-new-name')!.value.trim() || 'Novo Mapa', width = Number(backdrop.querySelector<HTMLInputElement>('#me-new-width')!.value) || 69, height = Number(backdrop.querySelector<HTMLInputElement>('#me-new-height')!.value) || 50; mapDoc = saveMapDocument(createBlankMap(name, width, height)); undoStack.length = 0; redoStack.length = 0; selection = null; markSaved(); backdrop.remove(); fitMap(); refreshAll(); showToast(`Mapa ${name} criado.`); };
  };
  const openMapSettings = () => {
    const backdrop = document.createElement('div'); backdrop.className = 'me-modal-backdrop'; backdrop.innerHTML = `<div class="me-modal"><header><h3>Configurações do mapa</h3><p>Metadados para o jogo e futuros editores.</p></header><form id="me-settings-form"><div class="me-field wide"><label>Nome</label><input id="me-set-name" maxlength="60" value="${escapeHtml(mapDoc.name)}"></div><div class="me-field"><label>Level recomendado</label><input id="me-set-level" maxlength="30" value="${escapeHtml(mapDoc.metadata.recommendedLevel ?? '')}"></div><div class="me-field"><label>Tile size</label><input value="${mapDoc.tileSize}px" readonly></div><div class="me-field wide"><label>Notas</label><textarea id="me-set-notes">${escapeHtml(mapDoc.metadata.notes ?? '')}</textarea></div><footer><button type="button" id="me-settings-cancel">Cancelar</button><button class="primary" type="submit">Salvar</button></footer></form></div>`; document.body.appendChild(backdrop);
    backdrop.querySelector<HTMLButtonElement>('#me-settings-cancel')!.onclick = () => backdrop.remove();
    backdrop.querySelector<HTMLFormElement>('#me-settings-form')!.onsubmit = (event) => { event.preventDefault(); beginMutation('Editar configurações do mapa'); mapDoc.name = backdrop.querySelector<HTMLInputElement>('#me-set-name')!.value.trim() || mapDoc.name; mapDoc.metadata.recommendedLevel = backdrop.querySelector<HTMLInputElement>('#me-set-level')!.value; mapDoc.metadata.notes = backdrop.querySelector<HTMLTextAreaElement>('#me-set-notes')!.value; finishMutation(); backdrop.remove(); refreshMapSelect(); };
  };

  root.querySelector<HTMLElement>('#me-tools')!.innerHTML = TOOLS.map((value) => `<button data-tool="${value.id}" title="${value.label} (${value.key})"><span class="tool-icon">${value.icon}</span><span class="tool-label">${value.label}</span></button>`).join('');
  root.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => button.onclick = () => selectTool(button.dataset.tool as MapToolId));
  root.querySelector<HTMLSelectElement>('#me-brush-size')!.onchange = (event) => { brushSize = Number((event.target as HTMLSelectElement).value) || 1; };
  searchInput.oninput = renderPalette;
  root.querySelector<HTMLButtonElement>('#me-undo')!.onclick = undo; root.querySelector<HTMLButtonElement>('#me-redo')!.onclick = redo; root.querySelector<HTMLButtonElement>('#me-save')!.onclick = save; root.querySelector<HTMLButtonElement>('#me-new')!.onclick = openNewMap; root.querySelector<HTMLButtonElement>('#me-map-settings')!.onclick = openMapSettings; root.querySelector<HTMLButtonElement>('#me-fit')!.onclick = fitMap;
  root.querySelector<HTMLButtonElement>('#me-grid')!.onclick = (event) => { gridVisible = !gridVisible; (event.currentTarget as HTMLButtonElement).classList.toggle('active', gridVisible); render(); };
  root.querySelector<HTMLButtonElement>('#me-minimap-toggle')!.onclick = (event) => { const section = root.querySelector<HTMLElement>('#me-minimap-section')!; const show = section.style.display === 'none'; section.style.display = show ? '' : 'none'; (event.currentTarget as HTMLButtonElement).classList.toggle('active', show); };
  root.querySelector<HTMLButtonElement>('#me-back-game')!.onclick = () => { if (dirty && !window.confirm('Há alterações não salvas. Voltar para o jogo mesmo assim?')) return; window.location.href = window.location.pathname; };
  root.querySelector<HTMLButtonElement>('#me-export')!.onclick = () => { downloadText(`${mapDoc.id}.ascension-map.json`, JSON.stringify(mapDoc, null, 2)); showToast('Mapa exportado em JSON.'); };
  root.querySelector<HTMLButtonElement>('#me-import')!.onclick = () => fileInput.click();
  fileInput.onchange = async () => { const file = fileInput.files?.[0]; if (!file) return; try { mapDoc = importMapDocument(await file.text()); selection = null; undoStack.length = 0; redoStack.length = 0; markSaved(); fitMap(); refreshAll(); showToast(`Mapa ${mapDoc.name} importado.`); } catch (error) { showToast(error instanceof Error ? error.message : 'Falha ao importar mapa.'); } fileInput.value = ''; };
  mapSelect.onchange = () => { if (dirty && !window.confirm('Trocar de mapa sem salvar as alterações atuais?')) { mapSelect.value = mapDoc.id; return; } const next = loadMapDocument(mapSelect.value); if (!next) return; mapDoc = next; selection = null; undoStack.length = 0; redoStack.length = 0; markSaved(); fitMap(); refreshAll(); };

  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId); const point = screenToTile(event.clientX, event.clientY);
    if (event.button === 1 || event.button === 2 || tool === 'pan' || spaceDown) { dragMode = 'pan'; pointerStart = { x: event.clientX, y: event.clientY, cameraX, cameraY }; canvas.classList.add('dragging'); return; }
    if (tool === 'select') { useToolAt(point.x, point.y, true); const selected = selection; if (selected?.kind === 'object' || selected?.kind === 'zone') { beginMutation('Mover seleção'); dragMode = 'move'; } return; }
    dragMode = 'paint'; useToolAt(point.x, point.y, true);
  });
  canvas.addEventListener('pointermove', (event) => {
    const point = screenToTile(event.clientX, event.clientY); coordStatus.textContent = `X ${point.x} • Y ${point.y}`;
    if (dragMode === 'pan') { cameraX = pointerStart.cameraX - (event.clientX - pointerStart.x) / zoom; cameraY = pointerStart.cameraY - (event.clientY - pointerStart.y) / zoom; clampCamera(); render(); return; }
    if (dragMode === 'move' && validTile(point.x, point.y)) {
      const selected = selection;
      if (selected?.kind === 'object') { const value = mapDoc.objects.find((item) => item.id === selected.id); if (value) { value.x = point.x; value.y = point.y; } }
      else if (selected?.kind === 'zone') { const value = mapDoc.zones.find((item) => item.id === selected.id); if (value) { value.x = clamp(point.x, 0, mapDoc.width - value.width); value.y = clamp(point.y, 0, mapDoc.height - value.height); } }
      refreshInspector(); render(); return;
    }
    if (dragMode === 'paint') useToolAt(point.x, point.y, false);
  });
  const endPointer = () => { canvas.classList.remove('dragging'); if (dragMode === 'paint' || dragMode === 'move') finishMutation(); dragMode = 'none'; };
  canvas.addEventListener('pointerup', endPointer); canvas.addEventListener('pointercancel', endPointer); canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('wheel', (event) => { event.preventDefault(); const rect = canvas.getBoundingClientRect(), sx = event.clientX - rect.left, sy = event.clientY - rect.top, beforeX = sx / zoom + cameraX, beforeY = sy / zoom + cameraY; zoom = clamp(zoom * (event.deltaY < 0 ? 1.12 : .89), .15, 3.2); cameraX = beforeX - sx / zoom; cameraY = beforeY - sy / zoom; clampCamera(); refreshChrome(); render(); }, { passive: false });
  minimap.addEventListener('pointerdown', (event) => { const rect = minimap.getBoundingClientRect(); centerTile((event.clientX - rect.left) / rect.width * mapDoc.width, (event.clientY - rect.top) / rect.height * mapDoc.height); });

  window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
    if (event.ctrlKey || event.metaKey) { if (event.code === 'KeyS') { event.preventDefault(); save(); } else if (event.code === 'KeyZ' && !event.shiftKey) { event.preventDefault(); undo(); } else if (event.code === 'KeyY' || (event.code === 'KeyZ' && event.shiftKey)) { event.preventDefault(); redo(); } return; }
    if (event.code === 'Space') { event.preventDefault(); spaceDown = true; canvas.classList.add('tool-pan'); return; }
    const shortcut = TOOLS.find((value) => `Key${value.key}` === event.code); if (shortcut) { event.preventDefault(); selectTool(shortcut.id); return; }
    if ((event.code === 'Delete' || event.code === 'Backspace') && selection) { event.preventDefault(); deleteSelection(); }
  });
  window.addEventListener('keyup', (event) => { if (event.code === 'Space') { spaceDown = false; if (tool !== 'pan') canvas.classList.remove('tool-pan'); } });
  window.addEventListener('beforeunload', (event) => { if (dirty) event.preventDefault(); });

  const observer = new ResizeObserver(resizeCanvas); observer.observe(canvasArea);
  selectTool(tool); refreshAll(); resizeCanvas(); showToast('Ascension Map Editor pronto. B pinta, Espaço move a visão.');
  return { get document() { return mapDoc; }, save, destroy() { observer.disconnect(); root.remove(); } };
}

export type MapEditor = ReturnType<typeof startMapEditor>;
