import './mapAutotile.css';
import { getAssetSourceUrl } from './mapAssetLibraryV2';
import { applyAutotilePoints, missingAutotileMasks, reflowAutotileMap } from './mapAutotileEngine';
import { loadMapDocument, saveMapDocument } from './mapEditorStorage';
import {
  autotileMaskLabel,
  autotileRuleUsesTileset,
  deleteAutotileRule,
  duplicateAutotileRule,
  getAutotileRule,
  listAutotileRules,
  onAutotileRulesChange,
  requiredAutotileMasks,
  saveAutotileRule,
  type AutotileRule,
} from './mapAutotileStore';
import { ensureTilesetEntries, getTileset, listTilesets, parseTilesetTileId, tilesetTileId, tilesetTileRect, type TilesetDefinition } from './mapTilesetStore';

type Point = { x: number; y: number };
type BrushMode = 'off' | 'paint' | 'erase';

const LAST_RULE_KEY = 'ascension.map-editor.autotile-last-rule.v1';
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function currentMapId() { return document.querySelector<HTMLSelectElement>('#mep-map-select')?.value ?? ''; }
function currentTilesetId() { return document.querySelector<HTMLSelectElement>('#traditional-select')?.value ?? ''; }
function isTilesetMode() { return Boolean(document.querySelector<HTMLButtonElement>('[data-terrain-mode="tileset"].active')); }
function saveEditor() { document.querySelector<HTMLButtonElement>('#mep-save')?.click(); }
function reloadMap(id: string) { const select = document.querySelector<HTMLSelectElement>('#mep-map-select'); if (!select) return; select.value = id; select.dispatchEvent(new Event('change', { bubbles: true })); }

function pointFromStatus(): Point | null {
  const text = document.querySelector<HTMLElement>('#mep-position')?.textContent ?? '';
  const match = text.match(/X\s*(-?\d+(?:\.\d+)?)\s*[•·]\s*Y\s*(-?\d+(?:\.\d+)?)/i);
  return match ? { x: Math.floor(Number(match[1])), y: Math.floor(Number(match[2])) } : null;
}

function bresenham(a: Point, b: Point) {
  const result: Point[] = [];
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

function topologyHtml(rule: AutotileRule, mask: number) {
  const bits = rule.mode === 'blob47'
    ? [128, 1, 16, 8, 0, 2, 64, 4, 32]
    : [0, 1, 0, 8, 0, 2, 0, 4, 0];
  return `<div class="autotile-topology">${bits.map((bit, index) => `<i class="${index === 4 ? 'center' : bit && (mask & bit) ? 'on' : ''}"></i>`).join('')}</div>`;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível abrir o Tileset.'));
    image.src = url;
  });
}

async function drawVariantPreview(host: HTMLElement, rule: AutotileRule, mask: number) {
  const canvas = host.querySelector<HTMLCanvasElement>('#autotile-variant-preview');
  if (!canvas) return;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#071219'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const assetId = rule.variants[String(mask)];
  const parsed = parseTilesetTileId(assetId);
  const tileset = parsed ? getTileset(parsed.tilesetId) : null;
  if (!parsed || !tileset) return;
  const url = await getAssetSourceUrl(tileset.sourceId); if (!url || !canvas.isConnected) return;
  const image = await loadImage(url).catch(() => null); if (!image || !canvas.isConnected) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, parsed.rect.x, parsed.rect.y, parsed.rect.width, parsed.rect.height, 0, 0, canvas.width, canvas.height);
}

async function openTilePicker(rule: AutotileRule, mask: number, onPick: (assetId: string) => void) {
  const tileset = getTileset(rule.tilesetId);
  if (!tileset) { window.alert('Selecione um Tileset válido para esta regra.'); return; }
  const url = await getAssetSourceUrl(tileset.sourceId);
  if (!url) { window.alert('O PNG original deste Tileset não está disponível.'); return; }
  const image = await loadImage(url).catch(() => null);
  if (!image) return;

  const modal = document.createElement('div'); modal.className = 'pro-modal-backdrop';
  modal.innerHTML = `<section class="autotile-picker"><header><div><strong>Escolher variante · ${esc(autotileMaskLabel(rule.mode, mask))}</strong><span>${esc(tileset.name)} · clique exatamente no tile desejado</span></div><button type="button" data-close>×</button></header><div class="autotile-picker-body"><canvas class="autotile-picker-canvas"></canvas></div><footer><span>${tileset.columns}×${tileset.rows} células · ${tileset.tileWidth}×${tileset.tileHeight}px</span><button type="button" data-close>Cancelar</button></footer></section>`;
  document.body.appendChild(modal);
  const canvas = modal.querySelector<HTMLCanvasElement>('canvas')!;
  const ctx = canvas.getContext('2d')!;
  canvas.width = tileset.imageWidth; canvas.height = tileset.imageHeight;
  const scale = clamp(Math.min(1, 780 / Math.max(1, tileset.imageWidth), 560 / Math.max(1, tileset.imageHeight)), .2, 1);
  canvas.style.width = `${Math.max(1, tileset.imageWidth * scale)}px`; canvas.style.height = `${Math.max(1, tileset.imageHeight * scale)}px`;
  ctx.imageSmoothingEnabled = false; ctx.drawImage(image, 0, 0);
  ctx.strokeStyle = 'rgba(80,201,239,.42)'; ctx.lineWidth = Math.max(1, 1 / scale);
  for (let col = 0; col <= tileset.columns; col++) {
    const x = tileset.offsetX + tileset.margin + col * (tileset.tileWidth + tileset.spacing);
    ctx.beginPath(); ctx.moveTo(x, tileset.offsetY + tileset.margin); ctx.lineTo(x, tileset.offsetY + tileset.margin + tileset.rows * (tileset.tileHeight + tileset.spacing) - tileset.spacing); ctx.stroke();
  }
  for (let row = 0; row <= tileset.rows; row++) {
    const y = tileset.offsetY + tileset.margin + row * (tileset.tileHeight + tileset.spacing);
    ctx.beginPath(); ctx.moveTo(tileset.offsetX + tileset.margin, y); ctx.lineTo(tileset.offsetX + tileset.margin + tileset.columns * (tileset.tileWidth + tileset.spacing) - tileset.spacing, y); ctx.stroke();
  }
  const existing = parseTilesetTileId(rule.variants[String(mask)]);
  if (existing?.tilesetId === tileset.id) {
    ctx.strokeStyle = '#fff2a6'; ctx.lineWidth = Math.max(2, 2 / scale);
    ctx.strokeRect(existing.rect.x + 1, existing.rect.y + 1, existing.rect.width - 2, existing.rect.height - 2);
  }

  const close = () => modal.remove();
  modal.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((button) => button.onclick = close);
  canvas.onclick = (event) => {
    const rect = canvas.getBoundingClientRect();
    const px = (event.clientX - rect.left) * canvas.width / Math.max(1, rect.width), py = (event.clientY - rect.top) * canvas.height / Math.max(1, rect.height);
    const col = Math.floor((px - tileset.offsetX - tileset.margin) / Math.max(1, tileset.tileWidth + tileset.spacing));
    const row = Math.floor((py - tileset.offsetY - tileset.margin) / Math.max(1, tileset.tileHeight + tileset.spacing));
    const tileRect = tilesetTileRect(tileset, col, row);
    if (!tileRect || px < tileRect.x || py < tileRect.y || px >= tileRect.x + tileRect.width || py >= tileRect.y + tileRect.height) return;
    const assetId = tilesetTileId(tileset, col, row);
    if (!assetId) return;
    close(); onPick(assetId);
  };
}

function nextMissingMask(rule: AutotileRule, after: number) {
  const required = requiredAutotileMasks(rule.mode);
  const currentIndex = Math.max(0, required.indexOf(after));
  for (let offset = 1; offset <= required.length; offset++) {
    const mask = required[(currentIndex + offset) % required.length];
    if (!rule.variants[String(mask)]) return mask;
  }
  return required[(currentIndex + 1) % required.length] ?? 0;
}

export function installMapAutotileEditor() {
  const root = document.querySelector<HTMLElement>('.mep');
  const canvas = root?.querySelector<HTMLCanvasElement>('#mep-canvas');
  if (!root || !canvas || root.dataset.autotileEditor === '1') return;
  root.dataset.autotileEditor = '1';

  let selectedRuleId = localStorage.getItem(LAST_RULE_KEY) ?? '';
  let selectedMask = 0;
  let brushMode: BrushMode = 'off';
  let painting = false;
  let paintPoints: Point[] = [];
  let lastPoint: Point | null = null;
  let observerFrame = 0;

  const selectedRule = () => getAutotileRule(selectedRuleId) ?? listAutotileRules()[0] ?? null;
  const selectRule = (id: string) => {
    selectedRuleId = id;
    localStorage.setItem(LAST_RULE_KEY, id);
    const rule = selectedRule();
    const masks = rule ? requiredAutotileMasks(rule.mode) : [0];
    if (!masks.includes(selectedMask)) selectedMask = masks[0] ?? 0;
  };

  const setBrushMode = (mode: BrushMode) => {
    brushMode = mode;
    painting = false; paintPoints = []; lastPoint = null;
    refreshExistingStudio();
  };

  const newRule = () => {
    const tilesetId = currentTilesetId() || listTilesets()[0]?.id || '';
    if (!tilesetId) { window.alert('Importe um Tileset antes de criar uma Terrain Rule.'); return; }
    const tileset = getTileset(tilesetId);
    const created = saveAutotileRule({ name: `Caminho · ${tileset?.name ?? 'Tileset'}`, tilesetId, layer: 'ground', mode: 'path16', variants: {} });
    selectRule(created.id); selectedMask = 0; setBrushMode('off');
  };

  const saveRuleFields = (host: HTMLElement) => {
    const rule = selectedRule(); if (!rule) return;
    const name = host.querySelector<HTMLInputElement>('#autotile-name')?.value.trim() || rule.name;
    const tilesetId = host.querySelector<HTMLSelectElement>('#autotile-tileset')?.value || rule.tilesetId;
    const layer = host.querySelector<HTMLSelectElement>('#autotile-layer')?.value === 'detail' ? 'detail' : 'ground';
    const mode = host.querySelector<HTMLSelectElement>('#autotile-mode')?.value === 'blob47' ? 'blob47' : 'path16';
    let variants = { ...rule.variants };
    if (tilesetId !== rule.tilesetId && Object.keys(variants).length) {
      if (!window.confirm('Trocar o Tileset remove as variantes configuradas desta regra. Continuar?')) { renderStudio(host); return; }
      variants = {};
    }
    if (mode !== rule.mode && Object.keys(variants).length) {
      if (!window.confirm('Trocar Path16/Blob47 remove as variantes configuradas desta regra. Continuar?')) { renderStudio(host); return; }
      variants = {};
    }
    const saved = saveAutotileRule({ ...rule, name, tilesetId, layer, mode, variants });
    selectRule(saved.id);
    const masks = requiredAutotileMasks(saved.mode); if (!masks.includes(selectedMask)) selectedMask = masks[0] ?? 0;
    renderStudio(host);
  };

  const paintStatus = (host: HTMLElement) => {
    const node = host.querySelector<HTMLElement>('#autotile-paint-status'); if (!node) return;
    const rule = selectedRule();
    if (!rule) { node.className = 'autotile-paint-status'; node.textContent = 'Crie uma Terrain Rule para começar.'; return; }
    const missing = missingAutotileMasks(rule);
    node.className = `autotile-paint-status ${brushMode !== 'off' ? 'active' : ''}`;
    node.textContent = brushMode === 'paint'
      ? `Pincel Autotile ativo · ${rule.name}${painting ? ` · ${paintPoints.length} células no traço` : ''}`
      : brushMode === 'erase'
        ? `Borracha Autotile ativa · apaga somente células da regra “${rule.name}”.`
        : `${rule.name} · ${missing.length ? `${missing.length} variantes faltando (fallback ativo)` : 'regra completa'}.`;
  };

  const renderStudio = (host: HTMLElement) => {
    const rules = listAutotileRules();
    if (!rules.some((rule) => rule.id === selectedRuleId)) selectRule(rules[0]?.id ?? '');
    const rule = selectedRule();
    const tilesets = listTilesets();
    const masks = rule ? requiredAutotileMasks(rule.mode) : [0];
    if (rule && !masks.includes(selectedMask)) selectedMask = masks[0] ?? 0;
    const configured = rule ? masks.filter((mask) => Boolean(rule.variants[String(mask)])).length : 0;
    const missing = rule ? masks.length - configured : 0;

    host.innerHTML = `<div class="autotile-head"><strong>AUTOTILE / TERRAIN RULES</strong><span>Path16 · Blob47</span></div>
      <div class="autotile-row"><select id="autotile-rule-select"><option value="">${rules.length ? 'Selecionar regra…' : 'Nenhuma regra'}</option>${rules.map((value) => `<option value="${esc(value.id)}" ${value.id === rule?.id ? 'selected' : ''}>${esc(value.name)} · ${value.mode === 'blob47' ? 'Blob47' : 'Path16'}</option>`).join('')}</select><button id="autotile-new">＋ Nova</button></div>
      ${rule ? `<section class="autotile-editor-card">
        <div class="autotile-fields"><label>Nome<input id="autotile-name" value="${esc(rule.name)}"></label><label>Tipo<select id="autotile-mode"><option value="path16" ${rule.mode === 'path16' ? 'selected' : ''}>Path16 · estradas/rios</option><option value="blob47" ${rule.mode === 'blob47' ? 'selected' : ''}>Blob47 · costa/terreno</option></select></label><label>Tileset<select id="autotile-tileset">${tilesets.map((value) => `<option value="${esc(value.id)}" ${value.id === rule.tilesetId ? 'selected' : ''}>${esc(value.name)}</option>`).join('')}</select></label><label>Camada<select id="autotile-layer"><option value="ground" ${rule.layer === 'ground' ? 'selected' : ''}>Ground</option><option value="detail" ${rule.layer === 'detail' ? 'selected' : ''}>Detail</option></select></label></div>
        <div class="autotile-progress ${missing === 0 ? 'ready' : ''}">${configured}/${masks.length} variantes configuradas${missing ? ` · ${missing} faltando` : ' · pronta para uso'}</div>
        <div class="autotile-mask-card">${topologyHtml(rule, selectedMask)}<div class="autotile-variant-tools"><select id="autotile-mask">${masks.map((mask) => `<option value="${mask}" ${mask === selectedMask ? 'selected' : ''}>${esc(autotileMaskLabel(rule.mode, mask))}${rule.variants[String(mask)] ? ' ✓' : ''}</option>`).join('')}</select><canvas id="autotile-variant-preview" width="64" height="64"></canvas><small>${rule.variants[String(selectedMask)] ? esc(rule.variants[String(selectedMask)]) : 'Nenhum tile atribuído. Máscaras ausentes usam fallback até a regra ser completada.'}</small><div class="autotile-row"><button id="autotile-pick">Escolher tile</button><button id="autotile-clear-mask">Limpar variante</button></div></div></div>
        <div class="autotile-actions"><button id="autotile-paint" class="${brushMode === 'paint' ? 'active' : ''}">✎ Pincel Auto</button><button id="autotile-erase" class="${brushMode === 'erase' ? 'active' : ''}">⌫ Borracha Auto</button><button id="autotile-stop">Parar</button><button id="autotile-reflow">↻ Recalcular mapa</button><button id="autotile-duplicate">Duplicar regra</button><button id="autotile-delete" class="danger">Excluir regra</button></div>
      </section>` : '<div class="autotile-progress">Path16 cria estradas/rios conectados. Blob47 cria costas, ilhas e massas de terreno com cantos internos/externos.</div>'}
      <div id="autotile-paint-status" class="autotile-paint-status"></div>`;

    host.querySelector<HTMLSelectElement>('#autotile-rule-select')!.onchange = (event) => { selectRule((event.target as HTMLSelectElement).value); selectedMask = 0; setBrushMode('off'); };
    host.querySelector<HTMLButtonElement>('#autotile-new')!.onclick = newRule;
    if (!rule) { paintStatus(host); return; }
    ['#autotile-name', '#autotile-mode', '#autotile-tileset', '#autotile-layer'].forEach((selector) => host.querySelector<HTMLElement>(selector)?.addEventListener('change', () => saveRuleFields(host)));
    host.querySelector<HTMLSelectElement>('#autotile-mask')!.onchange = (event) => { selectedMask = Number((event.target as HTMLSelectElement).value) || 0; renderStudio(host); };
    host.querySelector<HTMLButtonElement>('#autotile-pick')!.onclick = () => {
      const fresh = selectedRule(); if (!fresh) return;
      void openTilePicker(fresh, selectedMask, (assetId) => {
        const latest = selectedRule(); if (!latest) return;
        const variants = { ...latest.variants, [String(selectedMask)]: assetId };
        const saved = saveAutotileRule({ ...latest, variants });
        void ensureTilesetEntries([assetId]);
        selectedMask = nextMissingMask(saved, selectedMask);
        renderStudio(host);
      });
    };
    host.querySelector<HTMLButtonElement>('#autotile-clear-mask')!.onclick = () => {
      const latest = selectedRule(); if (!latest) return;
      const variants = { ...latest.variants }; delete variants[String(selectedMask)];
      saveAutotileRule({ ...latest, variants }); renderStudio(host);
    };
    host.querySelector<HTMLButtonElement>('#autotile-paint')!.onclick = () => setBrushMode(brushMode === 'paint' ? 'off' : 'paint');
    host.querySelector<HTMLButtonElement>('#autotile-erase')!.onclick = () => setBrushMode(brushMode === 'erase' ? 'off' : 'erase');
    host.querySelector<HTMLButtonElement>('#autotile-stop')!.onclick = () => setBrushMode('off');
    host.querySelector<HTMLButtonElement>('#autotile-duplicate')!.onclick = () => { const duplicate = duplicateAutotileRule(rule.id); if (duplicate) { selectRule(duplicate.id); renderStudio(host); } };
    host.querySelector<HTMLButtonElement>('#autotile-delete')!.onclick = () => {
      if (!window.confirm(`Excluir a Terrain Rule “${rule.name}”? Os tiles já colocados no mapa permanecem.`)) return;
      deleteAutotileRule(rule.id); selectRule(''); selectedMask = 0; setBrushMode('off');
    };
    host.querySelector<HTMLButtonElement>('#autotile-reflow')!.onclick = async () => {
      const latest = selectedRule(), mapId = currentMapId(); if (!latest || !mapId) return;
      saveEditor(); const map = loadMapDocument(mapId); if (!map) return;
      await ensureTilesetEntries(Object.values(latest.variants));
      const result = reflowAutotileMap(map, latest); saveMapDocument(map); reloadMap(mapId);
      window.alert(`Terrain Rule recalculada. ${result.changed} tile(s) ajustados.`);
    };
    void drawVariantPreview(host, rule, selectedMask);
    paintStatus(host);
  };

  const refreshExistingStudio = () => {
    const host = document.querySelector<HTMLElement>('.autotile-studio');
    if (host) renderStudio(host);
  };

  const attachStudio = () => {
    const browser = document.querySelector<HTMLElement>('.traditional-browser');
    if (!browser) return;
    let host = browser.querySelector<HTMLElement>('.autotile-studio');
    if (!host) { host = document.createElement('section'); host.className = 'autotile-studio'; browser.appendChild(host); renderStudio(host); }

    const deleteButton = browser.querySelector<HTMLButtonElement>('#traditional-delete');
    if (deleteButton && deleteButton.dataset.autotileDependencyHook !== '1') {
      deleteButton.dataset.autotileDependencyHook = '1';
      deleteButton.addEventListener('click', (event) => {
        const tilesetId = currentTilesetId();
        const rules = autotileRuleUsesTileset(tilesetId);
        if (!rules.length) return;
        event.preventDefault(); event.stopImmediatePropagation();
        window.alert(`Este Tileset é usado por ${rules.length} Terrain Rule(s): ${rules.map((value) => value.name).join(', ')}. Exclua ou migre as regras primeiro.`);
      }, { capture: true });
    }
  };

  const applyStroke = async () => {
    if (!painting) return;
    painting = false;
    const points = [...new Map(paintPoints.map((point) => [`${point.x},${point.y}`, point])).values()];
    paintPoints = []; lastPoint = null;
    const rule = selectedRule(), mapId = currentMapId();
    if (!rule || !mapId || !points.length) { refreshExistingStudio(); return; }
    saveEditor(); const map = loadMapDocument(mapId); if (!map) return;
    await ensureTilesetEntries(Object.values(rule.variants));
    applyAutotilePoints(map, rule, points, brushMode === 'erase');
    saveMapDocument(map); reloadMap(mapId); refreshExistingStudio();
  };

  // Este listener precisa ser instalado antes do núcleo tradicional. Quando o
  // Autotile está desligado ele não interfere; quando ativo ele assume o gesto.
  canvas.addEventListener('pointerdown', (event) => {
    if (brushMode === 'off' || !isTilesetMode() || event.button !== 0) return;
    const rule = selectedRule(), point = pointFromStatus();
    if (!rule || !point) return;
    if (!Object.keys(rule.variants).length && brushMode === 'paint') { window.alert('Configure pelo menos uma variante antes de pintar.'); setBrushMode('off'); return; }
    event.preventDefault(); event.stopImmediatePropagation();
    painting = true; paintPoints = [point]; lastPoint = point; refreshExistingStudio();
  }, { capture: true });

  canvas.addEventListener('pointermove', () => {
    if (!painting || brushMode === 'off') return;
    const point = pointFromStatus(); if (!point || (lastPoint && point.x === lastPoint.x && point.y === lastPoint.y)) return;
    if (lastPoint) paintPoints.push(...bresenham(lastPoint, point).slice(1)); else paintPoints.push(point);
    lastPoint = point;
    const host = document.querySelector<HTMLElement>('.autotile-studio'); if (host) paintStatus(host);
  });
  window.addEventListener('pointerup', () => { void applyStroke(); }, { capture: true });
  window.addEventListener('blur', () => { void applyStroke(); });

  root.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('[data-trad-tool]') || target.closest('.tile-productivity [data-tile-action]')) setBrushMode('off');
  }, { capture: true });

  const scan = () => { observerFrame = 0; attachStudio(); };
  const observer = new MutationObserver(() => { if (!observerFrame) observerFrame = requestAnimationFrame(scan); });
  observer.observe(root, { childList: true, subtree: true });
  const unsubscribe = onAutotileRulesChange(() => { if (!observerFrame) observerFrame = requestAnimationFrame(() => { observerFrame = 0; refreshExistingStudio(); }); });
  attachStudio();
  window.addEventListener('pagehide', () => { observer.disconnect(); unsubscribe(); if (observerFrame) cancelAnimationFrame(observerFrame); }, { once: true });
}
