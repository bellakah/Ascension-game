import { MAP_PALETTE_ENTRIES } from './mapEditorCatalog';
import { mapBaseSurface, normalizeBaseSurface } from './mapBaseSurface';
import { loadMapDocument, saveMapDocument } from './mapEditorStorage';
import type { MapBaseSurface, MapPaletteEntry } from './mapEditorTypes';

const DRIVER_ID = '__base-surface-animation-driver';
const STYLE_ID = 'base-surface-editor-style';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);

function installStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    [data-card="${DRIVER_ID}"]{display:none!important}
    .base-surface-new{margin-top:14px;padding-top:14px;border-top:1px solid #23404f}.base-surface-new h4,.base-surface-panel h4{margin:0 0 10px;color:#9bd8ef;font-size:10px;letter-spacing:.08em}.base-surface-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.base-surface-grid label{display:flex;flex-direction:column;gap:5px;color:#7799a9;font-size:9px}.base-surface-grid input,.base-surface-grid select{min-height:32px;border:1px solid #294b5d;border-radius:5px;background:#081821;color:#d9ebf3;padding:5px 7px}.base-surface-grid input[type=color]{padding:3px}.base-surface-panel{margin-top:12px;padding:12px;border:1px solid #254758;border-radius:7px;background:#091923}.base-surface-note{grid-column:1/-1;color:#678898;font-size:8px;line-height:1.45}.base-surface-preview{grid-column:1/-1;height:34px;border-radius:5px;border:1px solid #315466;background:#23698d;overflow:hidden;position:relative}.base-surface-preview.water::after{content:'≈  ~  ≈   ~   ≈  ~  ≈';position:absolute;inset:0;display:grid;place-items:center;color:#9ee6ef;font-weight:800;letter-spacing:5px;opacity:.62}.base-surface-preview.none{background:repeating-conic-gradient(#16232a 0 25%,#0d171c 0 50%) 50%/12px 12px}
  `;
  document.head.appendChild(style);
}

function ensureAnimationDriver() {
  if (MAP_PALETTE_ENTRIES.some((entry) => entry.id === DRIVER_ID)) return;
  const driver: MapPaletteEntry = {
    id: DRIVER_ID,
    palette: 'raw',
    label: 'Base Surface Animation Driver',
    icon: '',
    color: '#000000',
    description: 'Asset interno que mantém o preview de água animado.',
    defaultLayer: 'objects',
    folder: 'raw',
    source: 'ascension',
    tags: ['studio-internal', 'base-surface-driver'],
    sprite: {
      src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
      nativeWidth: 1,
      nativeHeight: 1,
      sourceRect: { x: 0, y: 0, width: 1, height: 1 },
      animation: { frames: [{ x: 0, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: 1, height: 1 }], fps: 6, loop: true },
      pixelated: true,
    },
  };
  MAP_PALETTE_ENTRIES.push(driver);
}

function currentMapId() {
  return document.querySelector<HTMLSelectElement>('#mep-map-select')?.value ?? '';
}

function saveCurrentBeforeExternalEdit() {
  document.querySelector<HTMLButtonElement>('#mep-save')?.click();
}

function reloadMap(id: string) {
  const select = document.querySelector<HTMLSelectElement>('#mep-map-select');
  if (!select) return;
  select.value = id;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function updateMapSurface(id: string, mutate: (surface: MapBaseSurface) => void, tileSize?: number) {
  if (!id) return;
  const map = loadMapDocument(id);
  if (!map) return;
  const surface = mapBaseSurface(map);
  mutate(surface);
  map.metadata.baseSurface = normalizeBaseSurface(surface, surface.color);
  map.metadata.background = map.metadata.baseSurface.color;
  if (tileSize && Number.isFinite(tileSize)) map.tileSize = Math.max(8, Math.min(128, Math.floor(tileSize)));
  saveMapDocument(map);
  reloadMap(id);
}

function surfaceFields(surface: MapBaseSurface, prefix: string) {
  return `
    <div class="base-surface-grid">
      <label>Fundo base<select id="${prefix}-mode"><option value="water" ${surface.mode === 'water' ? 'selected' : ''}>Água animada</option><option value="color" ${surface.mode === 'color' ? 'selected' : ''}>Cor</option><option value="none" ${surface.mode === 'none' ? 'selected' : ''}>Nenhum</option></select></label>
      <label>Cor<input id="${prefix}-color" type="color" value="${esc(surface.color)}"></label>
      <label>Água<select id="${prefix}-style"><option value="ocean" ${surface.waterStyle === 'ocean' ? 'selected' : ''}>Oceano</option><option value="deep" ${surface.waterStyle === 'deep' ? 'selected' : ''}>Oceano profundo</option><option value="swamp" ${surface.waterStyle === 'swamp' ? 'selected' : ''}>Pântano</option></select></label>
      <label>Colisão<select id="${prefix}-collision"><option value="blocked" ${surface.collision === 'blocked' ? 'selected' : ''}>Bloqueada</option><option value="walkable" ${surface.collision === 'walkable' ? 'selected' : ''}>Caminhável</option><option value="swimmable" ${surface.collision === 'swimmable' ? 'selected' : ''}>Nadável (preparado)</option></select></label>
      <label>Velocidade<input id="${prefix}-speed" type="number" min="0.1" max="4" step="0.1" value="${surface.waterSpeed}"></label>
      <label>Opacidade<input id="${prefix}-opacity" type="number" min="0.05" max="1" step="0.05" value="${surface.waterOpacity}"></label>
      <div id="${prefix}-preview" class="base-surface-preview ${surface.mode}"></div>
    </div>`;
}

function readSurface(root: ParentNode, prefix: string): MapBaseSurface {
  const mode = root.querySelector<HTMLSelectElement>(`#${prefix}-mode`)?.value as MapBaseSurface['mode'] || 'color';
  const color = root.querySelector<HTMLInputElement>(`#${prefix}-color`)?.value || '#527b45';
  const waterStyle = root.querySelector<HTMLSelectElement>(`#${prefix}-style`)?.value as MapBaseSurface['waterStyle'] || 'ocean';
  const collision = root.querySelector<HTMLSelectElement>(`#${prefix}-collision`)?.value as MapBaseSurface['collision'] || (mode === 'water' ? 'blocked' : 'walkable');
  const waterSpeed = Number(root.querySelector<HTMLInputElement>(`#${prefix}-speed`)?.value) || 1;
  const waterOpacity = Number(root.querySelector<HTMLInputElement>(`#${prefix}-opacity`)?.value) || 1;
  return normalizeBaseSurface({ mode, color, waterStyle, collision, waterSpeed, waterOpacity }, color);
}

function refreshPreview(root: ParentNode, prefix: string) {
  const surface = readSurface(root, prefix);
  const preview = root.querySelector<HTMLElement>(`#${prefix}-preview`);
  if (!preview) return;
  preview.className = `base-surface-preview ${surface.mode}`;
  preview.style.background = surface.mode === 'none' ? '' : surface.color;
}

function enhanceNewMap(form: HTMLFormElement) {
  if (form.dataset.baseSurfaceEnhanced === '1') return;
  const title = form.querySelector('header strong')?.textContent?.trim();
  if (title !== 'Novo mapa') return;
  form.dataset.baseSurfaceEnhanced = '1';
  const body = form.children[1] as HTMLElement | undefined;
  if (!body) return;
  const surface: MapBaseSurface = { mode: 'water', color: '#23698d', waterStyle: 'ocean', waterSpeed: 1, waterOpacity: 1, collision: 'blocked' };
  const section = document.createElement('section');
  section.className = 'base-surface-new';
  section.innerHTML = `<h4>GRADE E FUNDO DO MAPA</h4><div class="base-surface-grid"><label>Tile lógico<select id="base-new-tile"><option value="8">8×8</option><option value="16">16×16</option><option value="24">24×24</option><option value="32" selected>32×32</option><option value="48">48×48</option><option value="64">64×64</option></select></label><div></div></div>${surfaceFields(surface, 'base-new')}<div class="base-surface-grid"><p class="base-surface-note">Água usa um renderer procedural leve, sem vídeo, shader pesado ou milhares de sprites. Mapas de dungeon podem usar Cor ou Nenhum.</p></div>`;
  body.appendChild(section);
  section.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select').forEach((input) => input.addEventListener('input', () => refreshPreview(section, 'base-new')));
  refreshPreview(section, 'base-new');

  form.addEventListener('submit', () => {
    const chosen = readSurface(section, 'base-new');
    const tileSize = Number(section.querySelector<HTMLSelectElement>('#base-new-tile')?.value) || 32;
    window.setTimeout(() => {
      const id = currentMapId();
      updateMapSurface(id, (target) => Object.assign(target, chosen), tileSize);
    }, 0);
  }, { capture: true });
}

function enhanceLayers(body: HTMLElement) {
  if (!body.querySelector('.mep-layers') || body.querySelector('.base-surface-panel')) return;
  const id = currentMapId();
  const map = id ? loadMapDocument(id) : null;
  if (!map) return;
  const surface = mapBaseSurface(map);
  const section = document.createElement('section');
  section.className = 'base-surface-panel';
  section.innerHTML = `<h4>BASE SURFACE</h4>${surfaceFields(surface, 'base-layer')}<p class="base-surface-note">Ground vazio revela esta superfície. Água bloqueada impede passagem no Playtest e no mapa publicado.</p>`;
  body.appendChild(section);
  section.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select').forEach((input) => input.addEventListener('input', () => refreshPreview(section, 'base-layer')));
  section.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select').forEach((input) => input.addEventListener('change', () => {
    saveCurrentBeforeExternalEdit();
    const chosen = readSurface(section, 'base-layer');
    updateMapSurface(id, (target) => Object.assign(target, chosen));
  }));
  refreshPreview(section, 'base-layer');
}

export function installMapBaseSurfaceEditorIntegration() {
  const root = document.querySelector<HTMLElement>('.mep');
  if (!root || root.dataset.baseSurfaceIntegration === '1') return;
  root.dataset.baseSurfaceIntegration = '1';
  installStyle();
  ensureAnimationDriver();

  const scan = () => {
    document.querySelectorAll<HTMLFormElement>('.pro-config-window form, form.pro-config-window').forEach(enhanceNewMap);
    document.querySelectorAll<HTMLFormElement>('form').forEach(enhanceNewMap);
    const body = document.querySelector<HTMLElement>('#mep-inspector-body');
    if (body) enhanceLayers(body);
  };
  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; scan(); });
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('pagehide', () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame); }, { once: true });
  scan();
}
