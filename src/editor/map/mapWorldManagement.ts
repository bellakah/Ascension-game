import './mapWorldManagement.css';
import { createBlankMap, deleteMapDocument, listMapDocuments, loadMapDocument, saveMapDocument } from './mapEditorStorage';
import { loadWorldLayout, saveWorldLayout } from './mapWorldStore';
import { clearPublishedMap, loadPublishedMap } from '../../map/publishedMapStore';
import { parseTileKey, tileKey, type AscensionMapDocument, type MapObject, type MapZone } from './mapEditorTypes';

type ResizeAnchor = 'nw' | 'n' | 'ne' | 'w' | 'center' | 'e' | 'sw' | 's' | 'se';
type Point = { x: number; y: number };

const clone = <T>(value: T): T => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

function currentMapId() {
  return document.querySelector<HTMLSelectElement>('#mep-map-select')?.value ?? '';
}

function selectMapInEditor(id: string, openMapMode = false) {
  const select = document.querySelector<HTMLSelectElement>('#mep-map-select');
  if (!select) return;
  select.value = id;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  if (openMapMode) document.querySelector<HTMLButtonElement>('#mep-mode-map')?.click();
}

function refreshWorldIfVisible() {
  const world = document.querySelector<HTMLElement>('#mep-world');
  if (!world || world.classList.contains('hidden')) return;
  const mapButton = document.querySelector<HTMLButtonElement>('#mep-mode-map');
  const worldButton = document.querySelector<HTMLButtonElement>('#mep-mode-world');
  if (!mapButton || !worldButton) return;
  mapButton.click();
  worldButton.click();
}

function anchorOffset(oldSize: number, newSize: number, anchor: ResizeAnchor, axis: 'x' | 'y') {
  const delta = newSize - oldSize;
  const first = axis === 'x' ? ['nw', 'w', 'sw'] : ['nw', 'n', 'ne'];
  const last = axis === 'x' ? ['ne', 'e', 'se'] : ['sw', 's', 'se'];
  if (first.includes(anchor)) return 0;
  if (last.includes(anchor)) return delta;
  return Math.trunc(delta / 2);
}

function resizeMapDocument(source: AscensionMapDocument, width: number, height: number, tileSize: number, anchor: ResizeAnchor) {
  const next = clone(source);
  const dx = anchorOffset(source.width, width, anchor, 'x');
  const dy = anchorOffset(source.height, height, anchor, 'y');
  let removedTiles = 0;
  let removedCollision = 0;
  let clampedObjects = 0;
  let clampedZones = 0;

  const tiles: AscensionMapDocument['tiles'] = {};
  for (const [key, value] of Object.entries(source.tiles)) {
    const point = parseTileKey(key);
    const x = point.x + dx, y = point.y + dy;
    if (x < 0 || y < 0 || x >= width || y >= height) { removedTiles += 1; continue; }
    tiles[tileKey(x, y)] = clone(value);
  }

  const collision: string[] = [];
  for (const key of source.collision) {
    const point = parseTileKey(key);
    const x = point.x + dx, y = point.y + dy;
    if (x < 0 || y < 0 || x >= width || y >= height) { removedCollision += 1; continue; }
    collision.push(tileKey(x, y));
  }

  const objects = source.objects.map((object) => {
    const value = clone(object) as MapObject;
    const shiftedX = value.x + dx, shiftedY = value.y + dy;
    const footprintW = Math.max(.1, Number(value.width) || 1), footprintH = Math.max(.1, Number(value.height) || 1);
    const maxX = Math.max(0, width - Math.min(width, footprintW));
    const maxY = Math.max(0, height - Math.min(height, footprintH));
    value.x = clamp(shiftedX, 0, maxX);
    value.y = clamp(shiftedY, 0, maxY);
    if (value.x !== shiftedX || value.y !== shiftedY) clampedObjects += 1;
    return value;
  });

  const zones = source.zones.map((zone) => {
    const value = clone(zone) as MapZone;
    const shiftedX = Math.round(value.x + dx), shiftedY = Math.round(value.y + dy);
    value.x = clamp(shiftedX, 0, width - 1);
    value.y = clamp(shiftedY, 0, height - 1);
    value.width = Math.max(1, Math.min(Math.round(value.width), width - value.x));
    value.height = Math.max(1, Math.min(Math.round(value.height), height - value.y));
    if (value.x !== shiftedX || value.y !== shiftedY || value.width !== zone.width || value.height !== zone.height) clampedZones += 1;
    return value;
  });

  next.width = width;
  next.height = height;
  next.tileSize = tileSize;
  next.tiles = tiles;
  next.collision = collision;
  next.objects = objects;
  next.zones = zones;
  next.updatedAt = Date.now();
  return { document: next, removedTiles, removedCollision, clampedObjects, clampedZones };
}

function placeDuplicateNear(sourceId: string, duplicateId: string) {
  const documents = listMapDocuments();
  const layout = loadWorldLayout(documents);
  const source = layout.nodes.find((node) => node.mapId === sourceId);
  const duplicate = layout.nodes.find((node) => node.mapId === duplicateId);
  if (!source || !duplicate) { saveWorldLayout(layout); return; }
  const occupied = new Set(layout.nodes.filter((node) => node.mapId !== duplicateId).map((node) => `${node.col},${node.row}`));
  const candidates = [
    { col: source.col + 1, row: source.row }, { col: source.col, row: source.row + 1 },
    { col: source.col - 1, row: source.row }, { col: source.col, row: source.row - 1 },
  ];
  let chosen = candidates.find((point) => !occupied.has(`${point.col},${point.row}`));
  if (!chosen) {
    for (let radius = 2; radius < 50 && !chosen; radius++) {
      for (let y = -radius; y <= radius && !chosen; y++) for (let x = -radius; x <= radius; x++) {
        if (Math.max(Math.abs(x), Math.abs(y)) !== radius) continue;
        const point = { col: source.col + x, row: source.row + y };
        if (!occupied.has(`${point.col},${point.row}`)) { chosen = point; break; }
      }
    }
  }
  if (chosen) { duplicate.col = chosen.col; duplicate.row = chosen.row; }
  saveWorldLayout(layout);
}

function duplicateMap(id: string) {
  const source = loadMapDocument(id);
  if (!source) return;
  const duplicate = createBlankMap(`${source.name} (Cópia)`, source.width, source.height, source.tileSize, source.metadata.baseSurface, false);
  duplicate.tiles = clone(source.tiles);
  duplicate.objects = source.objects.map((object) => ({ ...clone(object), id: uid('object') }));
  duplicate.collision = [...source.collision];
  duplicate.zones = source.zones.map((zone) => ({ ...clone(zone), id: uid('zone') }));
  duplicate.metadata = clone(source.metadata);
  duplicate.createdAt = Date.now();
  duplicate.updatedAt = Date.now();
  const saved = saveMapDocument(duplicate);
  placeDuplicateNear(source.id, saved.id);
  selectMapInEditor(saved.id, false);
  refreshWorldIfVisible();
}

function portalReferences(mapId: string) {
  const references: Array<{ mapName: string; objectId: string }> = [];
  for (const map of listMapDocuments()) {
    if (map.id === mapId) continue;
    for (const object of map.objects) {
      if (String(object.properties?.targetMapId ?? '') === mapId) references.push({ mapName: map.name, objectId: object.id });
    }
  }
  return references;
}

function deleteMap(id: string) {
  const documents = listMapDocuments();
  const source = documents.find((map) => map.id === id);
  if (!source) return;
  if (documents.length <= 1) { window.alert('O projeto precisa manter pelo menos um mapa. Crie outro mapa antes de excluir este.'); return; }
  const portals = portalReferences(id);
  const published = loadPublishedMap()?.document.id === id;
  const details = [
    `Excluir “${source.name}” definitivamente?`,
    `${source.width}×${source.height} · ${Object.keys(source.tiles).length} tiles · ${source.objects.length} objetos · ${source.zones.length} zonas.`,
    portals.length ? `ATENÇÃO: ${portals.length} portal(is) em outros mapas apontam para este mapa e precisarão ser revisados.` : '',
    published ? 'ATENÇÃO: este é o mapa publicado atualmente; a publicação será removida.' : '',
    'Esta ação não pode ser desfeita pelo Undo do editor.',
  ].filter(Boolean).join('\n\n');
  if (!window.confirm(details)) return;

  const wasCurrent = currentMapId() === id;
  deleteMapDocument(id);
  const remaining = listMapDocuments();
  saveWorldLayout(loadWorldLayout(remaining));
  if (published) clearPublishedMap();
  if (wasCurrent && remaining[0]) selectMapInEditor(remaining[0].id, false);
  refreshWorldIfVisible();
}

function openMapSettings(id: string) {
  const source = loadMapDocument(id);
  if (!source) return;
  const modal = document.createElement('div');
  modal.className = 'pro-modal-backdrop';
  modal.innerHTML = `<form class="pro-config-window map-manager-dialog">
    <header class="pro-config-head"><div><strong>Configurar mapa</strong><span>${esc(source.name)}</span></div><button type="button" data-close>×</button></header>
    <div class="map-manager-dialog-body">
      <p class="map-manager-summary">Atual: <strong>${source.width}×${source.height}</strong> tiles · tile lógico ${source.tileSize}×${source.tileSize} · ${Object.keys(source.tiles).length} células pintadas · ${source.objects.length} objetos · ${source.zones.length} zonas.</p>
      <label class="mep-field">Nome<input id="map-manage-name" value="${esc(source.name)}" maxlength="80"></label>
      <div class="mep-form-grid" style="margin-top:12px"><label>Largura<input id="map-manage-width" type="number" min="8" max="512" value="${source.width}"></label><label>Altura<input id="map-manage-height" type="number" min="8" max="512" value="${source.height}"></label></div>
      <div class="mep-form-grid" style="margin-top:12px"><label>Tile lógico<select id="map-manage-tile"><option value="8">8×8</option><option value="16">16×16</option><option value="24">24×24</option><option value="32">32×32</option><option value="48">48×48</option><option value="64">64×64</option></select></label><label>Âncora ao redimensionar<select id="map-manage-anchor"><option value="nw">Superior esquerdo</option><option value="n">Superior centro</option><option value="ne">Superior direito</option><option value="w">Centro esquerdo</option><option value="center">Centro</option><option value="e">Centro direito</option><option value="sw">Inferior esquerdo</option><option value="s">Inferior centro</option><option value="se">Inferior direito</option></select></label></div>
      <p class="map-manager-warning">Ao diminuir o mapa, tiles e colisões que ficarem fora da nova área serão removidos. Objetos e zonas são preservados e trazidos para dentro dos novos limites. A âncora define qual parte do mapa permanece fixa.</p>
    </div>
    <footer class="pro-config-footer"><span>Limite: 8–512 tiles por eixo</span><button type="button" data-close>Cancelar</button><button class="primary" type="submit">Salvar alterações</button></footer>
  </form>`;
  document.body.appendChild(modal);
  const form = modal.querySelector<HTMLFormElement>('form')!;
  const tileSize = modal.querySelector<HTMLSelectElement>('#map-manage-tile')!;
  tileSize.value = String([8, 16, 24, 32, 48, 64].includes(source.tileSize) ? source.tileSize : 32);
  const close = () => modal.remove();
  modal.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((button) => button.onclick = close);
  modal.addEventListener('pointerdown', (event) => { if (event.target === modal) close(); });

  form.onsubmit = (event) => {
    event.preventDefault();
    const name = modal.querySelector<HTMLInputElement>('#map-manage-name')!.value.trim() || source.name;
    const width = clamp(Math.floor(Number(modal.querySelector<HTMLInputElement>('#map-manage-width')!.value) || source.width), 8, 512);
    const height = clamp(Math.floor(Number(modal.querySelector<HTMLInputElement>('#map-manage-height')!.value) || source.height), 8, 512);
    const logicalTile = clamp(Math.floor(Number(tileSize.value) || source.tileSize), 8, 128);
    const anchor = modal.querySelector<HTMLSelectElement>('#map-manage-anchor')!.value as ResizeAnchor;
    const shrinking = width < source.width || height < source.height;
    if (shrinking && !window.confirm(`Reduzir “${source.name}” de ${source.width}×${source.height} para ${width}×${height}? Conteúdo fora da nova área poderá ser recortado.`)) return;
    const result = resizeMapDocument(source, width, height, logicalTile, anchor);
    result.document.name = name;
    const saved = saveMapDocument(result.document);
    close();
    selectMapInEditor(saved.id, false);
    refreshWorldIfVisible();
    if (result.removedTiles || result.removedCollision || result.clampedObjects || result.clampedZones) {
      window.setTimeout(() => window.alert(`Mapa redimensionado.\n\nTiles removidos: ${result.removedTiles}\nColisões removidas: ${result.removedCollision}\nObjetos reposicionados: ${result.clampedObjects}\nZonas ajustadas: ${result.clampedZones}`), 0);
    }
  };
}

function createActionsMenu() {
  let menu = document.querySelector<HTMLElement>('.mep-world-actions-menu');
  if (menu) return menu;
  menu = document.createElement('div');
  menu.className = 'mep-world-actions-menu hidden';
  menu.innerHTML = `<button data-map-action="open">Abrir no editor</button><button data-map-action="settings">Configurar / redimensionar</button><button data-map-action="duplicate">Duplicar mapa</button><button data-map-action="delete" class="danger">Excluir mapa</button>`;
  document.body.appendChild(menu);
  document.addEventListener('pointerdown', (event) => {
    const target = event.target as Node | null;
    if (!target || menu!.contains(target) || (target instanceof Element && target.closest('.mep-world-actions-button'))) return;
    menu!.classList.add('hidden');
  });
  return menu;
}

function openActionsMenu(button: HTMLButtonElement, mapId: string) {
  const menu = createActionsMenu();
  const rect = button.getBoundingClientRect();
  const width = 190;
  menu.style.left = `${clamp(rect.right - width, 8, Math.max(8, window.innerWidth - width - 8))}px`;
  const estimatedHeight = 140;
  const below = rect.bottom + 5;
  menu.style.top = `${below + estimatedHeight <= window.innerHeight ? below : Math.max(8, rect.top - estimatedHeight - 5)}px`;
  menu.classList.remove('hidden');
  menu.querySelectorAll<HTMLButtonElement>('[data-map-action]').forEach((item) => {
    item.onclick = () => {
      menu.classList.add('hidden');
      const action = item.dataset.mapAction;
      if (action === 'open') selectMapInEditor(mapId, true);
      if (action === 'settings') openMapSettings(mapId);
      if (action === 'duplicate') duplicateMap(mapId);
      if (action === 'delete') deleteMap(mapId);
    };
  });
}

function decorateWorldCards() {
  document.querySelectorAll<HTMLElement>('.mep-world-card[data-world-map]').forEach((card) => {
    if (card.dataset.mapManagement === '1') return;
    card.dataset.mapManagement = '1';
    const footer = card.querySelector<HTMLElement>('footer');
    const mapId = card.dataset.worldMap || '';
    if (!footer || !mapId) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mep-world-actions-button';
    button.title = 'Ações do mapa';
    button.textContent = '•••';
    button.onclick = (event) => { event.preventDefault(); event.stopPropagation(); openActionsMenu(button, mapId); };
    footer.appendChild(button);
  });
}

function fixNewMapDialogs() {
  document.querySelectorAll<HTMLFormElement>('form.pro-config-window').forEach((form) => {
    if (form.querySelector('header strong')?.textContent?.trim() !== 'Novo mapa') return;
    form.classList.add('mep-new-map-scroll-dialog');
  });
}

function readCursorPoint(): Point | null {
  const text = document.querySelector<HTMLElement>('#mep-position')?.textContent ?? '';
  const match = text.match(/X\s*(-?\d+(?:\.\d+)?)\s*[•·]\s*Y\s*(-?\d+(?:\.\d+)?)/i);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
}

/**
 * Ferramentas externas de Tileset salvam no storage e disparam um change no
 * mesmo mapa para o núcleo reler o documento. O núcleo fazia fitMap nesse
 * refresh, derrubando o zoom. Aqui distinguimos esse refresh sintético de uma
 * troca real de mapa e restauramos zoom + região de trabalho no mesmo frame.
 */
function installSameMapViewPersistence() {
  const select = document.querySelector<HTMLSelectElement>('#mep-map-select');
  if (!select || select.dataset.viewPersistence === '1') return;
  select.dataset.viewPersistence = '1';
  let lastMapId = select.value;
  select.addEventListener('change', (event) => {
    const nextMapId = select.value;
    const sameMapRefresh = !event.isTrusted && Boolean(nextMapId) && nextMapId === lastMapId;
    const zoomValue = Number(document.querySelector<HTMLInputElement>('#mep-zoom')?.value || 0);
    const cursor = readCursorPoint();
    lastMapId = nextMapId;
    if (!sameMapRefresh || !zoomValue) return;
    requestAnimationFrame(() => {
      const zoom = document.querySelector<HTMLInputElement>('#mep-zoom');
      if (zoom) {
        zoom.value = String(zoomValue);
        zoom.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (!cursor) return;
      const map = loadMapDocument(nextMapId);
      const minimap = document.querySelector<HTMLCanvasElement>('#mep-minimap-canvas');
      if (!map || !minimap) return;
      const rect = minimap.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      const x = clamp(cursor.x, 0, Math.max(0, map.width - 1));
      const y = clamp(cursor.y, 0, Math.max(0, map.height - 1));
      minimap.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        clientX: rect.left + (x / Math.max(1, map.width)) * rect.width,
        clientY: rect.top + (y / Math.max(1, map.height)) * rect.height,
      }));
    });
  });
}

export function installMapWorldManagement() {
  const root = document.querySelector<HTMLElement>('.mep');
  if (!root || root.dataset.worldManagement === '1') return;
  root.dataset.worldManagement = '1';
  decorateWorldCards();
  fixNewMapDialogs();
  installSameMapViewPersistence();
  let frame = 0;
  const scan = () => {
    frame = 0;
    decorateWorldCards();
    fixNewMapDialogs();
    installSameMapViewPersistence();
  };
  const observer = new MutationObserver(() => { if (!frame) frame = requestAnimationFrame(scan); });
  observer.observe(root, { childList: true, subtree: true });
  window.addEventListener('pagehide', () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame); document.querySelector('.mep-world-actions-menu')?.remove(); }, { once: true });
}
