import './mapTileset.css';
import { createTilesetFromFile, hydrateTilesetsIntoPalette, type TilesetDefinition } from './mapTilesetStore';

const CANDIDATES = [8, 16, 24, 32, 48, 64, 96, 128];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);

function loadImage(file: File) {
  return new Promise<{ image: HTMLImageElement; url: string }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível abrir o tileset.')); };
    image.src = url;
  });
}

function gridScore(size: number, width: number, height: number, preferred?: number) {
  let score = 0;
  if (width % size === 0) score += 40;
  if (height % size === 0) score += 40;
  const cols = width / size, rows = height / size;
  if (cols >= 4 && cols <= 64) score += 10;
  if (rows >= 4 && rows <= 64) score += 10;
  if (preferred === size) score += 22;
  if (size === 32) score += 3;
  return score;
}

export function suggestedTileSizes(width: number, height: number, preferred?: number) {
  return CANDIDATES.map((size) => ({ size, score: gridScore(size, width, height, preferred) }))
    .sort((a, b) => b.score - a.score || Math.abs((preferred ?? 32) - a.size) - Math.abs((preferred ?? 32) - b.size));
}

export async function openTraditionalTilesetImporter(file: File, options: { preferredTileSize?: number; onCreated?: (tileset: TilesetDefinition) => void } = {}) {
  if (!file.type.startsWith('image/')) throw new Error('Escolha uma imagem PNG, WebP ou JPEG.');
  const { image, url } = await loadImage(file);
  const suggestions = suggestedTileSizes(image.naturalWidth, image.naturalHeight, options.preferredTileSize);
  const detected = suggestions[0]?.size ?? options.preferredTileSize ?? 32;

  const modal = document.createElement('div');
  modal.className = 'pro-modal-backdrop';
  modal.innerHTML = `
    <section class="tileset-importer" role="dialog" aria-modal="true">
      <header><div><strong>IMPORTAR TILESET TRADICIONAL</strong><span>${esc(file.name)} • ${image.naturalWidth}×${image.naturalHeight}</span></div><button data-close>×</button></header>
      <div class="tileset-import-body">
        <aside class="tileset-import-controls">
          <label>Nome<input id="tsi-name" value="${esc(file.name.replace(/\.[^.]+$/, ''))}"></label>
          <h4>Grade</h4>
          <div class="tsi-two"><label>Tile W<input id="tsi-w" type="number" min="1" max="512" value="${detected}"></label><label>Tile H<input id="tsi-h" type="number" min="1" max="512" value="${detected}"></label></div>
          <div class="tsi-presets">${CANDIDATES.slice(0,6).map((size) => `<button type="button" data-size="${size}">${size}</button>`).join('')}</div>
          <div class="tsi-two"><label>Margem<input id="tsi-margin" type="number" min="0" value="0"></label><label>Espaço<input id="tsi-spacing" type="number" min="0" value="0"></label></div>
          <div class="tsi-two"><label>Offset X<input id="tsi-offset-x" type="number" min="0" value="0"></label><label>Offset Y<input id="tsi-offset-y" type="number" min="0" value="0"></label></div>
          <h4>Sugestões</h4>
          <div class="tsi-suggestions">${suggestions.slice(0,4).map((item, index) => `<button type="button" data-suggest="${item.size}"><strong>${item.size}×${item.size}</strong><span>${index === 0 ? 'mais provável' : `${item.score} pts`}</span></button>`).join('')}</div>
          <p>Detecção é apenas uma sugestão. Você pode usar qualquer tamanho, inclusive W/H diferentes.</p>
        </aside>
        <main class="tileset-import-stage"><canvas id="tsi-canvas"></canvas></main>
        <aside class="tileset-import-info"><h4>RESULTADO</h4><div id="tsi-summary"></div><p>O PNG é salvo uma única vez. Os tiles apenas referenciam seus recortes, sem duplicar imagens.</p></aside>
      </div>
      <footer><span id="tsi-message">Ajuste a grade até as linhas coincidirem exatamente com o spritesheet.</span><button data-close>Cancelar</button><button id="tsi-create" class="primary">Criar Tileset</button></footer>
    </section>`;
  document.body.appendChild(modal);

  const canvas = modal.querySelector<HTMLCanvasElement>('#tsi-canvas')!;
  const ctx = canvas.getContext('2d')!;
  const stage = canvas.parentElement!;
  const summary = modal.querySelector<HTMLElement>('#tsi-summary')!;
  const message = modal.querySelector<HTMLElement>('#tsi-message')!;
  const number = (id: string, fallback: number) => Math.max(0, Math.floor(Number(modal.querySelector<HTMLInputElement>(id)?.value) || fallback));

  const values = () => ({
    tileWidth: Math.max(1, number('#tsi-w', detected)),
    tileHeight: Math.max(1, number('#tsi-h', detected)),
    margin: number('#tsi-margin', 0),
    spacing: number('#tsi-spacing', 0),
    offsetX: number('#tsi-offset-x', 0),
    offsetY: number('#tsi-offset-y', 0),
  });

  const calculate = () => {
    const v = values();
    const usableW = Math.max(0, image.naturalWidth - v.offsetX - v.margin * 2);
    const usableH = Math.max(0, image.naturalHeight - v.offsetY - v.margin * 2);
    const columns = Math.max(0, Math.floor((usableW + v.spacing) / (v.tileWidth + v.spacing)));
    const rows = Math.max(0, Math.floor((usableH + v.spacing) / (v.tileHeight + v.spacing)));
    return { ...v, columns, rows };
  };

  const render = () => {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr)); canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, rect.width, rect.height); ctx.fillStyle = '#081118'; ctx.fillRect(0, 0, rect.width, rect.height);
    const fit = clamp(Math.min((rect.width - 30) / image.naturalWidth, (rect.height - 30) / image.naturalHeight), .05, 8);
    const ox = (rect.width - image.naturalWidth * fit) / 2, oy = (rect.height - image.naturalHeight * fit) / 2;
    ctx.imageSmoothingEnabled = false; ctx.drawImage(image, ox, oy, image.naturalWidth * fit, image.naturalHeight * fit);
    const grid = calculate();
    ctx.strokeStyle = 'rgba(99,213,255,.62)'; ctx.lineWidth = 1;
    const startX = grid.offsetX + grid.margin, startY = grid.offsetY + grid.margin;
    for (let col = 0; col <= grid.columns; col++) {
      const x = ox + (startX + col * (grid.tileWidth + grid.spacing)) * fit;
      ctx.beginPath(); ctx.moveTo(x, oy + startY * fit); ctx.lineTo(x, oy + (startY + grid.rows * (grid.tileHeight + grid.spacing) - grid.spacing) * fit); ctx.stroke();
    }
    for (let row = 0; row <= grid.rows; row++) {
      const y = oy + (startY + row * (grid.tileHeight + grid.spacing)) * fit;
      ctx.beginPath(); ctx.moveTo(ox + startX * fit, y); ctx.lineTo(ox + (startX + grid.columns * (grid.tileWidth + grid.spacing) - grid.spacing) * fit, y); ctx.stroke();
    }
    summary.innerHTML = `<strong>${grid.columns} × ${grid.rows}</strong><span>${grid.columns * grid.rows} tiles</span><dl><dt>Tile</dt><dd>${grid.tileWidth}×${grid.tileHeight}</dd><dt>Margem</dt><dd>${grid.margin}px</dd><dt>Spacing</dt><dd>${grid.spacing}px</dd><dt>Offset</dt><dd>${grid.offsetX}, ${grid.offsetY}</dd></dl>`;
    message.textContent = grid.columns && grid.rows ? `${grid.columns * grid.rows} tiles serão indexados sem duplicar o PNG.` : 'A grade atual não produz nenhum tile válido.';
  };

  modal.querySelectorAll<HTMLInputElement>('input[type=number]').forEach((input) => input.addEventListener('input', render));
  modal.querySelectorAll<HTMLButtonElement>('[data-size],[data-suggest]').forEach((button) => button.onclick = () => {
    const size = Number(button.dataset.size ?? button.dataset.suggest) || detected;
    modal.querySelector<HTMLInputElement>('#tsi-w')!.value = String(size); modal.querySelector<HTMLInputElement>('#tsi-h')!.value = String(size); render();
  });

  const close = () => { observer.disconnect(); URL.revokeObjectURL(url); modal.remove(); };
  modal.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((button) => button.onclick = close);
  modal.querySelector<HTMLButtonElement>('#tsi-create')!.onclick = async () => {
    const grid = calculate();
    if (!grid.columns || !grid.rows) { message.textContent = 'Corrija a grade antes de criar o Tileset.'; return; }
    const button = modal.querySelector<HTMLButtonElement>('#tsi-create')!; button.disabled = true; button.textContent = 'Salvando…';
    try {
      const tileset = await createTilesetFromFile(file, image.naturalWidth, image.naturalHeight, { name: modal.querySelector<HTMLInputElement>('#tsi-name')!.value.trim(), ...grid });
      await hydrateTilesetsIntoPalette();
      options.onCreated?.(tileset);
      close();
    } catch (error) {
      button.disabled = false; button.textContent = 'Criar Tileset'; message.textContent = error instanceof Error ? error.message : 'Falha ao criar Tileset.';
    }
  };

  const observer = new ResizeObserver(render); observer.observe(stage);
  requestAnimationFrame(render);
}
