import { drawConfiguredObject } from '../editor/map/mapObjectRenderer';
import { drawBlendedTerrainTile } from '../editor/map/mapTerrainBlend';
import { getPaletteEntry } from '../editor/map/mapEditorCatalog';
import type { AscensionMapDocument, MapObject } from '../editor/map/mapEditorTypes';
import type { NpcDefinition, NpcDirection, NpcInstanceRoute, NpcRoutePoint } from './npcTypes';
import { NPC_DIRECTIONS } from './npcTypes';
import { getNpcInstanceRoute, resolveNpcAppearanceAssetId, saveNpcInstanceRoute } from './npcStore';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const uid = () => `route-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const snap = (value: number) => Math.round(value * 4) / 4;

function directionFromDelta(dx: number, dy: number): NpcDirection {
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  if (angle >= -22.5 && angle < 22.5) return 'east';
  if (angle >= 22.5 && angle < 67.5) return 'south-east';
  if (angle >= 67.5 && angle < 112.5) return 'south';
  if (angle >= 112.5 && angle < 157.5) return 'south-west';
  if (angle >= 157.5 || angle < -157.5) return 'west';
  if (angle >= -157.5 && angle < -112.5) return 'north-west';
  if (angle >= -112.5 && angle < -67.5) return 'north';
  return 'north-east';
}

export function openNpcRouteStudio(map: AscensionMapDocument, object: MapObject, npc: NpcDefinition) {
  const existing = getNpcInstanceRoute(map.id, object.id);
  let route: NpcInstanceRoute = existing ?? {
    version: 1,
    mapId: map.id,
    objectId: object.id,
    npcId: npc.id,
    mode: npc.behavior.mode === 'patrol' || npc.behavior.mode === 'loop' || npc.behavior.mode === 'once' ? npc.behavior.mode : 'patrol',
    speed: npc.behavior.walkSpeed,
    points: [{ id: uid(), x: object.x, y: object.y, waitMs: npc.behavior.defaultWaitMs, face: 'auto' }],
    updatedAt: Date.now(),
  };
  route = structuredClone(route);
  let selectedPoint = Math.max(0, route.points.length - 1);
  let zoom = 1;
  let cameraX = Math.max(0, object.x * map.tileSize - 360);
  let cameraY = Math.max(0, object.y * map.tileSize - 260);
  let draggingPoint = -1;
  let panning = false;
  let panStart = { x: 0, y: 0, cameraX: 0, cameraY: 0 };
  let simulation = false;
  let simulationX = object.x;
  let simulationY = object.y;
  let simulationIndex = route.points.length > 1 ? 1 : 0;
  let simulationDirection = 1;
  let simulationWait = 0;
  let simulationFacing: NpcDirection = 'south';
  let lastTime = performance.now();
  let raf = 0;

  const backdrop = document.createElement('div');
  backdrop.className = 'npc-route-backdrop';
  backdrop.innerHTML = `
    <section class="npc-route-window">
      <header class="npc-route-head"><div><strong>ROTA • ${npc.name}</strong><span>${map.name}</span></div><div class="spacer"></div><button id="npc-route-close">×</button></header>
      <div class="npc-route-body">
        <main class="npc-route-stage" id="npc-route-stage"><canvas id="npc-route-canvas"></canvas><div class="npc-route-hint">Clique: adicionar ponto • Arraste ponto: mover • Botão direito: mover câmera • Scroll: zoom</div></main>
        <aside class="npc-route-side">
          <section><h4>Comportamento da rota</h4><label>Modo<select id="npc-route-mode"><option value="patrol">Patrulha (vai e volta)</option><option value="loop">Circuito</option><option value="once">Uma vez</option><option value="stationary">Parado</option></select></label><label>Velocidade (tiles/s)<input id="npc-route-speed" type="number" min="0.1" max="12" step="0.05" value="${route.speed}"></label><button id="npc-route-simulate">▶ Simular rota</button></section>
          <section><h4>Pontos</h4><div id="npc-route-points" class="npc-route-point-list"></div><div style="display:flex;gap:5px;margin-top:7px"><button id="npc-route-add" style="flex:1">＋ Ponto</button><button id="npc-route-clear">Limpar</button></div></section>
          <section id="npc-route-point-editor"><h4>Ponto selecionado</h4><div class="npc-form-grid"><label>X<input id="npc-route-x" type="number" step="0.25"></label><label>Y<input id="npc-route-y" type="number" step="0.25"></label></div><label>Esperar (ms)<input id="npc-route-wait" type="number" min="0" max="60000" step="100"></label><label>Ao chegar<select id="npc-route-face"><option value="auto">Direção automática</option>${NPC_DIRECTIONS.map((direction) => `<option value="${direction.id}">${direction.label}</option>`).join('')}</select></label></section>
        </aside>
      </div>
      <footer class="npc-route-foot"><span style="font-size:9px;color:#7e9ba9">${route.points.length} ponto(s)</span><div class="spacer"></div><button id="npc-route-cancel">Cancelar</button><button id="npc-route-save" class="npc-primary">Salvar rota</button></footer>
    </section>`;
  document.body.appendChild(backdrop);

  const stage = backdrop.querySelector<HTMLElement>('#npc-route-stage')!;
  const canvas = backdrop.querySelector<HTMLCanvasElement>('#npc-route-canvas')!;
  const ctx = canvas.getContext('2d')!;
  const pointList = backdrop.querySelector<HTMLElement>('#npc-route-points')!;
  const modeInput = backdrop.querySelector<HTMLSelectElement>('#npc-route-mode')!;
  const speedInput = backdrop.querySelector<HTMLInputElement>('#npc-route-speed')!;
  modeInput.value = route.mode;

  const selected = () => route.points[selectedPoint];
  const screenToMap = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return { x: ((clientX - rect.left) / zoom + cameraX) / map.tileSize, y: ((clientY - rect.top) / zoom + cameraY) / map.tileSize };
  };
  const mapToScreen = (x: number, y: number) => ({ x: (x * map.tileSize - cameraX) * zoom, y: (y * map.tileSize - cameraY) * zoom });

  const renderPointEditor = () => {
    const point = selected();
    const editor = backdrop.querySelector<HTMLElement>('#npc-route-point-editor')!;
    editor.style.opacity = point ? '1' : '.45';
    for (const id of ['#npc-route-x','#npc-route-y','#npc-route-wait','#npc-route-face']) (backdrop.querySelector<HTMLInputElement | HTMLSelectElement>(id)!).disabled = !point;
    if (!point) return;
    backdrop.querySelector<HTMLInputElement>('#npc-route-x')!.value = String(point.x);
    backdrop.querySelector<HTMLInputElement>('#npc-route-y')!.value = String(point.y);
    backdrop.querySelector<HTMLInputElement>('#npc-route-wait')!.value = String(point.waitMs);
    backdrop.querySelector<HTMLSelectElement>('#npc-route-face')!.value = point.face ?? 'auto';
  };

  const renderPointList = () => {
    pointList.innerHTML = route.points.map((point, index) => `<div class="npc-route-point ${index === selectedPoint ? 'active' : ''}" data-point="${index}"><button>${index + 1}</button><span>X ${point.x.toFixed(2)} • Y ${point.y.toFixed(2)} • ${point.waitMs}ms</span><button data-remove="${index}">×</button></div>`).join('') || '<div style="font-size:9px;color:#6e8b9a">Nenhum ponto.</div>';
    pointList.querySelectorAll<HTMLElement>('[data-point]').forEach((node) => node.onclick = (event) => { if ((event.target as HTMLElement).closest('[data-remove]')) return; selectedPoint = Number(node.dataset.point); renderPointList(); renderPointEditor(); });
    pointList.querySelectorAll<HTMLButtonElement>('[data-remove]').forEach((button) => button.onclick = () => { route.points.splice(Number(button.dataset.remove), 1); selectedPoint = clamp(selectedPoint, 0, Math.max(0, route.points.length - 1)); renderPointList(); renderPointEditor(); });
    backdrop.querySelector<HTMLElement>('.npc-route-foot span')!.textContent = `${route.points.length} ponto(s)`;
  };

  const addPoint = (x?: number, y?: number) => {
    const previous = route.points.at(-1) ?? { x: object.x, y: object.y };
    route.points.push({ id: uid(), x: snap(x ?? previous.x + 1), y: snap(y ?? previous.y), waitMs: npc.behavior.defaultWaitMs, face: 'auto' });
    selectedPoint = route.points.length - 1;
    renderPointList(); renderPointEditor();
  };

  const draw = (time = performance.now()) => {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(rect.width * dpr)), h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, rect.width, rect.height); ctx.fillStyle = '#050a0f'; ctx.fillRect(0, 0, rect.width, rect.height);
    const tilePx = map.tileSize * zoom;
    const startX = clamp(Math.floor(cameraX / map.tileSize) - 1, 0, map.width - 1), startY = clamp(Math.floor(cameraY / map.tileSize) - 1, 0, map.height - 1);
    const endX = clamp(Math.ceil((cameraX + rect.width / zoom) / map.tileSize) + 1, 0, map.width - 1), endY = clamp(Math.ceil((cameraY + rect.height / zoom) / map.tileSize) + 1, 0, map.height - 1);
    for (let y = startY; y <= endY; y++) for (let x = startX; x <= endX; x++) {
      const s = mapToScreen(x, y); drawBlendedTerrainTile(ctx, map, { x, y, screenX: s.x, screenY: s.y, tilePixels: tilePx, layer: 'ground', now: time, onReady: () => requestAnimationFrame(() => draw()) });
    }
    ctx.strokeStyle = 'rgba(119,167,190,.16)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = startX; x <= endX + 1; x++) { const s = mapToScreen(x, 0); ctx.moveTo(s.x, 0); ctx.lineTo(s.x, rect.height); }
    for (let y = startY; y <= endY + 1; y++) { const s = mapToScreen(0, y); ctx.moveTo(0, s.y); ctx.lineTo(rect.width, s.y); } ctx.stroke();

    if (route.points.length > 1) {
      ctx.strokeStyle = '#67d0ff'; ctx.lineWidth = 2.5; ctx.setLineDash([7, 4]); ctx.beginPath();
      route.points.forEach((point, index) => { const s = mapToScreen(point.x + .5, point.y + .5); if (!index) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y); });
      if (route.mode === 'loop') { const a = route.points[0], s = mapToScreen(a.x + .5, a.y + .5); ctx.lineTo(s.x, s.y); } ctx.stroke(); ctx.setLineDash([]);
    }
    route.points.forEach((point, index) => { const s = mapToScreen(point.x + .5, point.y + .5); ctx.beginPath(); ctx.fillStyle = index === selectedPoint ? '#fff1a6' : '#62cbf4'; ctx.strokeStyle = '#102a37'; ctx.lineWidth = 3; ctx.arc(s.x, s.y, index === selectedPoint ? 10 : 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#061018'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(index + 1), s.x, s.y); });

    const actorX = simulation ? simulationX : object.x, actorY = simulation ? simulationY : object.y;
    const assetId = resolveNpcAppearanceAssetId(npc, simulation ? 'walk' : 'idle', simulationFacing);
    const asset = getPaletteEntry(assetId);
    drawConfiguredObject(ctx, asset, { object: { ...object, assetId, x: actorX, y: actorY, scale: npc.appearance.scale }, x: ((actorX + .5) * map.tileSize - cameraX) * zoom, y: ((actorY + 1) * map.tileSize - cameraY) * zoom, tilePixels: tilePx, scale: npc.appearance.scale, selected: false, showHitbox: false, showLight: false, now: time, onReady: () => requestAnimationFrame(() => draw()) });
  };

  const updateSimulation = (time: number) => {
    const dt = Math.min(.05, Math.max(0, (time - lastTime) / 1000)); lastTime = time;
    if (simulation && route.mode !== 'stationary' && route.points.length > 1) {
      if (simulationWait > 0) simulationWait -= dt * 1000;
      else {
        const target = route.points[simulationIndex];
        const dx = target.x - simulationX, dy = target.y - simulationY, dist = Math.hypot(dx, dy);
        if (dist < .02) {
          simulationX = target.x; simulationY = target.y; simulationWait = target.waitMs;
          if (target.face && target.face !== 'auto') simulationFacing = target.face;
          if (route.mode === 'loop') simulationIndex = (simulationIndex + 1) % route.points.length;
          else if (route.mode === 'once') simulationIndex = Math.min(route.points.length - 1, simulationIndex + 1);
          else {
            if (simulationIndex >= route.points.length - 1) simulationDirection = -1;
            if (simulationIndex <= 0) simulationDirection = 1;
            simulationIndex = clamp(simulationIndex + simulationDirection, 0, route.points.length - 1);
          }
        } else {
          simulationFacing = directionFromDelta(dx, dy);
          const step = Math.min(dist, Math.max(.05, route.speed) * dt); simulationX += dx / dist * step; simulationY += dy / dist * step;
        }
      }
    }
    draw(time); raf = requestAnimationFrame(updateSimulation);
  };

  canvas.oncontextmenu = (event) => event.preventDefault();
  canvas.onpointerdown = (event) => {
    if (event.button === 2 || event.button === 1) { panning = true; panStart = { x: event.clientX, y: event.clientY, cameraX, cameraY }; canvas.setPointerCapture(event.pointerId); return; }
    const point = screenToMap(event.clientX, event.clientY);
    let hit = -1, best = 16;
    route.points.forEach((value, index) => { const s = mapToScreen(value.x + .5, value.y + .5); const rect = canvas.getBoundingClientRect(); const d = Math.hypot(event.clientX - rect.left - s.x, event.clientY - rect.top - s.y); if (d < best) { best = d; hit = index; } });
    if (hit >= 0) { selectedPoint = hit; draggingPoint = hit; canvas.setPointerCapture(event.pointerId); renderPointList(); renderPointEditor(); return; }
    addPoint(clamp(snap(point.x), 0, map.width - 1), clamp(snap(point.y), 0, map.height - 1));
  };
  canvas.onpointermove = (event) => {
    if (panning) { cameraX = panStart.cameraX - (event.clientX - panStart.x) / zoom; cameraY = panStart.cameraY - (event.clientY - panStart.y) / zoom; return; }
    if (draggingPoint < 0) return;
    const point = screenToMap(event.clientX, event.clientY), current = route.points[draggingPoint]; current.x = clamp(snap(point.x), 0, map.width - 1); current.y = clamp(snap(point.y), 0, map.height - 1); renderPointList(); renderPointEditor();
  };
  const stopPointer = (event: PointerEvent) => { panning = false; draggingPoint = -1; if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); };
  canvas.onpointerup = stopPointer; canvas.onpointercancel = stopPointer;
  canvas.onwheel = (event) => { event.preventDefault(); const before = screenToMap(event.clientX, event.clientY); const next = clamp(zoom * (event.deltaY < 0 ? 1.13 : .885), .25, 3); const rect = canvas.getBoundingClientRect(); const px = event.clientX - rect.left, py = event.clientY - rect.top; zoom = next; cameraX = before.x * map.tileSize - px / zoom; cameraY = before.y * map.tileSize - py / zoom; };

  backdrop.querySelector<HTMLButtonElement>('#npc-route-add')!.onclick = () => addPoint();
  backdrop.querySelector<HTMLButtonElement>('#npc-route-clear')!.onclick = () => { route.points = []; selectedPoint = 0; simulation = false; renderPointList(); renderPointEditor(); };
  modeInput.onchange = () => { route.mode = modeInput.value as NpcInstanceRoute['mode']; simulation = false; };
  speedInput.onchange = () => { route.speed = clamp(Number(speedInput.value) || npc.behavior.walkSpeed, .1, 12); };
  backdrop.querySelector<HTMLButtonElement>('#npc-route-simulate')!.onclick = (event) => { simulation = !simulation; simulationX = route.points[0]?.x ?? object.x; simulationY = route.points[0]?.y ?? object.y; simulationIndex = route.points.length > 1 ? 1 : 0; simulationDirection = 1; simulationWait = 0; (event.currentTarget as HTMLButtonElement).textContent = simulation ? '■ Parar simulação' : '▶ Simular rota'; };
  backdrop.querySelector<HTMLInputElement>('#npc-route-x')!.onchange = (event) => { if (selected()) selected()!.x = clamp(snap(Number((event.currentTarget as HTMLInputElement).value)), 0, map.width - 1); renderPointList(); };
  backdrop.querySelector<HTMLInputElement>('#npc-route-y')!.onchange = (event) => { if (selected()) selected()!.y = clamp(snap(Number((event.currentTarget as HTMLInputElement).value)), 0, map.height - 1); renderPointList(); };
  backdrop.querySelector<HTMLInputElement>('#npc-route-wait')!.onchange = (event) => { if (selected()) selected()!.waitMs = clamp(Number((event.currentTarget as HTMLInputElement).value) || 0, 0, 60000); renderPointList(); };
  backdrop.querySelector<HTMLSelectElement>('#npc-route-face')!.onchange = (event) => { if (selected()) selected()!.face = (event.currentTarget as HTMLSelectElement).value as NpcRoutePoint['face']; };

  const close = () => { cancelAnimationFrame(raf); backdrop.remove(); };
  backdrop.querySelector<HTMLButtonElement>('#npc-route-close')!.onclick = close;
  backdrop.querySelector<HTMLButtonElement>('#npc-route-cancel')!.onclick = close;
  backdrop.querySelector<HTMLButtonElement>('#npc-route-save')!.onclick = () => { route.speed = clamp(Number(speedInput.value) || npc.behavior.walkSpeed, .1, 12); route.mode = modeInput.value as NpcInstanceRoute['mode']; route.npcId = npc.id; route.updatedAt = Date.now(); saveNpcInstanceRoute(route); close(); };

  renderPointList(); renderPointEditor();
  raf = requestAnimationFrame(updateSimulation);
}
