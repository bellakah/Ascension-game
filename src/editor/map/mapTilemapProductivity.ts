import './mapTilemapProductivity.css';
import { deleteAssetSourceIfUnused } from './mapAssetLibraryV2';
import { listMapDocuments, loadMapDocument, saveMapDocument } from './mapEditorStorage';
import {
  deleteTileset,
  ensureTilesetEntries,
  getTileset,
  hydrateTilesetsIntoPalette,
  listTilesets,
  parseTilesetTileId,
} from './mapTilesetStore';
import {
  deleteTilePattern,
  getTilePattern,
  listTilePatterns,
  saveTilePattern,
  type TilePattern,
  type TilePatternCell,
} from './mapTilePatternStore';
import { tileKey } from './mapEditorTypes';

type Action = 'none' | 'copy-area' | 'cut-area' | 'paste';
type Point = { x: number; y: number };
type Area = { start: Point; end: Point };

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
const clone = <T>(value: T): T => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;

function currentMapId() { return document.querySelector<HTMLSelectElement>('#mep-map-select')?.value ?? ''; }
function currentLayer(): 'ground' | 'detail' { return document.querySelector<HTMLSelectElement>('#traditional-layer')?.value === 'detail' ? 'detail' : 'ground'; }
function currentTilesetId() { return document.querySelector<HTMLSelectElement>('#traditional-select')?.value ?? ''; }
function saveEditor() { document.querySelector<HTMLButtonElement>('#mep-save')?.click(); }
function reloadMap(id: string) {
  const select = document.querySelector<HTMLSelectElement>('#mep-map-select');
  if (!select) return;
  select.value = id;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function pointFromStatus(): Point | null {
  const text = document.querySelector<HTMLElement>('#mep-position')?.textContent ?? '';
  const match = text.match(/X\s*(-?\d+(?:\.\d+)?)\s*[•·]\s*Y\s*(-?\d+(?:\.\d+)?)/i);
  return match ? { x: Math.floor(Number(match[1])), y: Math.floor(Number(match[2])) } : null;
}

function normalizeArea(area: Area) {
  return {
    minX: Math.min(area.start.x, area.end.x), maxX: Math.max(area.start.x, area.end.x),
    minY: Math.min(area.start.y, area.end.y), maxY: Math.max(area.start.y, area.end.y),
  };
}

function patternFromArea(area: Area, layer: 'ground' | 'detail', cut = false): TilePattern | null {
  const mapId = currentMapId();
  if (!mapId) return null;
  saveEditor();
  const map = loadMapDocument(mapId);
  if (!map) return null;
  const box = normalizeArea(area);
  const cells: TilePatternCell[] = [];
  for (let y = box.minY; y <= box.maxY; y++) for (let x = box.minX; x <= box.maxX; x++) {
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
    const key = tileKey(x, y), value = map.tiles[key];
    const assetId = layer === 'detail' ? value?.detail : value?.ground;
    if (assetId) cells.push({ dx: x - box.minX, dy: y - box.minY, assetId });
    if (cut && value) {
      if (layer === 'detail') delete value.detail; else delete value.ground;
      if (!value.ground && !value.detail) delete map.tiles[key]; else map.tiles[key] = value;
    }
  }
  if (cut) { saveMapDocument(map); reloadMap(mapId); }
  const now = Date.now();
  return {
    version: 1,
    id: `clipboard-${now}`,
    name: 'Clipboard',
    width: box.maxX - box.minX + 1,
    height: box.maxY - box.minY + 1,
    layer,
    cells,
    createdAt: now,
    updatedAt: now,
  };
}

async function pastePattern(pattern: TilePattern, origin: Point) {
  const mapId = currentMapId();
  if (!mapId) return false;
  saveEditor();
  const map = loadMapDocument(mapId);
  if (!map) return false;
  await ensureTilesetEntries(pattern.cells.map((cell) => cell.assetId));
  for (const cell of pattern.cells) {
    const x = origin.x + cell.dx, y = origin.y + cell.dy;
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
    const key = tileKey(x, y), value = map.tiles[key] ?? {};
    if (pattern.layer === 'detail') value.detail = cell.assetId; else value.ground = cell.assetId;
    map.tiles[key] = value;
  }
  saveMapDocument(map);
  reloadMap(mapId);
  return true;
}

function dependencyReport(tilesetId: string) {
  const maps: Array<{ name: string; ground: number; detail: number }> = [];
  let mapTotal = 0;
  for (const map of listMapDocuments()) {
    let ground = 0, detail = 0;
    for (const tile of Object.values(map.tiles)) {
      const groundId = parseTilesetTileId(tile.ground), detailId = parseTilesetTileId(tile.detail);
      if (groundId?.tilesetId === tilesetId) ground += 1;
      if (detailId?.tilesetId === tilesetId) detail += 1;
    }
    if (ground || detail) { maps.push({ name: map.name, ground, detail }); mapTotal += ground + detail; }
  }
  const patterns = listTilePatterns().filter((pattern) => pattern.cells.some((cell) => parseTilesetTileId(cell.assetId)?.tilesetId === tilesetId));
  return { maps, mapTotal, patterns };
}

export function installMapTilemapProductivity() {
  const root = document.querySelector<HTMLElement>('.mep');
  const canvas = root?.querySelector<HTMLCanvasElement>('#mep-canvas');
  const stage = root?.querySelector<HTMLElement>('.mep-stage');
  if (!root || !canvas || !stage || root.dataset.tilemapProductivity === '1') return;
  root.dataset.tilemapProductivity = '1';

  let action: Action = 'none';
  let clipboard: TilePattern | null = null;
  let selecting = false;
  let selectArea: Area | null = null;
  let startClient = { x: 0, y: 0 };
  let endClient = { x: 0, y: 0 };
  let frame = 0;

  const marquee = document.createElement('div');
  marquee.style.cssText = 'position:absolute;display:none;z-index:180;pointer-events:none;border:2px solid #86e0ff;background:rgba(77,183,226,.14);box-shadow:0 0 0 1px rgba(3,12,18,.7) inset';
  stage.appendChild(marquee);

  const isTilesetMode = () => Boolean(document.querySelector<HTMLButtonElement>('[data-terrain-mode="tileset"].active'));

  const setAction = (next: Action) => {
    action = next;
    selecting = false;
    selectArea = null;
    marquee.style.display = 'none';
    refreshUi();
  };

  const actionMessage = () => {
    if (action === 'copy-area') return 'Arraste no mapa para copiar uma área da camada atual.';
    if (action === 'cut-area') return 'Arraste no mapa para recortar uma área da camada atual.';
    if (action === 'paste') return clipboard ? `Clique no mapa para colar “${clipboard.name}” (${clipboard.width}×${clipboard.height}). Esc cancela.` : 'Clipboard vazio.';
    if (clipboard) return `Clipboard: ${clipboard.name} • ${clipboard.width}×${clipboard.height} • ${clipboard.cells.length} tile(s).`;
    return 'Copie uma área ou escolha um padrão salvo.';
  };

  const renderPatterns = (host: HTMLElement) => {
    const patterns = listTilePatterns();
    const select = host.querySelector<HTMLSelectElement>('#tile-pattern-select');
    if (!select) return;
    const current = select.value;
    select.innerHTML = `<option value="">Padrões salvos…</option>${patterns.map((pattern) => `<option value="${esc(pattern.id)}">${esc(pattern.name)} · ${pattern.width}×${pattern.height}</option>`).join('')}`;
    if (patterns.some((pattern) => pattern.id === current)) select.value = current;
  };

  const refreshUi = () => {
    const host = document.querySelector<HTMLElement>('.tile-productivity');
    if (!host) return;
    host.querySelectorAll<HTMLButtonElement>('[data-tile-action]').forEach((button) => button.classList.toggle('active', button.dataset.tileAction === action));
    const status = host.querySelector<HTMLElement>('#tile-productivity-status');
    if (status) { status.innerHTML = `<strong>${action === 'none' ? 'Pronto' : action.toUpperCase()}</strong><br>${esc(actionMessage())}`; status.classList.toggle('active', action !== 'none' || Boolean(clipboard)); }
    const paste = host.querySelector<HTMLButtonElement>('[data-tile-action="paste"]'); if (paste) paste.disabled = !clipboard;
    const save = host.querySelector<HTMLButtonElement>('#tile-save-pattern'); if (save) save.disabled = !clipboard;
    renderPatterns(host);
  };

  const openSavePattern = () => {
    if (!clipboard) return;
    const backdrop = document.createElement('div'); backdrop.className = 'pro-modal-backdrop';
    backdrop.innerHTML = `<section class="tile-pattern-modal"><h3>Salvar padrão / Stamp</h3><label>Nome<input id="tile-pattern-name" value="Novo padrão ${clipboard.width}×${clipboard.height}"></label><p style="font-size:9px;color:#718f9d">Camada: ${clipboard.layer === 'ground' ? 'Ground' : 'Detail'} • ${clipboard.cells.length} tiles usados.</p><footer><button data-close>Cancelar</button><button id="tile-pattern-save" class="primary">Salvar</button></footer></section>`;
    document.body.appendChild(backdrop);
    const close = () => backdrop.remove();
    backdrop.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((button) => button.onclick = close);
    backdrop.querySelector<HTMLButtonElement>('#tile-pattern-save')!.onclick = () => {
      const name = backdrop.querySelector<HTMLInputElement>('#tile-pattern-name')!.value.trim() || `Padrão ${clipboard!.width}×${clipboard!.height}`;
      const saved = saveTilePattern({ name, width: clipboard!.width, height: clipboard!.height, layer: clipboard!.layer, cells: clipboard!.cells.map(clone) });
      clipboard = { ...saved };
      close(); refreshUi();
    };
  };

  const showDependencyModal = async (tilesetId: string) => {
    const tileset = getTileset(tilesetId); if (!tileset) return;
    const report = dependencyReport(tilesetId);
    const backdrop = document.createElement('div'); backdrop.className = 'pro-modal-backdrop';
    const mapRows = report.maps.map((map) => `<li><strong>${esc(map.name)}</strong> — Ground ${map.ground}, Detail ${map.detail}</li>`).join('');
    const patternRows = report.patterns.map((pattern) => `<li>${esc(pattern.name)} (${pattern.width}×${pattern.height})</li>`).join('');
    const blocked = report.mapTotal > 0 || report.patterns.length > 0;
    backdrop.innerHTML = `<section class="tile-pattern-modal" style="width:min(560px,92vw)"><h3>Dependências · ${esc(tileset.name)}</h3>${blocked ? `<p style="font-size:9px;color:#d9a983">Este Tileset não pode ser excluído enquanto houver referências.</p>${report.maps.length ? `<h4 style="font-size:9px">Mapas</h4><ul style="font-size:9px;color:#9db5bf">${mapRows}</ul>` : ''}${report.patterns.length ? `<h4 style="font-size:9px">Padrões</h4><ul style="font-size:9px;color:#9db5bf">${patternRows}</ul>` : ''}` : '<p style="font-size:9px;color:#9bcbb2">Nenhum mapa ou padrão usa este Tileset. A exclusão é segura.</p>'}<footer><button data-close>Fechar</button>${blocked ? '' : '<button id="tile-confirm-delete" class="primary">Excluir Tileset</button>'}</footer></section>`;
    document.body.appendChild(backdrop);
    const close = () => backdrop.remove();
    backdrop.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((button) => button.onclick = close);
    const confirm = backdrop.querySelector<HTMLButtonElement>('#tile-confirm-delete');
    if (confirm) confirm.onclick = async () => {
      const sourceId = tileset.sourceId;
      if (!deleteTileset(tileset.id)) return;
      const sourceStillUsedByTileset = listTilesets().some((other) => other.sourceId === sourceId);
      if (!sourceStillUsedByTileset) await deleteAssetSourceIfUnused(sourceId);
      await hydrateTilesetsIntoPalette();
      close();
      document.querySelector<HTMLButtonElement>('[data-terrain-mode="natural"]')?.click();
      requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-terrain-mode="tileset"]')?.click());
    };
  };

  const attachUi = () => {
    const browser = document.querySelector<HTMLElement>('.traditional-browser');
    if (!browser) return;
    let host = browser.querySelector<HTMLElement>('.tile-productivity');
    if (!host) {
      host = document.createElement('section'); host.className = 'tile-productivity';
      host.innerHTML = `<div class="tile-productivity-head"><strong>ÁREA & PADRÕES</strong><span>Ctrl/Cmd + ferramentas tradicionais</span></div><div class="tile-productivity-actions"><button data-tile-action="copy-area">Copiar área</button><button data-tile-action="cut-area">Recortar</button><button data-tile-action="paste">Colar</button><button id="tile-save-pattern">Salvar padrão</button><button id="tile-clear-clipboard">Limpar</button><button id="tile-cancel-action">Cancelar</button></div><div class="tile-productivity-patterns"><select id="tile-pattern-select"><option>Padrões salvos…</option></select><button id="tile-use-pattern">Usar</button><button id="tile-delete-pattern">×</button></div><div id="tile-productivity-status" class="tile-productivity-status"></div>`;
      browser.appendChild(host);
      host.querySelectorAll<HTMLButtonElement>('[data-tile-action]').forEach((button) => button.onclick = () => setAction(button.dataset.tileAction as Action));
      host.querySelector<HTMLButtonElement>('#tile-save-pattern')!.onclick = openSavePattern;
      host.querySelector<HTMLButtonElement>('#tile-clear-clipboard')!.onclick = () => { clipboard = null; setAction('none'); };
      host.querySelector<HTMLButtonElement>('#tile-cancel-action')!.onclick = () => setAction('none');
      host.querySelector<HTMLButtonElement>('#tile-use-pattern')!.onclick = () => {
        const id = host!.querySelector<HTMLSelectElement>('#tile-pattern-select')!.value;
        const pattern = getTilePattern(id); if (!pattern) return;
        clipboard = pattern; setAction('paste');
      };
      host.querySelector<HTMLButtonElement>('#tile-delete-pattern')!.onclick = () => {
        const id = host!.querySelector<HTMLSelectElement>('#tile-pattern-select')!.value;
        const pattern = getTilePattern(id); if (!pattern) return;
        if (window.confirm(`Excluir o padrão “${pattern.name}”?`)) { deleteTilePattern(id); if (clipboard?.id === id) clipboard = null; refreshUi(); }
      };
    }
    refreshUi();

    const deleteButton = browser.querySelector<HTMLButtonElement>('#traditional-delete');
    if (deleteButton && deleteButton.dataset.dependenciesHook !== '1') {
      deleteButton.dataset.dependenciesHook = '1';
      deleteButton.onclick = (event) => { event.preventDefault(); event.stopImmediatePropagation(); const id = currentTilesetId(); if (id) void showDependencyModal(id); };
    }
  };

  const updateMarquee = () => {
    const rect = stage.getBoundingClientRect();
    const x1 = Math.min(startClient.x, endClient.x) - rect.left, y1 = Math.min(startClient.y, endClient.y) - rect.top;
    const x2 = Math.max(startClient.x, endClient.x) - rect.left, y2 = Math.max(startClient.y, endClient.y) - rect.top;
    marquee.style.left = `${x1}px`; marquee.style.top = `${y1}px`; marquee.style.width = `${Math.max(1, x2 - x1)}px`; marquee.style.height = `${Math.max(1, y2 - y1)}px`; marquee.style.display = selecting ? 'block' : 'none';
  };

  canvas.addEventListener('pointerdown', (event) => {
    if (!isTilesetMode() || event.button !== 0 || action === 'none') return;
    const point = pointFromStatus(); if (!point) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (action === 'paste') { if (clipboard) void pastePattern(clipboard, point); return; }
    selecting = true; selectArea = { start: point, end: point }; startClient = { x: event.clientX, y: event.clientY }; endClient = { ...startClient }; updateMarquee();
  }, { capture: true });

  canvas.addEventListener('pointermove', (event) => {
    if (!selecting || !selectArea) return;
    endClient = { x: event.clientX, y: event.clientY }; updateMarquee();
    requestAnimationFrame(() => { const point = pointFromStatus(); if (point && selectArea) selectArea.end = point; });
  });

  const finishSelection = () => {
    if (!selecting || !selectArea) return;
    selecting = false; updateMarquee();
    const layer = currentLayer();
    const copied = patternFromArea(selectArea, layer, action === 'cut-area');
    if (copied) clipboard = copied;
    selectArea = null; setAction('none');
  };
  window.addEventListener('pointerup', finishSelection, { capture: true });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && action !== 'none') { event.preventDefault(); setAction('none'); }
    const editable = (event.target as HTMLElement | null)?.matches('input,textarea,select,[contenteditable="true"]'); if (editable) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v' && clipboard && isTilesetMode()) { event.preventDefault(); setAction('paste'); }
  });

  const scan = () => { frame = 0; attachUi(); };
  const observer = new MutationObserver(() => { if (!frame) frame = requestAnimationFrame(scan); });
  observer.observe(root, { childList: true, subtree: true });
  attachUi();
  window.addEventListener('pagehide', () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame); marquee.remove(); }, { once: true });
}
