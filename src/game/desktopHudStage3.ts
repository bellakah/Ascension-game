type DockRule = {
  button: string;
  panel: string;
  isOpen: (panel: HTMLElement) => boolean;
};

const visibleWithout = (hiddenClass: string) => (panel: HTMLElement) => !panel.classList.contains(hiddenClass);

const RULES: DockRule[] = [
  { button: '#inventory-button', panel: '#inventory-overlay', isOpen: visibleWithout('inventory-hidden') },
  { button: '#character-button', panel: '#character-sheet-overlay', isOpen: visibleWithout('character-sheet-hidden') },
  { button: '#quest-journal-button', panel: '#quest-journal-overlay', isOpen: visibleWithout('quest-journal-hidden') },
  { button: '#map-button', panel: '#map-overlay', isOpen: visibleWithout('map-hidden') },
  { button: '#pet-button', panel: '#pet-overlay', isOpen: visibleWithout('pet-hidden') },
  { button: '#guild-button', panel: '#guild-overlay', isOpen: visibleWithout('guild-hidden') },
  { button: '#chat-button', panel: '#chat-shell', isOpen: visibleWithout('chat-collapsed') },
  {
    button: '#menu-button',
    panel: '#game-menu-overlay',
    isOpen: (panel) => !panel.classList.contains('game-menu-hidden')
      && !panel.classList.contains('chat-pause-proxy')
      && !panel.classList.contains('guild-pause-proxy'),
  },
];

export function installDesktopHudStage3() {
  if (document.documentElement.dataset.desktopHudStage3 === 'ready') return;
  document.documentElement.dataset.desktopHudStage3 = 'ready';

  const sync = () => {
    for (const rule of RULES) {
      const button = document.querySelector<HTMLButtonElement>(rule.button);
      const panel = document.querySelector<HTMLElement>(rule.panel);
      if (!button) continue;
      const active = Boolean(panel && rule.isOpen(panel));
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  };

  const observer = new MutationObserver((records) => {
    if (records.some((record) => record.type === 'attributes' || record.addedNodes.length > 0 || record.removedNodes.length > 0)) sync();
  });
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });

  for (const rule of RULES) {
    document.querySelector<HTMLButtonElement>(rule.button)?.addEventListener('pointerdown', () => {
      requestAnimationFrame(sync);
      window.setTimeout(sync, 0);
    });
  }
  window.addEventListener('ascension-hud-state', sync);
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
  sync();
}
