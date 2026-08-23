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

export function getSafeCameraPosition(
  screenWidth: number,
  screenHeight: number,
  playerX: number,
  playerY: number,
  worldWidth: number,
  worldHeight: number,
) {
  if (document.documentElement.dataset.uiMode !== 'desktop') {
    return {
      x: Math.max(Math.min(0, screenWidth - worldWidth), Math.min(0, screenWidth / 2 - playerX)),
      y: Math.max(Math.min(0, screenHeight - worldHeight), Math.min(0, screenHeight / 2 - playerY)),
    };
  }

  const margin = desktopMargins(screenWidth, screenHeight);
  const safeLeft = margin.left;
  const safeRight = Math.max(safeLeft + 220, screenWidth - margin.right);
  const safeTop = margin.top;
  const safeBottom = Math.max(safeTop + 220, screenHeight - margin.bottom);
  const centerX = safeLeft + (safeRight - safeLeft) / 2;
  const centerY = safeTop + (safeBottom - safeTop) / 2;

  const minX = safeRight - worldWidth;
  const maxX = safeLeft;
  const minY = safeBottom - worldHeight;
  const maxY = safeTop;

  return {
    x: Math.max(minX, Math.min(maxX, centerX - playerX)),
    y: Math.max(minY, Math.min(maxY, centerY - playerY)),
  };
}
