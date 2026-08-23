import { collides, WORLD_H, WORLD_W, type Obstacle } from '../game/world';
import { getPreparedPublishedWorldRuntime } from './publishedMapRuntime';

type Point = { x: number; y: number };
type RouteState = {
  label: string;
  target: Point;
  path: Point[];
  index: number;
  lastPosition: Point;
  lastMovedAt: number;
  replans: number;
};

type HeapNode = { index: number; priority: number };

const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
const SYNTHETIC_KEYS = ['w', 'a', 's', 'd'] as const;
const CELL_SIZE = 38;
const ARRIVE_RADIUS = 25;
const MAX_REPLANS = 3;

class MinHeap {
  private values: HeapNode[] = [];

  get size() { return this.values.length; }

  push(node: HeapNode) {
    this.values.push(node);
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.values[parent].priority <= node.priority) break;
      this.values[index] = this.values[parent];
      index = parent;
    }
    this.values[index] = node;
  }

  pop() {
    if (!this.values.length) return null;
    const root = this.values[0];
    const tail = this.values.pop()!;
    if (!this.values.length) return root;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.values.length) break;
      const best = right < this.values.length && this.values[right].priority < this.values[left].priority ? right : left;
      if (this.values[best].priority >= tail.priority) break;
      this.values[index] = this.values[best];
      index = best;
    }
    this.values[index] = tail;
    return root;
  }
}

function playerPosition(): Point | null {
  const text = document.querySelector<HTMLElement>('#minimap-coords')?.textContent ?? '';
  const match = text.match(/(-?\d+)\s*,\s*(-?\d+)/);
  if (!match) return null;
  return { x: Number(match[1]), y: Number(match[2]) };
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lineClear(obstacles: Obstacle[], a: Point, b: Point) {
  const length = distance(a, b);
  const steps = Math.max(1, Math.ceil(length / 16));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (collides(obstacles, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false;
  }
  return true;
}

function buildPath(start: Point, target: Point, obstacles: Obstacle[], worldWidth: number, worldHeight: number): Point[] | null {
  const clamp = (point: Point): Point => ({
    x: Math.max(22, Math.min(worldWidth - 22, point.x)),
    y: Math.max(22, Math.min(worldHeight - 22, point.y)),
  });
  const source = clamp(start);
  const destination = clamp(target);
  if (!collides(obstacles, destination.x, destination.y) && lineClear(obstacles, source, destination)) return [destination];

  const cols = Math.max(1, Math.ceil(worldWidth / CELL_SIZE));
  const rows = Math.max(1, Math.ceil(worldHeight / CELL_SIZE));
  const total = cols * rows;
  if (total > 70000) return null;

  const center = (index: number): Point => {
    const x = index % cols;
    const y = Math.floor(index / cols);
    return {
      x: Math.min(worldWidth - 22, Math.max(22, (x + .5) * CELL_SIZE)),
      y: Math.min(worldHeight - 22, Math.max(22, (y + .5) * CELL_SIZE)),
    };
  };
  const indexAt = (point: Point) => {
    const col = Math.max(0, Math.min(cols - 1, Math.floor(point.x / CELL_SIZE)));
    const row = Math.max(0, Math.min(rows - 1, Math.floor(point.y / CELL_SIZE)));
    return row * cols + col;
  };

  const blocked = new Int8Array(total);
  blocked.fill(-1);
  const isBlocked = (index: number) => {
    const cached = blocked[index];
    if (cached >= 0) return cached === 1;
    const point = center(index);
    const value = collides(obstacles, point.x, point.y);
    blocked[index] = value ? 1 : 0;
    return value;
  };

  const nearestWalkable = (point: Point) => {
    const origin = indexAt(point);
    if (!isBlocked(origin)) return origin;
    const originCol = origin % cols;
    const originRow = Math.floor(origin / cols);
    for (let radius = 1; radius <= 10; radius++) {
      let best: number | null = null;
      let bestDistance = Infinity;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const col = originCol + dx;
          const row = originRow + dy;
          if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
          const index = row * cols + col;
          if (isBlocked(index)) continue;
          const d = distance(center(index), point);
          if (d < bestDistance) { best = index; bestDistance = d; }
        }
      }
      if (best !== null) return best;
    }
    return null;
  };

  const startIndex = nearestWalkable(source);
  const targetIndex = nearestWalkable(destination);
  if (startIndex === null || targetIndex === null) return null;

  const g = new Float64Array(total);
  g.fill(Infinity);
  const came = new Int32Array(total);
  came.fill(-1);
  const closed = new Uint8Array(total);
  const heap = new MinHeap();
  const targetCol = targetIndex % cols;
  const targetRow = Math.floor(targetIndex / cols);
  const heuristic = (index: number) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const dx = Math.abs(col - targetCol);
    const dy = Math.abs(row - targetRow);
    return (Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)) * CELL_SIZE;
  };

  g[startIndex] = 0;
  heap.push({ index: startIndex, priority: heuristic(startIndex) });
  const directions = [
    [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],
    [-1, -1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, 1, Math.SQRT2],
  ] as const;
  let expanded = 0;

  while (heap.size && expanded < 50000) {
    const node = heap.pop()!;
    const current = node.index;
    if (closed[current]) continue;
    closed[current] = 1;
    expanded++;
    if (current === targetIndex) break;
    const col = current % cols;
    const row = Math.floor(current / cols);

    for (const [dx, dy, cost] of directions) {
      const nextCol = col + dx;
      const nextRow = row + dy;
      if (nextCol < 0 || nextRow < 0 || nextCol >= cols || nextRow >= rows) continue;
      const next = nextRow * cols + nextCol;
      if (closed[next] || isBlocked(next)) continue;
      if (dx !== 0 && dy !== 0) {
        const horizontal = row * cols + nextCol;
        const vertical = nextRow * cols + col;
        if (isBlocked(horizontal) || isBlocked(vertical)) continue;
      }
      const candidate = g[current] + cost * CELL_SIZE;
      if (candidate >= g[next]) continue;
      g[next] = candidate;
      came[next] = current;
      heap.push({ index: next, priority: candidate + heuristic(next) });
    }
  }

  if (targetIndex !== startIndex && came[targetIndex] < 0) return null;
  const raw: Point[] = [];
  let cursor = targetIndex;
  raw.push(center(cursor));
  while (cursor !== startIndex && came[cursor] >= 0) {
    cursor = came[cursor];
    if (cursor !== startIndex) raw.push(center(cursor));
  }
  raw.reverse();

  const endpoint = !collides(obstacles, destination.x, destination.y) ? destination : center(targetIndex);
  if (!raw.length || distance(raw[raw.length - 1], endpoint) > 4) raw.push(endpoint);

  const smooth: Point[] = [];
  let anchor = source;
  let index = 0;
  while (index < raw.length) {
    let farthest = index;
    for (let candidate = raw.length - 1; candidate >= index; candidate--) {
      if (lineClear(obstacles, anchor, raw[candidate])) { farthest = candidate; break; }
    }
    smooth.push(raw[farthest]);
    anchor = raw[farthest];
    index = farthest + 1;
  }
  return smooth;
}

function dispatchMovement(type: 'keydown' | 'keyup', key: string) {
  window.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, cancelable: true }));
}

export function installMapAutoRoute() {
  const overlay = document.querySelector<HTMLElement>('#map-overlay');
  const viewport = document.querySelector<HTMLElement>('#map-viewport');
  const world = document.querySelector<HTMLElement>('#map-world');
  const toolbar = document.querySelector<HTMLElement>('.map-header-center');
  if (!overlay || !viewport || !world || !toolbar) return;

  const runtime = getPreparedPublishedWorldRuntime();
  const obstacles = runtime?.obstacles ?? [];
  const worldWidth = runtime?.width ?? WORLD_W;
  const worldHeight = runtime?.height ?? WORLD_H;
  let route: RouteState | null = null;
  const pressed = new Set<string>();

  const status = document.createElement('div');
  status.id = 'map-auto-route-status';
  status.className = 'map-auto-route-hidden';
  status.innerHTML = '<span class="map-auto-route-icon">⇢</span><div><strong>Auto-rota</strong><small></small></div><button type="button" aria-label="Cancelar auto-rota">×</button>';
  document.body.appendChild(status);
  const statusText = status.querySelector<HTMLElement>('small')!;
  status.querySelector<HTMLButtonElement>('button')!.addEventListener('click', () => cancelRoute('Auto-rota cancelada.'));

  const routeButton = document.createElement('button');
  routeButton.type = 'button';
  routeButton.id = 'map-auto-route-button';
  routeButton.className = 'map-tool map-auto-route-button';
  routeButton.textContent = '⇢ ROTA';
  routeButton.title = 'Auto-rota até o ponto selecionado';
  routeButton.disabled = true;
  const closeButton = toolbar.querySelector('[data-map-action="close"]');
  toolbar.insertBefore(routeButton, closeButton);

  function setPressed(next: Set<string>) {
    for (const key of [...pressed]) {
      if (next.has(key)) continue;
      dispatchMovement('keyup', key);
      pressed.delete(key);
    }
    for (const key of next) {
      if (pressed.has(key)) continue;
      dispatchMovement('keydown', key);
      pressed.add(key);
    }
  }

  function releaseMovement() {
    setPressed(new Set());
  }

  function showStatus(message: string) {
    statusText.textContent = message;
    status.classList.remove('map-auto-route-hidden');
  }

  function hideStatusSoon() {
    window.setTimeout(() => {
      if (!route) status.classList.add('map-auto-route-hidden');
    }, 1600);
  }

  function cancelRoute(message?: string) {
    if (!route && !pressed.size) return;
    route = null;
    releaseMovement();
    if (message) { showStatus(message); hideStatusSoon(); }
    else status.classList.add('map-auto-route-hidden');
  }

  function startRoute(target: Point, label: string) {
    const start = playerPosition();
    if (!start) { showStatus('Não foi possível localizar o personagem.'); hideStatusSoon(); return false; }
    const path = buildPath(start, target, obstacles, worldWidth, worldHeight);
    if (!path?.length) { showStatus('Não existe uma rota segura até esse ponto.'); hideStatusSoon(); return false; }
    cancelRoute();
    route = {
      label,
      target,
      path,
      index: 0,
      lastPosition: start,
      lastMovedAt: performance.now(),
      replans: 0,
    };
    showStatus(`${label} · WASD cancela`);
    const close = overlay.querySelector<HTMLButtonElement>('[data-map-action="close"]');
    close?.click();
    return true;
  }

  function replan(current: Point) {
    if (!route) return false;
    const next = buildPath(current, route.target, obstacles, worldWidth, worldHeight);
    if (!next?.length) return false;
    route.path = next;
    route.index = 0;
    route.lastPosition = current;
    route.lastMovedAt = performance.now();
    route.replans++;
    return true;
  }

  function tick() {
    const current = playerPosition();
    if (!route || !current) { releaseMovement(); return; }

    if (distance(current, route.lastPosition) > 2) {
      route.lastPosition = current;
      route.lastMovedAt = performance.now();
    }

    while (route.index < route.path.length && distance(current, route.path[route.index]) <= ARRIVE_RADIUS) route.index++;
    if (route.index >= route.path.length) {
      const label = route.label;
      route = null;
      releaseMovement();
      showStatus(`Chegamos perto de ${label}.`);
      hideStatusSoon();
      return;
    }

    if (performance.now() - route.lastMovedAt > 1200) {
      if (route.replans >= MAX_REPLANS || !replan(current)) {
        cancelRoute('Rota interrompida: caminho bloqueado.');
        return;
      }
    }

    const waypoint = route.path[route.index];
    const dx = waypoint.x - current.x;
    const dy = waypoint.y - current.y;
    const nextKeys = new Set<string>();
    if (Math.abs(dx) > 8) nextKeys.add(dx < 0 ? 'a' : 'd');
    if (Math.abs(dy) > 8) nextKeys.add(dy < 0 ? 'w' : 's');
    setPressed(nextKeys);
    statusText.textContent = `${route.label} · ${Math.max(0, Math.round(distance(current, route.target)))}m · WASD cancela`;
  }

  function selectedPoi() {
    return overlay.querySelector<HTMLButtonElement>('.map-poi.selected');
  }

  function pointFromPoi(poi: HTMLElement): Point | null {
    const x = Number.parseFloat(poi.style.left);
    const y = Number.parseFloat(poi.style.top);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }

  function labelFromPoi(poi: HTMLElement) {
    return (poi.title.split(' · ')[0] || 'destino').trim();
  }

  function pointFromMapEvent(event: MouseEvent): Point | null {
    const rect = world.getBoundingClientRect();
    const width = Number.parseFloat(world.style.width) || worldWidth;
    const height = Number.parseFloat(world.style.height) || worldHeight;
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: Math.max(22, Math.min(worldWidth - 22, (event.clientX - rect.left) / rect.width * width)),
      y: Math.max(22, Math.min(worldHeight - 22, (event.clientY - rect.top) / rect.height * height)),
    };
  }

  routeButton.addEventListener('click', () => {
    const poi = selectedPoi();
    if (!poi) return;
    const point = pointFromPoi(poi);
    if (point) startRoute(point, labelFromPoi(poi));
  });

  overlay.addEventListener('dblclick', (event) => {
    const target = event.target as HTMLElement;
    const poi = target.closest<HTMLElement>('.map-poi');
    if (poi) {
      const point = pointFromPoi(poi);
      if (point) { event.preventDefault(); event.stopPropagation(); startRoute(point, labelFromPoi(poi)); }
      return;
    }
    if (!target.closest('.map-viewport')) return;
    const point = pointFromMapEvent(event);
    if (!point) return;
    event.preventDefault(); event.stopPropagation();
    startRoute(point, `Ponto ${Math.round(point.x)}, ${Math.round(point.y)}`);
  });

  overlay.addEventListener('pointermove', () => {
    routeButton.disabled = !selectedPoi();
  }, { passive: true });
  overlay.addEventListener('click', () => {
    window.setTimeout(() => { routeButton.disabled = !selectedPoi(); }, 0);
  });

  window.addEventListener('keydown', (event) => {
    if (!route || !event.isTrusted) return;
    if (MOVE_KEYS.has(event.key.toLowerCase())) cancelRoute('Auto-rota cancelada pelo movimento manual.');
  }, true);
  document.querySelector('#stick')?.addEventListener('pointerdown', (event) => {
    if (route && event.isTrusted) cancelRoute('Auto-rota cancelada pelo movimento manual.');
  }, true);

  window.addEventListener('pagehide', () => { cancelRoute(); status.remove(); }, { once: true });
  window.setInterval(tick, 80);
}
