import { getMapAssetImage } from './mapAssetRenderer';
import { defaultAssetPreset, getAssetPreset, saveAssetPreset, type AssetHitbox, type MapAssetPreset } from './mapAssetPresets';
import type { MapPaletteEntry } from './mapEditorTypes';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

type PreviewRect = { x: number; y: number; width: number; height: number };

type ConfigureResult = { saved: boolean; preset: MapAssetPreset };

export function openMapAssetConfigurator(entry: MapPaletteEntry): Promise<ConfigureResult> {
  return new Promise((resolve) => {
    let preset = clone(getAssetPreset(entry));
    let dragMode: 'move-rect' | 'resize-rect' | 'move-circle' | 'light' | null = null;
    let dragOffset = { x: 0, y: 0 };
    let previewRect: PreviewRect = { x: 40, y: 30, width: 340, height: 260 };

    const backdrop = document.createElement('div');
    backdrop.className = 'pro-modal-backdrop';
    backdrop.innerHTML = `
      <section class="pro-config-window" role="dialog" aria-modal="true">
        <header class="pro-config-head">
          <div><strong>Configurar objeto</strong><span>${esc(entry.label)}</span></div>
          <button data-close>×</button>
        </header>
        <div class="pro-config-body">
          <div class="pro-config-preview-wrap">
            <canvas id="pro-config-canvas"></canvas>
            <div class="pro-config-hint">Arraste a área vermelha. No modo livre, clique para marcar os pontos.</div>
          </div>
          <div class="pro-config-controls">
            <section>
              <h3>Colisão</h3>
              <label>Formato<select id="pro-hit-type"><option value="none">Sem colisão</option><option value="rectangle">Retângulo</option><option value="circle">Círculo</option><option value="polygon">Forma livre</option></select></label>
              <div class="pro-two" id="pro-hit-size"><label>Largura<input id="pro-hit-w" type="number" min="0.02" max="1" step="0.02"></label><label>Altura<input id="pro-hit-h" type="number" min="0.02" max="1" step="0.02"></label></div>
              <div class="pro-two" id="pro-hit-circle"><label>Raio<input id="pro-hit-radius" type="number" min="0.02" max="0.7" step="0.02"></label><button id="pro-center-hit" type="button">Centralizar</button></div>
              <button id="pro-clear-points" type="button">Limpar pontos da forma livre</button>
            </section>
            <section>
              <h3>Tamanho padrão</h3>
              <div class="pro-scale-mode"><label><input type="radio" name="scale-mode" value="set"> Usar tamanho do conjunto</label><label><input type="radio" name="scale-mode" value="custom"> Tamanho próprio</label></div>
              <label>Escala<input id="pro-scale" type="number" min="0.1" max="10" step="0.1"></label>
              <label class="pro-check"><input id="pro-shadow" type="checkbox"> Sombra automática</label>
            </section>
            <section>
              <h3>Luz</h3>
              <label class="pro-check"><input id="pro-light" type="checkbox"> Este objeto produz luz</label>
              <div class="pro-two"><label>Alcance<input id="pro-light-radius" type="number" min="0.2" max="12" step="0.1"></label><label>Força<input id="pro-light-intensity" type="number" min="0.1" max="2" step="0.1"></label></div>
              <p>Quando a luz estiver ligada, arraste o ponto amarelo no preview.</p>
            </section>
            <section>
              <h3>Objeto extensível</h3>
              <label class="pro-check"><input id="pro-stretch" type="checkbox"> Permitir aumentar sem deformar as pontas</label>
              <div class="pro-two"><label>Direção<select id="pro-stretch-axis"><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></label><label>Pontas<input id="pro-stretch-cap" type="number" min="0.05" max="0.45" step="0.05"></label></div>
              <p>Útil para paredes, cercas, pontes, faixas e peças compridas.</p>
            </section>
          </div>
        </div>
        <footer class="pro-config-footer"><button id="pro-reset" type="button">Restaurar</button><span></span><button data-close type="button">Cancelar</button><button id="pro-save-config" class="primary" type="button">Salvar configuração</button></footer>
      </section>`;
    document.body.appendChild(backdrop);

    const canvas = backdrop.querySelector<HTMLCanvasElement>('#pro-config-canvas')!;
    const ctx = canvas.getContext('2d')!;
    const hitType = backdrop.querySelector<HTMLSelectElement>('#pro-hit-type')!;
    const hitW = backdrop.querySelector<HTMLInputElement>('#pro-hit-w')!;
    const hitH = backdrop.querySelector<HTMLInputElement>('#pro-hit-h')!;
    const hitRadius = backdrop.querySelector<HTMLInputElement>('#pro-hit-radius')!;
    const scale = backdrop.querySelector<HTMLInputElement>('#pro-scale')!;
    const shadow = backdrop.querySelector<HTMLInputElement>('#pro-shadow')!;
    const light = backdrop.querySelector<HTMLInputElement>('#pro-light')!;
    const lightRadius = backdrop.querySelector<HTMLInputElement>('#pro-light-radius')!;
    const lightIntensity = backdrop.querySelector<HTMLInputElement>('#pro-light-intensity')!;
    const stretch = backdrop.querySelector<HTMLInputElement>('#pro-stretch')!;
    const stretchAxis = backdrop.querySelector<HTMLSelectElement>('#pro-stretch-axis')!;
    const stretchCap = backdrop.querySelector<HTMLInputElement>('#pro-stretch-cap')!;

    const close = (saved: boolean) => {
      backdrop.remove();
      resolve({ saved, preset: clone(preset) });
    };

    const sourceAspect = () => {
      const image = getMapAssetImage(entry, render);
      const source = entry.sprite?.sourceRect;
      const width = source?.width ?? image?.naturalWidth ?? 1;
      const height = source?.height ?? image?.naturalHeight ?? 1;
      return Math.max(.05, width / Math.max(1, height));
    };

    const normalizedPoint = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / Math.max(1, rect.width);
      const scaleY = canvas.height / Math.max(1, rect.height);
      const x = (event.clientX - rect.left) * scaleX;
      const y = (event.clientY - rect.top) * scaleY;
      return {
        x: clamp((x - previewRect.x) / previewRect.width, 0, 1),
        y: clamp((y - previewRect.y) / previewRect.height, 0, 1),
      };
    };

    const ensureHitbox = (type: string) => {
      if (type === 'none') { preset.hitbox = null; return; }
      if (type === 'rectangle' && preset.hitbox?.type !== 'rectangle') preset.hitbox = { type: 'rectangle', x: .18, y: .55, width: .64, height: .38 };
      if (type === 'circle' && preset.hitbox?.type !== 'circle') preset.hitbox = { type: 'circle', x: .5, y: .75, radius: .2 };
      if (type === 'polygon' && preset.hitbox?.type !== 'polygon') preset.hitbox = { type: 'polygon', points: [{ x: .2, y: .82 }, { x: .35, y: .58 }, { x: .68, y: .58 }, { x: .82, y: .82 }] };
    };

    const syncInputs = () => {
      hitType.value = preset.hitbox?.type ?? 'none';
      const rect = preset.hitbox?.type === 'rectangle' ? preset.hitbox : null;
      hitW.value = String(rect?.width ?? .64);
      hitH.value = String(rect?.height ?? .38);
      const circle = preset.hitbox?.type === 'circle' ? preset.hitbox : null;
      hitRadius.value = String(circle?.radius ?? .2);
      scale.value = String(preset.scale);
      shadow.checked = preset.shadow;
      light.checked = preset.light.enabled;
      lightRadius.value = String(preset.light.radius);
      lightIntensity.value = String(preset.light.intensity);
      stretch.checked = preset.stretch.enabled;
      stretchAxis.value = preset.stretch.axis;
      stretchCap.value = String(preset.stretch.cap);
      backdrop.querySelectorAll<HTMLInputElement>('input[name="scale-mode"]').forEach((node) => { node.checked = node.value === preset.scaleMode; });
      backdrop.querySelector<HTMLElement>('#pro-hit-size')!.classList.toggle('hidden', preset.hitbox?.type !== 'rectangle');
      backdrop.querySelector<HTMLElement>('#pro-hit-circle')!.classList.toggle('hidden', preset.hitbox?.type !== 'circle');
      backdrop.querySelector<HTMLButtonElement>('#pro-clear-points')!.classList.toggle('hidden', preset.hitbox?.type !== 'polygon');
      render();
    };

    function drawSource() {
      const image = getMapAssetImage(entry, render);
      const aspect = sourceAspect();
      const maxW = canvas.width - 80, maxH = canvas.height - 70;
      let width = maxW, height = width / aspect;
      if (height > maxH) { height = maxH; width = height * aspect; }
      previewRect = { x: (canvas.width - width) / 2, y: (canvas.height - height) / 2 - 8, width, height };
      if (image?.complete && image.naturalWidth > 0) {
        const source = entry.sprite?.sourceRect;
        ctx.imageSmoothingEnabled = !entry.sprite?.pixelated;
        if (source) ctx.drawImage(image, source.x, source.y, source.width, source.height, previewRect.x, previewRect.y, previewRect.width, previewRect.height);
        else ctx.drawImage(image, previewRect.x, previewRect.y, previewRect.width, previewRect.height);
      } else {
        ctx.fillStyle = entry.color || '#63809a';
        ctx.fillRect(previewRect.x, previewRect.y, previewRect.width, previewRect.height);
      }
    }

    function render() {
      const shell = canvas.parentElement!;
      const rect = shell.getBoundingClientRect();
      const dpr = Math.min(2, devicePixelRatio || 1);
      const width = Math.max(420, Math.floor(rect.width * dpr));
      const height = Math.max(320, Math.floor(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#111923'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#182431';
      for (let y = 0; y < canvas.height; y += 24) for (let x = 0; x < canvas.width; x += 24) if (((x / 24 + y / 24) & 1) === 0) ctx.fillRect(x, y, 24, 24);
      drawSource();

      if (preset.shadow) {
        ctx.fillStyle = 'rgba(0,0,0,.3)';
        ctx.beginPath(); ctx.ellipse(previewRect.x + previewRect.width / 2, previewRect.y + previewRect.height * .94, previewRect.width * .27, Math.max(5, previewRect.height * .045), 0, 0, Math.PI * 2); ctx.fill();
      }

      const hitbox = preset.hitbox;
      if (hitbox) {
        ctx.fillStyle = 'rgba(70,123,255,.19)'; ctx.strokeStyle = '#6090ff'; ctx.lineWidth = 3;
        if (hitbox.type === 'rectangle') {
          const x = previewRect.x + hitbox.x * previewRect.width, y = previewRect.y + hitbox.y * previewRect.height, w = hitbox.width * previewRect.width, h = hitbox.height * previewRect.height;
          ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
          ctx.fillStyle = '#fff'; ctx.fillRect(x + w - 7, y + h - 7, 14, 14);
        } else if (hitbox.type === 'circle') {
          ctx.beginPath(); ctx.arc(previewRect.x + hitbox.x * previewRect.width, previewRect.y + hitbox.y * previewRect.height, hitbox.radius * Math.min(previewRect.width, previewRect.height), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        } else if (hitbox.points.length) {
          ctx.beginPath(); hitbox.points.forEach((point, index) => { const x = previewRect.x + point.x * previewRect.width, y = previewRect.y + point.y * previewRect.height; if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); if (hitbox.points.length >= 3) ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#fff'; hitbox.points.forEach((point) => { ctx.beginPath(); ctx.arc(previewRect.x + point.x * previewRect.width, previewRect.y + point.y * previewRect.height, 5, 0, Math.PI * 2); ctx.fill(); });
        }
      }

      if (preset.light.enabled) {
        const lx = previewRect.x + preset.light.x * previewRect.width, ly = previewRect.y + preset.light.y * previewRect.height;
        ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(lx, ly, Math.max(12, preset.light.radius * 20), 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ffe48a'; ctx.beginPath(); ctx.arc(lx, ly, 7, 0, Math.PI * 2); ctx.fill();
      }
    }

    hitType.onchange = () => { ensureHitbox(hitType.value); syncInputs(); };
    hitW.oninput = () => { if (preset.hitbox?.type === 'rectangle') preset.hitbox.width = clamp(Number(hitW.value) || .1, .02, 1 - preset.hitbox.x); render(); };
    hitH.oninput = () => { if (preset.hitbox?.type === 'rectangle') preset.hitbox.height = clamp(Number(hitH.value) || .1, .02, 1 - preset.hitbox.y); render(); };
    hitRadius.oninput = () => { if (preset.hitbox?.type === 'circle') preset.hitbox.radius = clamp(Number(hitRadius.value) || .1, .02, .7); render(); };
    scale.oninput = () => { preset.scale = clamp(Number(scale.value) || 1, .1, 10); };
    shadow.onchange = () => { preset.shadow = shadow.checked; render(); };
    light.onchange = () => { preset.light.enabled = light.checked; render(); };
    lightRadius.oninput = () => { preset.light.radius = clamp(Number(lightRadius.value) || 1, .2, 12); render(); };
    lightIntensity.oninput = () => { preset.light.intensity = clamp(Number(lightIntensity.value) || .7, .1, 2); };
    stretch.onchange = () => { preset.stretch.enabled = stretch.checked; };
    stretchAxis.onchange = () => { preset.stretch.axis = stretchAxis.value === 'vertical' ? 'vertical' : 'horizontal'; };
    stretchCap.oninput = () => { preset.stretch.cap = clamp(Number(stretchCap.value) || .2, .05, .45); };
    backdrop.querySelectorAll<HTMLInputElement>('input[name="scale-mode"]').forEach((node) => node.onchange = () => { if (node.checked) preset.scaleMode = node.value === 'custom' ? 'custom' : 'set'; });
    backdrop.querySelector<HTMLButtonElement>('#pro-center-hit')!.onclick = () => { if (preset.hitbox?.type === 'circle') { preset.hitbox.x = .5; preset.hitbox.y = .72; render(); } };
    backdrop.querySelector<HTMLButtonElement>('#pro-clear-points')!.onclick = () => { if (preset.hitbox?.type === 'polygon') { preset.hitbox.points = []; render(); } };
    backdrop.querySelector<HTMLButtonElement>('#pro-reset')!.onclick = () => { preset = defaultAssetPreset(entry); syncInputs(); };

    canvas.onpointerdown = (event) => {
      const point = normalizedPoint(event);
      const hitbox = preset.hitbox;
      if (preset.light.enabled) {
        const dx = point.x - preset.light.x, dy = point.y - preset.light.y;
        if (Math.hypot(dx, dy) < .08) { dragMode = 'light'; canvas.setPointerCapture(event.pointerId); return; }
      }
      if (!hitbox) return;
      if (hitbox.type === 'polygon') { hitbox.points.push(point); render(); return; }
      if (hitbox.type === 'circle') { dragMode = 'move-circle'; dragOffset = { x: point.x - hitbox.x, y: point.y - hitbox.y }; canvas.setPointerCapture(event.pointerId); return; }
      const nearHandle = Math.hypot(point.x - (hitbox.x + hitbox.width), point.y - (hitbox.y + hitbox.height)) < .08;
      dragMode = nearHandle ? 'resize-rect' : 'move-rect';
      dragOffset = { x: point.x - hitbox.x, y: point.y - hitbox.y };
      canvas.setPointerCapture(event.pointerId);
    };
    canvas.onpointermove = (event) => {
      if (!dragMode) return;
      const point = normalizedPoint(event);
      if (dragMode === 'light') { preset.light.x = point.x; preset.light.y = point.y; render(); return; }
      if (preset.hitbox?.type === 'circle' && dragMode === 'move-circle') { preset.hitbox.x = point.x; preset.hitbox.y = point.y; render(); return; }
      if (preset.hitbox?.type !== 'rectangle') return;
      if (dragMode === 'move-rect') {
        preset.hitbox.x = clamp(point.x - dragOffset.x, 0, 1 - preset.hitbox.width);
        preset.hitbox.y = clamp(point.y - dragOffset.y, 0, 1 - preset.hitbox.height);
      } else if (dragMode === 'resize-rect') {
        preset.hitbox.width = clamp(point.x - preset.hitbox.x, .02, 1 - preset.hitbox.x);
        preset.hitbox.height = clamp(point.y - preset.hitbox.y, .02, 1 - preset.hitbox.y);
        hitW.value = preset.hitbox.width.toFixed(2); hitH.value = preset.hitbox.height.toFixed(2);
      }
      render();
    };
    const stopDrag = () => { dragMode = null; };
    canvas.onpointerup = stopDrag; canvas.onpointercancel = stopDrag;

    backdrop.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((button) => button.onclick = () => close(false));
    backdrop.querySelector<HTMLButtonElement>('#pro-save-config')!.onclick = () => { saveAssetPreset(entry.id, preset); close(true); };
    backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(false); });
    new ResizeObserver(render).observe(canvas.parentElement!);
    syncInputs();
  });
}
