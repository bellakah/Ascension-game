import './mapSystemStage4Polish.css';

type Point = { x: number; y: number };

const COORDINATE_PATTERN = /(-?\d+)\s*,\s*(-?\d+)/;
const MIN_MOVEMENT = 0.75;
const MAX_TRACKED_MOVEMENT = 96;

function readPlayerPoint(node: HTMLElement): Point | null {
  const match = node.textContent?.match(COORDINATE_PATTERN);
  if (!match) return null;
  const x = Number(match[1]);
  const y = Number(match[2]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function createMinimapDirectionMarker() {
  const minimap = document.querySelector<HTMLElement>('#minimap-shell');
  const canvas = minimap?.querySelector<HTMLCanvasElement>('#minimap-canvas');
  if (!minimap || !canvas) return null;

  let marker = minimap.querySelector<HTMLElement>('.minimap-direction-marker');
  if (!marker) {
    marker = document.createElement('span');
    marker.className = 'minimap-direction-marker';
    marker.setAttribute('aria-hidden', 'true');
    marker.innerHTML = '<span class="minimap-direction-arrow"></span>';
    minimap.appendChild(marker);
  }

  const position = () => {
    if (!marker) return;
    marker.style.left = `${canvas.offsetLeft + canvas.clientWidth / 2}px`;
    marker.style.top = `${canvas.offsetTop + canvas.clientHeight / 2}px`;
  };

  position();
  return { marker, position };
}

export function installMapSystemStage4Polish() {
  if (document.documentElement.dataset.mapStage4Polish === 'ready') return;

  const coords = document.querySelector<HTMLElement>('#minimap-coords');
  const minimapMarker = createMinimapDirectionMarker();
  if (!coords || !minimapMarker) return;

  document.documentElement.dataset.mapStage4Polish = 'ready';
  let previous = readPlayerPoint(coords);
  let heading = 0;

  const applyHeading = () => {
    const next = readPlayerPoint(coords);
    if (!next) return;

    if (previous) {
      const dx = next.x - previous.x;
      const dy = next.y - previous.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= MIN_MOVEMENT && distance <= MAX_TRACKED_MOVEMENT) {
        heading = Math.atan2(dy, dx) + Math.PI / 2;
      }
    }

    previous = next;
    document.documentElement.style.setProperty('--map-player-heading', `${heading}rad`);
    minimapMarker.marker.style.setProperty('--map-player-heading', `${heading}rad`);
  };

  const observer = new MutationObserver(applyHeading);
  observer.observe(coords, { subtree: true, childList: true, characterData: true });

  const onResize = () => minimapMarker.position();
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('pagehide', () => {
    observer.disconnect();
    window.removeEventListener('resize', onResize);
  }, { once: true });

  applyHeading();
  requestAnimationFrame(minimapMarker.position);
}
