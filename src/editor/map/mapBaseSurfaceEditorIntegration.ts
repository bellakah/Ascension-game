import { mapBaseSurface, normalizeBaseSurface } from './mapBaseSurface';
import { listMapDocuments, loadMapDocument, saveMapDocument } from './mapEditorStorage';
import type { MapBaseSurface } from './mapEditorTypes';
import { clearPreparedWaterFrames, prepareWaterFrames, waterFrameIndex } from './mapWaterRenderer';
import {
  createWaterAssetFromFile,
  deleteWaterAsset,
  detectWaterAnimation,
  getWaterAsset,
  listWaterAssets,
  onWaterAssetsChange,
  waterAssetFrameRect,
} from './mapWaterAssetStore';

const STYLE_ID = 'base-surface-editor-style';
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function installStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .base-surface-new{margin-top:14px;padding-top:14px;border-top:1px solid #23404f}.base-surface-new h4,.base-surface-panel h4{margin:0 0 10px;color:#9bd8ef;font-size:10px;letter-spacing:.08em}.base-surface-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.base-surface-grid label{display:flex;flex-direction:column;gap:5px;color:#7799a9;font-size:9px}.base-surface-grid input,.base-surface-grid select{min-height:32px;border:1px solid #294b5d;border-radius:5px;background:#081821;color:#d9ebf3;padding:5px 7px}.base-surface-grid input[type=color]{padding:3px}.base-surface-panel{margin-top:12px;padding:12px;border:1px solid #254758;border-radius:7px;background:#091923}.base-surface-note{grid-column:1/-1;color:#678898;font-size:8px;line-height:1.45}.base-water-actions{display:flex;gap:6px;align-items:end}.base-water-actions button{height:32px;border:1px solid #31576a;border-radius:5px;background:#102936;color:#b9dbe8;padding:0 9px;cursor:pointer}.base-water-actions button.primary{background:#17445a;color:#dff7ff}.base-water-preview{grid-column:1/-1;height:88px;border-radius:6px;border:1px solid #315466;background:#16242c;overflow:hidden;position:relative}.base-water-preview canvas{width:100%;height:100%;display:block;image-rendering:pixelated}.base-water-empty{display:grid;place-items:center;height:100%;font-size:9px;color:#6c8d9c;padding:10px;text-align:center}.base-surface-disabled{opacity:.45;pointer-events:none}
    .water-import-form{padding:14px;display:grid;gap:12px}.water-import-preview{height:180px;border:1px solid #315466;background:#071219;border-radius:7px;overflow:hidden}.water-import-preview canvas{width:100%;height:100%;display:block;image-rendering:pixelated}.water-import-summary{font-size:9px;color:#77a4b5;line-height:1.55}
  `;
  document.head.appendChild(style);
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
  clearPreparedWaterFrames();
  reloadMap(id);
}

function waterOptions(selected?: string) {
  const assets = listWaterAssets();
  return [`<option value="">${assets.length ? 'Selecione uma água' : 'Nenhuma água importada'}</option>`, ...assets.map((asset) => `<option value="${esc(asset.id)}" ${asset.id === selected ? 'selected' : ''}>${esc(asset.name)} · ${asset.frameCount}f ${asset.frameWidth}×${asset.frameHeight}</option>`)].join('');
}

function surfaceFields(surface: MapBaseSurface, prefix: string) {
  return `
    <div class="base-surface-grid">
      <label>Fundo base<select id="${prefix}-mode"><option value="water" ${surface.mode === 'water' ? 'selected' : ''}>Água por asset</option><option value="color" ${surface.mode === 'color' ? 'selected' : ''}>Cor</option><option value="none" ${surface.mode === 'none' ? 'selected' : ''}>Nenhum</option></select></label>
      <label>Cor / fallback<input id="${prefix}-color" type="color" value="${esc(surface.color)}"></label>
      <label style="grid-column:1/-1">Water Asset<select id="${prefix}-asset">${waterOptions(surface.waterAssetId)}</select></label>
      <div class="base-water-actions" style="grid-column:1/-1"><button type="button" class="primary" id="${prefix}-import">＋ Importar água</button><button type="button" id="${prefix}-delete">Excluir selecionada</button></div>
      <label>Cor da água<select id="${prefix}-tint-mode"><option value="original" ${(surface.waterTintMode ?? 'original') === 'original' ? 'selected' : ''}>Original do asset</option><option value="colorize" ${surface.waterTintMode === 'colorize' ? 'selected' : ''}>Colorizar</option></select></label>
      <label>Tint<input id="${prefix}-tint" type="color" value="${esc(surface.waterTint ?? '#2f9fca')}"></label>
      <label>Intensidade<input id="${prefix}-tint-strength" type="number" min="0" max="1" step="0.05" value="${surface.waterTintStrength ?? .8}"></label>
      <label>Brilho<input id="${prefix}-brightness" type="number" min="-50" max="50" step="1" value="${surface.waterBrightness ?? 0}"></label>
      <label>Velocidade<input id="${prefix}-speed" type="number" min="0.1" max="4" step="0.1" value="${surface.waterSpeed}"></label>
      <label>Escala do padrão<input id="${prefix}-scale" type="number" min="0.1" max="8" step="0.1" value="${surface.waterScale ?? 1}"></label>
      <label>Opacidade<input id="${prefix}-opacity" type="number" min="0.05" max="1" step="0.05" value="${surface.waterOpacity}"></label>
      <label>Colisão<select id="${prefix}-collision"><option value="blocked" ${surface.collision === 'blocked' ? 'selected' : ''}>Bloqueada</option><option value="walkable" ${surface.collision === 'walkable' ? 'selected' : ''}>Caminhável</option><option value="swimmable" ${surface.collision === 'swimmable' ? 'selected' : ''}>Nadável (preparado)</option></select></label>
      <div id="${prefix}-preview" class="base-water-preview"><canvas></canvas></div>
    </div>`;
}

function readSurface(root: ParentNode, prefix: string): MapBaseSurface {
  const mode = root.querySelector<HTMLSelectElement>(`#${prefix}-mode`)?.value as MapBaseSurface['mode'] || 'color';
  const color = root.querySelector<HTMLInputElement>(`#${prefix}-color`)?.value || '#527b45';
  const waterAssetId = root.querySelector<HTMLSelectElement>(`#${prefix}-asset`)?.value || undefined;
  const collision = root.querySelector<HTMLSelectElement>(`#${prefix}-collision`)?.value as MapBaseSurface['collision'] || (mode === 'water' ? 'blocked' : 'walkable');
  const waterSpeed = Number(root.querySelector<HTMLInputElement>(`#${prefix}-speed`)?.value) || 1;
  const waterOpacity = Number(root.querySelector<HTMLInputElement>(`#${prefix}-opacity`)?.value) || 1;
  const waterScale = Number(root.querySelector<HTMLInputElement>(`#${prefix}-scale`)?.value) || 1;
  const waterTintMode = root.querySelector<HTMLSelectElement>(`#${prefix}-tint-mode`)?.value as MapBaseSurface['waterTintMode'] || 'original';
  const waterTint = root.querySelector<HTMLInputElement>(`#${prefix}-tint`)?.value || '#2f9fca';
  const waterTintStrength = Number(root.querySelector<HTMLInputElement>(`#${prefix}-tint-strength`)?.value);
  const waterBrightness = Number(root.querySelector<HTMLInputElement>(`#${prefix}-brightness`)?.value) || 0;
  return normalizeBaseSurface({ mode, color, waterStyle: 'ocean', waterAssetId, collision, waterSpeed, waterOpacity, waterScale, waterTintMode, waterTint, waterTintStrength, waterBrightness }, color);
}

const previewLoops = new WeakSet<HTMLCanvasElement>();
function animatePreview(root: ParentNode, prefix: string) {
  const canvas = root.querySelector<HTMLCanvasElement>(`#${prefix}-preview canvas`);
  if (!canvas || previewLoops.has(canvas)) return;
  previewLoops.add(canvas);
  const frame = async (time: number) => {
    if (!canvas.isConnected) return;
    const width = Math.max(1, Math.round(canvas.clientWidth * Math.min(2, devicePixelRatio || 1)));
    const height = Math.max(1, Math.round(canvas.clientHeight * Math.min(2, devicePixelRatio || 1)));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const surface = readSurface(root, prefix);
      ctx.clearRect(0, 0, width, height);
      if (surface.mode === 'none') {
        ctx.fillStyle = '#111c22'; ctx.fillRect(0, 0, width, height);
      } else if (surface.mode === 'color') {
        ctx.fillStyle = surface.color; ctx.fillRect(0, 0, width, height);
      } else {
        ctx.fillStyle = surface.color; ctx.fillRect(0, 0, width, height);
        const prepared = await prepareWaterFrames(surface);
        if (prepared?.frames.length) {
          const tile = prepared.frames[waterFrameIndex(prepared.asset, surface, time) % prepared.frames.length];
          const scale = Math.max(.1, surface.waterScale ?? 1) * (height / Math.max(1, tile.height)) * .72;
          const dw = Math.max(1, tile.width * scale), dh = Math.max(1, tile.height * scale);
          ctx.globalAlpha = surface.waterOpacity;
          ctx.imageSmoothingEnabled = false;
          for (let y = 0; y < height + dh; y += dh) for (let x = 0; x < width + dw; x += dw) ctx.drawImage(tile, x, y, dw + .5, dh + .5);
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = '#d9edf5'; ctx.font = `${Math.max(10, Math.round(height * .12))}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(surface.waterAssetId ? 'Carregando água…' : 'Importe ou selecione um Water Asset', width / 2, height / 2);
        }
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function filePicker(onFile: (file: File) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/webp,image/jpeg';
  input.onchange = () => { const file = input.files?.[0]; if (file) onFile(file); };
  input.click();
}

async function imageSize(file: File) {
  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(file);
    const result = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return result;
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error('Imagem inválida.'));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function openWaterImportDialog(file: File, onCreated: (id: string) => void) {
  const size = await imageSize(file);
  const guess = detectWaterAnimation(size.width, size.height);
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.src = objectUrl;
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Imagem inválida.')); });

  const modal = document.createElement('div');
  modal.className = 'pro-modal-backdrop';
  modal.innerHTML = `<form class="pro-config-window" style="width:min(660px,95vw);height:auto;grid-template-rows:52px auto 54px">
    <header class="pro-config-head"><div><strong>Importar Water Asset</strong><span>${esc(file.name)} · ${size.width}×${size.height}</span></div><button type="button" data-close>×</button></header>
    <div class="water-import-form">
      <label class="mep-field">Nome<input id="water-name" value="${esc(file.name.replace(/\.[^.]+$/, ''))}"></label>
      <div class="mep-form-grid"><label>Frame W<input id="water-fw" type="number" min="1" value="${guess.frameWidth}"></label><label>Frame H<input id="water-fh" type="number" min="1" value="${guess.frameHeight}"></label><label>Frames<input id="water-count" type="number" min="1" value="${guess.frameCount}"></label><label>FPS<input id="water-fps" type="number" min="0.1" max="60" step="0.01" value="${guess.fps}"></label></div>
      <label class="mep-field">Layout<select id="water-layout"><option value="horizontal" ${guess.layout === 'horizontal' ? 'selected' : ''}>Horizontal</option><option value="vertical" ${guess.layout === 'vertical' ? 'selected' : ''}>Vertical</option><option value="grid">Grade</option></select></label>
      <div class="water-import-preview"><canvas></canvas></div>
      <div id="water-summary" class="water-import-summary"></div>
    </div>
    <footer class="pro-config-footer"><span>O PNG fica salvo localmente no navegador e não é enviado ao GitHub.</span><button type="button" data-close>Cancelar</button><button class="primary" type="submit">Importar água</button></footer>
  </form>`;
  document.body.appendChild(modal);
  const form = modal.querySelector<HTMLFormElement>('form')!;
  const canvas = modal.querySelector<HTMLCanvasElement>('canvas')!;
  const summary = modal.querySelector<HTMLElement>('#water-summary')!;
  let alive = true;

  const config = () => {
    const frameWidth = Math.max(1, Number(modal.querySelector<HTMLInputElement>('#water-fw')!.value) || guess.frameWidth);
    const frameHeight = Math.max(1, Number(modal.querySelector<HTMLInputElement>('#water-fh')!.value) || guess.frameHeight);
    const columns = Math.max(1, Math.floor(size.width / frameWidth));
    const rows = Math.max(1, Math.floor(size.height / frameHeight));
    const frameCount = clamp(Number(modal.querySelector<HTMLInputElement>('#water-count')!.value) || 1, 1, columns * rows);
    const fps = clamp(Number(modal.querySelector<HTMLInputElement>('#water-fps')!.value) || 8.33, .1, 60);
    const layout = modal.querySelector<HTMLSelectElement>('#water-layout')!.value as 'horizontal' | 'vertical' | 'grid';
    return { frameWidth, frameHeight, columns, rows, frameCount, fps, layout };
  };

  const preview = (time: number) => {
    if (!alive || !canvas.isConnected) return;
    const cfg = config();
    const width = Math.max(1, Math.round(canvas.clientWidth * Math.min(2, devicePixelRatio || 1)));
    const height = Math.max(1, Math.round(canvas.clientHeight * Math.min(2, devicePixelRatio || 1)));
    if (canvas.width !== width) canvas.width = width; if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#071219'; ctx.fillRect(0, 0, width, height);
      const index = Math.floor(time / (1000 / cfg.fps)) % Math.max(1, cfg.frameCount);
      const column = cfg.layout === 'vertical' ? 0 : index % cfg.columns;
      const row = cfg.layout === 'vertical' ? index : Math.floor(index / cfg.columns);
      const sx = column * cfg.frameWidth, sy = row * cfg.frameHeight;
      const scale = Math.min(width / cfg.frameWidth, height / cfg.frameHeight);
      const dw = cfg.frameWidth * scale, dh = cfg.frameHeight * scale;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, sx, sy, cfg.frameWidth, cfg.frameHeight, (width - dw) / 2, (height - dh) / 2, dw, dh);
      summary.textContent = `${cfg.frameCount} frame(s) · ${cfg.frameWidth}×${cfg.frameHeight} · ${cfg.fps.toFixed(2)} FPS · ${cfg.layout}. ${size.width === 1032 && size.height === 129 ? 'Compatível com o sheet de 8 frames 129×129.' : ''}`;
    }
    requestAnimationFrame(preview);
  };
  requestAnimationFrame(preview);

  const close = () => { alive = false; URL.revokeObjectURL(objectUrl); modal.remove(); };
  modal.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((button) => button.onclick = close);
  form.onsubmit = async (event) => {
    event.preventDefault();
    const cfg = config();
    const name = modal.querySelector<HTMLInputElement>('#water-name')!.value.trim() || file.name;
    const record = await createWaterAssetFromFile(file, name, size.width, size.height, { frameWidth: cfg.frameWidth, frameHeight: cfg.frameHeight, frameCount: cfg.frameCount, fps: cfg.fps, layout: cfg.layout, loop: true });
    close();
    onCreated(record.id);
  };
}

function bindWaterActions(section: HTMLElement, prefix: string, onSelect?: (id: string) => void) {
  section.querySelector<HTMLButtonElement>(`#${prefix}-import`)!.onclick = () => filePicker((file) => {
    void openWaterImportDialog(file, (id) => {
      const select = section.querySelector<HTMLSelectElement>(`#${prefix}-asset`);
      if (select) { select.innerHTML = waterOptions(id); select.value = id; }
      clearPreparedWaterFrames(id);
      onSelect?.(id);
    });
  });
  section.querySelector<HTMLButtonElement>(`#${prefix}-delete`)!.onclick = async () => {
    const select = section.querySelector<HTMLSelectElement>(`#${prefix}-asset`);
    const id = select?.value || '';
    if (!id) return;
    const asset = getWaterAsset(id);
    const users = listMapDocuments().filter((map) => map.metadata.baseSurface?.waterAssetId === id);
    if (users.length) {
      window.alert(`Não é possível excluir ${asset?.name ?? 'esta água'}: ela está em uso por ${users.map((map) => map.name).join(', ')}.`);
      return;
    }
    if (!window.confirm(`Excluir ${asset?.name ?? 'esta água'} da Water Library local?`)) return;
    await deleteWaterAsset(id);
    clearPreparedWaterFrames(id);
    if (select) select.innerHTML = waterOptions('');
  };
}

function refreshFieldState(section: HTMLElement, prefix: string) {
  const surface = readSurface(section, prefix);
  const asset = section.querySelector<HTMLSelectElement>(`#${prefix}-asset`);
  const waterControls = [asset, section.querySelector(`#${prefix}-tint-mode`), section.querySelector(`#${prefix}-tint`), section.querySelector(`#${prefix}-tint-strength`), section.querySelector(`#${prefix}-brightness`), section.querySelector(`#${prefix}-speed`), section.querySelector(`#${prefix}-scale`), section.querySelector(`#${prefix}-opacity`), section.querySelector(`#${prefix}-collision`)];
  waterControls.forEach((node) => (node as HTMLElement | null)?.closest('label')?.classList.toggle('base-surface-disabled', surface.mode !== 'water'));
  animatePreview(section, prefix);
}

function enhanceNewMap(form: HTMLFormElement) {
  if (form.dataset.baseSurfaceEnhanced === '1') return;
  const title = form.querySelector('header strong')?.textContent?.trim();
  if (title !== 'Novo mapa') return;
  form.dataset.baseSurfaceEnhanced = '1';
  const body = form.children[1] as HTMLElement | undefined;
  if (!body) return;
  const firstWater = listWaterAssets()[0];
  const surface = normalizeBaseSurface({ mode: firstWater ? 'water' : 'color', color: firstWater ? '#225b78' : '#1b2329', waterStyle: 'ocean', waterAssetId: firstWater?.id, waterSpeed: 1, waterOpacity: 1, waterScale: 1, waterTintMode: 'original', collision: firstWater ? 'blocked' : 'walkable' }, '#1b2329');
  const section = document.createElement('section');
  section.className = 'base-surface-new';
  section.innerHTML = `<h4>GRADE E FUNDO DO MAPA</h4><div class="base-surface-grid"><label>Tile lógico<select id="base-new-tile"><option value="8">8×8</option><option value="16">16×16</option><option value="24">24×24</option><option value="32" selected>32×32</option><option value="48">48×48</option><option value="64">64×64</option></select></label><div></div></div>${surfaceFields(surface, 'base-new')}<div class="base-surface-grid"><p class="base-surface-note">Water Assets são PNGs/spritesheets locais. O arquivo comprado não é incluído no repositório público. Sem Water Asset, o modo Água usa apenas a cor de fallback.</p></div>`;
  body.appendChild(section);
  bindWaterActions(section, 'base-new', (id) => {
    const select = section.querySelector<HTMLSelectElement>('#base-new-asset'); if (select) select.value = id;
    const mode = section.querySelector<HTMLSelectElement>('#base-new-mode'); if (mode) mode.value = 'water';
    refreshFieldState(section, 'base-new');
  });
  section.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select').forEach((input) => input.addEventListener('input', () => { clearPreparedWaterFrames(); refreshFieldState(section, 'base-new'); }));
  refreshFieldState(section, 'base-new');

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
  section.innerHTML = `<h4>BASE SURFACE</h4>${surfaceFields(surface, 'base-layer')}<p class="base-surface-note">Ground vazio revela esta superfície. No Editor a água fica estática no mapa para economizar CPU; a preview acima, o Playtest e o jogo publicado mostram a animação completa.</p>`;
  body.appendChild(section);
  bindWaterActions(section, 'base-layer', (waterAssetId) => {
    saveCurrentBeforeExternalEdit();
    updateMapSurface(id, (target) => { target.mode = 'water'; target.waterAssetId = waterAssetId; });
  });
  section.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select').forEach((input) => input.addEventListener('input', () => { clearPreparedWaterFrames(); refreshFieldState(section, 'base-layer'); }));
  section.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select').forEach((input) => input.addEventListener('change', () => {
    saveCurrentBeforeExternalEdit();
    const chosen = readSurface(section, 'base-layer');
    updateMapSurface(id, (target) => Object.assign(target, chosen));
  }));
  refreshFieldState(section, 'base-layer');
  if (surface.mode === 'water' && surface.waterAssetId) void prepareWaterFrames(surface).then(() => window.dispatchEvent(new Event('resize')));
}

export function installMapBaseSurfaceEditorIntegration() {
  const root = document.querySelector<HTMLElement>('.mep');
  if (!root || root.dataset.baseSurfaceIntegration === '2') return;
  root.dataset.baseSurfaceIntegration = '2';
  installStyle();

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
  const unsubscribeWater = onWaterAssetsChange(schedule);
  window.addEventListener('pagehide', () => { observer.disconnect(); unsubscribeWater(); if (frame) cancelAnimationFrame(frame); }, { once: true });
  scan();
}
