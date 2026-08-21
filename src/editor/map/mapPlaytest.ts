import './mapPlaytest.css';
import { drawObjectAsset, drawTerrainAsset, preloadMapAssets } from './mapAssetRenderer';
import { getPaletteEntry, MAP_PALETTE_ENTRIES } from './mapEditorCatalog';
import { loadMapDocument, loadOrCreateActiveMap } from './mapEditorStorage';
import { readPlaytestSnapshot, subscribeMapPreview } from './mapPreviewBridge';
import type { AscensionMapDocument } from './mapEditorTypes';
import { parseTileKey, tileKey } from './mapEditorTypes';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function startMapPlaytest() {
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
        <div class="mpt-help"><strong>WASD / setas</strong> mover • atualizações do Editor entram ao vivo<br>Esta sessão não publica alterações no jogo principal.</div>
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
  let scale = 1.6;
  const keys = new Set<string>();

  const id = new URLSearchParams(location.search).get('id') ?? undefined;
  let mapDoc: AscensionMapDocument = readPlaytestSnapshot(id) ?? (id ? loadMapDocument(id) : null) ?? loadOrCreateActiveMap();
  const spawnZone = mapDoc.zones.find((zone) => zone.kind === 'respawn');
  let player = spawnZone
    ? { x: spawnZone.x + spawnZone.width / 2, y: spawnZone.y + spawnZone.height / 2 }
    : { x: mapDoc.width / 2, y: mapDoc.height / 2 };

  const showToast = (message: string) => {
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 1600);
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

  const objectBlocksTile = (tileX: number, tileY: number) => mapDoc.objects.some((object) => {
    const entry = getPaletteEntry(object.assetId);
    const collision = entry.footprint?.collision;
    if (!collision?.length) return false;
    return collision.some((cell) => object.x + cell.x === tileX && object.y + cell.y === tileY);
  });

  const blocked = (x: number, y: number) => {
    const tileX = Math.floor(x), tileY = Math.floor(y);
    if (tileX < 0 || tileY < 0 || tileX >= mapDoc.width || tileY >= mapDoc.height) return true;
    return mapDoc.collision.includes(tileKey(tileX, tileY)) || objectBlocksTile(tileX, tileY);
  };

  const attemptMove = (dx: number, dy: number) => {
    const radius = .22;
    const canStand = (x: number, y: number) => !blocked(x - radius, y - radius) && !blocked(x + radius, y - radius) && !blocked(x - radius, y + radius) && !blocked(x + radius, y + radius);
    const nextX = player.x + dx;
    if (canStand(nextX, player.y)) player.x = nextX;
    const nextY = player.y + dy;
    if (canStand(player.x, nextY)) player.y = nextY;
  };

  const render = () => {
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
      const tile = mapDoc.tiles[tileKey(x, y)] ?? { ground: 'grass' };
      const sx = x * tilePx - cameraX, sy = y * tilePx - cameraY;
      drawTerrainAsset(ctx, getPaletteEntry(tile.ground ?? 'grass'), sx, sy, tilePx, 1, render);
      if (tile.detail) drawTerrainAsset(ctx, getPaletteEntry(tile.detail), sx, sy, tilePx, .72, render);
    }

    for (const zone of mapDoc.zones) {
      const sx = zone.x * tilePx - cameraX, sy = zone.y * tilePx - cameraY;
      ctx.fillStyle = zone.kind === 'safe' ? 'rgba(96,210,130,.06)' : zone.kind === 'pvp' ? 'rgba(220,80,80,.07)' : 'rgba(110,175,220,.04)';
      ctx.fillRect(sx, sy, zone.width * tilePx, zone.height * tilePx);
    }

    const sortedObjects = [...mapDoc.objects].sort((a, b) => (a.y + (a.height ?? 1)) - (b.y + (b.height ?? 1)));
    for (const object of sortedObjects) {
      const anchorX = (object.x + .5) * tilePx - cameraX;
      const anchorY = (object.y + 1) * tilePx - cameraY;
      drawObjectAsset(ctx, getPaletteEntry(object.assetId), { x: anchorX, y: anchorY, tilePixels: tilePx, scale: object.scale ?? 1, onReady: render });
    }

    if (showCollision) {
      ctx.fillStyle = 'rgba(240,70,70,.28)';
      for (const key of mapDoc.collision) {
        const point = parseTileKey(key);
        ctx.fillRect(point.x * tilePx - cameraX, point.y * tilePx - cameraY, tilePx, tilePx);
      }
      for (const object of mapDoc.objects) {
        const collision = getPaletteEntry(object.assetId).footprint?.collision ?? [];
        for (const cell of collision) ctx.fillRect((object.x + cell.x) * tilePx - cameraX, (object.y + cell.y) * tilePx - cameraY, tilePx, tilePx);
      }
    }

    if (showGrid && tilePx >= 10) {
      ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1;
      for (let x = startX; x <= endX + 1; x++) { const sx = x * tilePx - cameraX; ctx.moveTo(sx, 0); ctx.lineTo(sx, height); }
      for (let y = startY; y <= endY + 1; y++) { const sy = y * tilePx - cameraY; ctx.moveTo(0, sy); ctx.lineTo(width, sy); }
      ctx.stroke();
    }

    drawObjectAsset(ctx, getPaletteEntry('pc_knight_npc'), { x: width / 2, y: height / 2 + tilePx * .5, tilePixels: tilePx, selected: true, onReady: render });
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
    render();
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
