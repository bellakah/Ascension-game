import './mapSystem.css';
import './mapSystemStage4.css';
import type { Container } from 'pixi.js';
import type { CharacterProgress } from '../character/characterCreator';
import type { Monster } from '../game/monsterSystem';
import type { VillageMerchant } from '../game/villageNpcs';
import { VILLAGES, WORLD_H, WORLD_W } from '../game/world';
import { getMapPois, type MapPoi } from './mapCatalog';
import { getPreparedPublishedWorldRuntime } from './publishedMapRuntime';
import { ensureMapState, MAP_FILTER_KEYS, setMapFilter, setMapZoom, setMinimapRange, type MapFilterKey } from './mapState';
import { createMapWorldRaster, drawMapWorldCrop } from './mapWorldRaster';

type MapSystemOptions = {
  player: Container;
  elandra: Container;
  merchants: VillageMerchant[];
  monsters: Monster[];
  onChanged: () => void;
};

type UiSafeZone = { id: string; name: string; x: number; y: number; width: number; height: number };

const FILTER_META: Record<MapFilterKey, { icon: string; label: string; description: string }> = {
  npc: { icon: '◆', label: 'NPCs', description: 'Guias e personagens sem loja.' },
  quests: { icon: '!', label: 'Missões', description: 'Missões disponíveis e entregas.' },
  shops: { icon: '🪙', label: 'Lojas', description: 'Ferreiro, alquimista e comerciantes.' },
  bank: { icon: '🏦', label: 'Banco', description: 'Banqueiros e serviços de armazém.' },
  crafting: { icon: '⚒', label: 'Crafting', description: 'Forjas, alquimia e estações.' },
  herbs: { icon: '✿', label: 'Ervas', description: 'Recursos de herborismo.' },
  mining: { icon: '⛏', label: 'Minérios', description: 'Veios de mineração.' },
  wood: { icon: '🪓', label: 'Madeira', description: 'Árvores coletáveis.' },
  monsters: { icon: '☠', label: 'Monstros', description: 'Criaturas hostis vivas.' },
  landmarks: { icon: '⌖', label: 'Pontos', description: 'Poços e locais importantes.' },
  safeZones: { icon: '🛡', label: 'Áreas seguras', description: 'Regiões protegidas.' },
  respawn: { icon: '✦', label: 'Renascimento', description: 'Pontos de retorno após a morte.' },
  portals: { icon: '⇄', label: 'Portais', description: 'Teleportadores e saídas futuras.' },
};

const IMPORTANT_LABELS: MapFilterKey[] = ['npc', 'quests', 'shops', 'bank', 'crafting', 'respawn'];

function esc(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
}

export function createMapSystem(progress: CharacterProgress, options: MapSystemOptions) {
  const state = ensureMapState(progress);
  const publishedRuntime = getPreparedPublishedWorldRuntime();
  const fallbackMapName = progress.map || 'Floresta Inicial';
  const raster = createMapWorldRaster(WORLD_W, WORLD_H, fallbackMapName);
  const worldWidth = raster.worldWidth;
  const worldHeight = raster.worldHeight;
  let selectedId: string | null = null;
  let zoom = state.fullZoom;
  let panX = 0, panY = 0;
  let updateMs = 0;

  const currentMap = () => raster.mapName || fallbackMapName;
  const safeZones = (): UiSafeZone[] => {
    if (publishedRuntime) {
      const map = publishedRuntime.document;
      return map.zones.filter((zone) => zone.kind === 'safe').map((zone) => ({
        id: zone.id,
        name: zone.name || map.name,
        x: zone.x * map.tileSize,
        y: zone.y * map.tileSize,
        width: zone.width * map.tileSize,
        height: zone.height * map.tileSize,
      }));
    }
    return VILLAGES.filter((entry) => entry.map === fallbackMapName).map((village) => ({
      id: village.id,
      name: village.name,
      ...village.safeZone,
    }));
  };

  const minimap = document.createElement('button');
  minimap.id = 'minimap-shell';
  minimap.type = 'button';
  minimap.title = 'Abrir mapa (M)';
  minimap.innerHTML = `<div class="minimap-heading"><b id="minimap-name">${esc(currentMap())}</b><span class="minimap-north">N</span></div><canvas id="minimap-canvas" width="400" height="352"></canvas><div class="minimap-footer"><span id="minimap-coords"></span><strong>M · MAPA</strong></div>`;
  document.body.appendChild(minimap);

  const root = document.createElement('div');
  root.id = 'map-overlay';
  root.className = 'map-hidden';
  root.innerHTML = `<section class="map-window" role="dialog" aria-modal="true" aria-label="Mapa Mundial">
    <header class="map-header">
      <div class="map-title-block"><span class="map-kicker">CARTOGRAFIA DE ASCENSION</span><h2>Mapa Mundial</h2></div>
      <div class="map-header-center"><select class="map-select" aria-label="Mapa"><option>${esc(currentMap())}</option></select><button class="map-tool map-filter-toggle" data-map-action="filters" title="Filtros">☷</button><button class="map-tool" data-map-action="zoom-out" title="Diminuir zoom">−</button><button class="map-tool" data-map-action="zoom-in" title="Aumentar zoom">＋</button><button class="map-tool" data-map-action="center" title="Centralizar no personagem">◎</button><button class="map-tool map-close" data-map-action="close" title="Fechar">×</button></div>
    </header>
    <div class="map-main">
      <aside class="map-sidebar left"><h3>O que mostrar</h3><p class="map-sidebar-intro">Escolha quais informações aparecem no mapa e no minimapa.</p><div class="map-filter-list">${MAP_FILTER_KEYS.map((key) => `<label class="map-filter"><input type="checkbox" data-map-filter="${key}" ${state.filters[key] ? 'checked' : ''}><span class="map-filter-icon">${FILTER_META[key].icon}</span><span class="map-filter-copy"><b>${FILTER_META[key].label}</b><small>${FILTER_META[key].description}</small></span></label>`).join('')}</div></aside>
      <div class="map-viewport" id="map-viewport"><div class="map-world" id="map-world"><div class="map-zone-layer" id="map-zone-layer"></div><div class="map-marker-layer" id="map-marker-layer"></div></div></div>
      <aside class="map-sidebar right" id="map-details"><div class="map-details-empty"><span>⌖</span><strong>Selecione um ponto</strong><p>Toque em um marcador para ver os detalhes.</p></div></aside>
    </div>
    <footer class="map-footer"><span>Arraste para navegar · roda/pinça para zoom · <strong>M</strong> fechar</span><span id="map-footer-position"></span><span id="map-footer-zoom"></span></footer>
  </section>`;
  document.body.appendChild(root);

  const canvas = minimap.querySelector<HTMLCanvasElement>('#minimap-canvas')!;
  const ctx = canvas.getContext('2d')!;
  const miniCoords = minimap.querySelector<HTMLElement>('#minimap-coords')!;
  const miniName = minimap.querySelector<HTMLElement>('#minimap-name')!;
  const viewport = root.querySelector<HTMLElement>('#map-viewport')!;
  const world = root.querySelector<HTMLElement>('#map-world')!;
  const markerLayer = root.querySelector<HTMLElement>('#map-marker-layer')!;
  const zoneLayer = root.querySelector<HTMLElement>('#map-zone-layer')!;
  const details = root.querySelector<HTMLElement>('#map-details')!;
  const footerPosition = root.querySelector<HTMLElement>('#map-footer-position')!;
  const footerZoom = root.querySelector<HTMLElement>('#map-footer-zoom')!;

  world.style.width = `${worldWidth}px`;
  world.style.height = `${worldHeight}px`;
  raster.canvas.style.width = `${worldWidth}px`;
  raster.canvas.style.height = `${worldHeight}px`;
  world.prepend(raster.canvas);

  const allPois = () => getMapPois({ progress, elandra: options.elandra, merchants: options.merchants, monsters: options.monsters });
  const visiblePois = () => allPois().filter((poi) => poi.map === currentMap() && state.filters[poi.filter]);

  const baseScale = () => Math.max(.08, Math.min((viewport.clientWidth - 18) / worldWidth, (viewport.clientHeight - 18) / worldHeight));
  const scale = () => baseScale() * zoom;

  const clampPan = () => {
    const scaledW = worldWidth * scale(), scaledH = worldHeight * scale();
    panX = scaledW <= viewport.clientWidth ? (viewport.clientWidth - scaledW) / 2 : Math.max(viewport.clientWidth - scaledW, Math.min(0, panX));
    panY = scaledH <= viewport.clientHeight ? (viewport.clientHeight - scaledH) / 2 : Math.max(viewport.clientHeight - scaledH, Math.min(0, panY));
  };

  const applyTransform = () => {
    clampPan();
    world.style.transform = `translate(${panX}px,${panY}px) scale(${scale()})`;
    footerZoom.textContent = `Zoom ${Math.round(zoom * 100)}%`;
  };

  const centerAt = (x: number, y: number) => {
    panX = viewport.clientWidth / 2 - x * scale();
    panY = viewport.clientHeight / 2 - y * scale();
    applyTransform();
  };

  const centerPlayer = () => centerAt(options.player.x, options.player.y);

  const zoomAt = (next: number, focusX = viewport.clientWidth / 2, focusY = viewport.clientHeight / 2, persist = true) => {
    const oldScale = scale();
    const worldX = (focusX - panX) / oldScale;
    const worldY = (focusY - panY) / oldScale;
    zoom = Math.max(.75, Math.min(3, next));
    const nextScale = scale();
    panX = focusX - worldX * nextScale;
    panY = focusY - worldY * nextScale;
    applyTransform();
    if (persist) { setMapZoom(progress, zoom); options.onChanged(); }
    renderMarkers();
  };

  const renderZones = () => {
    zoneLayer.replaceChildren();
    if (!state.filters.safeZones) return;
    for (const zone of safeZones()) {
      const node = document.createElement('div');
      node.className = 'map-safe-zone';
      node.style.left = `${zone.x}px`; node.style.top = `${zone.y}px`;
      node.style.width = `${zone.width}px`; node.style.height = `${zone.height}px`;
      node.innerHTML = `<span>🛡 ${esc(zone.name)}</span>`;
      zoneLayer.appendChild(node);
    }
  };

  const renderDetails = (pois = allPois()) => {
    const poi = selectedId ? pois.find((entry) => entry.id === selectedId) : undefined;
    if (!poi) {
      details.innerHTML = '<div class="map-details-empty"><span>⌖</span><strong>Selecione um ponto</strong><p>Toque em um marcador para ver os detalhes.</p></div>';
      return;
    }
    details.innerHTML = `<div class="map-details-card"><div class="map-details-icon">${poi.icon}</div><div><h3>${esc(poi.name)}</h3><p>${esc(poi.subtitle)}</p></div><div class="map-detail-meta"><div><span>Categoria</span><strong>${FILTER_META[poi.filter].label}</strong></div><div><span>Mapa</span><strong>${esc(poi.map)}</strong></div><div><span>Coordenadas</span><strong>${Math.round(poi.x)}, ${Math.round(poi.y)}</strong></div></div><button class="map-primary" id="map-center-selected" type="button">◎ Centralizar neste ponto</button></div>`;
    details.querySelector<HTMLButtonElement>('#map-center-selected')?.addEventListener('click', () => centerAt(poi.x, poi.y));
  };

  const renderMarkers = () => {
    const pois = visiblePois();
    markerLayer.replaceChildren();
    const player = document.createElement('div');
    player.className = 'map-player-marker'; player.textContent = '▲';
    player.style.left = `${options.player.x}px`; player.style.top = `${options.player.y}px`;
    markerLayer.appendChild(player);

    for (const poi of pois) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `map-poi${selectedId === poi.id ? ' selected' : ''}`;
      button.dataset.tone = poi.tone ?? 'neutral';
      button.style.left = `${poi.x}px`; button.style.top = `${poi.y}px`;
      button.title = `${poi.name} · ${poi.subtitle}`;
      const showLabel = IMPORTANT_LABELS.includes(poi.filter) || zoom >= 1.45;
      button.innerHTML = `<span>${poi.icon}</span>${showLabel ? `<span class="map-poi-label">${esc(poi.name)}</span>` : ''}`;
      button.addEventListener('pointerdown', (event) => event.stopPropagation());
      button.addEventListener('click', (event) => { event.stopPropagation(); selectedId = poi.id; renderMarkers(); renderDetails(); });
      markerLayer.appendChild(button);
    }
    renderZones();
    renderDetails();
    footerPosition.textContent = `Você · ${Math.round(options.player.x)}, ${Math.round(options.player.y)}`;
  };

  const drawMinimap = () => {
    const w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2;
    const range = state.minimapRange;
    const pixelsPerWorld = cx / range;
    const toX = (x: number) => cx + (x - options.player.x) * pixelsPerWorld;
    const toY = (y: number) => cy + (y - options.player.y) * pixelsPerWorld;
    ctx.clearRect(0, 0, w, h);
    drawMapWorldCrop(ctx, raster, options.player.x, options.player.y, range * 2, w, h);

    if (state.filters.safeZones) {
      for (const zone of safeZones()) {
        const x = toX(zone.x), y = toY(zone.y);
        const width = zone.width * pixelsPerWorld, height = zone.height * pixelsPerWorld;
        ctx.fillStyle = 'rgba(107,177,113,.14)'; ctx.fillRect(x, y, width, height);
        ctx.strokeStyle = 'rgba(204,224,164,.62)'; ctx.lineWidth = 3; ctx.strokeRect(x, y, width, height);
      }
    }

    const pois = visiblePois();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 24px system-ui, sans-serif';
    for (const poi of pois) {
      const x = toX(poi.x), y = toY(poi.y);
      if (x < -20 || x > w + 20 || y < -20 || y > h + 20) continue;
      ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.fillStyle = poi.tone === 'danger' ? 'rgba(112,45,48,.92)' : poi.tone === 'quest' ? 'rgba(131,94,22,.94)' : poi.tone === 'resource' ? 'rgba(34,79,50,.94)' : 'rgba(8,25,32,.92)';
      ctx.fill(); ctx.strokeStyle = 'rgba(225,195,116,.45)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#f4f2e9'; ctx.fillText(poi.icon, x, y + 1);
    }

    ctx.save(); ctx.translate(cx, cy); ctx.fillStyle = '#d9b85e'; ctx.strokeStyle = '#fff4c9'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(12, 12); ctx.lineTo(0, 7); ctx.lineTo(-12, 12); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    const vignette = ctx.createRadialGradient(cx, cy, Math.min(w, h) * .24, cx, cy, Math.max(w, h) * .7);
    vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(1,8,11,.34)');
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(218,184,96,.38)'; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
    miniCoords.textContent = `${Math.round(options.player.x)}, ${Math.round(options.player.y)} · ${Math.round(range)}m`;
    miniName.textContent = currentMap();
  };

  const refreshFilters = () => {
    root.querySelectorAll<HTMLInputElement>('[data-map-filter]').forEach((input) => { input.checked = state.filters[input.dataset.mapFilter as MapFilterKey]; });
  };

  root.querySelectorAll<HTMLInputElement>('[data-map-filter]').forEach((input) => input.addEventListener('change', () => {
    const key = input.dataset.mapFilter as MapFilterKey;
    setMapFilter(progress, key, input.checked);
    options.onChanged(); renderMarkers(); drawMinimap();
  }));

  root.querySelector<HTMLButtonElement>('[data-map-action="close"]')!.addEventListener('click', () => close());
  root.querySelector<HTMLButtonElement>('[data-map-action="center"]')!.addEventListener('click', centerPlayer);
  root.querySelector<HTMLButtonElement>('[data-map-action="zoom-in"]')!.addEventListener('click', () => zoomAt(zoom + .25));
  root.querySelector<HTMLButtonElement>('[data-map-action="zoom-out"]')!.addEventListener('click', () => zoomAt(zoom - .25));
  root.querySelector<HTMLButtonElement>('[data-map-action="filters"]')!.addEventListener('click', () => root.classList.toggle('filters-open'));

  minimap.addEventListener('click', () => open());
  minimap.addEventListener('wheel', (event) => {
    event.preventDefault();
    setMinimapRange(progress, state.minimapRange + (event.deltaY > 0 ? 80 : -80));
    options.onChanged(); drawMinimap();
  }, { passive: false });

  viewport.addEventListener('wheel', (event) => {
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    zoomAt(zoom * (event.deltaY > 0 ? .9 : 1.1), event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });

  const pointers = new Map<number, { x: number; y: number }>();
  let lastCenter: { x: number; y: number } | null = null;
  let lastDistance = 0;
  const gesture = () => {
    const points = [...pointers.values()];
    const center = points.length === 1 ? points[0] : { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
    const distance = points.length > 1 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0;
    return { center, distance };
  };

  viewport.addEventListener('pointerdown', (event) => {
    if ((event.target as HTMLElement).closest('.map-poi')) return;
    viewport.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const next = gesture(); lastCenter = next.center; lastDistance = next.distance; viewport.classList.add('dragging');
  });
  viewport.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const next = gesture();
    if (lastCenter) {
      panX += next.center.x - lastCenter.x; panY += next.center.y - lastCenter.y;
      if (pointers.size > 1 && lastDistance > 0 && next.distance > 0) {
        const rect = viewport.getBoundingClientRect();
        zoomAt(zoom * next.distance / lastDistance, next.center.x - rect.left, next.center.y - rect.top, false);
      } else applyTransform();
    }
    lastCenter = next.center; lastDistance = next.distance;
  });
  const endPointer = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    if (!pointers.size) {
      viewport.classList.remove('dragging'); lastCenter = null; lastDistance = 0;
      setMapZoom(progress, zoom); options.onChanged();
    } else { const next = gesture(); lastCenter = next.center; lastDistance = next.distance; }
  };
  viewport.addEventListener('pointerup', endPointer); viewport.addEventListener('pointercancel', endPointer);

  root.addEventListener('pointerdown', (event) => { if (event.target === root) close(); });
  window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && isOpen()) close(); });
  window.addEventListener('resize', () => { if (isOpen()) window.requestAnimationFrame(centerPlayer); drawMinimap(); }, { passive: true });

  function open() {
    root.classList.remove('map-hidden'); root.classList.remove('filters-open');
    zoom = ensureMapState(progress).fullZoom; refreshFilters(); renderMarkers();
    window.requestAnimationFrame(() => centerPlayer());
  }
  function close() { root.classList.add('map-hidden'); root.classList.remove('filters-open'); }
  function toggle() { isOpen() ? close() : open(); }
  function isOpen() { return !root.classList.contains('map-hidden'); }
  function update(deltaMs = 16) {
    updateMs += deltaMs;
    if (updateMs < 140) return;
    updateMs = 0; drawMinimap();
    if (isOpen()) renderMarkers();
  }
  function refresh() { refreshFilters(); drawMinimap(); if (isOpen()) renderMarkers(); }

  drawMinimap();
  return { root, minimap, open, close, toggle, isOpen, update, refresh, centerPlayer };
}
