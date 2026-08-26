import './mapTileset.css';
import { getAssetSourceUrl } from './mapAssetLibraryV2';
import { loadMapDocument, saveMapDocument } from './mapEditorStorage';
import { openTraditionalTilesetImporter } from './mapTilesetImporter';
import {
  getTileset,
  hydrateTilesetsIntoPalette,
  listTilesets,
  parseTilesetTileId,
  tilesetTileId,
  tilesetTileRect,
  type TilesetDefinition,
} from './mapTilesetStore';
import { tileKey } from './mapEditorTypes';

const STYLE_MODE_KEY = 'ascension.map-editor.terrain-mode.v1';
type TraditionalTool = 'pencil' | 'eraser' | 'fill' | 'eyedropper';
type StampCell = { dx: number; dy: number; assetId: string };
type TilePoint = { x: number; y: number };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);

function imageFromUrl(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível abrir a imagem deste Tileset.'));
    image.src = url;
  });
}

function currentMapId() { return document.querySelector<HTMLSelectElement>('#mep-map-select')?.value ?? ''; }
function currentMap() { const id = currentMapId(); return id ? loadMapDocument(id) : null; }
function currentMapTileSize() { return currentMap()?.tileSize ?? 32; }
function saveEditor() { document.querySelector<HTMLButtonElement>('#mep-save')?.click(); }
function reloadMap(id: string) {
  const select = document.querySelector<HTMLSelectElement>('#mep-map-select');
  if (!select) return;
  select.value = id; select.dispatchEvent(new Event('change', { bubbles: true }));
}

function pointFromStatus(): TilePoint | null {
  const text = document.querySelector<HTMLElement>('#mep-position')?.textContent ?? '';
  const match = text.match(/X\s*(-?\d+(?:\.\d+)?)\s*[•·]\s*Y\s*(-?\d+(?:\.\d+)?)/i);
  if (!match) return null;
  return { x: Math.floor(Number(match[1])), y: Math.floor(Number(match[2])) };
}

function bresenham(a: TilePoint, b: TilePoint) {
  const result: TilePoint[] = [];
  let x0 = a.x, y0 = a.y, x1 = b.x, y1 = b.y;
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  while (true) {
    result.push({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return result;
}

export function installTraditionalTilesetEditor() {
  const root = document.querySelector<HTMLElement>('.mep');
  const panel = root?.querySelector<HTMLElement>('#mep-panel');
  const canvas = root?.querySelector<HTMLCanvasElement>('#mep-canvas');
  if (!root || !panel || !canvas || root.dataset.traditionalTileset === '1') return;
  root.dataset.traditionalTileset = '1';

  let mode: 'natural' | 'tileset' = localStorage.getItem(STYLE_MODE_KEY) === 'tileset' ? 'tileset' : 'natural';
  let tilesets: TilesetDefinition[] = [];
  let selectedTilesetId = '';
  let image: HTMLImageElement | null = null;
  let sheetScale = .5;
  let selection = { c0: 0, r0: 0, c1: 0, r1: 0 };
  let selectionDragging = false;
  let tool: TraditionalTool = 'pencil';
  let mapLayer: 'ground' | 'detail' = 'ground';
  let painting = false;
  let paintPoints: TilePoint[] = [];
  let lastPoint: TilePoint | null = null;
  let panelHost: HTMLElement | null = null;
  let tabs: HTMLElement | null = null;
  let browser: HTMLElement | null = null;
  let sheetCanvas: HTMLCanvasElement | null = null;
  let sheetCtx: CanvasRenderingContext2D | null = null;
  let statusNode: HTMLElement | null = null;

  const selectedTileset = () => getTileset(selectedTilesetId) ?? tilesets[0] ?? null;
  const orderedSelection = () => ({
    minC: Math.min(selection.c0, selection.c1), maxC: Math.max(selection.c0, selection.c1),
    minR: Math.min(selection.r0, selection.r1), maxR: Math.max(selection.r0, selection.r1),
  });
  const stamp = (): StampCell[] => {
    const ts = selectedTileset(); if (!ts) return [];
    const box = orderedSelection(), cells: StampCell[] = [];
    for (let row = box.minR; row <= box.maxR; row++) for (let col = box.minC; col <= box.maxC; col++) {
      const id = tilesetTileId(ts, col, row); if (id) cells.push({ dx: col - box.minC, dy: row - box.minR, assetId: id });
    }
    return cells;
  };

  const syncStatus = () => {
    if (!statusNode) return;
    const box = orderedSelection();
    statusNode.innerHTML = `<strong>${box.maxC - box.minC + 1}×${box.maxR - box.minR + 1} tiles</strong><span>${stamp().length} célula(s) no Stamp • ${mapLayer === 'ground' ? 'Ground' : 'Detail'}</span>`;
  };

  const renderSheet = () => {
    const ts = selectedTileset(); if (!sheetCanvas || !sheetCtx || !ts || !image) return;
    sheetCanvas.width = ts.imageWidth; sheetCanvas.height = ts.imageHeight;
    sheetCanvas.style.width = `${Math.max(1, ts.imageWidth * sheetScale)}px`; sheetCanvas.style.height = `${Math.max(1, ts.imageHeight * sheetScale)}px`;
    sheetCtx.clearRect(0, 0, ts.imageWidth, ts.imageHeight); sheetCtx.imageSmoothingEnabled = false; sheetCtx.drawImage(image, 0, 0);
    sheetCtx.strokeStyle = 'rgba(92,205,245,.38)'; sheetCtx.lineWidth = Math.max(1, 1 / sheetScale);
    for (let col = 0; col <= ts.columns; col++) {
      const x = ts.offsetX + ts.margin + col * (ts.tileWidth + ts.spacing);
      sheetCtx.beginPath(); sheetCtx.moveTo(x, ts.offsetY + ts.margin); sheetCtx.lineTo(x, ts.offsetY + ts.margin + ts.rows * (ts.tileHeight + ts.spacing) - ts.spacing); sheetCtx.stroke();
    }
    for (let row = 0; row <= ts.rows; row++) {
      const y = ts.offsetY + ts.margin + row * (ts.tileHeight + ts.spacing);
      sheetCtx.beginPath(); sheetCtx.moveTo(ts.offsetX + ts.margin, y); sheetCtx.lineTo(ts.offsetX + ts.margin + ts.columns * (ts.tileWidth + ts.spacing) - ts.spacing, y); sheetCtx.stroke();
    }
    const box = orderedSelection();
    const first = tilesetTileRect(ts, box.minC, box.minR), last = tilesetTileRect(ts, box.maxC, box.maxR);
    if (first && last) {
      const right = last.x + last.width, bottom = last.y + last.height;
      sheetCtx.fillStyle = 'rgba(77,186,231,.20)'; sheetCtx.strokeStyle = '#a5edff'; sheetCtx.lineWidth = Math.max(2, 2 / sheetScale);
      sheetCtx.fillRect(first.x, first.y, right - first.x, bottom - first.y); sheetCtx.strokeRect(first.x + 1, first.y + 1, right - first.x - 2, bottom - first.y - 2);
    }
    syncStatus();
  };

  const loadSelectedSheet = async () => {
    const ts = selectedTileset(); if (!ts) { image = null; renderBrowser(); return; }
    selectedTilesetId = ts.id;
    const url = await getAssetSourceUrl(ts.sourceId);
    image = url ? await imageFromUrl(url).catch(() => null) : null;
    selection = { c0: 0, r0: 0, c1: 0, r1: 0 };
    renderSheet();
  };

  const renderBrowser = () => {
    if (!browser) return;
    tilesets = listTilesets();
    if (!tilesets.some((value) => value.id === selectedTilesetId)) selectedTilesetId = tilesets[0]?.id ?? '';
    if (!tilesets.length) {
      browser.innerHTML = `<div class="traditional-toolbar"><button id="traditional-import" style="grid-column:1/-1">＋ Importar primeiro Tileset</button></div><div class="traditional-empty">Importe um spritesheet organizado e defina sua grade 16×16, 32×32, 48×48 ou custom.</div>`;
      browser.querySelector<HTMLButtonElement>('#traditional-import')!.onclick = importTileset;
      return;
    }
    browser.innerHTML = `
      <div class="traditional-toolbar"><select id="traditional-select">${tilesets.map((value) => `<option value="${esc(value.id)}" ${value.id === selectedTilesetId ? 'selected' : ''}>${esc(value.name)} · ${value.tileWidth}×${value.tileHeight}</option>`).join('')}</select><button id="traditional-import">＋</button></div>
      <div class="traditional-toolbar" style="grid-template-columns:1fr 1fr"><select id="traditional-layer"><option value="ground">Ground</option><option value="detail">Detail</option></select><select id="traditional-zoom"><option value="0.25">25%</option><option value="0.5">50%</option><option value="1">100%</option><option value="2">200%</option><option value="4">400%</option></select></div>
      <div class="traditional-sheet-wrap"><canvas class="traditional-sheet-canvas" id="traditional-sheet"></canvas></div>
      <div class="traditional-selection-meta" id="traditional-meta"></div>
      <div class="traditional-actions"><button data-trad-tool="pencil">✎ Pintar</button><button data-trad-tool="eraser">⌫ Apagar</button><button data-trad-tool="fill">▨ Fill</button><button data-trad-tool="eyedropper">⌾ Conta-gotas</button><button id="traditional-edit-grid">⚙ Grade</button><button id="traditional-delete">Excluir</button></div>`;
    sheetCanvas = browser.querySelector<HTMLCanvasElement>('#traditional-sheet')!; sheetCtx = sheetCanvas.getContext('2d')!; statusNode = browser.querySelector<HTMLElement>('#traditional-meta')!;
    browser.querySelector<HTMLSelectElement>('#traditional-layer')!.value = mapLayer;
    browser.querySelector<HTMLSelectElement>('#traditional-zoom')!.value = String(sheetScale);
    browser.querySelector<HTMLSelectElement>('#traditional-select')!.onchange = async (event) => { selectedTilesetId = (event.target as HTMLSelectElement).value; await loadSelectedSheet(); };
    browser.querySelector<HTMLSelectElement>('#traditional-layer')!.onchange = (event) => { mapLayer = (event.target as HTMLSelectElement).value === 'detail' ? 'detail' : 'ground'; syncStatus(); };
    browser.querySelector<HTMLSelectElement>('#traditional-zoom')!.onchange = (event) => { sheetScale = Number((event.target as HTMLSelectElement).value) || .5; renderSheet(); };
    browser.querySelector<HTMLButtonElement>('#traditional-import')!.onclick = importTileset;
    browser.querySelectorAll<HTMLButtonElement>('[data-trad-tool]').forEach((button) => {
      button.classList.toggle('active', button.dataset.tradTool === tool);
      button.onclick = () => { tool = button.dataset.tradTool as TraditionalTool; renderBrowser(); void loadSelectedSheet(); };
    });
    browser.querySelector<HTMLButtonElement>('#traditional-edit-grid')!.onclick = () => showGridEditor();
    browser.querySelector<HTMLButtonElement>('#traditional-delete')!.onclick = () => showDeleteInfo();

    sheetCanvas.onpointerdown = (event) => {
      const ts = selectedTileset(); if (!ts) return;
      const rect = sheetCanvas!.getBoundingClientRect();
      const px = (event.clientX - rect.left) * sheetCanvas!.width / Math.max(1, rect.width), py = (event.clientY - rect.top) * sheetCanvas!.height / Math.max(1, rect.height);
      const col = clamp(Math.floor((px - ts.offsetX - ts.margin) / Math.max(1, ts.tileWidth + ts.spacing)), 0, Math.max(0, ts.columns - 1));
      const row = clamp(Math.floor((py - ts.offsetY - ts.margin) / Math.max(1, ts.tileHeight + ts.spacing)), 0, Math.max(0, ts.rows - 1));
      selection = { c0: col, r0: row, c1: col, r1: row }; selectionDragging = true; sheetCanvas!.setPointerCapture(event.pointerId); renderSheet();
    };
    sheetCanvas.onpointermove = (event) => {
      if (!selectionDragging) return;
      const ts = selectedTileset(); if (!ts) return;
      const rect = sheetCanvas!.getBoundingClientRect();
      const px = (event.clientX - rect.left) * sheetCanvas!.width / Math.max(1, rect.width), py = (event.clientY - rect.top) * sheetCanvas!.height / Math.max(1, rect.height);
      selection.c1 = clamp(Math.floor((px - ts.offsetX - ts.margin) / Math.max(1, ts.tileWidth + ts.spacing)), 0, Math.max(0, ts.columns - 1));
      selection.r1 = clamp(Math.floor((py - ts.offsetY - ts.margin) / Math.max(1, ts.tileHeight + ts.spacing)), 0, Math.max(0, ts.rows - 1)); renderSheet();
    };
    sheetCanvas.onpointerup = () => { selectionDragging = false; };
    void loadSelectedSheet();
  };

  const setMode = (next: 'natural' | 'tileset') => {
    mode = next; localStorage.setItem(STYLE_MODE_KEY, mode);
    panel.classList.toggle('traditional-hidden-main', mode === 'tileset');
    tabs?.querySelectorAll<HTMLButtonElement>('button').forEach((button) => button.classList.toggle('active', button.dataset.terrainMode === mode));
    browser?.classList.toggle('hidden', mode !== 'tileset');
    if (mode === 'tileset') { renderBrowser(); }
  };

  function importTileset() {
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/png,image/webp,image/jpeg';
    input.onchange = () => { const file = input.files?.[0]; if (!file) return; void openTraditionalTilesetImporter(file, { preferredTileSize: currentMapTileSize(), onCreated: async (created) => { await hydrateTilesetsIntoPalette(); tilesets = listTilesets(); selectedTilesetId = created.id; renderBrowser(); } }); };
    input.click();
  }

  function showGridEditor() {
    const ts = selectedTileset(); if (!ts) return;
    const modal = document.createElement('div'); modal.className = 'pro-modal-backdrop';
    modal.innerHTML = `<form class="pro-config-window" style="width:min(520px,94vw);height:auto;grid-template-rows:52px auto 54px"><header class="pro-config-head"><div><strong>Editar grade</strong><span>${esc(ts.name)}</span></div><button type="button" data-close>×</button></header><div style="padding:16px"><p style="font-size:9px;color:#7795a4">Tiles já colocados mantêm o recorte em pixels que possuíam. A nova grade afeta apenas seleções futuras.</p><div class="mep-form-grid"><label>Tile W<input id="teg-w" type="number" min="1" value="${ts.tileWidth}"></label><label>Tile H<input id="teg-h" type="number" min="1" value="${ts.tileHeight}"></label><label>Margem<input id="teg-margin" type="number" min="0" value="${ts.margin}"></label><label>Spacing<input id="teg-spacing" type="number" min="0" value="${ts.spacing}"></label><label>Offset X<input id="teg-x" type="number" min="0" value="${ts.offsetX}"></label><label>Offset Y<input id="teg-y" type="number" min="0" value="${ts.offsetY}"></label></div></div><footer class="pro-config-footer"><span></span><button type="button" data-close>Cancelar</button><button class="primary">Aplicar grade</button></footer></form>`;
    document.body.appendChild(modal);
    modal.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((button) => button.onclick = () => modal.remove());
    modal.querySelector<HTMLFormElement>('form')!.onsubmit = async (event) => {
      event.preventDefault();
      const { saveTileset } = await import('./mapTilesetStore');
      saveTileset({ ...ts, tileWidth: Number(modal.querySelector<HTMLInputElement>('#teg-w')!.value) || ts.tileWidth, tileHeight: Number(modal.querySelector<HTMLInputElement>('#teg-h')!.value) || ts.tileHeight, margin: Number(modal.querySelector<HTMLInputElement>('#teg-margin')!.value) || 0, spacing: Number(modal.querySelector<HTMLInputElement>('#teg-spacing')!.value) || 0, offsetX: Number(modal.querySelector<HTMLInputElement>('#teg-x')!.value) || 0, offsetY: Number(modal.querySelector<HTMLInputElement>('#teg-y')!.value) || 0 });
      await hydrateTilesetsIntoPalette(); modal.remove(); tilesets = listTilesets(); renderBrowser();
    };
  }

  function showDeleteInfo() {
    const ts = selectedTileset(); if (!ts) return;
    alert('A exclusão definitiva do Tileset será habilitada junto ao relatório de dependências, para impedir que mapas fiquem com tiles órfãos. Por enquanto use Editar grade ou importe outro Tileset.');
  }

  const ensurePanelUi = () => {
    const title = panel.querySelector<HTMLElement>('#mep-panel-title')?.textContent;
    if (title !== 'TERRENO') { tabs?.remove(); browser?.remove(); tabs = null; browser = null; panel.classList.remove('traditional-hidden-main'); return; }
    if (tabs && browser) return;
    panelHost = panel.querySelector<HTMLElement>('.mep-search') ?? panel.firstElementChild as HTMLElement;
    tabs = document.createElement('div'); tabs.className = 'traditional-tabs'; tabs.innerHTML = `<button data-terrain-mode="natural">Natural Blend</button><button data-terrain-mode="tileset">Tileset</button>`;
    browser = document.createElement('section'); browser.className = 'traditional-browser hidden';
    panelHost?.insertAdjacentElement('afterend', tabs); tabs.insertAdjacentElement('afterend', browser);
    tabs.querySelectorAll<HTMLButtonElement>('[data-terrain-mode]').forEach((button) => button.onclick = () => setMode(button.dataset.terrainMode === 'tileset' ? 'tileset' : 'natural'));
    setMode(mode);
  };

  const applyStampAtPoints = (points: TilePoint[], erase = false) => {
    const id = currentMapId(); if (!id || !points.length) return;
    saveEditor();
    const map = loadMapDocument(id); if (!map) return;
    const cells = stamp();
    if (!cells.length && !erase) return;
    const unique = new Map(points.map((point) => [`${point.x},${point.y}`, point]));
    for (const point of unique.values()) {
      if (erase) {
        if (point.x < 0 || point.y < 0 || point.x >= map.width || point.y >= map.height) continue;
        const key = tileKey(point.x, point.y), value = map.tiles[key] ?? {};
        if (mapLayer === 'detail') delete value.detail; else delete value.ground;
        if (!value.ground && !value.detail) delete map.tiles[key]; else map.tiles[key] = value;
        continue;
      }
      for (const cell of cells) {
        const x = point.x + cell.dx, y = point.y + cell.dy;
        if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
        const key = tileKey(x, y), value = map.tiles[key] ?? {};
        if (mapLayer === 'detail') value.detail = cell.assetId; else value.ground = cell.assetId;
        map.tiles[key] = value;
      }
    }
    saveMapDocument(map); reloadMap(id);
  };

  const floodAt = (point: TilePoint) => {
    const id = currentMapId(); if (!id) return;
    const cells = stamp(); if (cells.length !== 1) { alert('Fill usa uma seleção de 1×1 tile.'); return; }
    saveEditor(); const map = loadMapDocument(id); if (!map) return;
    const getValue = (x: number, y: number) => { const tile = map.tiles[tileKey(x, y)]; return mapLayer === 'detail' ? (tile?.detail ?? '') : (tile?.ground ?? ''); };
    const target = getValue(point.x, point.y), replacement = cells[0].assetId;
    if (target === replacement) return;
    const queue = [point], seen = new Set<string>();
    while (queue.length) {
      const next = queue.shift()!; if (next.x < 0 || next.y < 0 || next.x >= map.width || next.y >= map.height) continue;
      const key = tileKey(next.x, next.y); if (seen.has(key) || getValue(next.x, next.y) !== target) continue; seen.add(key);
      const value = map.tiles[key] ?? {}; if (mapLayer === 'detail') value.detail = replacement; else value.ground = replacement; map.tiles[key] = value;
      queue.push({ x: next.x + 1, y: next.y }, { x: next.x - 1, y: next.y }, { x: next.x, y: next.y + 1 }, { x: next.x, y: next.y - 1 });
    }
    saveMapDocument(map); reloadMap(id);
  };

  const eyedropAt = async (point: TilePoint) => {
    const map = currentMap(); if (!map) return;
    const id = mapLayer === 'detail' ? map.tiles[tileKey(point.x, point.y)]?.detail : map.tiles[tileKey(point.x, point.y)]?.ground;
    const parsed = parseTilesetTileId(id); if (!parsed) return;
    const ts = getTileset(parsed.tilesetId); if (!ts) return;
    selectedTilesetId = ts.id; tilesets = listTilesets(); renderBrowser(); await loadSelectedSheet();
    const col = Math.round((parsed.rect.x - ts.offsetX - ts.margin) / Math.max(1, ts.tileWidth + ts.spacing));
    const row = Math.round((parsed.rect.y - ts.offsetY - ts.margin) / Math.max(1, ts.tileHeight + ts.spacing));
    selection = { c0: clamp(col, 0, ts.columns - 1), c1: clamp(col, 0, ts.columns - 1), r0: clamp(row, 0, ts.rows - 1), r1: clamp(row, 0, ts.rows - 1) }; renderSheet();
  };

  canvas.addEventListener('pointerdown', (event) => {
    if (mode !== 'tileset' || event.button !== 0) return;
    const point = pointFromStatus(); if (!point) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.altKey || tool === 'eyedropper') { void eyedropAt(point); return; }
    if (tool === 'fill') { floodAt(point); return; }
    painting = true; paintPoints = [point]; lastPoint = point;
  }, { capture: true });

  canvas.addEventListener('pointermove', () => {
    if (mode !== 'tileset' || !painting) return;
    const point = pointFromStatus(); if (!point || (lastPoint && point.x === lastPoint.x && point.y === lastPoint.y)) return;
    const cells = stamp();
    if (cells.length > 1) return; // Stamp multi-tile é colocado por clique para não sobrepor padrões durante drag.
    if (lastPoint) paintPoints.push(...bresenham(lastPoint, point).slice(1)); else paintPoints.push(point);
    lastPoint = point;
  });

  const finishPaint = () => {
    if (!painting) return; painting = false;
    applyStampAtPoints(paintPoints, tool === 'eraser'); paintPoints = []; lastPoint = null;
  };
  window.addEventListener('pointerup', finishPaint, { capture: true });
  window.addEventListener('blur', finishPaint);

  let frame = 0;
  const scan = () => { frame = 0; ensurePanelUi(); };
  const observer = new MutationObserver(() => { if (!frame) frame = requestAnimationFrame(scan); });
  observer.observe(panel, { childList: true, subtree: true, characterData: true });

  void hydrateTilesetsIntoPalette().then(() => { tilesets = listTilesets(); ensurePanelUi(); if (mode === 'tileset') renderBrowser(); });
  ensurePanelUi();

  window.addEventListener('pagehide', () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame); window.removeEventListener('pointerup', finishPaint, { capture: true }); window.removeEventListener('blur', finishPaint); }, { once: true });
}
