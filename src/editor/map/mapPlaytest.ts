import './mapPlaytest.css';
import { preloadMapAssets } from './mapAssetRenderer';
import { hydrateAssetLibraryV2 } from './mapAssetLibraryV2';
import { objectBlocksPoint } from './mapAssetPresets';
import { drawConfiguredObject } from './mapObjectRenderer';
import { drawBlendedTerrainTile } from './mapTerrainBlend';
import { getPaletteEntry, MAP_PALETTE_ENTRIES } from './mapEditorCatalog';
import { listMapDocuments, loadMapDocument, loadOrCreateActiveMap } from './mapEditorStorage';
import { readPlaytestSnapshot, subscribeMapPreview } from './mapPreviewBridge';
import { worldLinkFrom, type WorldDirection } from './mapWorldStore';
import type { AscensionMapDocument } from './mapEditorTypes';
import { parseTileKey, tileKey } from './mapEditorTypes';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export async function startMapPlaytest() {
  await hydrateAssetLibraryV2();
  document.body.className = 'map-playtest-mode';
  document.title = 'Ascension • Map Playtest';
  const mount = document.querySelector<HTMLElement>('#app') ?? document.body;
  mount.innerHTML = `
    <div class="map-playtest">
      <div class="mpt-bar">
        <strong class="mpt-brand">ASCENSION MAP PLAYTEST</strong>
        <span class="mpt-live">● LIVE</span>
        <span class="mpt-meta" id="mpt-map-name"></span>
        <span class="mpt-meta secondary" id="mpt-position"></span>
        <div class="mpt-spacer"></div>
        <button id="mpt-collision">Colisão</button>
        <button id="mpt-grid">Grade</button>
        <button id="mpt-back">← Editor</button>
      </div>
      <main class="mpt-stage" id="mpt-stage">
        <canvas class="mpt-canvas" id="mpt-canvas"></canvas>
        <div class="mpt-help"><strong>WASD / setas</strong> mover • atravesse uma borda conectada para trocar de mapa<br>Entre em um portal configurado para testar viagens internas.</div>
        <div class="mpt-toast" id="mpt-toast"></div>
      </main>
    </div>`;

  const canvas = mount.querySelector<HTMLCanvasElement>('#mpt-canvas')!;
  const stage = mount.querySelector<HTMLElement>('#mpt-stage')!;
  const ctx = canvas.getContext('2d')!;
  const nameNode = mount.querySelector<HTMLElement>('#mpt-map-name')!;
  const positionNode = mount.querySelector<HTMLElement>('#mpt-position')!;
  const toast = mount.querySelector<HTMLElement>('#mpt-toast')!;
  let showCollision = false;
  let showGrid = false;
  let toastTimer = 0;
  let lastTime = performance.now();
  let transitionBlockedUntil = 0;
  let scale = 1.6;
  const keys = new Set<string>();

  const id = new URLSearchParams(location.search).get('id') ?? undefined;
  let mapDoc: AscensionMapDocument = readPlaytestSnapshot(id) ?? (id ? loadMapDocument(id) : null) ?? loadOrCreateActiveMap();

  const spawnFor = (document: AscensionMapDocument) => {
    const zone = document.zones.find((value) => value.kind === 'respawn');
    return zone
      ? { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 }
      : { x: document.width / 2, y: document.height / 2 };
  };

  let player = spawnFor(mapDoc);

  const showToast = (message: string) => {
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 1900);
  };

  const resize = () => {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scale = clamp(Math.min(rect.width / 900, rect.height / 600) * 2, .8, 2.2);
  };

  const objectBlocks = (x: number, y: number) => mapDoc.objects.some((object) => objectBlocksPoint(getPaletteEntry(object.assetId), object, x, y));

  const blocked = (x: number, y: number) => {
    const tileX = Math.floor(x), tileY = Math.floor(y);
    if (tileX < 0 || tileY < 0 || tileX >= mapDoc.width || tileY >= mapDoc.height) return true;
    return mapDoc.collision.includes(tileKey(tileX, tileY)) || objectBlocks(x, y);
  };

  const loadTravelMap = (targetId: string) => loadMapDocument(targetId) ?? (readPlaytestSnapshot(targetId) ?? null);

  const travelAcrossEdge = (direction: WorldDirection) => {
    if (performance.now() < transitionBlockedUntil) return false;
    const documents = listMapDocuments();
    const link = worldLinkFrom(mapDoc.id, direction, documents);
    if (!link) return false;
    const next = loadTravelMap(link.toMapId);
    if (!next) return false;

    const previous = mapDoc;
    const normalizedX = clamp(player.x / Math.max(1, previous.width), 0, 1);
    const normalizedY = clamp(player.y / Math.max(1, previous.height), 0, 1);
    mapDoc = next;
    if (direction === 'east') player = { x: .58, y: clamp(normalizedY * next.height, .58, next.height - .58) };
    if (direction === 'west') player = { x: next.width - .58, y: clamp(normalizedY * next.height, .58, next.height - .58) };
    if (direction === 'south') player = { x: clamp(normalizedX * next.width, .58, next.width - .58), y: .58 };
    if (direction === 'north') player = { x: clamp(normalizedX * next.width, .58, next.width - .58), y: next.height - .58 };
    transitionBlockedUntil = performance.now() + 450;
    preloadMapAssets(MAP_PALETTE_ENTRIES, render);
    showToast(`${previous.name} → ${next.name}`);
    return true;
  };

  const tryEdgeTransition = (x: number, y: number) => {
    if (x < .12) return travelAcrossEdge('west');
    if (x > mapDoc.width - .12) return travelAcrossEdge('east');
    if (y < .12) return travelAcrossEdge('north');
    if (y > mapDoc.height - .12) return travelAcrossEdge('south');
    return false;
  };

  const tryPortalTransition = () => {
    if (performance.now() < transitionBlockedUntil) return false;
    const portal = mapDoc.objects.find((object) => {
      if (object.kind !== 'portal') return false;
      const targetMapId = String(object.properties?.targetMapId ?? '');
      if (!targetMapId) return false;
      const dx = player.x - (object.x + .5), dy = player.y - (object.y + .5);
      return dx * dx + dy * dy <= .32;
    });
    if (!portal) return false;
    const targetMapId = String(portal.properties?.targetMapId ?? '');
    const next = loadTravelMap(targetMapId);
    if (!next) { showToast('O destino deste portal não existe.'); transitionBlockedUntil = performance.now() + 800; return false; }
    const previous = mapDoc;
    mapDoc = next;
    const targetX = Number(portal.properties?.targetX ?? spawnFor(next).x);
    const targetY = Number(portal.properties?.targetY ?? spawnFor(next).y);
    player = { x: clamp(targetX, .58, next.width - .58), y: clamp(targetY, .58, next.height - .58) };
    transitionBlockedUntil = performance.now() + 850;
    preloadMapAssets(MAP_PALETTE_ENTRIES, render);
    showToast(`${previous.name} → ${next.name}`);
    return true;
  };

  const attemptMove = (dx: number, dy: number) => {
    const radius = .22;
    const canStand = (x: number, y: number) => !blocked(x - radius, y - radius) && !blocked(x + radius, y - radius) && !blocked(x - radius, y + radius) && !blocked(x + radius, y + radius);
    let nextX = player.x + dx;
    let nextY = player.y + dy;

    if (nextX < .12 || nextX > mapDoc.width - .12 || nextY < .12 || nextY > mapDoc.height - .12) {
      if (tryEdgeTransition(nextX, nextY)) return;
      nextX = clamp(nextX, .22, mapDoc.width - .22);
      nextY = clamp(nextY, .22, mapDoc.height - .22);
    }

    if (canStand(nextX, player.y)) player.x = nextX;
    if (canStand(player.x, nextY)) player.y = nextY;
    tryPortalTransition();
  };

  const render = (now = performance.now()) => {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#070b0f'; ctx.fillRect(0, 0, width, height);

    const tilePx = mapDoc.tileSize * scale;
    const cameraX = player.x * tilePx - width / 2;
    const cameraY = player.y * tilePx - height / 2;
    const startX = clamp(Math.floor(cameraX / tilePx) - 2, 0, mapDoc.width - 1);
    const startY = clamp(Math.floor(cameraY / tilePx) - 2, 0, mapDoc.height - 1);
    const endX = clamp(Math.ceil((cameraX + width) / tilePx) + 2, 0, mapDoc.width - 1);
    const endY = clamp(Math.ceil((cameraY + height) / tilePx) + 2, 0, mapDoc.height - 1);

    for (let y = startY; y <= endY; y++) for (let x = startX; x <= endX; x++) {
      const sx = x * tilePx - cameraX, sy = y * tilePx - cameraY;
      drawBlendedTerrainTile(ctx, mapDoc, { x, y, screenX: sx, screenY: sy, tilePixels: tilePx, layer: 'ground', onReady: render, now });
      if (mapDoc.tiles[tileKey(x, y)]?.detail) drawBlendedTerrainTile(ctx, mapDoc, { x, y, screenX: sx, screenY: sy, tilePixels: tilePx, layer: 'detail', alpha: .82, onReady: render, now });
    }

    for (const zone of mapDoc.zones) {
      const sx = zone.x * tilePx - cameraX, sy = zone.y * tilePx - cameraY;
      ctx.fillStyle = zone.kind === 'safe' ? 'rgba(96,210,130,.06)' : zone.kind === 'pvp' ? 'rgba(220,80,80,.07)' : 'rgba(110,175,220,.04)';
      ctx.fillRect(sx, sy, zone.width * tilePx, zone.height * tilePx);
    }

    const sortedObjects = [...mapDoc.objects].sort((a, b) => (a.y + (a.height ?? 1)) - (b.y + (b.height ?? 1)));
    for (const object of sortedObjects) {
      drawConfiguredObject(ctx, getPaletteEntry(object.assetId), {
        object,
        x: (object.x + .5) * tilePx - cameraX,
        y: (object.y + 1) * tilePx - cameraY,
        tilePixels: tilePx,
        scale: object.scale ?? 1,
        showHitbox: showCollision,
        showLight: true,
        onReady: render,
        now,
      });
    }

    if (showCollision) {
      ctx.fillStyle = 'rgba(240,70,70,.28)';
      for (const key of mapDoc.collision) {
        const point = parseTileKey(key);
        ctx.fillRect(point.x * tilePx - cameraX, point.y * tilePx - cameraY, tilePx, tilePx);
      }
    }

    if (showGrid && tilePx >= 10) {
      ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1;
      for (let x = startX; x <= endX + 1; x++) { const sx = x * tilePx - cameraX; ctx.moveTo(sx, 0); ctx.lineTo(sx, height); }
      for (let y = startY; y <= endY + 1; y++) { const sy = y * tilePx - cameraY; ctx.moveTo(0, sy); ctx.lineTo(width, sy); }
      ctx.stroke();
    }

    const playerAsset = getPaletteEntry('pc_knight_npc');
    drawConfiguredObject(ctx, playerAsset, {
      object: { id: 'playtest-player', kind: 'npc', assetId: playerAsset.id, x: 0, y: 0, scale: 1, properties: {} },
      x: width / 2, y: height / 2 + tilePx * .5, tilePixels: tilePx, selected: true, onReady: render, now,
    });

    nameNode.textContent = mapDoc.name;
    positionNode.textContent = `X ${player.x.toFixed(1)} • Y ${player.y.toFixed(1)}`;
  };

  const update = (time: number) => {
    const dt = Math.min(.05, Math.max(0, (time - lastTime) / 1000));
    lastTime = time;
    let dx = 0, dy = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) dy -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) dy += 1;
    if (dx || dy) {
      const length = Math.hypot(dx, dy) || 1;
      attemptMove(dx / length * 4.2 * dt, dy / length * 4.2 * dt);
    }
    render(time);
    requestAnimationFrame(update);
  };

  window.addEventListener('keydown', (event) => { keys.add(event.code); if (event.code.startsWith('Arrow')) event.preventDefault(); });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());
  mount.querySelector<HTMLButtonElement>('#mpt-collision')!.onclick = (event) => { showCollision = !showCollision; (event.currentTarget as HTMLButtonElement).classList.toggle('active', showCollision); };
  mount.querySelector<HTMLButtonElement>('#mpt-grid')!.onclick = (event) => { showGrid = !showGrid; (event.currentTarget as HTMLButtonElement).classList.toggle('active', showGrid); };
  mount.querySelector<HTMLButtonElement>('#mpt-back')!.onclick = () => { if (window.opener) window.close(); else location.href = `${location.pathname}?editor=map&id=${encodeURIComponent(mapDoc.id)}`; };

  const unsubscribe = subscribeMapPreview((next) => {
    if (next.id !== mapDoc.id) return;
    mapDoc = next;
    player.x = clamp(player.x, .5, mapDoc.width - .5);
    player.y = clamp(player.y, .5, mapDoc.height - .5);
    showToast('Mapa atualizado pelo Editor.');
    preloadMapAssets(MAP_PALETTE_ENTRIES, render);
  });
  window.addEventListener('pagehide', unsubscribe, { once: true });

  const observer = new ResizeObserver(() => { resize(); render(); });
  observer.observe(stage);
  preloadMapAssets(MAP_PALETTE_ENTRIES, render);
  resize();
  requestAnimationFrame(update);
}
