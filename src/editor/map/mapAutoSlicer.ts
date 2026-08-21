import { addAssetSource, addAssetsToLibrary, type AssetLibraryCreateInput } from './mapAssetLibraryV2';
import type { MapAssetFolder, MapObject, MapPaletteEntry, MapPaletteId, MapSpriteRect } from './mapEditorTypes';

type DetectedRect = MapSpriteRect & { area: number; selected: boolean };
type Category = { folder: MapAssetFolder; label: string; palette: MapPaletteId; objectKind?: MapObject['kind'] };

const CATEGORIES: Category[] = [
  { folder: 'nature', label: 'Natureza', palette: 'doodad', objectKind: 'doodad' },
  { folder: 'buildings', label: 'Construções', palette: 'doodad', objectKind: 'doodad' },
  { folder: 'walls', label: 'Paredes', palette: 'doodad', objectKind: 'doodad' },
  { folder: 'furniture', label: 'Móveis', palette: 'doodad', objectKind: 'doodad' },
  { folder: 'props', label: 'Props', palette: 'doodad', objectKind: 'doodad' },
  { folder: 'npc', label: 'NPC', palette: 'npc', objectKind: 'npc' },
  { folder: 'monster', label: 'Monstro', palette: 'monster', objectKind: 'monster' },
  { folder: 'resource', label: 'Recurso', palette: 'resource', objectKind: 'resource' },
  { folder: 'portal', label: 'Portal', palette: 'portal', objectKind: 'portal' },
  { folder: 'terrain', label: 'Terreno', palette: 'terrain' },
  { folder: 'raw', label: 'Outros', palette: 'raw', objectKind: 'raw' },
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);

function loadImage(file: File) {
  return new Promise<{ image: HTMLImageElement; url: string }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível abrir a imagem.')); };
    image.src = url;
  });
}

function detectRects(image: HTMLImageElement, minimum = 14, tolerance = 28) {
  const maxDimension = 1400;
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  const cornerSamples = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
  const cornerColors = cornerSamples.map(([x, y]) => { const index = (y * width + x) * 4; return [data[index], data[index + 1], data[index + 2], data[index + 3]]; });
  const transparentBackground = cornerColors.filter((value) => value[3] < 24).length >= 2;
  const background = cornerColors.reduce((sum, value) => [sum[0] + value[0], sum[1] + value[1], sum[2] + value[2]], [0, 0, 0]).map((value) => value / cornerColors.length);
  const isContent = (index: number) => {
    const alpha = data[index + 3];
    if (alpha < 20) return false;
    if (transparentBackground) return alpha >= 20;
    const dr = data[index] - background[0], dg = data[index + 1] - background[1], db = data[index + 2] - background[2];
    return Math.sqrt(dr * dr + dg * dg + db * db) > tolerance;
  };

  const visited = new Uint8Array(width * height);
  const rects: DetectedRect[] = [];
  const stackX = new Int32Array(width * height);
  const stackY = new Int32Array(width * height);
  for (let sy = 0; sy < height; sy++) {
    for (let sx = 0; sx < width; sx++) {
      const startIndex = sy * width + sx;
      if (visited[startIndex] || !isContent(startIndex * 4)) continue;
      let size = 0, head = 0, tail = 0, minX = sx, maxX = sx, minY = sy, maxY = sy;
      stackX[tail] = sx; stackY[tail] = sy; tail += 1; visited[startIndex] = 1;
      while (head < tail) {
        const x = stackX[head], y = stackY[head]; head += 1; size += 1;
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
        const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const index = ny * width + nx;
          if (visited[index] || !isContent(index * 4)) continue;
          visited[index] = 1; stackX[tail] = nx; stackY[tail] = ny; tail += 1;
        }
      }
      const boxW = maxX - minX + 1, boxH = maxY - minY + 1;
      if (size < minimum * minimum * .14 || boxW < minimum || boxH < minimum) continue;
      const pad = Math.max(1, Math.round(2 * scale));
      const x = clamp(minX - pad, 0, width - 1), y = clamp(minY - pad, 0, height - 1);
      const right = clamp(maxX + pad, 0, width - 1), bottom = clamp(maxY + pad, 0, height - 1);
      rects.push({
        x: Math.round(x / scale), y: Math.round(y / scale),
        width: Math.max(1, Math.round((right - x + 1) / scale)), height: Math.max(1, Math.round((bottom - y + 1) / scale)),
        area: size / (scale * scale), selected: true,
      });
    }
  }
  return rects.sort((a, b) => a.y - b.y || a.x - b.x).slice(0, 250);
}

export async function openAutoObjectSlicer(file: File, onCreated: (entries: MapPaletteEntry[]) => void) {
  const { image, url } = await loadImage(file);
  let minimum = 14;
  let tolerance = 28;
  let rects = detectRects(image, minimum, tolerance);
  let selectedIndex = rects.length ? 0 : -1;

  const modal = document.createElement('div');
  modal.className = 'pro-modal-backdrop';
  modal.innerHTML = `
    <section class="pro-slicer-window">
      <header class="pro-config-head"><div><strong>Separar objetos automaticamente</strong><span>${esc(file.name)} • ${image.naturalWidth}×${image.naturalHeight}</span></div><button data-close>×</button></header>
      <div class="pro-slicer-body">
        <aside class="pro-slicer-controls">
          <h3>Detecção</h3>
          <label>Tamanho mínimo<input id="pro-detect-min" type="number" min="4" max="256" value="14"></label>
          <label>Separação do fundo<input id="pro-detect-tolerance" type="range" min="5" max="120" value="28"></label>
          <button id="pro-redetect">Detectar novamente</button>
          <div class="pro-detected-count" id="pro-detected-count"></div>
          <div class="pro-two"><button id="pro-select-all">Marcar todos</button><button id="pro-select-none">Desmarcar</button></div>
          <hr>
          <h3>Como salvar</h3>
          <label>Categoria<select id="pro-detect-category">${CATEGORIES.map((value) => `<option value="${value.folder}">${value.label}</option>`).join('')}</select></label>
          <label>Nome base<input id="pro-detect-name" value="${esc(file.name.replace(/\.[^.]+$/, ''))}"></label>
          <p>Cada área marcada vira um objeto separado na biblioteca. Depois você pode configurar colisão, luz, sombra e tamanho uma única vez.</p>
        </aside>
        <main class="pro-slicer-stage"><canvas id="pro-slicer-canvas"></canvas></main>
        <aside class="pro-slicer-list"><strong>Objetos encontrados</strong><div id="pro-detected-list"></div></aside>
      </div>
      <footer class="pro-config-footer"><span id="pro-detect-message">Clique nas caixas para marcar ou desmarcar.</span><span></span><button data-close>Cancelar</button><button id="pro-create-detected" class="primary">Criar objetos marcados</button></footer>
    </section>`;
  document.body.appendChild(modal);

  const canvas = modal.querySelector<HTMLCanvasElement>('#pro-slicer-canvas')!;
  const ctx = canvas.getContext('2d')!;
  const list = modal.querySelector<HTMLElement>('#pro-detected-list')!;
  const count = modal.querySelector<HTMLElement>('#pro-detected-count')!;
  const stage = canvas.parentElement!;
  let drawScale = 1, drawX = 0, drawY = 0;

  const renderList = () => {
    count.textContent = `${rects.filter((value) => value.selected).length} de ${rects.length} marcados`;
    list.innerHTML = rects.map((rect, index) => `<button data-detected="${index}" class="${rect.selected ? 'selected' : ''} ${selectedIndex === index ? 'active' : ''}"><span>${rect.selected ? '✓' : '○'}</span><b>Objeto ${index + 1}</b><small>${rect.width}×${rect.height}</small></button>`).join('') || '<p>Nenhum objeto separado foi encontrado. Tente diminuir o tamanho mínimo ou ajustar a separação do fundo.</p>';
    list.querySelectorAll<HTMLButtonElement>('[data-detected]').forEach((button) => button.onclick = () => { const index = Number(button.dataset.detected); if (!rects[index]) return; selectedIndex = index; rects[index].selected = !rects[index].selected; renderList(); render(); });
  };

  const render = () => {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr)); canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, rect.width, rect.height); ctx.fillStyle = '#0d141d'; ctx.fillRect(0, 0, rect.width, rect.height);
    drawScale = Math.min((rect.width - 36) / image.naturalWidth, (rect.height - 36) / image.naturalHeight);
    drawScale = Math.max(.05, drawScale);
    drawX = (rect.width - image.naturalWidth * drawScale) / 2; drawY = (rect.height - image.naturalHeight * drawScale) / 2;
    ctx.imageSmoothingEnabled = false; ctx.drawImage(image, drawX, drawY, image.naturalWidth * drawScale, image.naturalHeight * drawScale);
    rects.forEach((box, index) => {
      const x = drawX + box.x * drawScale, y = drawY + box.y * drawScale, w = box.width * drawScale, h = box.height * drawScale;
      ctx.fillStyle = box.selected ? 'rgba(75,190,255,.12)' : 'rgba(0,0,0,.26)'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = selectedIndex === index ? '#fff39a' : box.selected ? '#71d2ff' : 'rgba(255,255,255,.38)'; ctx.lineWidth = selectedIndex === index ? 2.5 : 1.2; ctx.strokeRect(x, y, w, h);
      if (w > 24 && h > 20) { ctx.fillStyle = 'rgba(4,12,18,.78)'; ctx.fillRect(x + 2, y + 2, 24, 17); ctx.fillStyle = '#fff'; ctx.font = '11px system-ui'; ctx.fillText(String(index + 1), x + 7, y + 14); }
    });
  };

  canvas.onclick = (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left - drawX) / drawScale, y = (event.clientY - rect.top - drawY) / drawScale;
    const index = rects.findIndex((box) => x >= box.x && y >= box.y && x <= box.x + box.width && y <= box.y + box.height);
    if (index < 0) return; selectedIndex = index; rects[index].selected = !rects[index].selected; renderList(); render();
  };

  modal.querySelector<HTMLButtonElement>('#pro-redetect')!.onclick = () => {
    minimum = Number(modal.querySelector<HTMLInputElement>('#pro-detect-min')!.value) || 14;
    tolerance = Number(modal.querySelector<HTMLInputElement>('#pro-detect-tolerance')!.value) || 28;
    rects = detectRects(image, minimum, tolerance); selectedIndex = rects.length ? 0 : -1; renderList(); render();
  };
  modal.querySelector<HTMLButtonElement>('#pro-select-all')!.onclick = () => { rects.forEach((value) => value.selected = true); renderList(); render(); };
  modal.querySelector<HTMLButtonElement>('#pro-select-none')!.onclick = () => { rects.forEach((value) => value.selected = false); renderList(); render(); };
  modal.querySelector<HTMLButtonElement>('#pro-create-detected')!.onclick = async () => {
    const chosen = rects.filter((value) => value.selected);
    if (!chosen.length) { modal.querySelector<HTMLElement>('#pro-detect-message')!.textContent = 'Marque pelo menos um objeto.'; return; }
    const folder = modal.querySelector<HTMLSelectElement>('#pro-detect-category')!.value as MapAssetFolder;
    const category = CATEGORIES.find((value) => value.folder === folder) ?? CATEGORIES[0];
    const baseName = modal.querySelector<HTMLInputElement>('#pro-detect-name')!.value.trim() || 'Objeto';
    const button = modal.querySelector<HTMLButtonElement>('#pro-create-detected')!; button.disabled = true; button.textContent = 'Criando…';
    try {
      const sourceId = await addAssetSource(file, file.name, image.naturalWidth, image.naturalHeight);
      const values: AssetLibraryCreateInput[] = chosen.map((box, index) => ({
        label: `${baseName} ${String(index + 1).padStart(2, '0')}`,
        palette: category.palette, folder: category.folder, objectKind: category.objectKind,
        color: '#61788b', sourceRect: { x: box.x, y: box.y, width: box.width, height: box.height },
        widthTiles: Math.max(.5, Math.round((box.width / 32) * 2) / 2), heightTiles: Math.max(.5, Math.round((box.height / 32) * 2) / 2),
        anchorX: .5, anchorY: 1, tags: ['auto-detect', file.name],
      }));
      const entries = await addAssetsToLibrary(sourceId, values); onCreated(entries); modal.remove(); URL.revokeObjectURL(url);
    } catch (error) {
      button.disabled = false; button.textContent = 'Criar objetos marcados';
      modal.querySelector<HTMLElement>('#pro-detect-message')!.textContent = error instanceof Error ? error.message : 'Falha ao criar objetos.';
    }
  };

  const close = () => { modal.remove(); URL.revokeObjectURL(url); };
  modal.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((button) => button.onclick = close);
  new ResizeObserver(render).observe(stage);
  renderList(); render();
}
