import './mapEditor.css';
import { MAP_PALETTES, MAP_PALETTE_ENTRIES, getPaletteEntry } from './mapEditorCatalog';
import { createBlankMap, deleteMapDocument, importMapDocument, listMapDocuments, loadMapDocument, loadOrCreateActiveMap, saveMapDocument } from './mapEditorStorage';
import type { AscensionMapDocument, EditorSnapshot, MapLayerId, MapObject, MapPaletteEntry, MapPaletteId, MapToolId, MapZone } from './mapEditorTypes';
import { parseTileKey, tileKey } from './mapEditorTypes';

type EditorSelection =
  | { kind: 'object'; id: string }
  | { kind: 'zone'; id: string }
  | { kind: 'tile'; x: number; y: number }
  | null;

type DragMode = 'none' | 'paint' | 'pan' | 'move-selection';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const TOOL_DEFS: Array<{ id: MapToolId; icon: string; label: string; key: string }> = [
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

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char] ?? char);
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function startMapEditor() {
  document.body.className = 'map-editor-mode';
  document.title = 'Ascension Map Editor';
  const app = document.querySelector<HTMLElement>('#app') ?? document.body;
  app.innerHTML = '';

  let mapDoc = loadOrCreateActiveMap();
  let tool: MapToolId = 'brush';
  let activePalette: MapPaletteId = 'terrain';
  let selectedEntry = getPaletteEntry('grass');
  let activeLayer: MapLayerId = 'ground';
  let brushSize = 1;
  let zoom = .55;
  let cameraX = 0;
  let cameraY = 0;
  let selection: EditorSelection = null;
  let dragMode: DragMode = 'none';
  let pointerStart = { x: 0, y: 0, cameraX: 0, cameraY: 0 };
  let lastPaintKey = '';
  let actionMutated = false;
  let dirty = false;
  let spaceDown = false;
  let initializedViewport = false;
  const undoStack: EditorSnapshot[] = [];
  const redoStack: EditorSnapshot[] = [];
  const layerVisible: Record<MapLayerId, boolean> = { ground: true, detail: true, objects: true, collision: true, zones: true };

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
      <div class="me-tool-group"><button id="me-undo" title="Desfazer (Ctrl+Z)">↶</button><button id="me-redo" title="Refazer (Ctrl+Y)">↷</button></div>
      <div class="me-tool-group" id="me-tools"></div>
      <div class="me-tool-group"><label>Brush <select id="me-brush-size"><option value="1">1×1</option><option value="2">2×2</option><option value="3">3×3</option><option value="5">5×5</option><option value="7">7×7</option></select></label></div>
      <div class="me-tool-group optional"><label>Mapa <select id="me-map-select"></select></label></div>
      <div class="me-spacer"></div>
      <div class="me-tool-group"><button id="me-grid" class="active" title="Mostrar grade"># <span class="tool-label">Grade</span></button><button id="me-minimap-toggle" class="active" title="Mostrar minimapa">▤ <span class="tool-label">Minimapa</span></button></div>
    </div>
    <div class="me-workspace">
      <aside class="me-sidebar">
        <div class="me-panel-head"><strong>Paletas</strong><span>RME workflow</span></div>
        <div class="me-palette-tabs" id="me-palette-tabs"></div>
        <div class="me-search"><input id="me-search" placeholder="Buscar na paleta..." autocomplete="off"></div>
        <div class="me-palette-list" id="me-palette-list"></div>
      </aside>
      <main class="me-canvas-area" id="me-canvas-area">
        <canvas class="me-canvas" id="me-canvas"></canvas>
        <div class="me-canvas-overlay"><span class="me-chip" id="me-map-chip"></span><span class="me-chip" id="me-selection-chip">Nada selecionado</span></div>
        <div class="me-toast" id="me-toast"></div>
      </main>
      <aside class="me-sidebar right" id="me-right-sidebar">
        <div class="me-right-scroll">
          <section class="me-section"><div class="me-panel-head"><strong>Layers</strong><span>visibilidade</span></div><div class="me-section-body me-layers" id="me-layers"></div></section>
          <section class="me-section"><div class="me-panel-head"><strong>Inspector</strong><span id="me-inspector-type">seleção</span></div><div class="me-section-body" id="me-inspector"></div></section>
          <section class="me-section" id="me-minimap-section"><div class="me-panel-head"><strong>Minimapa</strong><span>clique para navegar</span></div><div class="me-minimap-wrap"><div class="me-minimap-shell"><canvas class="me-minimap" id="me-minimap"></canvas></div></div></section>
          <section class="me-section"><div class="me-panel-head"><strong>Atalhos</strong><span>rápidos</span></div><div class="me-help"><div><span>Selecionar</span><kbd>V</kbd></div><div><span>Pincel</span><kbd>B</kbd></div><div><span>Borracha</span><kbd>E</kbd></div><div><span>Fill</span><kbd>F</kbd></div><div><span>Colisão</span><kbd>C</kbd></div><div><span>Pan</span><kbd>Espaço</kbd></div><div><span>Salvar</span><kbd>Ctrl+S</kbd></div><div><span>Undo</span><kbd>Ctrl+Z</kbd></div></div></section>
        </div>
      </aside>
    </div>
    <div class="me-statusbar"><span id="me-status-coord">X 0 • Y 0</span><span>Zoom <strong id="me-status-zoom">55%</strong></span><span>Tool <strong id="me-status-tool">Pincel</strong></span><span>Layer <strong id="me-status-layer">Terreno</strong></span><div class="status-right"><span id="me-object-count"></span><span class="me-save-state saved" id="me-save-state">● Salvo</span></div></div>
    <input id="me-file-input" type="file" accept="application/json,.json" hidden>`;
  app.appendChild(root);

  const canvas = root.querySelector<HTMLCanvasElement>('#me-canvas')!;
  const canvasArea = root.querySelector<HTMLElement>('#me-canvas-area')!;
  const ctx = canvas.getContext('2d')!;
  const minimap = root.querySelector<HTMLCanvasElement>('#me-minimap')!;
  const minimapCtx = minimap.getContext('2d')!;
  const paletteTabs = root.querySelector<HTMLElement>('#me-palette-tabs')!;
  const paletteList = root.querySelector<HTMLElement>('#me-palette-list')!;
  const searchInput = root.querySelector<HTMLInputElement>('#me-search')!;
  const inspector = root.querySelector<HTMLElement>('#me-inspector')!;
  const inspectorType = root.querySelector<HTMLElement>('#me-inspector-type')!;
  const layersNode = root.querySelector<HTMLElement>('#me-layers')!;
  const mapSelect = root.querySelector<HTMLSelectElement>('#me-map-select')!;
  const fileInput = root.querySelector<HTMLInputElement>('#me-file-input')!;
  const toast = root.querySelector<HTMLElement>('#me-toast')!;
  const selectionChip = root.querySelector<HTMLElement>('#me-selection-chip')!;
  const mapChip = root.querySelector<HTMLElement>('#me-map-chip')!;
  const saveState = root.querySelector<HTMLElement>('#me-save-state')!;
  const coordStatus = root.querySelector<HTMLElement>('#me-status-coord')!;
  const zoomStatus = root.querySelector<HTMLElement>('#me-status-zoom')!;
  const toolStatus = root.querySelector<HTMLElement>('#me-status-tool')!;
  const layerStatus = root.querySelector<HTMLElement>('#me-status-layer')!;
  const objectCount = root.querySelector<HTMLElement>('#me-object-count')!;
  let gridVisible = true;
  let toastTimer = 0;

  const showToast = (message: string) => {
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2200);
  };

  const markDirty = () => {
    dirty = true;
    saveState.className = 'me-save-state dirty';
    saveState.textContent = '● Alterações não salvas';
  };

  const markSaved = () => {
    dirty = false;
    saveState.className = 'me-save-state saved';
    saveState.textContent = '● Salvo';
  };

  const beginMutation = (label: string) => {
    if (actionMutated) return;
    undoStack.push({ document: clone(mapDoc), label });
    if (undoStack.length > 80) undoStack.shift();
    redoStack.length = 0;
    actionMutated = true;
  };

  const finishMutation = () => {
    if (actionMutated) {
      mapDoc.updatedAt = Date.now();
      markDirty();
    }
    actionMutated = false;
    lastPaintKey = '';
    refreshChrome();
    render();
  };

  const restoreSnapshot = (snapshot: EditorSnapshot, target: EditorSnapshot[], label: string) => {
    target.push({ document: clone(mapDoc), label });
    mapDoc = clone(snapshot.document);
    selection = null;
    markDirty();
    refreshAll();
  };

  const undo = () => {
    const snapshot = undoStack.pop();
    if (!snapshot) return;
    restoreSnapshot(snapshot, redoStack, `Refazer ${snapshot.label}`);
    showToast(`Desfeito: ${snapshot.label}`);
  };

  const redo = () => {
    const snapshot = redoStack.pop();
    if (!snapshot) return;
    restoreSnapshot(snapshot, undoStack, `Desfazer ${snapshot.label}`);
    showToast('Alteração refeita.');
  };

  const save = () => {
    mapDoc = saveMapDocument(mapDoc);
    markSaved();
    refreshMapSelect();
    refreshChrome();
    showToast('Mapa salvo no navegador.');
  };

  const resizeCanvas = () => {
    const rect = canvasArea.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!initializedViewport && rect.width > 0 && rect.height > 0) {
      initializedViewport = true;
      fitMap();
    } else render();
  };

  const viewportSize = () => ({ width: canvas.clientWidth, height: canvas.clientHeight });

  const fitMap = () => {
    const view = viewportSize();
    const worldW = mapDoc.width * mapDoc.tileSize;
    const worldH = mapDoc.height * mapDoc.tileSize;
    zoom = clamp(Math.min(view.width / worldW, view.height / worldH) * .9, .18, 2.5);
    cameraX = Math.max(0, worldW / 2 - view.width / (2 * zoom));
    cameraY = Math.max(0, worldH / 2 - view.height / (2 * zoom));
    refreshChrome();
    render();
  };

  const clampCamera = () => {
    const view = viewportSize();
    const worldW = mapDoc.width * mapDoc.tileSize;
    const worldH = mapDoc.height * mapDoc.tileSize;
    const maxX = Math.max(0, worldW - view.width / zoom);
    const maxY = Math.max(0, worldH - view.height / zoom);
    cameraX = clamp(cameraX, -120 / zoom, maxX + 120 / zoom);
    cameraY = clamp(cameraY, -120 / zoom, maxY + 120 / zoom);
  };

  const screenToTile = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    const worldX = (clientX - rect.left) / zoom + cameraX;
    const worldY = (clientY - rect.top) / zoom + cameraY;
    return { x: Math.floor(worldX / mapDoc.tileSize), y: Math.floor(worldY / mapDoc.tileSize), worldX, worldY };
  };

  const validTile = (x: number, y: number) => x >= 0 && y >= 0 && x < mapDoc.width && y < mapDoc.height;

  const objectAt = (x: number, y: number) => [...mapDoc.objects].reverse().find((entry) => entry.x === x && entry.y === y) ?? null;
  const zoneAt = (x: number, y: number) => [...mapDoc.zones].reverse().find((entry) => x >= entry.x && y >= entry.y && x < entry.x + entry.width && y < entry.y + entry.height) ?? null;

  const paintTerrain = (x: number, y: number) => {
    if (!validTile(x, y)) return;
    for (let oy = 0; oy < brushSize; oy++) {
      for (let ox = 0; ox < brushSize; ox++) {
        const tx = x + ox - Math.floor(brushSize / 2);
        const ty = y + oy - Math.floor(brushSize / 2);
        if (!validTile(tx, ty)) continue;
        const key = tileKey(tx, ty);
        const tile = mapDoc.tiles[key] ?? {};
        if (activeLayer === 'detail') tile.detail = selectedEntry.id;
        else tile.ground = selectedEntry.id;
        mapDoc.tiles[key] = tile;
      }
    }
  };

  const paintObject = (x: number, y: number) => {
    if (!validTile(x, y) || !selectedEntry.objectKind) return;
    const key = `${selectedEntry.id}:${x},${y}`;
    if (key === lastPaintKey) return;
    lastPaintKey = key;
    const existing = mapDoc.objects.find((entry) => entry.x === x && entry.y === y && entry.assetId === selectedEntry.id);
    if (existing) return;
    const entry: MapObject = { id: uid('object'), kind: selectedEntry.objectKind, assetId: selectedEntry.id, x, y, rotation: 0, properties: {} };
    mapDoc.objects.push(entry);
    selection = { kind: 'object', id: entry.id };
  };

  const paintZone = (x: number, y: number) => {
    if (!validTile(x, y) || !selectedEntry.zoneKind || lastPaintKey) return;
    lastPaintKey = `${x},${y}`;
    const size = Math.max(1, brushSize);
    const entry: MapZone = {
      id: uid('zone'), kind: selectedEntry.zoneKind,
      x: clamp(x - Math.floor(size / 2), 0, mapDoc.width - 1), y: clamp(y - Math.floor(size / 2), 0, mapDoc.height - 1),
      width: Math.min(size, mapDoc.width), height: Math.min(size, mapDoc.height), name: selectedEntry.label, properties: {},
    };
    mapDoc.zones.push(entry);
    selection = { kind: 'zone', id: entry.id };
  };

  const paintCollision = (x: number, y: number) => {
    for (let oy = 0; oy < brushSize; oy++) {
      for (let ox = 0; ox < brushSize; ox++) {
        const tx = x + ox - Math.floor(brushSize / 2);
        const ty = y + oy - Math.floor(brushSize / 2);
        if (!validTile(tx, ty)) continue;
        const key = tileKey(tx, ty);
        if (!mapDoc.collision.includes(key)) mapDoc.collision.push(key);
      }
    }
  };

  const eraseAt = (x: number, y: number) => {
    if (!validTile(x, y)) return;
    if (activeLayer === 'objects') {
      const before = mapDoc.objects.length;
      mapDoc.objects = mapDoc.objects.filter((entry) => !(entry.x === x && entry.y === y));
      if (before !== mapDoc.objects.length) selection = null;
      return;
    }
    if (activeLayer === 'zones') {
      const zone = zoneAt(x, y);
      if (zone) mapDoc.zones = mapDoc.zones.filter((entry) => entry.id !== zone.id);
      selection = null;
      return;
    }
    if (activeLayer === 'collision') {
      mapDoc.collision = mapDoc.collision.filter((entry) => entry !== tileKey(x, y));
      return;
    }
    const tile = mapDoc.tiles[tileKey(x, y)] ?? {};
    if (activeLayer === 'detail') delete tile.detail;
    else tile.ground = 'grass';
    mapDoc.tiles[tileKey(x, y)] = tile;
  };

  const floodFill = (x: number, y: number) => {
    if (!validTile(x, y) || selectedEntry.palette !== 'terrain') return;
    const isDetail = activeLayer === 'detail';
    const start = mapDoc.tiles[tileKey(x, y)] ?? {};
    const target = isDetail ? start.detail : (start.ground ?? 'grass');
    if (target === selectedEntry.id) return;
    const queue: Array<{ x: number; y: number }> = [{ x, y }];
    const seen = new Set<string>();
    while (queue.length) {
      const point = queue.shift()!;
      const key = tileKey(point.x, point.y);
      if (seen.has(key) || !validTile(point.x, point.y)) continue;
      seen.add(key);
      const tile = mapDoc.tiles[key] ?? {};
      const value = isDetail ? tile.detail : (tile.ground ?? 'grass');
      if (value !== target) continue;
      if (isDetail) tile.detail = selectedEntry.id;
      else tile.ground = selectedEntry.id;
      mapDoc.tiles[key] = tile;
      queue.push({ x: point.x + 1, y: point.y }, { x: point.x - 1, y: point.y }, { x: point.x, y: point.y + 1 }, { x: point.x, y: point.y - 1 });
    }
  };

  const useToolAt = (x: number, y: number, initial: boolean) => {
    if (!validTile(x, y)) return;
    if (tool === 'select') {
      if (!initial) return;
      const object = layerVisible.objects ? objectAt(x, y) : null;
      const zone = !object && layerVisible.zones ? zoneAt(x, y) : null;
      selection = object ? { kind: 'object', id: object.id } : zone ? { kind: 'zone', id: zone.id } : { kind: 'tile', x, y };
      refreshInspector();
      refreshChrome();
      render();
      return;
    }
    if (tool === 'fill') {
      if (!initial) return;
      beginMutation('Preencher terreno');
      floodFill(x, y);
      return;
    }
    beginMutation(tool === 'eraser' ? 'Apagar' : tool === 'collision' ? 'Pintar colisão' : 'Pintar mapa');
    if (tool === 'eraser') eraseAt(x, y);
    else if (tool === 'collision') paintCollision(x, y);
    else if (tool === 'brush') {
      if (selectedEntry.palette === 'terrain') paintTerrain(x, y);
      else if (selectedEntry.palette === 'zone') paintZone(x, y);
      else paintObject(x, y);
    }
    refreshInspector();
    render();
  };

  const selectTool = (next: MapToolId) => {
    tool = next;
    root.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => button.classList.toggle('active', button.dataset.tool === tool));
    canvas.classList.toggle('tool-pan', tool === 'pan');
    canvas.classList.toggle('tool-select', tool === 'select');
    refreshChrome();
  };

  const selectPalette = (next: MapPaletteId) => {
    activePalette = next;
    const first = MAP_PALETTE_ENTRIES.find((entry) => entry.palette === next);
    if (first) {
      selectedEntry = first;
      activeLayer = first.defaultLayer;
      if (next !== 'terrain' && next !== 'zone') tool = 'brush';
    }
    renderPalette();
    renderLayers();
    selectTool(tool);
  };

  const selectPaletteEntry = (entry: MapPaletteEntry) => {
    selectedEntry = entry;
    activeLayer = entry.defaultLayer;
    if (entry.palette !== 'terrain') tool = 'brush';
    renderPalette();
    renderLayers();
    selectTool(tool);
    refreshInspector();
  };

  const renderPaletteTabs = () => {
    paletteTabs.innerHTML = MAP_PALETTES.map((palette) => `<button data-palette="${palette.id}" class="${palette.id === activePalette ? 'active' : ''}" title="${escapeHtml(palette.description)}">${palette.icon}<span>${escapeHtml(palette.label)}</span></button>`).join('');
    paletteTabs.querySelectorAll<HTMLButtonElement>('[data-palette]').forEach((button) => button.onclick = () => selectPalette(button.dataset.palette as MapPaletteId));
  };

  const renderPalette = () => {
    renderPaletteTabs();
    const query = searchInput.value.trim().toLocaleLowerCase('pt-BR');
    const entries = MAP_PALETTE_ENTRIES.filter((entry) => entry.palette === activePalette && (!query || `${entry.label} ${entry.description} ${(entry.tags ?? []).join(' ')}`.toLocaleLowerCase('pt-BR').includes(query)));
    paletteList.innerHTML = entries.length ? entries.map((entry) => `<button class="me-palette-item ${selectedEntry.id === entry.id ? 'active' : ''}" data-entry="${entry.id}"><span class="me-palette-preview" style="background:${entry.color}">${entry.icon}</span><span><strong>${escapeHtml(entry.label)}</strong><small>${escapeHtml(entry.description)}</small></span></button>`).join('') : '<div class="me-inspector-empty">Nenhum elemento encontrado nesta paleta.</div>';
    paletteList.querySelectorAll<HTMLButtonElement>('[data-entry]').forEach((button) => button.onclick = () => selectPaletteEntry(getPaletteEntry(button.dataset.entry!)));
  };

  const renderLayers = () => {
    layersNode.innerHTML = LAYERS.map((layer) => `<div class="me-layer ${activeLayer === layer.id ? 'active' : ''}" data-layer="${layer.id}"><button data-visible="${layer.id}" title="Mostrar/ocultar">${layerVisible[layer.id] ? '◉' : '○'}</button><span>${layer.icon} ${layer.label}</span><span>${activeLayer === layer.id ? '●' : ''}</span></div>`).join('');
    layersNode.querySelectorAll<HTMLElement>('[data-layer]').forEach((node) => node.onclick = () => { activeLayer = node.dataset.layer as MapLayerId; renderLayers(); refreshChrome(); render(); });
    layersNode.querySelectorAll<HTMLButtonElement>('[data-visible]').forEach((button) => button.onclick = (event) => { event.stopPropagation(); const layer = button.dataset.visible as MapLayerId; layerVisible[layer] = !layerVisible[layer]; renderLayers(); render(); });
  };

  const deleteSelection = () => {
    if (!selection) return;
    beginMutation('Excluir seleção');
    if (selection.kind === 'object') mapDoc.objects = mapDoc.objects.filter((entry) => entry.id !== selection!.id);
    else if (selection.kind === 'zone') mapDoc.zones = mapDoc.zones.filter((entry) => entry.id !== selection!.id);
    else eraseAt(selection.x, selection.y);
    selection = null;
    finishMutation();
  };

  const refreshInspector = () => {
    if (!selection) {
      inspectorType.textContent = 'seleção';
      inspector.innerHTML = `<div class="me-inspector-empty">Selecione um tile, objeto ou zona para editar propriedades.<br><br><strong>${escapeHtml(selectedEntry.label)}</strong><br>${escapeHtml(selectedEntry.description)}</div>`;
      return;
    }
    if (selection.kind === 'object') {
      const value = mapDoc.objects.find((entry) => entry.id === selection!.id);
      if (!value) { selection = null; refreshInspector(); return; }
      const catalog = getPaletteEntry(value.assetId);
      inspectorType.textContent = value.kind;
      inspector.innerHTML = `<div class="me-inspector-grid"><div class="me-field wide"><label>Objeto</label><input value="${escapeHtml(catalog.label)}" readonly></div><div class="me-field"><label>X</label><input id="me-ins-x" type="number" min="0" max="${mapDoc.width - 1}" value="${value.x}"></div><div class="me-field"><label>Y</label><input id="me-ins-y" type="number" min="0" max="${mapDoc.height - 1}" value="${value.y}"></div><div class="me-field"><label>Rotação</label><input id="me-ins-rotation" type="number" step="15" value="${value.rotation ?? 0}"></div><div class="me-field"><label>Asset ID</label><input value="${escapeHtml(value.assetId)}" readonly></div></div><div class="me-inspector-actions"><button class="me-small-btn" id="me-center-selection">Centralizar</button><button class="me-small-btn danger" id="me-delete-selection">Excluir</button></div>`;
      const update = () => { beginMutation('Editar objeto'); value.x = clamp(Number((root.querySelector<HTMLInputElement>('#me-ins-x')!).value) || 0, 0, mapDoc.width - 1); value.y = clamp(Number((root.querySelector<HTMLInputElement>('#me-ins-y')!).value) || 0, 0, mapDoc.height - 1); value.rotation = Number((root.querySelector<HTMLInputElement>('#me-ins-rotation')!).value) || 0; finishMutation(); };
      root.querySelector<HTMLInputElement>('#me-ins-x')!.onchange = update;
      root.querySelector<HTMLInputElement>('#me-ins-y')!.onchange = update;
      root.querySelector<HTMLInputElement>('#me-ins-rotation')!.onchange = update;
      root.querySelector<HTMLButtonElement>('#me-delete-selection')!.onclick = deleteSelection;
      root.querySelector<HTMLButtonElement>('#me-center-selection')!.onclick = () => centerTile(value.x, value.y);
      return;
    }
    if (selection.kind === 'zone') {
      const value = mapDoc.zones.find((entry) => entry.id === selection!.id);
      if (!value) { selection = null; refreshInspector(); return; }
      inspectorType.textContent = 'zona';
      inspector.innerHTML = `<div class="me-inspector-grid"><div class="me-field wide"><label>Nome</label><input id="me-zone-name" maxlength="80" value="${escapeHtml(value.name ?? '')}"></div><div class="me-field"><label>X</label><input id="me-zone-x" type="number" min="0" value="${value.x}"></div><div class="me-field"><label>Y</label><input id="me-zone-y" type="number" min="0" value="${value.y}"></div><div class="me-field"><label>Largura</label><input id="me-zone-w" type="number" min="1" value="${value.width}"></div><div class="me-field"><label>Altura</label><input id="me-zone-h" type="number" min="1" value="${value.height}"></div><div class="me-field wide"><label>Tipo</label><input value="${escapeHtml(value.kind)}" readonly></div></div><div class="me-inspector-actions"><button class="me-small-btn" id="me-center-selection">Centralizar</button><button class="me-small-btn danger" id="me-delete-selection">Excluir</button></div>`;
      const update = () => { beginMutation('Editar zona'); value.name = root.querySelector<HTMLInputElement>('#me-zone-name')!.value; value.x = clamp(Number(root.querySelector<HTMLInputElement>('#me-zone-x')!.value) || 0, 0, mapDoc.width - 1); value.y = clamp(Number(root.querySelector<HTMLInputElement>('#me-zone-y')!.value) || 0, 0, mapDoc.height - 1); value.width = clamp(Number(root.querySelector<HTMLInputElement>('#me-zone-w')!.value) || 1, 1, mapDoc.width - value.x); value.height = clamp(Number(root.querySelector<HTMLInputElement>('#me-zone-h')!.value) || 1, 1, mapDoc.height - value.y); finishMutation(); };
      root.querySelectorAll<HTMLInputElement>('#me-zone-name,#me-zone-x,#me-zone-y,#me-zone-w,#me-zone-h').forEach((input) => input.onchange = update);
      root.querySelector<HTMLButtonElement>('#me-delete-selection')!.onclick = deleteSelection;
      root.querySelector<HTMLButtonElement>('#me-center-selection')!.onclick = () => centerTile(value.x + value.width / 2, value.y + value.height / 2);
      return;
    }
    const tile = mapDoc.tiles[tileKey(selection.x, selection.y)] ?? {};
    inspectorType.textContent = 'tile';
    inspector.innerHTML = `<div class="me-inspector-grid"><div class="me-field"><label>X</label><input value="${selection.x}" readonly></div><div class="me-field"><label>Y</label><input value="${selection.y}" readonly></div><div class="me-field wide"><label>Ground</label><input value="${escapeHtml(tile.ground ?? 'grass')}" readonly></div><div class="me-field wide"><label>Detail</label><input value="${escapeHtml(tile.detail ?? '—')}" readonly></div><div class="me-field wide"><label>Colisão</label><input value="${mapDoc.collision.includes(tileKey(selection.x, selection.y)) ? 'Bloqueado' : 'Livre'}" readonly></div></div><div class="me-inspector-actions"><button class="me-small-btn danger" id="me-delete-selection">Limpar layer</button></div>`;
    root.querySelector<HTMLButtonElement>('#me-delete-selection')!.onclick = deleteSelection;
  };

  function centerTile(x: number, y: number) {
    const view = viewportSize();
    cameraX = x * mapDoc.tileSize - view.width / (2 * zoom);
    cameraY = y * mapDoc.tileSize - view.height / (2 * zoom);
    clampCamera();
    render();
  }

  const refreshMapSelect = () => {
    const docs = listMapDocuments();
    mapSelect.innerHTML = docs.map((entry) => `<option value="${entry.id}" ${entry.id === mapDoc.id ? 'selected' : ''}>${escapeHtml(entry.name)}</option>`).join('');
  };

  const refreshChrome = () => {
    const toolDef = TOOL_DEFS.find((entry) => entry.id === tool)!;
    const layer = LAYERS.find((entry) => entry.id === activeLayer)!;
    root.querySelector<HTMLElement>('#me-doc-name')!.textContent = `${mapDoc.name} • ${mapDoc.width}×${mapDoc.height}`;
    mapChip.textContent = `${mapDoc.name} · ${mapDoc.width}×${mapDoc.height} · ${mapDoc.tileSize}px`;
    zoomStatus.textContent = `${Math.round(zoom * 100)}%`;
    toolStatus.textContent = toolDef.label;
    layerStatus.textContent = layer.label;
    objectCount.textContent = `${mapDoc.objects.length} objetos • ${mapDoc.zones.length} zonas`;
    root.querySelector<HTMLButtonElement>('#me-undo')!.disabled = !undoStack.length;
    root.querySelector<HTMLButtonElement>('#me-redo')!.disabled = !redoStack.length;
    if (!selection) selectionChip.textContent = `${selectedEntry.icon} ${selectedEntry.label}`;
    else if (selection.kind === 'tile') selectionChip.textContent = `Tile ${selection.x}, ${selection.y}`;
    else if (selection.kind === 'object') selectionChip.textContent = `Objeto selecionado`;
    else selectionChip.textContent = `Zona selecionada`;
  };

  const refreshAll = () => {
    refreshMapSelect(); renderPalette(); renderLayers(); refreshInspector(); refreshChrome(); render();
  };

  const drawTile = (entryId: string, sx: number, sy: number, size: number, alpha = 1) => {
    const entry = getPaletteEntry(entryId);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = entry.color;
    ctx.fillRect(sx, sy, size + .5, size + .5);
    ctx.globalAlpha = 1;
  };

  const renderMinimap = () => {
    const width = 560, height = 400;
    minimap.width = width; minimap.height = height;
    const sx = width / mapDoc.width, sy = height / mapDoc.height;
    minimapCtx.fillStyle = mapDoc.metadata.background || '#527b45';
    minimapCtx.fillRect(0, 0, width, height);
    for (const [key, tile] of Object.entries(mapDoc.tiles)) {
      const point = parseTileKey(key);
      minimapCtx.fillStyle = getPaletteEntry(tile.ground ?? 'grass').color;
      minimapCtx.fillRect(point.x * sx, point.y * sy, sx + 1, sy + 1);
    }
    if (layerVisible.zones) {
      for (const value of mapDoc.zones) {
        const catalog = MAP_PALETTE_ENTRIES.find((entry) => entry.zoneKind === value.kind);
        minimapCtx.fillStyle = `${catalog?.color ?? '#7dd29b'}66`;
        minimapCtx.fillRect(value.x * sx, value.y * sy, value.width * sx, value.height * sy);
      }
    }
    if (layerVisible.objects) {
      for (const value of mapDoc.objects) {
        minimapCtx.fillStyle = getPaletteEntry(value.assetId).color;
        minimapCtx.fillRect(value.x * sx - 1.5, value.y * sy - 1.5, 4, 4);
      }
    }
    const view = viewportSize();
    minimapCtx.strokeStyle = '#e5f6ff';
    minimapCtx.lineWidth = 2;
    minimapCtx.strokeRect(cameraX / mapDoc.tileSize * sx, cameraY / mapDoc.tileSize * sy, view.width / zoom / mapDoc.tileSize * sx, view.height / zoom / mapDoc.tileSize * sy);
  };

  const render = () => {
    const view = viewportSize();
    ctx.clearRect(0, 0, view.width, view.height);
    ctx.fillStyle = '#070b0f'; ctx.fillRect(0, 0, view.width, view.height);
    const ts = mapDoc.tileSize;
    const screenTile = ts * zoom;
    const startX = clamp(Math.floor(cameraX / ts) - 1, 0, mapDoc.width - 1);
    const startY = clamp(Math.floor(cameraY / ts) - 1, 0, mapDoc.height - 1);
    const endX = clamp(Math.ceil((cameraX + view.width / zoom) / ts) + 1, 0, mapDoc.width - 1);
    const endY = clamp(Math.ceil((cameraY + view.height / zoom) / ts) + 1, 0, mapDoc.height - 1);

    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        const tile = mapDoc.tiles[tileKey(x, y)] ?? { ground: 'grass' };
        const sx = (x * ts - cameraX) * zoom;
        const sy = (y * ts - cameraY) * zoom;
        if (layerVisible.ground) drawTile(tile.ground ?? 'grass', sx, sy, screenTile);
        else { ctx.fillStyle = '#192027'; ctx.fillRect(sx, sy, screenTile + .5, screenTile + .5); }
        if (layerVisible.detail && tile.detail) drawTile(tile.detail, sx + screenTile * .15, sy + screenTile * .15, screenTile * .7, .55);
      }
    }

    if (layerVisible.zones) {
      for (const value of mapDoc.zones) {
        const catalog = MAP_PALETTE_ENTRIES.find((entry) => entry.zoneKind === value.kind);
        const sx = (value.x * ts - cameraX) * zoom, sy = (value.y * ts - cameraY) * zoom;
        const sw = value.width * screenTile, sh = value.height * screenTile;
        ctx.fillStyle = `${catalog?.color ?? '#7dd29b'}32`; ctx.fillRect(sx, sy, sw, sh);
        ctx.strokeStyle = catalog?.color ?? '#7dd29b'; ctx.lineWidth = selection?.kind === 'zone' && selection.id === value.id ? 3 : 1.5; ctx.strokeRect(sx + 1, sy + 1, sw - 2, sh - 2);
      }
    }

    if (layerVisible.collision) {
      ctx.fillStyle = 'rgba(230,80,80,.23)'; ctx.strokeStyle = 'rgba(255,120,120,.55)'; ctx.lineWidth = 1;
      for (const key of mapDoc.collision) {
        const point = parseTileKey(key);
        if (point.x < startX || point.x > endX || point.y < startY || point.y > endY) continue;
        const sx = (point.x * ts - cameraX) * zoom, sy = (point.y * ts - cameraY) * zoom;
        ctx.fillRect(sx, sy, screenTile, screenTile); ctx.strokeRect(sx + 1, sy + 1, screenTile - 2, screenTile - 2);
      }
    }

    if (layerVisible.objects) {
      for (const value of mapDoc.objects) {
        const catalog = getPaletteEntry(value.assetId);
        const cx = ((value.x + .5) * ts - cameraX) * zoom, cy = ((value.y + .5) * ts - cameraY) * zoom;
        const radius = clamp(screenTile * .36, 7, 19);
        ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fillStyle = catalog.color; ctx.globalAlpha = .92; ctx.fill(); ctx.globalAlpha = 1;
        ctx.strokeStyle = selection?.kind === 'object' && selection.id === value.id ? '#ffffff' : 'rgba(0,0,0,.45)'; ctx.lineWidth = selection?.kind === 'object' && selection.id === value.id ? 3 : 1.5; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = `800 ${clamp(screenTile * .34, 8, 14)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(catalog.icon.slice(0, 2), cx, cy + .5);
      }
    }

    if (gridVisible && screenTile >= 8) {
      ctx.beginPath(); ctx.strokeStyle = screenTile >= 18 ? 'rgba(255,255,255,.105)' : 'rgba(255,255,255,.055)'; ctx.lineWidth = 1;
      for (let x = startX; x <= endX + 1; x++) { const sx = (x * ts - cameraX) * zoom; ctx.moveTo(Math.round(sx) + .5, 0); ctx.lineTo(Math.round(sx) + .5, view.height); }
      for (let y = startY; y <= endY + 1; y++) { const sy = (y * ts - cameraY) * zoom; ctx.moveTo(0, Math.round(sy) + .5); ctx.lineTo(view.width, Math.round(sy) + .5); }
      ctx.stroke();
    }

    if (selection?.kind === 'tile') {
      const sx = (selection.x * ts - cameraX) * zoom, sy = (selection.y * ts - cameraY) * zoom;
      ctx.strokeStyle = '#dff4ff'; ctx.lineWidth = 2; ctx.strokeRect(sx + 1, sy + 1, screenTile - 2, screenTile - 2);
    }
    renderMinimap();
  };

  const openNewMapModal = () => {
    const backdrop = document.createElement('div');
    backdrop.className = 'me-modal-backdrop';
    backdrop.innerHTML = `<div class="me-modal"><header><h3>Novo mapa</h3><p>Crie um documento limpo. O tamanho usa tiles, não pixels.</p></header><form id="me-new-form"><div class="me-field wide"><label>Nome</label><input id="me-new-name" value="Novo Mapa" maxlength="60" required></div><div class="me-field"><label>Largura</label><input id="me-new-width" type="number" min="8" max="512" value="69"></div><div class="me-field"><label>Altura</label><input id="me-new-height" type="number" min="8" max="512" value="50"></div><footer><button type="button" id="me-new-cancel">Cancelar</button><button class="primary" type="submit">Criar mapa</button></footer></form></div>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector<HTMLButtonElement>('#me-new-cancel')!.onclick = () => backdrop.remove();
    backdrop.querySelector<HTMLFormElement>('#me-new-form')!.onsubmit = (event) => {
      event.preventDefault();
      const name = backdrop.querySelector<HTMLInputElement>('#me-new-name')!.value.trim() || 'Novo Mapa';
      const width = Number(backdrop.querySelector<HTMLInputElement>('#me-new-width')!.value) || 69;
      const height = Number(backdrop.querySelector<HTMLInputElement>('#me-new-height')!.value) || 50;
      mapDoc = saveMapDocument(createBlankMap(name, width, height));
      undoStack.length = 0; redoStack.length = 0; selection = null; markSaved(); backdrop.remove(); fitMap(); refreshAll(); showToast(`Mapa ${name} criado.`);
    };
  };

  const openMapSettings = () => {
    const backdrop = document.createElement('div');
    backdrop.className = 'me-modal-backdrop';
    backdrop.innerHTML = `<div class="me-modal"><header><h3>Configurações do mapa</h3><p>Metadados que depois serão consumidos pelo jogo e pelo Editor de Áudio.</p></header><form id="me-settings-form"><div class="me-field wide"><label>Nome</label><input id="me-set-name" maxlength="60" value="${escapeHtml(mapDoc.name)}"></div><div class="me-field"><label>Level recomendado</label><input id="me-set-level" maxlength="30" value="${escapeHtml(mapDoc.metadata.recommendedLevel ?? '')}"></div><div class="me-field"><label>Tile size</label><input value="${mapDoc.tileSize}px" readonly></div><div class="me-field wide"><label>Notas</label><textarea id="me-set-notes">${escapeHtml(mapDoc.metadata.notes ?? '')}</textarea></div><footer><button type="button" id="me-settings-cancel">Cancelar</button><button class="primary" type="submit">Salvar</button></footer></form></div>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector<HTMLButtonElement>('#me-settings-cancel')!.onclick = () => backdrop.remove();
    backdrop.querySelector<HTMLFormElement>('#me-settings-form')!.onsubmit = (event) => {
      event.preventDefault(); beginMutation('Editar configurações do mapa'); mapDoc.name = backdrop.querySelector<HTMLInputElement>('#me-set-name')!.value.trim() || mapDoc.name; mapDoc.metadata.recommendedLevel = backdrop.querySelector<HTMLInputElement>('#me-set-level')!.value; mapDoc.metadata.notes = backdrop.querySelector<HTMLTextAreaElement>('#me-set-notes')!.value; finishMutation(); backdrop.remove(); refreshMapSelect();
    };
  };

  root.querySelector<HTMLElement>('#me-tools')!.innerHTML = TOOL_DEFS.map((entry) => `<button data-tool="${entry.id}" title="${entry.label} (${entry.key})"><span class="tool-icon">${entry.icon}</span><span class="tool-label">${entry.label}</span></button>`).join('');
  root.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => button.onclick = () => selectTool(button.dataset.tool as MapToolId));
  root.querySelector<HTMLSelectElement>('#me-brush-size')!.onchange = (event) => { brushSize = Number((event.target as HTMLSelectElement).value) || 1; };
  searchInput.oninput = renderPalette;
  root.querySelector<HTMLButtonElement>('#me-undo')!.onclick = undo;
  root.querySelector<HTMLButtonElement>('#me-redo')!.onclick = redo;
  root.querySelector<HTMLButtonElement>('#me-save')!.onclick = save;
  root.querySelector<HTMLButtonElement>('#me-new')!.onclick = openNewMapModal;
  root.querySelector<HTMLButtonElement>('#me-map-settings')!.onclick = openMapSettings;
  root.querySelector<HTMLButtonElement>('#me-fit')!.onclick = fitMap;
  root.querySelector<HTMLButtonElement>('#me-grid')!.onclick = (event) => { gridVisible = !gridVisible; (event.currentTarget as HTMLButtonElement).classList.toggle('active', gridVisible); render(); };
  root.querySelector<HTMLButtonElement>('#me-minimap-toggle')!.onclick = (event) => { const section = root.querySelector<HTMLElement>('#me-minimap-section')!; const show = section.style.display === 'none'; section.style.display = show ? '' : 'none'; (event.currentTarget as HTMLButtonElement).classList.toggle('active', show); };
  root.querySelector<HTMLButtonElement>('#me-back-game')!.onclick = () => { if (dirty && !window.confirm('Há alterações não salvas. Voltar para o jogo mesmo assim?')) return; window.location.href = window.location.pathname; };
  root.querySelector<HTMLButtonElement>('#me-export')!.onclick = () => { downloadText(`${mapDoc.id}.ascension-map.json`, JSON.stringify(mapDoc, null, 2)); showToast('Mapa exportado em JSON.'); };
  root.querySelector<HTMLButtonElement>('#me-import')!.onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const file = fileInput.files?.[0]; if (!file) return;
    try { mapDoc = importMapDocument(await file.text()); selection = null; undoStack.length = 0; redoStack.length = 0; markSaved(); fitMap(); refreshAll(); showToast(`Mapa ${mapDoc.name} importado.`); }
    catch (error) { showToast(error instanceof Error ? error.message : 'Falha ao importar mapa.'); }
    fileInput.value = '';
  };
  mapSelect.onchange = () => {
    if (dirty && !window.confirm('Trocar de mapa sem salvar as alterações atuais?')) { mapSelect.value = mapDoc.id; return; }
    const next = loadMapDocument(mapSelect.value); if (!next) return;
    mapDoc = next; selection = null; undoStack.length = 0; redoStack.length = 0; markSaved(); fitMap(); refreshAll();
  };

  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    const point = screenToTile(event.clientX, event.clientY);
    if (event.button === 1 || event.button === 2 || tool === 'pan' || spaceDown) {
      dragMode = 'pan'; pointerStart = { x: event.clientX, y: event.clientY, cameraX, cameraY }; canvas.classList.add('dragging'); return;
    }
    if (tool === 'select') {
      useToolAt(point.x, point.y, true);
      if (selection?.kind === 'object' || selection?.kind === 'zone') { beginMutation('Mover seleção'); dragMode = 'move-selection'; }
      return;
    }
    dragMode = 'paint'; useToolAt(point.x, point.y, true);
  });

  canvas.addEventListener('pointermove', (event) => {
    const point = screenToTile(event.clientX, event.clientY);
    coordStatus.textContent = `X ${point.x} • Y ${point.y}`;
    if (dragMode === 'pan') {
      cameraX = pointerStart.cameraX - (event.clientX - pointerStart.x) / zoom; cameraY = pointerStart.cameraY - (event.clientY - pointerStart.y) / zoom; clampCamera(); render(); return;
    }
    if (dragMode === 'move-selection' && validTile(point.x, point.y)) {
      if (selection?.kind === 'object') { const value = mapDoc.objects.find((entry) => entry.id === selection!.id); if (value) { value.x = point.x; value.y = point.y; actionMutated = true; } }
      else if (selection?.kind === 'zone') { const value = mapDoc.zones.find((entry) => entry.id === selection!.id); if (value) { value.x = clamp(point.x, 0, mapDoc.width - value.width); value.y = clamp(point.y, 0, mapDoc.height - value.height); actionMutated = true; } }
      refreshInspector(); render(); return;
    }
    if (dragMode === 'paint') useToolAt(point.x, point.y, false);
  });

  const endPointer = () => { canvas.classList.remove('dragging'); if (dragMode === 'paint' || dragMode === 'move-selection') finishMutation(); dragMode = 'none'; };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = event.clientX - rect.left, sy = event.clientY - rect.top;
    const beforeX = sx / zoom + cameraX, beforeY = sy / zoom + cameraY;
    const factor = event.deltaY < 0 ? 1.12 : .89;
    zoom = clamp(zoom * factor, .15, 3.2);
    cameraX = beforeX - sx / zoom; cameraY = beforeY - sy / zoom; clampCamera(); refreshChrome(); render();
  }, { passive: false });

  minimap.addEventListener('pointerdown', (event) => {
    const rect = minimap.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * mapDoc.width;
    const y = (event.clientY - rect.top) / rect.height * mapDoc.height;
    centerTile(x, y);
  });

  window.addEventListener('keydown', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
    if (event.ctrlKey || event.metaKey) {
      if (event.code === 'KeyS') { event.preventDefault(); save(); }
      else if (event.code === 'KeyZ' && !event.shiftKey) { event.preventDefault(); undo(); }
      else if (event.code === 'KeyY' || (event.code === 'KeyZ' && event.shiftKey)) { event.preventDefault(); redo(); }
      return;
    }
    if (event.code === 'Space') { event.preventDefault(); spaceDown = true; canvas.classList.add('tool-pan'); return; }
    const shortcut = TOOL_DEFS.find((entry) => `Key${entry.key}` === event.code);
    if (shortcut) { event.preventDefault(); selectTool(shortcut.id); return; }
    if ((event.code === 'Delete' || event.code === 'Backspace') && selection) { event.preventDefault(); deleteSelection(); }
  });
  window.addEventListener('keyup', (event) => { if (event.code === 'Space') { spaceDown = false; if (tool !== 'pan') canvas.classList.remove('tool-pan'); } });
  window.addEventListener('beforeunload', (event) => { if (!dirty) return; event.preventDefault(); });

  const observer = new ResizeObserver(resizeCanvas);
  observer.observe(canvasArea);

  selectTool(tool);
  refreshAll();
  resizeCanvas();
  showToast('Ascension Map Editor pronto. Use B para pintar e Espaço para mover a visão.');

  // Exposto só para debug do protótipo/editor. O jogo consumirá o schema por módulo na próxima etapa.
  return { get document() { return mapDoc; }, save, destroy() { observer.disconnect(); root.remove(); } };
}

export type MapEditor = ReturnType<typeof startMapEditor>;
