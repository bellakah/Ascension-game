type DesktopMargins = { left: number; right: number; top: number; bottom: number };

function desktopMargins(width = window.innerWidth, height = window.innerHeight): DesktopMargins {
  if (width >= 1600) return { left: 350, right: 280, top: 92, bottom: 126 };
  if (width >= 1280) return { left: 320, right: 250, top: 88, bottom: 120 };
  if (width >= 1050) return { left: 285, right: 225, top: 82, bottom: 112 };
  return { left: 240, right: 190, top: 76, bottom: 104 };
}

export function installDesktopViewportMetrics() {
  const apply = () => {
    const margins = desktopMargins();
    const root = document.documentElement;
    root.style.setProperty('--desktop-hud-left', `${margins.left}px`);
    root.style.setProperty('--desktop-hud-right', `${margins.right}px`);
    root.style.setProperty('--desktop-hud-top', `${margins.top}px`);
    root.style.setProperty('--desktop-hud-bottom', `${margins.bottom}px`);
  };
  apply();
  window.addEventListener('resize', apply, { passive: true });
}

function axisPosition(viewStart: number, viewEnd: number, worldSize: number, focus: number) {
  const viewSize = Math.max(1, viewEnd - viewStart);
  if (worldSize <= viewSize) return viewStart + (viewSize - worldSize) / 2;
  const desired = viewStart + viewSize / 2 - focus;
  const minimum = viewEnd - worldSize;
  const maximum = viewStart;
  return Math.max(minimum, Math.min(maximum, desired));
}

export function getSafeCameraPosition(
  screenWidth: number,
  screenHeight: number,
  playerX: number,
  playerY: number,
  worldWidth: number,
  worldHeight: number,
  scale = 1,
) {
  const safeScale = Math.max(0.01, Number.isFinite(scale) ? scale : 1);
  const scaledWorldWidth = worldWidth * safeScale;
  const scaledWorldHeight = worldHeight * safeScale;
  const scaledPlayerX = playerX * safeScale;
  const scaledPlayerY = playerY * safeScale;

  if (document.documentElement.dataset.uiMode !== 'desktop') {
    return {
      x: axisPosition(0, screenWidth, scaledWorldWidth, scaledPlayerX),
      y: axisPosition(0, screenHeight, scaledWorldHeight, scaledPlayerY),
    };
  }

  const margin = desktopMargins(screenWidth, screenHeight);
  const safeLeft = margin.left;
  const safeRight = Math.max(safeLeft + 220, screenWidth - margin.right);
  const safeTop = margin.top;
  const safeBottom = Math.max(safeTop + 220, screenHeight - margin.bottom);

  return {
    x: axisPosition(safeLeft, safeRight, scaledWorldWidth, scaledPlayerX),
    y: axisPosition(safeTop, safeBottom, scaledWorldHeight, scaledPlayerY),
  };
}
