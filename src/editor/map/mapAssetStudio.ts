import { addAssetSource, addAssetsToLibrary, type AssetLibraryCreateInput } from './mapAssetLibraryV2';
import type { MapAssetFolder, MapObject, MapPaletteEntry, MapPaletteId, MapSpriteRect } from './mapEditorTypes';

type StudioMode = 'grid' | 'crop' | 'animation';
type Rect = { x: number; y: number; width: number; height: number };

type CategoryDef = {
  folder: MapAssetFolder;
  label: string;
  palette: MapPaletteId;
  objectKind?: MapObject['kind'];
};

const CATEGORIES: CategoryDef[] = [
  { folder: 'terrain', label: 'Terreno', palette: 'terrain' },
  { folder: 'nature', label: 'Natureza', palette: 'doodad', objectKind: 'doodad' },
  { folder: 'buildings', label: 'Construções', palette: 'doodad', objectKind: 'doodad' },
  { folder: 'walls', label: 'Paredes', palette: 'doodad', objectKind: 'doodad' },
  { folder: 'roofs', label: 'Telhados', palette: 'doodad', objectKind: 'doodad' },
  { folder: 'furniture', label: 'Móveis', palette: 'doodad', objectKind: 'doodad' },
  { folder: 'props', label: 'Props', palette: 'doodad', objectKind: 'doodad' },
  { folder: 'crafting', label: 'Crafting', palette: 'doodad', objectKind: 'doodad' },
  { folder: 'npc', label: 'NPC', palette: 'npc', objectKind: 'npc' },
  { folder: 'monster', label: 'Monstro', palette: 'monster', objectKind: 'monster' },
  { folder: 'resource', label: 'Recurso', palette: 'resource', objectKind: 'resource' },
  { folder: 'portal', label: 'Portal', palette: 'portal', objectKind: 'portal' },
  { folder: 'effects', label: 'Efeitos', palette: 'raw', objectKind: 'raw' },
  { folder: 'raw', label: 'Outros', palette: 'raw', objectKind: 'raw' },
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);

function imageFromFile(file: File) {
  return new Promise<{ image: HTMLImageElement; url: string }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível abrir esta imagem.')); };
    image.src = url;
  });
}

function detectGrid(width: number, height: number) {
  const candidates = [16, 32, 24, 48, 64, 8];
  for (const size of candidates) if (width % size === 0 && height % size === 0) return size;
  return 16;
}

function categoryFor(folder: string) {
  return CATEGORIES.find((value) => value.folder === folder) ?? CATEGORIES[CATEGORIES.length - 1];
}

export async function openMapAssetStudio(file: File, onCreated: (entries: MapPaletteEntry[]) => void) {
  if (!file.type.startsWith('image/')) throw new Error('Arraste uma imagem PNG/WebP para o Asset Studio.');
  const { image, url } = await imageFromFile(file);
  const detected = detectGrid(image.naturalWidth, image.naturalHeight);

  let mode: StudioMode = 'grid';
  let gridWidth = detected;
  let gridHeight = detected;
  let margin = 0;
  let spacing = 0;
  let selection: Rect = { x: 0, y: 0, width: detected, height: detected };
  let dragging = false;
  let dragStart = { x: 0, y: 0 };
  let raf = 0;
  let previewStart = performance.now();

  const backdrop = document.createElement('div');
  backdrop.className = 'as-backdrop';
  backdrop.innerHTML = `
    <section class="as-window" role="dialog" aria-modal="true">
      <header class="as-header">
        <div><strong>ASSET STUDIO</strong><span>${escapeHtml(file.name)} • ${image.naturalWidth}×${image.naturalHeight}</span></div>
        <div class="as-header-actions"><button id="as-help">?</button><button id="as-close">×</button></div>
      </header>
      <div class="as-body">
        <aside class="as-tools">
          <div class="as-mode-tabs">
            <button data-mode="grid" class="active"><b>▦</b><span>Tileset</span></button>
            <button data-mode="crop"><b>⌗</b><span>Recorte</span></button>
            <button data-mode="animation"><b>▶</b><span>Animação</span></button>
          </div>
          <div class="as-block" id="as-grid-block">
            <h4>Grade</h4>
            <div class="as-row"><label>Tile W<input id="as-grid-w" type="number" min="1" value="${gridWidth}"></label><label>Tile H<input id="as-grid-h" type="number" min="1" value="${gridHeight}"></label></div>
            <div class="as-row"><label>Margem<input id="as-margin" type="number" min="0" value="0"></label><label>Espaço<input id="as-spacing" type="number" min="0" value="0"></label></div>
            <div class="as-presets"><button data-grid="16">16×16</button><button data-grid="32">32×32</button><button data-grid="48">48×48</button><button data-grid="64">64×64</button></div>
          </div>
          <div class="as-block as-animation-options" id="as-animation-block">
            <h4>Animação</h4>
            <div class="as-row"><label>Frame W<input id="as-frame-w" type="number" min="1" value="${gridWidth}"></label><label>Frame H<input id="as-frame-h" type="number" min="1" value="${gridHeight}"></label></div>
            <div class="as-row"><label>Frames<input id="as-frame-count" type="number" min="1" max="64" value="4"></label><label>FPS<input id="as-fps" type="number" min="1" max="60" value="8"></label></div>
            <label class="as-check"><input id="as-loop" type="checkbox" checked> Repetir em loop</label>
          </div>
          <div class="as-block">
            <h4>Asset</h4>
            <label>Nome<input id="as-name" value="${escapeHtml(file.name.replace(/\.[^.]+$/, ''))}"></label>
            <label>Categoria<select id="as-category">${CATEGORIES.map((value) => `<option value="${value.folder}">${value.label}</option>`).join('')}</select></label>
            <div class="as-row"><label>Largura visual<input id="as-visual-w" type="number" min="0.1" max="32" step="0.1" value="1"></label><label>Altura visual<input id="as-visual-h" type="number" min="0.1" max="32" step="0.1" value="1"></label></div>
            <label class="as-check as-grid-only"><input id="as-split" type="checkbox" checked> Criar cada tile selecionado separadamente</label>
          </div>
          <details class="as-block as-advanced">
            <summary>Avançado</summary>
            <div class="as-row"><label>Anchor X<input id="as-anchor-x" type="number" min="0" max="1" step="0.05" value="0.5"></label><label>Anchor Y<input id="as-anchor-y" type="number" min="0" max="1" step="0.05" value="1"></label></div>
            <label class="as-check"><input id="as-block-base" type="checkbox"> Bloquear tile-base na colisão</label>
          </details>
        </aside>
        <main class="as-stage-wrap">
          <div class="as-stage-toolbar"><span id="as-mode-label">TILESET SLICER</span><span id="as-selection-label"></span><span class="as-spacer"></span><button id="as-fit">Enquadrar</button></div>
          <div class="as-stage" id="as-stage"><canvas id="as-canvas"></canvas><div class="as-drop-hint">Arraste para selecionar • roda do mouse para zoom</div></div>
        </main>
        <aside class="as-preview-panel">
          <h4>PREVIEW</h4>
          <div class="as-preview-box"><canvas id="as-preview"></canvas></div>
          <div class="as-preview-info" id="as-preview-info"></div>
          <div class="as-tip"><strong>Fluxo rápido</strong><br>1. Ajuste a grade se necessário.<br>2. Arraste sobre os tiles.<br>3. Escolha categoria.<br>4. Adicione à biblioteca.</div>
        </aside>
      </div>
      <footer class="as-footer"><span id="as-message">Grade detectada automaticamente: ${detected}×${detected}</span><div><button id="as-cancel">Cancelar</button><button class="primary" id="as-create">Adicionar à biblioteca</button></div></footer>
    </section>`;
  document.body.appendChild(backdrop);

  const stage = backdrop.querySelector<HTMLElement>('#as-stage')!;
  const canvas = backdrop.querySelector<HTMLCanvasElement>('#as-canvas')!;
  const ctx = canvas.getContext('2d')!;
  const preview = backdrop.querySelector<HTMLCanvasElement>('#as-preview')!;
  const previewCtx = preview.getContext('2d')!;
  const selectionLabel = backdrop.querySelector<HTMLElement>('#as-selection-label')!;
  const previewInfo = backdrop.querySelector<HTMLElement>('#as-preview-info')!;
  const modeLabel = backdrop.querySelector<HTMLElement>('#as-mode-label')!;
  const message = backdrop.querySelector<HTMLElement>('#as-message')!;
  let zoom = 1;
  let panX = 0;
  let panY = 0;

  const inputNumber = (selector: string, fallback: number) => Number(backdrop.querySelector<HTMLInputElement>(selector)?.value) || fallback;
  const setSelectionFromAnimation = () => {
    if (mode !== 'animation') return;
    const fw = Math.max(1, inputNumber('#as-frame-w', gridWidth));
    const fh = Math.max(1, inputNumber('#as-frame-h', gridHeight));
    const count = Math.max(1, Math.floor(inputNumber('#as-frame-count', 4)));
    selection.width = Math.min(image.naturalWidth - selection.x, fw * count);
    selection.height = Math.min(image.naturalHeight - selection.y, fh);
  };

  const fit = () => {
    const rect = stage.getBoundingClientRect();
    zoom = clamp(Math.min((rect.width - 40) / image.naturalWidth, (rect.height - 40) / image.naturalHeight), .2, 8);
    panX = (rect.width - image.naturalWidth * zoom) / 2;
    panY = (rect.height - image.naturalHeight * zoom) / 2;
    render();
  };

  const pointFromEvent = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp(Math.floor((event.clientX - rect.left - panX) / zoom), 0, image.naturalWidth - 1),
      y: clamp(Math.floor((event.clientY - rect.top - panY) / zoom), 0, image.naturalHeight - 1),
    };
  };

  const snapPoint = (point: { x: number; y: number }) => {
    if (mode === 'crop') return point;
    const stepX = gridWidth + spacing;
    const stepY = gridHeight + spacing;
    const col = Math.max(0, Math.floor((point.x - margin) / Math.max(1, stepX)));
    const row = Math.max(0, Math.floor((point.y - margin) / Math.max(1, stepY)));
    return { x: margin + col * stepX, y: margin + row * stepY };
  };

  const render = () => {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, panX, panY, image.naturalWidth * zoom, image.naturalHeight * zoom);

    if (mode !== 'crop') {
      ctx.strokeStyle = 'rgba(110,190,230,.22)';
      ctx.lineWidth = 1;
      const stepX = Math.max(1, gridWidth + spacing);
      const stepY = Math.max(1, gridHeight + spacing);
      for (let x = margin; x <= image.naturalWidth; x += stepX) {
        const sx = panX + x * zoom; ctx.beginPath(); ctx.moveTo(sx, panY); ctx.lineTo(sx, panY + image.naturalHeight * zoom); ctx.stroke();
      }
      for (let y = margin; y <= image.naturalHeight; y += stepY) {
        const sy = panY + y * zoom; ctx.beginPath(); ctx.moveTo(panX, sy); ctx.lineTo(panX + image.naturalWidth * zoom, sy); ctx.stroke();
      }
    }

    ctx.fillStyle = 'rgba(69,164,219,.18)';
    ctx.strokeStyle = '#8edcff';
    ctx.lineWidth = 2;
    const sx = panX + selection.x * zoom, sy = panY + selection.y * zoom;
    const sw = selection.width * zoom, sh = selection.height * zoom;
    ctx.fillRect(sx, sy, sw, sh);
    ctx.strokeRect(sx + 1, sy + 1, Math.max(0, sw - 2), Math.max(0, sh - 2));

    if (mode === 'animation') {
      const fw = Math.max(1, inputNumber('#as-frame-w', gridWidth));
      const count = Math.max(1, Math.floor(inputNumber('#as-frame-count', 4)));
      ctx.strokeStyle = 'rgba(255,229,130,.75)';
      for (let index = 1; index < count; index++) {
        const x = panX + (selection.x + fw * index) * zoom;
        ctx.beginPath(); ctx.moveTo(x, sy); ctx.lineTo(x, sy + sh); ctx.stroke();
      }
    }
    ctx.restore();
    selectionLabel.textContent = `X ${selection.x} Y ${selection.y} • ${selection.width}×${selection.height}px`;
  };

  const renderPreview = (now: number) => {
    preview.width = 240;
    preview.height = 240;
    previewCtx.clearRect(0, 0, preview.width, preview.height);
    previewCtx.imageSmoothingEnabled = false;
    const frameW = mode === 'animation' ? Math.max(1, inputNumber('#as-frame-w', gridWidth)) : selection.width;
    const frameH = mode === 'animation' ? Math.max(1, inputNumber('#as-frame-h', gridHeight)) : selection.height;
    let sourceX = selection.x;
    let sourceY = selection.y;
    if (mode === 'animation') {
      const count = Math.max(1, Math.floor(inputNumber('#as-frame-count', 4)));
      const fps = Math.max(1, inputNumber('#as-fps', 8));
      const index = Math.floor((now - previewStart) / (1000 / fps)) % count;
      sourceX += index * frameW;
    }
    const scale = Math.min(200 / frameW, 200 / frameH, 8);
    const dw = frameW * scale, dh = frameH * scale;
    previewCtx.drawImage(image, sourceX, sourceY, Math.min(frameW, image.naturalWidth - sourceX), Math.min(frameH, image.naturalHeight - sourceY), (240 - dw) / 2, (240 - dh) / 2, dw, dh);
    previewInfo.innerHTML = `<strong>${mode === 'animation' ? 'Animação' : mode === 'grid' ? 'Tileset' : 'Recorte'}</strong><span>${frameW}×${frameH}px ${mode === 'animation' ? `• ${Math.max(1, Math.floor(inputNumber('#as-frame-count', 4)))} frames` : ''}</span>`;
    raf = requestAnimationFrame(renderPreview);
  };

  const setMode = (next: StudioMode) => {
    mode = next;
    backdrop.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
    backdrop.classList.toggle('as-mode-animation', mode === 'animation');
    backdrop.classList.toggle('as-mode-crop', mode === 'crop');
    modeLabel.textContent = mode === 'grid' ? 'TILESET SLICER' : mode === 'crop' ? 'RECORTE LIVRE' : 'EDITOR DE ANIMAÇÃO';
    if (mode === 'animation') setSelectionFromAnimation();
    render();
  };

  const refreshGrid = () => {
    gridWidth = Math.max(1, Math.floor(inputNumber('#as-grid-w', detected)));
    gridHeight = Math.max(1, Math.floor(inputNumber('#as-grid-h', detected)));
    margin = Math.max(0, Math.floor(inputNumber('#as-margin', 0)));
    spacing = Math.max(0, Math.floor(inputNumber('#as-spacing', 0)));
    render();
  };

  canvas.onpointerdown = (event) => {
    dragging = true;
    canvas.setPointerCapture(event.pointerId);
    const point = snapPoint(pointFromEvent(event));
    dragStart = point;
    selection = { x: point.x, y: point.y, width: mode === 'crop' ? 1 : gridWidth, height: mode === 'crop' ? 1 : gridHeight };
    if (mode === 'animation') setSelectionFromAnimation();
    render();
  };
  canvas.onpointermove = (event) => {
    if (!dragging) return;
    const point = snapPoint(pointFromEvent(event));
    if (mode === 'animation') { selection.x = point.x; selection.y = point.y; setSelectionFromAnimation(); render(); return; }
    if (mode === 'grid') {
      const minX = Math.min(dragStart.x, point.x), minY = Math.min(dragStart.y, point.y);
      selection = { x: minX, y: minY, width: Math.min(image.naturalWidth - minX, Math.abs(point.x - dragStart.x) + gridWidth), height: Math.min(image.naturalHeight - minY, Math.abs(point.y - dragStart.y) + gridHeight) };
    } else {
      const minX = Math.min(dragStart.x, point.x), minY = Math.min(dragStart.y, point.y);
      selection = { x: minX, y: minY, width: Math.max(1, Math.abs(point.x - dragStart.x)), height: Math.max(1, Math.abs(point.y - dragStart.y)) };
    }
    render();
  };
  canvas.onpointerup = () => { dragging = false; };
  canvas.onwheel = (event) => {
    event.preventDefault();
    const before = zoom;
    zoom = clamp(zoom * (event.deltaY < 0 ? 1.15 : .87), .15, 12);
    const rect = canvas.getBoundingClientRect();
    const mx = event.clientX - rect.left, my = event.clientY - rect.top;
    panX = mx - (mx - panX) * (zoom / before);
    panY = my - (my - panY) * (zoom / before);
    render();
  };

  backdrop.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => button.onclick = () => setMode(button.dataset.mode as StudioMode));
  backdrop.querySelectorAll<HTMLButtonElement>('[data-grid]').forEach((button) => button.onclick = () => {
    const size = Number(button.dataset.grid) || 16;
    backdrop.querySelector<HTMLInputElement>('#as-grid-w')!.value = String(size);
    backdrop.querySelector<HTMLInputElement>('#as-grid-h')!.value = String(size);
    refreshGrid();
  });
  ['#as-grid-w', '#as-grid-h', '#as-margin', '#as-spacing'].forEach((selector) => backdrop.querySelector<HTMLInputElement>(selector)!.onchange = refreshGrid);
  ['#as-frame-w', '#as-frame-h', '#as-frame-count'].forEach((selector) => backdrop.querySelector<HTMLInputElement>(selector)!.onchange = () => { setSelectionFromAnimation(); render(); previewStart = performance.now(); });
  backdrop.querySelector<HTMLInputElement>('#as-fps')!.onchange = () => { previewStart = performance.now(); };
  backdrop.querySelector<HTMLButtonElement>('#as-fit')!.onclick = fit;

  const close = () => {
    cancelAnimationFrame(raf);
    URL.revokeObjectURL(url);
    backdrop.remove();
  };
  backdrop.querySelector<HTMLButtonElement>('#as-close')!.onclick = close;
  backdrop.querySelector<HTMLButtonElement>('#as-cancel')!.onclick = close;
  backdrop.querySelector<HTMLButtonElement>('#as-help')!.onclick = () => { message.textContent = 'Tileset: selecione células. Recorte: marque qualquer área. Animação: escolha a primeira célula e configure frames/FPS.'; };

  backdrop.querySelector<HTMLButtonElement>('#as-create')!.onclick = async () => {
    const category = categoryFor(backdrop.querySelector<HTMLSelectElement>('#as-category')!.value);
    const baseName = backdrop.querySelector<HTMLInputElement>('#as-name')!.value.trim() || 'Asset';
    const visualW = clamp(inputNumber('#as-visual-w', 1), .1, 32);
    const visualH = clamp(inputNumber('#as-visual-h', 1), .1, 32);
    const anchorX = clamp(inputNumber('#as-anchor-x', .5), 0, 1);
    const anchorY = clamp(inputNumber('#as-anchor-y', 1), 0, 1);
    const blocksBase = backdrop.querySelector<HTMLInputElement>('#as-block-base')!.checked;
    const footprint = category.palette === 'terrain' ? undefined : { width: Math.max(1, Math.ceil(visualW)), height: Math.max(1, Math.ceil(visualH)), collision: blocksBase ? [{ x: 0, y: 0 }] : [] };
    const common = { palette: category.palette, folder: category.folder, objectKind: category.objectKind, color: '#687f91', widthTiles: visualW, heightTiles: visualH, anchorX, anchorY, footprint, tags: [category.folder, 'importado'] };
    const values: AssetLibraryCreateInput[] = [];

    if (mode === 'animation') {
      const fw = Math.max(1, Math.floor(inputNumber('#as-frame-w', gridWidth)));
      const fh = Math.max(1, Math.floor(inputNumber('#as-frame-h', gridHeight)));
      const count = Math.max(1, Math.floor(inputNumber('#as-frame-count', 4)));
      const frames: MapSpriteRect[] = [];
      for (let index = 0; index < count; index++) {
        const x = selection.x + index * fw;
        if (x + fw > image.naturalWidth || selection.y + fh > image.naturalHeight) break;
        frames.push({ x, y: selection.y, width: fw, height: fh });
      }
      if (!frames.length) { message.textContent = 'Nenhum frame válido dentro da imagem.'; return; }
      values.push({ ...common, label: baseName, animation: { frames, fps: clamp(inputNumber('#as-fps', 8), 1, 60), loop: backdrop.querySelector<HTMLInputElement>('#as-loop')!.checked } });
    } else if (mode === 'grid' && backdrop.querySelector<HTMLInputElement>('#as-split')!.checked) {
      const stepX = gridWidth + spacing, stepY = gridHeight + spacing;
      let number = 1;
      for (let y = selection.y; y + gridHeight <= selection.y + selection.height && y + gridHeight <= image.naturalHeight; y += stepY) {
        for (let x = selection.x; x + gridWidth <= selection.x + selection.width && x + gridWidth <= image.naturalWidth; x += stepX) {
          values.push({ ...common, label: `${baseName} ${String(number++).padStart(2, '0')}`, sourceRect: { x, y, width: gridWidth, height: gridHeight } });
        }
      }
    } else {
      values.push({ ...common, label: baseName, sourceRect: { ...selection } });
    }

    if (!values.length) { message.textContent = 'Selecione pelo menos um tile/recorte.'; return; }
    const createButton = backdrop.querySelector<HTMLButtonElement>('#as-create')!;
    createButton.disabled = true;
    createButton.textContent = 'Salvando...';
    try {
      const sourceId = await addAssetSource(file, file.name, image.naturalWidth, image.naturalHeight);
      const entries = await addAssetsToLibrary(sourceId, values);
      onCreated(entries);
      close();
    } catch (error) {
      createButton.disabled = false;
      createButton.textContent = 'Adicionar à biblioteca';
      message.textContent = error instanceof Error ? error.message : 'Falha ao salvar assets.';
    }
  };

  const observer = new ResizeObserver(() => render());
  observer.observe(stage);
  backdrop.addEventListener('remove', () => observer.disconnect(), { once: true });
  fit();
  raf = requestAnimationFrame(renderPreview);
}
