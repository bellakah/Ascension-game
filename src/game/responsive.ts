export type UiMode = 'desktop' | 'mobile-portrait' | 'mobile-landscape';

let installed = false;

function detectMode(): UiMode {
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const noHover = window.matchMedia('(hover: none)').matches;
  const compactViewport = window.innerWidth <= 900;
  const mobile = coarsePointer || (compactViewport && noHover);
  if (!mobile) return 'desktop';
  return window.innerWidth > window.innerHeight ? 'mobile-landscape' : 'mobile-portrait';
}

export function installResponsiveUi() {
  if (installed) return;
  installed = true;

  const root = document.documentElement;
  const viewport = window.visualViewport;

  const sync = () => {
    const mode = detectMode();
    root.dataset.uiMode = mode;
    root.style.setProperty('--app-height', `${Math.round(viewport?.height ?? window.innerHeight)}px`);
    root.style.setProperty('--app-width', `${Math.round(viewport?.width ?? window.innerWidth)}px`);
  };

  sync();
  window.addEventListener('resize', sync, { passive: true });
  window.addEventListener('orientationchange', sync, { passive: true });
  viewport?.addEventListener('resize', sync, { passive: true });
}
