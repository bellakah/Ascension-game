import { getMapAssetImage } from './mapAssetRenderer';
import {
  circleHitboxRadii,
  defaultAssetPreset,
  getAssetPreset,
  saveAssetPreset,
  type AssetHitboxCircle,
  type MapAssetPreset,
} from './mapAssetPresets';
import type { MapPaletteEntry } from './mapEditorTypes';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

type PreviewRect = { x: number; y: number; width: number; height: number };
type NormalPoint = { x: number; y: number };
type ConfigureResult = { saved: boolean; preset: MapAssetPreset };
type DragMode =
  | 'move-rect'
  | 'resize-rect'
  | 'move-ellipse'
  | 'resize-ellipse-x'
  | 'resize-ellipse-y'
  | 'move-polygon-point'
  | 'light'
  | null;

export function openMapAssetConfigurator(entry: MapPaletteEntry): Promise<ConfigureResult> {
  return new Promise((resolve) => {
    let preset = clone(getAssetPreset(entry));
    let dragMode: DragMode = null;
    let dragOffset = { x: 0, y: 0 };
    let previewRect: PreviewRect = { x: 40, y: 30, width: 340, height: 260 };
    let polygonDragIndex = -1;
    let polygonSelectedIndex = -1;
    let polygonHoverIndex = -1;

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
            <div class="pro-config-hint">Oval: arraste o centro ou os pontos brancos. Forma livre: arraste pontos; clique numa linha para adicionar; clique direito para remover.</div>
          </div>
          <div class="pro-config-controls">
            <section>
              <h3>Camada do personagem</h3>
              <label>Comportamento<select id="pro-depth-mode"><option value="ground">No chão — personagem sempre por cima</option><option value="auto">Automática — passa na frente ou atrás</option><option value="foreground">Sempre na frente — objeto cobre o personagem</option></select></label>
              <p>Escolha como este tipo de objeto deve aparecer em relação ao personagem. Isso não altera a colisão.</p>
            </section>
            <section>
              <h3>Colisão</h3>
              <label>Formato<select id="pro-hit-type"><option value="none">Sem colisão</option><option value="rectangle">Retângulo</option><option value="circle">Círculo / oval</option><option value="polygon">Forma livre</option></select></label>
              <div class="pro-two" id="pro-hit-size"><label>Largura<input id="pro-hit-w" type="number" min="0.02" max="1" step="0.02"></label><label>Altura<input id="pro-hit-h" type="number" min="0.02" max="1" step="0.02"></label></div>
              <div id="pro-hit-circle">
                <div class="pro-two"><label>Largura<input id="pro-ellipse-w" type="number" min="0.04" max="1" step="0.02"></label><label>Altura<input id="pro-ellipse-h" type="number" min="0.04" max="1" step="0.02"></label></div>
                <button id="pro-center-hit" type="button">Centralizar</button>
              </div>
              <div id="pro-hit-polygon-actions" class="pro-two">
                <button id="pro-undo-point" type="button">Desfazer último ponto</button>
                <button id="pro-clear-points" type="button">Limpar forma</button>
              </div>
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
    const depthMode = backdrop.querySelector<HTMLSelectElement>('#pro-depth-mode')!;
    const hitType = backdrop.querySelector<HTMLSelectElement>('#pro-hit-type')!;
    const hitW = backdrop.querySelector<HTMLInputElement>('#pro-hit-w')!;
    const hitH = backdrop.querySelector<HTMLInputElement>('#pro-hit-h')!;
    const ellipseW = backdrop.querySelector<HTMLInputElement>('#pro-ellipse-w')!;
    const ellipseH = backdrop.querySelector<HTMLInputElement>('#pro-ellipse-h')!;
    const scale = backdrop.querySelector<HTMLInputElement>('#pro-scale')!;
    const shadow = backdrop.querySelector<HTMLInputElement>('#pro-shadow')!;
    const light = backdrop.querySelector<HTMLInputElement>('#pro-light')!;
    const lightRadius = backdrop.querySelector<HTMLInputElement>('#pro-light-radius')!;
    const lightIntensity = backdrop.querySelector<HTMLInputElement>('#pro-light-intensity')!;
    const stretch = backdrop.querySelector<HTMLInputElement>('#pro-stretch')!;
    const stretchAxis = backdrop.querySelector<HTMLSelectElement>('#pro-stretch-axis')!;
    const stretchCap = backdrop.querySelector<HTMLInputElement>('#pro-stretch-cap')!;

    const close = (saved: boolean) => {
      window.removeEventListener('keydown', onKeyDown);
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

    const normalizedPoint = (event: PointerEvent | MouseEvent): NormalPoint => {
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

    const pixelDistance = (a: NormalPoint, b: NormalPoint) => Math.hypot(
      (a.x - b.x) * previewRect.width,
      (a.y - b.y) * previewRect.height,
    );

    const nearestPolygonPoint = (point: NormalPoint, threshold = 14) => {
      if (preset.hitbox?.type !== 'polygon') return -1;
      let best = -1, bestDistance = threshold;
      preset.hitbox.points.forEach((candidate, index) => {
        const distance = pixelDistance(point, candidate);
        if (distance <= bestDistance) { best = index; bestDistance = distance; }
      });
      return best;
    };

    const nearestPolygonEdge = (point: NormalPoint, threshold = 10) => {
      if (preset.hitbox?.type !== 'polygon' || preset.hitbox.points.length < 2) return null;
      let best: { index: number; point: NormalPoint; distance: number } | null = null;
      const px = point.x * previewRect.width, py = point.y * previewRect.height;
      preset.hitbox.points.forEach((a, index) => {
        const b = preset.hitbox!.type === 'polygon' ? preset.hitbox.points[(index + 1) % preset.hitbox.points.length] : a;
        const ax = a.x * previewRect.width, ay = a.y * previewRect.height;
        const bx = b.x * previewRect.width, by = b.y * previewRect.height;
        const vx = bx - ax, vy = by - ay;
        const lengthSq = vx * vx + vy * vy;
        const t = lengthSq <= 1e-9 ? 0 : clamp(((px - ax) * vx + (py - ay) * vy) / lengthSq, 0, 1);
        const projected = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        const distance = pixelDistance(point, projected);
        if (distance <= threshold && (!best || distance < best.distance)) best = { index, point: projected, distance };
      });
      return best;
    };

    const ensureEllipseRadii = (hitbox: AssetHitboxCircle) => {
      const radii = circleHitboxRadii(hitbox);
      hitbox.radiusX = radii.radiusX;
      hitbox.radiusY = radii.radiusY;
      delete hitbox.radius;
      return radii;
    };

    const ensureHitbox = (type: string) => {
      polygonDragIndex = -1; polygonSelectedIndex = -1; polygonHoverIndex = -1;
      if (type === 'none') { preset.hitbox = null; return; }
      if (type === 'rectangle' && preset.hitbox?.type !== 'rectangle') preset.hitbox = { type: 'rectangle', x: .18, y: .55, width: .64, height: .38 };
      if (type === 'circle') {
        if (preset.hitbox?.type !== 'circle') preset.hitbox = { type: 'circle', x: .5, y: .72, radiusX: .28, radiusY: .16 };
        else ensureEllipseRadii(preset.hitbox);
      }
      if (type === 'polygon' && preset.hitbox?.type !== 'polygon') preset.hitbox = { type: 'polygon', points: [{ x: .2, y: .82 }, { x: .35, y: .58 }, { x: .68, y: .58 }, { x: .82, y: .82 }] };
    };

    const syncInputs = () => {
      depthMode.value = preset.depthMode ?? 'auto';
      hitType.value = preset.hitbox?.type ?? 'none';
      const rect = preset.hitbox?.type === 'rectangle' ? preset.hitbox : null;
      hitW.value = String(rect?.width ?? .64);
      hitH.value = String(rect?.height ?? .38);
      const circle = preset.hitbox?.type === 'circle' ? preset.hitbox : null;
      if (circle) {
        const radii = ensureEllipseRadii(circle);
        ellipseW.value = (radii.radiusX * 2).toFixed(2);
        ellipseH.value = (radii.radiusY * 2).toFixed(2);
      } else {
        ellipseW.value = '.56'; ellipseH.value = '.32';
      }
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
      backdrop.querySelector<HTMLElement>('#pro-hit-polygon-actions')!.classList.toggle('hidden', preset.hitbox?.type !== 'polygon');
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

    const drawHandle = (point: NormalPoint, active = false) => {
      const x = previewRect.x + point.x * previewRect.width;
      const y = previewRect.y + point.y * previewRect.height;
      ctx.beginPath(); ctx.arc(x, y, active ? 7 : 6, 0, Math.PI * 2);
      ctx.fillStyle = active ? '#ffd96b' : '#ffffff'; ctx.fill();
      ctx.strokeStyle = '#3769dd'; ctx.lineWidth = 2; ctx.stroke();
    };

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
          const { radiusX, radiusY } = ensureEllipseRadii(hitbox);
          const cx = previewRect.x + hitbox.x * previewRect.width;
          const cy = previewRect.y + hitbox.y * previewRect.height;
          const rx = radiusX * previewRect.width;
          const ry = radiusY * previewRect.height;
          ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          drawHandle({ x: hitbox.x - radiusX, y: hitbox.y });
          drawHandle({ x: hitbox.x + radiusX, y: hitbox.y });
          drawHandle({ x: hitbox.x, y: hitbox.y - radiusY });
          drawHandle({ x: hitbox.x, y: hitbox.y + radiusY });
          ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fillStyle = '#67d9ff'; ctx.fill(); ctx.strokeStyle = '#17445a'; ctx.lineWidth = 2; ctx.stroke();
        } else if (hitbox.points.length) {
          ctx.beginPath();
          hitbox.points.forEach((point, index) => {
            const x = previewRect.x + point.x * previewRect.width, y = previewRect.y + point.y * previewRect.height;
            if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          });
          if (hitbox.points.length >= 3) ctx.closePath();
          ctx.fill(); ctx.stroke();
          hitbox.points.forEach((point, index) => drawHandle(point, index === polygonHoverIndex || index === polygonSelectedIndex));
        }
      }

      if (preset.light.enabled) {
        const lx = previewRect.x + preset.light.x * previewRect.width, ly = previewRect.y + preset.light.y * previewRect.height;
        ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(lx, ly, Math.max(12, preset.light.radius * 20), 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ffe48a'; ctx.beginPath(); ctx.arc(lx, ly, 7, 0, Math.PI * 2); ctx.fill();
      }
    }

    depthMode.onchange = () => { preset.depthMode = depthMode.value === 'ground' ? 'ground' : depthMode.value === 'foreground' ? 'foreground' : 'auto'; };
    hitType.onchange = () => { ensureHitbox(hitType.value); syncInputs(); };
    hitW.oninput = () => { if (preset.hitbox?.type === 'rectangle') preset.hitbox.width = clamp(Number(hitW.value) || .1, .02, 1 - preset.hitbox.x); render(); };
    hitH.oninput = () => { if (preset.hitbox?.type === 'rectangle') preset.hitbox.height = clamp(Number(hitH.value) || .1, .02, 1 - preset.hitbox.y); render(); };
    ellipseW.oninput = () => {
      if (preset.hitbox?.type !== 'circle') return;
      const radius = clamp((Number(ellipseW.value) || .04) / 2, .02, Math.max(.02, Math.min(preset.hitbox.x, 1 - preset.hitbox.x)));
      preset.hitbox.radiusX = radius; ellipseW.value = (radius * 2).toFixed(2); render();
    };
    ellipseH.oninput = () => {
      if (preset.hitbox?.type !== 'circle') return;
      const radius = clamp((Number(ellipseH.value) || .04) / 2, .02, Math.max(.02, Math.min(preset.hitbox.y, 1 - preset.hitbox.y)));
      preset.hitbox.radiusY = radius; ellipseH.value = (radius * 2).toFixed(2); render();
    };
    scale.oninput = () => { preset.scale = clamp(Number(scale.value) || 1, .1, 10); };
    shadow.onchange = () => { preset.shadow = shadow.checked; render(); };
    light.onchange = () => { preset.light.enabled = light.checked; render(); };
    lightRadius.oninput = () => { preset.light.radius = clamp(Number(lightRadius.value) || 1, .2, 12); render(); };
    lightIntensity.oninput = () => { preset.light.intensity = clamp(Number(lightIntensity.value) || .7, .1, 2); };
    stretch.onchange = () => { preset.stretch.enabled = stretch.checked; };
    stretchAxis.onchange = () => { preset.stretch.axis = stretchAxis.value === 'vertical' ? 'vertical' : 'horizontal'; };
    stretchCap.oninput = () => { preset.stretch.cap = clamp(Number(stretchCap.value) || .2, .05, .45); };
    backdrop.querySelectorAll<HTMLInputElement>('input[name="scale-mode"]').forEach((node) => node.onchange = () => { if (node.checked) preset.scaleMode = node.value === 'custom' ? 'custom' : 'set'; });
    backdrop.querySelector<HTMLButtonElement>('#pro-center-hit')!.onclick = () => {
      if (preset.hitbox?.type === 'circle') { preset.hitbox.x = .5; preset.hitbox.y = .5; render(); }
    };
    backdrop.querySelector<HTMLButtonElement>('#pro-undo-point')!.onclick = () => {
      if (preset.hitbox?.type === 'polygon' && preset.hitbox.points.length) {
        preset.hitbox.points.pop(); polygonSelectedIndex = -1; polygonHoverIndex = -1; render();
      }
    };
    backdrop.querySelector<HTMLButtonElement>('#pro-clear-points')!.onclick = () => {
      if (preset.hitbox?.type === 'polygon') { preset.hitbox.points = []; polygonSelectedIndex = -1; polygonHoverIndex = -1; render(); }
    };
    backdrop.querySelector<HTMLButtonElement>('#pro-reset')!.onclick = () => { preset = defaultAssetPreset(entry); polygonSelectedIndex = -1; polygonHoverIndex = -1; syncInputs(); };

    canvas.onpointerdown = (event) => {
      const point = normalizedPoint(event);
      const hitbox = preset.hitbox;
      if (preset.light.enabled) {
        const dx = point.x - preset.light.x, dy = point.y - preset.light.y;
        if (Math.hypot(dx, dy) < .08) { dragMode = 'light'; canvas.setPointerCapture(event.pointerId); return; }
      }
      if (!hitbox) return;

      if (hitbox.type === 'polygon') {
        const existing = nearestPolygonPoint(point);
        if (existing >= 0) {
          polygonSelectedIndex = existing; polygonDragIndex = existing; dragMode = 'move-polygon-point';
          canvas.setPointerCapture(event.pointerId); render(); return;
        }
        const edge = nearestPolygonEdge(point);
        if (edge) {
          const insertIndex = edge.index + 1;
          hitbox.points.splice(insertIndex, 0, edge.point);
          polygonSelectedIndex = insertIndex; polygonDragIndex = insertIndex; dragMode = 'move-polygon-point';
          canvas.setPointerCapture(event.pointerId); render(); return;
        }
        hitbox.points.push(point);
        polygonSelectedIndex = hitbox.points.length - 1;
        polygonDragIndex = polygonSelectedIndex;
        dragMode = 'move-polygon-point';
        canvas.setPointerCapture(event.pointerId); render(); return;
      }

      if (hitbox.type === 'circle') {
        const { radiusX, radiusY } = ensureEllipseRadii(hitbox);
        const left = { x: hitbox.x - radiusX, y: hitbox.y }, right = { x: hitbox.x + radiusX, y: hitbox.y };
        const top = { x: hitbox.x, y: hitbox.y - radiusY }, bottom = { x: hitbox.x, y: hitbox.y + radiusY };
        if (Math.min(pixelDistance(point, left), pixelDistance(point, right)) <= 16) dragMode = 'resize-ellipse-x';
        else if (Math.min(pixelDistance(point, top), pixelDistance(point, bottom)) <= 16) dragMode = 'resize-ellipse-y';
        else {
          const dx = (point.x - hitbox.x) / Math.max(.001, radiusX);
          const dy = (point.y - hitbox.y) / Math.max(.001, radiusY);
          if (dx * dx + dy * dy <= 1.05) {
            dragMode = 'move-ellipse';
            dragOffset = { x: point.x - hitbox.x, y: point.y - hitbox.y };
          } else return;
        }
        canvas.setPointerCapture(event.pointerId); return;
      }

      const nearHandle = Math.hypot(point.x - (hitbox.x + hitbox.width), point.y - (hitbox.y + hitbox.height)) < .08;
      dragMode = nearHandle ? 'resize-rect' : 'move-rect';
      dragOffset = { x: point.x - hitbox.x, y: point.y - hitbox.y };
      canvas.setPointerCapture(event.pointerId);
    };

    canvas.onpointermove = (event) => {
      const point = normalizedPoint(event);
      if (!dragMode) {
        if (preset.hitbox?.type === 'polygon') {
          const hover = nearestPolygonPoint(point);
          if (hover !== polygonHoverIndex) { polygonHoverIndex = hover; render(); }
          canvas.style.cursor = hover >= 0 ? 'grab' : nearestPolygonEdge(point) ? 'copy' : 'crosshair';
        } else canvas.style.cursor = preset.hitbox?.type === 'circle' ? 'move' : 'default';
        return;
      }
      if (dragMode === 'light') { preset.light.x = point.x; preset.light.y = point.y; render(); return; }
      if (dragMode === 'move-polygon-point' && preset.hitbox?.type === 'polygon' && polygonDragIndex >= 0 && polygonDragIndex < preset.hitbox.points.length) {
        preset.hitbox.points[polygonDragIndex] = point; polygonSelectedIndex = polygonDragIndex; polygonHoverIndex = polygonDragIndex; render(); return;
      }
      if (preset.hitbox?.type === 'circle') {
        const hitbox = preset.hitbox;
        const { radiusX, radiusY } = ensureEllipseRadii(hitbox);
        if (dragMode === 'move-ellipse') {
          hitbox.x = clamp(point.x - dragOffset.x, radiusX, 1 - radiusX);
          hitbox.y = clamp(point.y - dragOffset.y, radiusY, 1 - radiusY);
        } else if (dragMode === 'resize-ellipse-x') {
          hitbox.radiusX = clamp(Math.abs(point.x - hitbox.x), .02, Math.max(.02, Math.min(hitbox.x, 1 - hitbox.x)));
          ellipseW.value = (hitbox.radiusX * 2).toFixed(2);
        } else if (dragMode === 'resize-ellipse-y') {
          hitbox.radiusY = clamp(Math.abs(point.y - hitbox.y), .02, Math.max(.02, Math.min(hitbox.y, 1 - hitbox.y)));
          ellipseH.value = (hitbox.radiusY * 2).toFixed(2);
        }
        render(); return;
      }
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

    const stopDrag = () => { dragMode = null; polygonDragIndex = -1; };
    canvas.onpointerup = stopDrag;
    canvas.onpointercancel = stopDrag;
    canvas.onpointerleave = () => { if (!dragMode && polygonHoverIndex !== -1) { polygonHoverIndex = -1; render(); } };

    canvas.oncontextmenu = (event) => {
      if (preset.hitbox?.type !== 'polygon') return;
      event.preventDefault();
      const index = nearestPolygonPoint(normalizedPoint(event), 18);
      if (index < 0) return;
      preset.hitbox.points.splice(index, 1);
      polygonSelectedIndex = -1; polygonHoverIndex = -1; render();
    };

    function onKeyDown(event: KeyboardEvent) {
      if ((event.key === 'Delete' || event.key === 'Backspace') && preset.hitbox?.type === 'polygon' && polygonSelectedIndex >= 0 && polygonSelectedIndex < preset.hitbox.points.length) {
        event.preventDefault();
        preset.hitbox.points.splice(polygonSelectedIndex, 1);
        polygonSelectedIndex = -1; polygonHoverIndex = -1; render();
      }
    }
    window.addEventListener('keydown', onKeyDown);

    backdrop.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((button) => button.onclick = () => close(false));
    backdrop.querySelector<HTMLButtonElement>('#pro-save-config')!.onclick = () => { saveAssetPreset(entry.id, preset); close(true); };
    backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(false); });
    new ResizeObserver(render).observe(canvas.parentElement!);
    syncInputs();
  });
}
