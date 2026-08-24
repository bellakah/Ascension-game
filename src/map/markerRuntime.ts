import './markerRuntime.css';
import type { MapPoi } from './mapCatalog';
import { getLastMapPois } from './mapCatalog';
import { markerStyle, markerStylesChangedEvent } from './markerStore';
import type { MarkerCategory, MarkerStyle } from './markerTypes';
import { applyMarkerStyle, renderMarkerSource } from './markerVisual';
import { createMapWorldRaster, drawMapWorldCrop } from './mapWorldRaster';
import { getPreparedPublishedWorldRuntime } from './publishedMapRuntime';

type DisplayMarker = { poi: MapPoi; badge?: MapPoi };
type PlayerPoint = { x: number; y: number; range: number };

type MarkerNodeParts = {
  root: HTMLButtonElement;
  visual: HTMLElement;
  source: HTMLElement;
  label: HTMLElement;
  badge: HTMLElement;
  badgeSource: HTMLElement;
};

const WORLD_PLAYER_KEY = '__player__';

function filterEnabled(filter: string) {
  return document.querySelector<HTMLInputElement>(`[data-map-filter="${filter}"]`)?.checked ?? true;
}

function markerCategory(poi: MapPoi): MarkerCategory {
  if (poi.filter === 'npc') return 'npc';
  if (poi.filter === 'shops') return 'shop';
  if (poi.filter === 'bank') return 'bank';
  if (poi.filter === 'crafting') return 'crafting';
  if (poi.filter === 'monsters') return /boss|chefe|lord|rei/i.test(`${poi.name} ${poi.subtitle}`) ? 'boss' : 'monster';
  if (poi.filter === 'herbs' || poi.filter === 'mining' || poi.filter === 'wood') return 'resource';
  if (poi.filter === 'respawn') return 'respawn';
  if (poi.filter === 'portals') return 'portal';
  if (poi.filter === 'quests') return poi.icon === '?' ? 'questReady' : 'questAvailable';
  return 'landmark';
}

function mergeQuestMarkers(pois: MapPoi[]) {
  const quests = new Map<string, MapPoi>();
  const consumed = new Set<string>();
  for (const poi of pois) {
    if (!poi.id.startsWith('quest:')) continue;
    quests.set(poi.id.slice('quest:'.length), poi);
  }

  const result: DisplayMarker[] = [];
  for (const poi of pois) {
    if (poi.id.startsWith('quest:')) continue;
    let badge: MapPoi | undefined;
    if (poi.id.startsWith('npc:')) {
      const suffix = poi.id.slice('npc:'.length);
      badge = quests.get(suffix);
      if (badge) consumed.add(suffix);
    }
    const baseVisible = filterEnabled(poi.filter);
    const badgeVisible = badge ? filterEnabled('quests') : false;
    if (!baseVisible && !badgeVisible) continue;
    result.push({ poi, badge: badgeVisible ? badge : undefined });
  }

  if (filterEnabled('quests')) {
    for (const [suffix, quest] of quests) {
      if (consumed.has(suffix)) continue;
      result.push({ poi: quest });
    }
  }
  return result;
}

function createMarkerNode(key: string): MarkerNodeParts {
  const root = document.createElement('button');
  root.type = 'button';
  root.className = 'map-marker-v2';
  root.dataset.markerId = key;
  root.innerHTML = '<span class="marker-visual"><span class="marker-source"></span><span class="marker-badge"><span class="marker-source"></span></span></span><span class="marker-label"></span>';
  return {
    root,
    visual: root.querySelector<HTMLElement>('.marker-visual')!,
    source: root.querySelector<HTMLElement>('.marker-visual>.marker-source')!,
    label: root.querySelector<HTMLElement>('.marker-label')!,
    badge: root.querySelector<HTMLElement>('.marker-badge')!,
    badgeSource: root.querySelector<HTMLElement>('.marker-badge .marker-source')!,
  };
}

function applyBadge(parts: MarkerNodeParts, badge?: MapPoi) {
  parts.root.classList.toggle('has-badge', Boolean(badge));
  if (!badge) return;
  const category: MarkerCategory = badge.icon === '?' ? 'questReady' : 'questAvailable';
  const style = markerStyle(category, badge.id);
  parts.root.style.setProperty('--badge-size', `${style.size}px`);
  parts.root.style.setProperty('--badge-color', style.color);
  parts.root.style.setProperty('--badge-bg', style.background ? style.backgroundColor : 'transparent');
  parts.root.style.setProperty('--badge-border', style.background ? style.borderColor : 'transparent');
  parts.root.style.setProperty('--badge-border-width', style.background ? `${style.borderWidth}px` : '0px');
  renderMarkerSource(parts.badgeSource, style);
  parts.badge.title = badge.name;
}

function applyDisplay(parts: MarkerNodeParts, display: DisplayMarker, selected: boolean) {
  const category = markerCategory(display.poi);
  const style = markerStyle(category, display.poi.id);
  parts.root.dataset.category = category;
  parts.root.classList.toggle('selected', selected);
  parts.root.classList.remove('player');
  parts.root.style.left = `${display.poi.x}px`;
  parts.root.style.top = `${display.poi.y}px`;
  parts.root.title = `${display.poi.name} · ${display.poi.subtitle}`;
  parts.label.textContent = display.poi.name.replace(/^Missão(?: disponível)? · /, '');
  applyMarkerStyle(parts.root, style);
  renderMarkerSource(parts.source, style);
  applyBadge(parts, display.badge);
}

function applyPlayer(parts: MarkerNodeParts, x: number, y: number) {
  const style = markerStyle('player', 'player');
  parts.root.classList.add('player');
  parts.root.classList.remove('selected', 'has-badge');
  parts.root.style.left = `${x}px`;
  parts.root.style.top = `${y}px`;
  parts.root.title = 'Você';
  parts.label.textContent = '';
  applyMarkerStyle(parts.root, style);
  renderMarkerSource(parts.source, style);
}

function playerPoint(): PlayerPoint | null {
  const text = document.querySelector<HTMLElement>('#minimap-coords')?.textContent ?? '';
  const match = text.match(/(-?\d+)\s*,\s*(-?\d+)(?:\s*·\s*(\d+)m)?/);
  if (!match) return null;
  return { x: Number(match[1]), y: Number(match[2]), range: Number(match[3] || 520) };
}

function findLegacyPoi(poi: MapPoi) {
  const nodes = [...document.querySelectorAll<HTMLButtonElement>('#map-marker-layer .map-poi')];
  let best: HTMLButtonElement | null = null;
  let bestScore = Infinity;
  for (const node of nodes) {
    const x = Number.parseFloat(node.style.left);
    const y = Number.parseFloat(node.style.top);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const title = node.title || '';
    const nameScore = title.startsWith(`${poi.name} ·`) ? 0 : title.includes(poi.name) ? 30 : 300;
    const score = Math.hypot(x - poi.x, y - poi.y) + nameScore;
    if (score < bestScore) { best = node; bestScore = score; }
  }
  return bestScore < 380 ? best : null;
}

function syncCache(
  layer: HTMLElement,
  cache: Map<string, MarkerNodeParts>,
  displays: DisplayMarker[],
  selectedId: string | null,
  onSelect?: (display: DisplayMarker) => void,
) {
  const alive = new Set<string>();
  for (const display of displays) {
    const key = display.poi.id;
    alive.add(key);
    let parts = cache.get(key);
    if (!parts) {
      parts = createMarkerNode(key);
      cache.set(key, parts);
      layer.appendChild(parts.root);
      if (onSelect) parts.root.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const current = cache.get(key)?.root;
        if (!current) return;
        const latest = getLastMapPois().find((poi) => poi.id === key) ?? display.poi;
        onSelect({ poi: latest, badge: display.badge });
      });
    }
    applyDisplay(parts, display, selectedId === key);
  }
  for (const [key, parts] of [...cache]) {
    if (alive.has(key)) continue;
    parts.root.remove();
    cache.delete(key);
  }
}

function drawSafeZones(ctx: CanvasRenderingContext2D, point: PlayerPoint, width: number, height: number) {
  if (!filterEnabled('safeZones')) return;
  const runtime = getPreparedPublishedWorldRuntime();
  if (!runtime) return;
  const map = runtime.document;
  const pixelsPerWorld = width / 2 / Math.max(1, point.range);
  const toX = (x: number) => width / 2 + (x - point.x) * pixelsPerWorld;
  const toY = (y: number) => height / 2 + (y - point.y) * pixelsPerWorld;
  for (const zone of map.zones.filter((entry) => entry.kind === 'safe')) {
    const x = zone.x * map.tileSize;
    const y = zone.y * map.tileSize;
    const w = zone.width * map.tileSize;
    const h = zone.height * map.tileSize;
    ctx.fillStyle = 'rgba(103,157,91,.12)';
    ctx.strokeStyle = 'rgba(193,218,151,.48)';
    ctx.lineWidth = 2;
    ctx.fillRect(toX(x), toY(y), w * pixelsPerWorld, h * pixelsPerWorld);
    ctx.strokeRect(toX(x), toY(y), w * pixelsPerWorld, h * pixelsPerWorld);
  }
}

export function installMarkerRuntime() {
  if (document.documentElement.dataset.markerRuntimeV2 === 'ready') return;
  const legacyLayer = document.querySelector<HTMLElement>('#map-marker-layer');
  const world = document.querySelector<HTMLElement>('#map-world');
  const minimap = document.querySelector<HTMLElement>('#minimap-shell');
  const legacyCanvas = minimap?.querySelector<HTMLCanvasElement>('#minimap-canvas');
  const coords = minimap?.querySelector<HTMLElement>('#minimap-coords');
  if (!legacyLayer || !world || !minimap || !legacyCanvas || !coords) return;
  document.documentElement.dataset.markerRuntimeV2 = 'ready';

  const worldLayer = document.createElement('div');
  worldLayer.id = 'map-marker-layer-v2';
  world.appendChild(worldLayer);
  const worldCache = new Map<string, MarkerNodeParts>();
  let playerParts = createMarkerNode(WORLD_PLAYER_KEY);
  playerParts.root.classList.add('player');
  worldLayer.appendChild(playerParts.root);
  let selectedId: string | null = null;

  const miniCanvas = document.createElement('canvas');
  miniCanvas.className = 'minimap-v2-canvas';
  miniCanvas.width = legacyCanvas.width;
  miniCanvas.height = legacyCanvas.height;
  minimap.appendChild(miniCanvas);
  const miniCtx = miniCanvas.getContext('2d')!;
  const miniLayer = document.createElement('div');
  miniLayer.className = 'minimap-marker-layer-v2';
  minimap.appendChild(miniLayer);
  const miniCache = new Map<string, MarkerNodeParts>();
  const miniPlayer = createMarkerNode('__mini_player__');
  miniPlayer.root.classList.add('player');
  miniLayer.appendChild(miniPlayer.root);
  const raster = createMapWorldRaster(2200, 1600, document.querySelector<HTMLElement>('#minimap-name')?.textContent || 'Mundo');

  const layoutMinimap = () => {
    const left = legacyCanvas.offsetLeft;
    const top = legacyCanvas.offsetTop;
    const width = legacyCanvas.clientWidth;
    const height = legacyCanvas.clientHeight;
    for (const node of [miniCanvas, miniLayer]) {
      node.style.left = `${left}px`;
      node.style.top = `${top}px`;
      node.style.width = `${width}px`;
      node.style.height = `${height}px`;
    }
  };

  const displays = () => mergeQuestMarkers(getLastMapPois());

  const selectDisplay = (display: DisplayMarker) => {
    selectedId = display.poi.id;
    const legacy = findLegacyPoi(display.poi);
    legacy?.click();
    syncWorld();
  };

  const syncWorld = () => {
    const list = displays();
    syncCache(worldLayer, worldCache, list, selectedId, selectDisplay);
    const point = playerPoint();
    if (point) applyPlayer(playerParts, point.x, point.y);
  };

  const syncMinimap = () => {
    layoutMinimap();
    const point = playerPoint();
    if (!point) return;
    drawMapWorldCrop(miniCtx, raster, point.x, point.y, point.range * 2, miniCanvas.width, miniCanvas.height);
    drawSafeZones(miniCtx, point, miniCanvas.width, miniCanvas.height);

    const displayWidth = legacyCanvas.clientWidth;
    const displayHeight = legacyCanvas.clientHeight;
    const pixelsPerWorld = displayWidth / 2 / Math.max(1, point.range);
    const list = displays().filter((display) => {
      const x = displayWidth / 2 + (display.poi.x - point.x) * pixelsPerWorld;
      const y = displayHeight / 2 + (display.poi.y - point.y) * pixelsPerWorld;
      return x >= -24 && y >= -24 && x <= displayWidth + 24 && y <= displayHeight + 24;
    });
    syncCache(miniLayer, miniCache, list, null);
    for (const display of list) {
      const parts = miniCache.get(display.poi.id);
      if (!parts) continue;
      parts.root.style.left = `${displayWidth / 2 + (display.poi.x - point.x) * pixelsPerWorld}px`;
      parts.root.style.top = `${displayHeight / 2 + (display.poi.y - point.y) * pixelsPerWorld}px`;
    }
    applyPlayer(miniPlayer, displayWidth / 2, displayHeight / 2);
  };

  const syncAll = () => { syncWorld(); syncMinimap(); };
  const timer = window.setInterval(syncAll, 120);
  const observer = new MutationObserver(syncWorld);
  observer.observe(legacyLayer, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  const onStyle = () => syncAll();
  const onResize = () => { layoutMinimap(); syncMinimap(); };
  window.addEventListener(markerStylesChangedEvent(), onStyle);
  window.addEventListener('resize', onResize, { passive: true });

  syncAll();
  window.requestAnimationFrame(layoutMinimap);
  window.addEventListener('pagehide', () => {
    window.clearInterval(timer);
    observer.disconnect();
    window.removeEventListener(markerStylesChangedEvent(), onStyle);
    window.removeEventListener('resize', onResize);
  }, { once: true });
}
