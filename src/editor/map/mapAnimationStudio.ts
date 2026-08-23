import './mapAnimationStudio.css';
import { addAssetSource, addAssetsToLibrary, type AssetLibraryCreateInput } from './mapAssetLibraryV2';
import { activeAnimationFrame } from './mapAnimationRuntime';
import type {
  MapAnimationDefinition,
  MapAnimationFrame,
  MapAnimationPlayback,
  MapAnimationSync,
  MapAssetFolder,
  MapObject,
  MapPaletteEntry,
  MapPaletteId,
} from './mapEditorTypes';

type CategoryDef = {
  folder: MapAssetFolder;
  label: string;
  palette: MapPaletteId;
  objectKind?: MapObject['kind'];
};

type LoadedImage = { file: File; image: HTMLImageElement; url: string };

const CATEGORIES: CategoryDef[] = [
  { folder: 'terrain', label: 'Terreno animado', palette: 'terrain' },
  { folder: 'nature', label: 'Natureza', palette: 'doodad', objectKind: 'doodad' },
  { folder: 'buildings', label: 'Construções', palette: 'doodad', objectKind: 'doodad' },
  { folder: 'props', label: 'Props', palette: 'doodad', objectKind: 'doodad' },
  { folder: 'effects', label: 'Efeitos', palette: 'raw', objectKind: 'raw' },
  { folder: 'portal', label: 'Portal', palette: 'portal', objectKind: 'portal' },
  { folder: 'npc', label: 'NPC', palette: 'npc', objectKind: 'npc' },
  { folder: 'monster', label: 'Monstro', palette: 'monster', objectKind: 'monster' },
  { folder: 'resource', label: 'Recurso', palette: 'resource', objectKind: 'resource' },
  { folder: 'raw', label: 'Outros', palette: 'raw', objectKind: 'raw' },
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
const frameKey = (frame: MapAnimationFrame) => `${frame.x}:${frame.y}:${frame.width}:${frame.height}`;

function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function detectGrid(width: number, height: number) {
  for (const size of [16, 32, 24, 48, 64, 8, 96, 128]) if (width % size === 0 && height % size === 0) return size;
  return Math.max(1, Math.min(width, height));
}

function loadImage(file: File) {
  return new Promise<LoadedImage>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ file, image, url });
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Não foi possível abrir ${file.name}.`)); };
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Falha ao preparar spritesheet.')), 'image/png'));
}

function categoryFor(folder: string) {
  return CATEGORIES.find((value) => value.folder === folder) ?? CATEGORIES[0];
}

export async function openMapAnimationStudio(inputFiles: File[], onCreated: (entries: MapPaletteEntry[]) => void) {
  const files = [...inputFiles].filter((file) => file.type.startsWith('image/')).sort((a, b) => naturalCompare(a.name, b.name));
  if (!files.length) throw new Error('Selecione PNG, WebP ou JPEG para criar a animação.');
  const loaded = await Promise.all(files.map(loadImage));
  const separateFrames = loaded.length > 1;

  let sourceImage: CanvasImageSource = loaded[0].image;
  let sourceBlob: Blob = loaded[0].file;
  let sourceWidth = loaded[0].image.naturalWidth;
  let sourceHeight = loaded[0].image.naturalHeight;
  let sourceName = loaded[0].file.name;
  let frames: MapAnimationFrame[] = [];

  if (separateFrames) {
    sourceWidth = loaded.reduce((sum, value) => sum + value.image.naturalWidth, 0);
    sourceHeight = Math.max(...loaded.map((value) => value.image.naturalHeight));
    const sheet = document.createElement('canvas');
    sheet.width = Math.max(1, sourceWidth); sheet.height = Math.max(1, sourceHeight);
    const sheetCtx = sheet.getContext('2d')!; sheetCtx.imageSmoothingEnabled = false;
    let cursorX = 0;
    for (const item of loaded) {
      sheetCtx.drawImage(item.image, cursorX, 0);
      frames.push({ x: cursorX, y: 0, width: item.image.naturalWidth, height: item.image.naturalHeight });
      cursorX += item.image.naturalWidth;
    }
    sourceImage = sheet;
    sourceBlob = await canvasBlob(sheet);
    sourceName = `${files[0].name.replace(/\.[^.]+$/, '')}-animation.png`;
  }

  let gridW = detectGrid(sourceWidth, sourceHeight);
  let gridH = gridW;
  let margin = 0;
  let spacing = 0;
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let selectedIndex = frames.length ? 0 : -1;
  let playing = true;
  let previewBase = performance.now();
  let frozenPreviewMs = 0;
  let raf = 0;
  let dragFrameIndex = -1;

  if (!separateFrames) {
    const columns = Math.max(1, Math.floor(sourceWidth / gridW));
    const initial = Math.min(columns, 4);
    frames = Array.from({ length: initial }, (_, index) => ({ x: index * gridW, y: 0, width: gridW, height: gridH }));
    selectedIndex = frames.length ? 0 : -1;
  }

  const backdrop = document.createElement('div');
  backdrop.className = 'anim-backdrop';
  backdrop.innerHTML = `
    <section class="anim-window" role="dialog" aria-modal="true">
      <header class="anim-head">
        <div><strong>ANIMATION STUDIO</strong><span>${separateFrames ? `${files.length} imagens separadas` : `${esc(sourceName)} • ${sourceWidth}×${sourceHeight}`}</span></div>
        <span class="anim-badge">${separateFrames ? 'FRAMES SEPARADOS' : 'SPRITESHEET'}</span><div class="spacer"></div><button id="anim-close">×</button>
      </header>
      <div class="anim-body">
        <aside class="anim-controls">
          <section class="anim-block">
            <h4>Asset</h4>
            <label>Nome<input id="anim-name" value="${esc(files[0].name.replace(/\.[^.]+$/, '').replace(/[-_]?\d+$/, ''))}"></label>
            <label>Categoria<select id="anim-category">${CATEGORIES.map((value) => `<option value="${value.folder}" ${value.folder === (separateFrames ? 'props' : 'terrain') ? 'selected' : ''}>${value.label}</option>`).join('')}</select></label>
            <div class="anim-row"><label>Largura visual<input id="anim-visual-w" type="number" min="0.1" max="32" step="0.1" value="1"></label><label>Altura visual<input id="anim-visual-h" type="number" min="0.1" max="32" step="0.1" value="1"></label></div>
          </section>
          <section class="anim-block">
            <h4>Reprodução</h4>
            <label>Modo<select id="anim-playback"><option value="loop">Loop</option><option value="pingpong">Ping-pong</option><option value="once">Uma vez</option><option value="random">Aleatória</option></select></label>
            <div class="anim-row"><label>FPS<input id="anim-fps" type="number" min="1" max="60" step="1" value="8"></label><label>Sincronização<select id="anim-sync"><option value="global">Global</option><option value="random">Fase diferente</option></select></label></div>
            <p class="anim-note">Global é ideal para água/lava. Fase diferente evita árvores, tochas e fogueiras perfeitamente sincronizadas.</p>
          </section>
          <section class="anim-block ${separateFrames ? 'hidden' : ''}" id="anim-grid-block">
            <h4>Grade do spritesheet</h4>
            <div class="anim-row"><label>Frame W<input id="anim-grid-w" type="number" min="1" value="${gridW}"></label><label>Frame H<input id="anim-grid-h" type="number" min="1" value="${gridH}"></label></div>
            <div class="anim-row"><label>Margem<input id="anim-margin" type="number" min="0" value="0"></label><label>Espaço<input id="anim-spacing" type="number" min="0" value="0"></label></div>
            <button id="anim-select-row" type="button">Selecionar primeira linha</button>
            <p class="anim-note">Clique em qualquer célula para adicionar/remover um frame da timeline.</p>
          </section>
          <details class="anim-block">
            <summary>Avançado</summary>
            <div class="anim-row"><label>Anchor X<input id="anim-anchor-x" type="number" min="0" max="1" step="0.05" value="0.5"></label><label>Anchor Y<input id="anim-anchor-y" type="number" min="0" max="1" step="0.05" value="1"></label></div>
            <label class="anim-check"><input id="anim-collision" type="checkbox"> Bloquear tile-base na colisão</label>
          </details>
        </aside>
        <main class="anim-stage-wrap">
          <div class="anim-stage-toolbar"><strong>FONTE</strong><span id="anim-source-info"></span><div class="spacer"></div><button id="anim-fit">Enquadrar</button></div>
          <div class="anim-stage" id="anim-stage"><canvas id="anim-stage-canvas"></canvas></div>
        </main>
        <aside class="anim-preview-side">
          <section class="anim-block"><h4>Preview em tempo real</h4><div class="anim-preview-box"><canvas id="anim-preview"></canvas></div><div class="anim-preview-controls"><button id="anim-play">❚❚ Pausar</button><button id="anim-step">▶|</button></div><div id="anim-preview-info" class="anim-preview-info"></div></section>
          <section class="anim-block"><h4>Frame selecionado</h4><label>Duração (ms)<input id="anim-duration" type="number" min="16" max="10000" step="10" placeholder="automática"></label><p class="anim-note">Deixe vazio para usar o FPS geral. Valores diferentes permitem pausas naturais em certos frames.</p></section>
        </aside>
      </div>
      <section class="anim-timeline">
        <div class="anim-timeline-head"><strong>TIMELINE</strong><span id="anim-count"></span><div class="anim-timeline-actions"><button id="anim-reverse">Inverter</button><button id="anim-duplicate">Duplicar</button><button id="anim-delete">Excluir</button><button id="anim-clear">Limpar</button></div></div>
        <div id="anim-strip" class="anim-strip"></div>
      </section>
      <footer class="anim-foot"><span id="anim-message">Arraste os cards da timeline para mudar a ordem.</span><div class="spacer"></div><button id="anim-cancel">Cancelar</button><button id="anim-save" class="primary">Adicionar animação à biblioteca</button></footer>
    </section>`;
  document.body.appendChild(backdrop);

  const stage = backdrop.querySelector<HTMLElement>('#anim-stage')!;
  const canvas = backdrop.querySelector<HTMLCanvasElement>('#anim-stage-canvas')!;
  const ctx = canvas.getContext('2d')!;
  const preview = backdrop.querySelector<HTMLCanvasElement>('#anim-preview')!;
  const previewCtx = preview.getContext('2d')!;
  const strip = backdrop.querySelector<HTMLElement>('#anim-strip')!;
  const message = backdrop.querySelector<HTMLElement>('#anim-message')!;
  const previewInfo = backdrop.querySelector<HTMLElement>('#anim-preview-info')!;
  const durationInput = backdrop.querySelector<HTMLInputElement>('#anim-duration')!;

  const numberInput = (selector: string, fallback: number) => Number(backdrop.querySelector<HTMLInputElement>(selector)?.value) || fallback;
  const animationDefinition = (): MapAnimationDefinition => {
    const playback = backdrop.querySelector<HTMLSelectElement>('#anim-playback')!.value as MapAnimationPlayback;
    const sync = backdrop.querySelector<HTMLSelectElement>('#anim-sync')!.value as MapAnimationSync;
    return {
      frames: frames.map((frame) => ({ ...frame })),
      fps: clamp(numberInput('#anim-fps', 8), 1, 60),
      loop: playback !== 'once',
      playback,
      sync,
    };
  };

  const syncDurationInput = () => {
    const frame = frames[selectedIndex];
    durationInput.disabled = !frame;
    durationInput.value = frame?.durationMs ? String(frame.durationMs) : '';
  };

  const drawFrameInto = (target: CanvasRenderingContext2D, frame: MapAnimationFrame, width: number, height: number) => {
    target.clearRect(0, 0, width, height);
    target.imageSmoothingEnabled = false;
    const scale = Math.min(width / Math.max(1, frame.width), height / Math.max(1, frame.height)) * .86;
    const dw = frame.width * scale, dh = frame.height * scale;
    target.drawImage(sourceImage, frame.x, frame.y, frame.width, frame.height, (width - dw) / 2, (height - dh) / 2, dw, dh);
  };

  const renderTimeline = () => {
    backdrop.querySelector<HTMLElement>('#anim-count')!.textContent = `${frames.length} frame${frames.length === 1 ? '' : 's'}`;
    if (!frames.length) { strip.innerHTML = '<div class="anim-empty">Nenhum frame. Clique nas células do spritesheet para adicioná-las.</div>'; syncDurationInput(); return; }
    strip.innerHTML = frames.map((frame, index) => `<button class="anim-frame ${index === selectedIndex ? 'active' : ''}" draggable="true" data-frame-index="${index}"><canvas width="74" height="58"></canvas><span>#${index + 1} • ${frame.durationMs ? `${frame.durationMs}ms` : 'FPS'}</span></button>`).join('');
    strip.querySelectorAll<HTMLButtonElement>('[data-frame-index]').forEach((button) => {
      const index = Number(button.dataset.frameIndex);
      const frame = frames[index];
      const frameCanvas = button.querySelector<HTMLCanvasElement>('canvas')!;
      drawFrameInto(frameCanvas.getContext('2d')!, frame, frameCanvas.width, frameCanvas.height);
      button.onclick = () => { selectedIndex = index; renderTimeline(); renderStage(); };
      button.ondragstart = () => { dragFrameIndex = index; button.classList.add('dragging'); };
      button.ondragend = () => { dragFrameIndex = -1; button.classList.remove('dragging'); };
      button.ondragover = (event) => event.preventDefault();
      button.ondrop = (event) => {
        event.preventDefault(); const target = index;
        if (dragFrameIndex < 0 || dragFrameIndex === target) return;
        const [moved] = frames.splice(dragFrameIndex, 1); frames.splice(target, 0, moved); selectedIndex = target; dragFrameIndex = -1; renderTimeline(); renderStage(); previewBase = performance.now();
      };
    });
    syncDurationInput();
  };

  const fit = () => {
    const rect = stage.getBoundingClientRect();
    zoom = clamp(Math.min((rect.width - 30) / sourceWidth, (rect.height - 30) / sourceHeight), .08, 12);
    panX = (rect.width - sourceWidth * zoom) / 2; panY = (rect.height - sourceHeight * zoom) / 2; renderStage();
  };

  const renderStage = () => {
    const rect = stage.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr)); canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(sourceImage, panX, panY, sourceWidth * zoom, sourceHeight * zoom);
    if (!separateFrames) {
      const stepX = Math.max(1, gridW + spacing), stepY = Math.max(1, gridH + spacing);
      ctx.strokeStyle = 'rgba(91,190,232,.26)'; ctx.lineWidth = 1;
      for (let x = margin; x <= sourceWidth; x += stepX) { const sx = panX + x * zoom; ctx.beginPath(); ctx.moveTo(sx, panY); ctx.lineTo(sx, panY + sourceHeight * zoom); ctx.stroke(); }
      for (let y = margin; y <= sourceHeight; y += stepY) { const sy = panY + y * zoom; ctx.beginPath(); ctx.moveTo(panX, sy); ctx.lineTo(panX + sourceWidth * zoom, sy); ctx.stroke(); }
    }
    frames.forEach((frame, index) => {
      const x = panX + frame.x * zoom, y = panY + frame.y * zoom, w = frame.width * zoom, h = frame.height * zoom;
      ctx.fillStyle = index === selectedIndex ? 'rgba(88,210,255,.24)' : 'rgba(255,216,104,.12)'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = index === selectedIndex ? '#79ddff' : '#ffd86a'; ctx.lineWidth = index === selectedIndex ? 2 : 1; ctx.strokeRect(x + .5, y + .5, Math.max(0, w - 1), Math.max(0, h - 1));
      if (w > 18 && h > 18) { ctx.fillStyle = '#f4fbff'; ctx.font = '700 10px system-ui'; ctx.fillText(String(index + 1), x + 5, y + 12); }
    });
    ctx.restore();
    backdrop.querySelector<HTMLElement>('#anim-source-info')!.textContent = `${sourceWidth}×${sourceHeight} • zoom ${Math.round(zoom * 100)}%`;
  };

  const pointFromEvent = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left - panX) / zoom, y: (event.clientY - rect.top - panY) / zoom };
  };

  const toggleSheetFrame = (point: { x: number; y: number }) => {
    if (separateFrames) return;
    const stepX = Math.max(1, gridW + spacing), stepY = Math.max(1, gridH + spacing);
    const col = Math.floor((point.x - margin) / stepX), row = Math.floor((point.y - margin) / stepY);
    if (col < 0 || row < 0) return;
    const frame: MapAnimationFrame = { x: margin + col * stepX, y: margin + row * stepY, width: gridW, height: gridH };
    if (frame.x < 0 || frame.y < 0 || frame.x + frame.width > sourceWidth || frame.y + frame.height > sourceHeight) return;
    const key = frameKey(frame), existing = frames.findIndex((value) => frameKey(value) === key);
    if (existing >= 0) { frames.splice(existing, 1); selectedIndex = Math.min(selectedIndex, frames.length - 1); }
    else { frames.push(frame); selectedIndex = frames.length - 1; }
    renderTimeline(); renderStage(); previewBase = performance.now();
  };

  const renderPreview = (time: number) => {
    preview.width = 300; preview.height = 220;
    const animation = animationDefinition();
    const elapsed = playing ? Math.max(0, time - previewBase + frozenPreviewMs) : frozenPreviewMs;
    const frame = activeAnimationFrame(animation, elapsed, 'preview-object');
    if (frame) drawFrameInto(previewCtx, frame, preview.width, preview.height); else previewCtx.clearRect(0, 0, preview.width, preview.height);
    const mode = animation.playback ?? (animation.loop ? 'loop' : 'once');
    previewInfo.innerHTML = `<strong>${frames.length} frames</strong><br>${animation.fps} FPS • ${esc(mode)}<br>${animation.sync === 'random' ? 'Fase diferente por objeto' : 'Sincronização global'}`;
    raf = requestAnimationFrame(renderPreview);
  };

  canvas.onpointerdown = (event) => toggleSheetFrame(pointFromEvent(event));
  canvas.onwheel = (event) => {
    event.preventDefault(); const before = zoom; zoom = clamp(zoom * (event.deltaY < 0 ? 1.14 : .88), .08, 16);
    const rect = canvas.getBoundingClientRect(), mx = event.clientX - rect.left, my = event.clientY - rect.top;
    panX = mx - (mx - panX) * (zoom / before); panY = my - (my - panY) * (zoom / before); renderStage();
  };

  durationInput.onchange = () => {
    const frame = frames[selectedIndex]; if (!frame) return;
    const raw = durationInput.value.trim(); frame.durationMs = raw ? clamp(Number(raw) || 16, 16, 10000) : undefined; renderTimeline(); previewBase = performance.now(); frozenPreviewMs = 0;
  };
  backdrop.querySelector<HTMLSelectElement>('#anim-category')!.onchange = (event) => {
    const category = categoryFor((event.target as HTMLSelectElement).value);
    backdrop.querySelector<HTMLSelectElement>('#anim-sync')!.value = category.palette === 'terrain' ? 'global' : 'random';
  };
  backdrop.querySelector<HTMLSelectElement>('#anim-playback')!.onchange = () => { previewBase = performance.now(); frozenPreviewMs = 0; };
  backdrop.querySelector<HTMLInputElement>('#anim-fps')!.onchange = () => { previewBase = performance.now(); frozenPreviewMs = 0; };
  backdrop.querySelector<HTMLSelectElement>('#anim-sync')!.onchange = () => { previewBase = performance.now(); frozenPreviewMs = 0; };
  backdrop.querySelector<HTMLButtonElement>('#anim-play')!.onclick = (event) => {
    if (playing) { frozenPreviewMs += performance.now() - previewBase; playing = false; (event.currentTarget as HTMLButtonElement).textContent = '▶ Reproduzir'; }
    else { previewBase = performance.now(); playing = true; (event.currentTarget as HTMLButtonElement).textContent = '❚❚ Pausar'; }
  };
  backdrop.querySelector<HTMLButtonElement>('#anim-step')!.onclick = () => {
    playing = false; backdrop.querySelector<HTMLButtonElement>('#anim-play')!.textContent = '▶ Reproduzir';
    const animation = animationDefinition(), frameMs = 1000 / Math.max(1, animation.fps); frozenPreviewMs += frameMs;
  };
  backdrop.querySelector<HTMLButtonElement>('#anim-reverse')!.onclick = () => { frames.reverse(); selectedIndex = selectedIndex < 0 ? -1 : frames.length - 1 - selectedIndex; renderTimeline(); renderStage(); previewBase = performance.now(); };
  backdrop.querySelector<HTMLButtonElement>('#anim-duplicate')!.onclick = () => { const frame = frames[selectedIndex]; if (!frame) return; frames.splice(selectedIndex + 1, 0, { ...frame }); selectedIndex += 1; renderTimeline(); previewBase = performance.now(); };
  backdrop.querySelector<HTMLButtonElement>('#anim-delete')!.onclick = () => { if (selectedIndex < 0) return; frames.splice(selectedIndex, 1); selectedIndex = Math.min(selectedIndex, frames.length - 1); renderTimeline(); renderStage(); previewBase = performance.now(); };
  backdrop.querySelector<HTMLButtonElement>('#anim-clear')!.onclick = () => { frames = []; selectedIndex = -1; renderTimeline(); renderStage(); previewBase = performance.now(); };
  backdrop.querySelector<HTMLButtonElement>('#anim-select-row')?.addEventListener('click', () => {
    frames = []; const step = Math.max(1, gridW + spacing);
    for (let x = margin; x + gridW <= sourceWidth; x += step) frames.push({ x, y: margin, width: gridW, height: gridH });
    selectedIndex = frames.length ? 0 : -1; renderTimeline(); renderStage(); previewBase = performance.now();
  });
  const refreshGrid = () => {
    gridW = Math.max(1, Math.floor(numberInput('#anim-grid-w', gridW))); gridH = Math.max(1, Math.floor(numberInput('#anim-grid-h', gridH)));
    margin = Math.max(0, Math.floor(numberInput('#anim-margin', 0))); spacing = Math.max(0, Math.floor(numberInput('#anim-spacing', 0))); renderStage();
  };
  ['#anim-grid-w', '#anim-grid-h', '#anim-margin', '#anim-spacing'].forEach((selector) => backdrop.querySelector<HTMLInputElement>(selector)?.addEventListener('change', refreshGrid));
  backdrop.querySelector<HTMLButtonElement>('#anim-fit')!.onclick = fit;

  const close = () => {
    cancelAnimationFrame(raf); loaded.forEach((value) => URL.revokeObjectURL(value.url)); backdrop.remove();
  };
  backdrop.querySelector<HTMLButtonElement>('#anim-close')!.onclick = close;
  backdrop.querySelector<HTMLButtonElement>('#anim-cancel')!.onclick = close;

  backdrop.querySelector<HTMLButtonElement>('#anim-save')!.onclick = async () => {
    if (!frames.length) { message.textContent = 'Adicione pelo menos um frame à timeline.'; return; }
    const category = categoryFor(backdrop.querySelector<HTMLSelectElement>('#anim-category')!.value);
    const name = backdrop.querySelector<HTMLInputElement>('#anim-name')!.value.trim() || 'Animação';
    const visualW = clamp(numberInput('#anim-visual-w', 1), .1, 32), visualH = clamp(numberInput('#anim-visual-h', 1), .1, 32);
    const anchorX = clamp(numberInput('#anim-anchor-x', .5), 0, 1), anchorY = clamp(numberInput('#anim-anchor-y', 1), 0, 1);
    const blocks = backdrop.querySelector<HTMLInputElement>('#anim-collision')!.checked;
    const footprint = category.palette === 'terrain' ? undefined : { width: Math.max(1, Math.ceil(visualW)), height: Math.max(1, Math.ceil(visualH)), collision: blocks ? [{ x: 0, y: 0 }] : [] };
    const value: AssetLibraryCreateInput = {
      label: name,
      palette: category.palette,
      folder: category.folder,
      objectKind: category.objectKind,
      color: '#687f91',
      animation: animationDefinition(),
      widthTiles: visualW,
      heightTiles: visualH,
      anchorX,
      anchorY,
      footprint,
      tags: [category.folder, 'animado', separateFrames ? 'frames-separados' : 'spritesheet'],
    };
    const button = backdrop.querySelector<HTMLButtonElement>('#anim-save')!; button.disabled = true; button.textContent = 'Salvando...';
    try {
      const sourceId = await addAssetSource(sourceBlob, sourceName, sourceWidth, sourceHeight);
      const entries = await addAssetsToLibrary(sourceId, [value]); onCreated(entries); close();
    } catch (error) {
      button.disabled = false; button.textContent = 'Adicionar animação à biblioteca'; message.textContent = error instanceof Error ? error.message : 'Falha ao salvar animação.';
    }
  };

  const observer = new ResizeObserver(() => renderStage()); observer.observe(stage);
  fit(); renderTimeline(); raf = requestAnimationFrame(renderPreview);
}
