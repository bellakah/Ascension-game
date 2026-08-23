import './mapEditorFloatingMenus.css';

type FloatingEntry = {
  menu: HTMLElement;
  anchor: HTMLElement;
  kind: 'top' | 'card';
};

const MARGIN = 8;
const GAP = 6;

function isOpen(entry: FloatingEntry) {
  if (!entry.menu.isConnected || !entry.anchor.isConnected) return false;
  if (entry.kind === 'top') return !entry.menu.classList.contains('hidden');
  return entry.menu.classList.contains('open');
}

function positionMenu(entry: FloatingEntry) {
  if (!isOpen(entry)) return;

  const anchorRect = entry.anchor.getBoundingClientRect();
  if (
    anchorRect.bottom < 0 ||
    anchorRect.top > window.innerHeight ||
    anchorRect.right < 0 ||
    anchorRect.left > window.innerWidth
  ) {
    if (entry.kind === 'top') entry.menu.classList.add('hidden');
    else entry.menu.classList.remove('open');
    return;
  }

  entry.menu.style.left = '0px';
  entry.menu.style.top = '0px';
  entry.menu.style.right = 'auto';
  entry.menu.style.bottom = 'auto';

  const menuRect = entry.menu.getBoundingClientRect();
  let left = anchorRect.right - menuRect.width;
  let top = anchorRect.bottom + GAP;

  if (top + menuRect.height > window.innerHeight - MARGIN) {
    top = anchorRect.top - menuRect.height - GAP;
  }

  left = Math.max(MARGIN, Math.min(left, window.innerWidth - menuRect.width - MARGIN));
  top = Math.max(MARGIN, Math.min(top, window.innerHeight - menuRect.height - MARGIN));

  entry.menu.style.left = `${Math.round(left)}px`;
  entry.menu.style.top = `${Math.round(top)}px`;
}

export function installMapEditorFloatingMenus() {
  const root = document.querySelector<HTMLElement>('.mep');
  if (!root || root.dataset.floatingMenusInstalled === '1') return;
  root.dataset.floatingMenusInstalled = '1';

  const entries = new Map<HTMLElement, FloatingEntry>();
  let frame = 0;

  const schedulePosition = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      for (const [menu, entry] of entries) {
        if (!entry.anchor.isConnected || !menu.isConnected) {
          entries.delete(menu);
          if (menu.isConnected && entry.kind === 'card') menu.remove();
          continue;
        }
        positionMenu(entry);
      }
    });
  };

  const bindMenu = (menu: HTMLElement, anchor: HTMLElement, kind: FloatingEntry['kind']) => {
    if (menu.dataset.floatingMenuBound === '1') return;
    menu.dataset.floatingMenuBound = '1';
    menu.dataset.floatingMenuKind = kind;
    menu.classList.add('mep-floating-menu');

    // O menu deixa o contêiner com overflow/transform e passa a existir na camada global.
    document.body.appendChild(menu);
    const entry: FloatingEntry = { menu, anchor, kind };
    entries.set(menu, entry);

    // Evita que os listeners de "clicou fora" do editor considerem um clique
    // dentro do menu portado como um clique fora do menu original.
    menu.addEventListener('pointerdown', (event) => event.stopPropagation());
    menu.addEventListener('click', (event) => event.stopPropagation());

    const classObserver = new MutationObserver(schedulePosition);
    classObserver.observe(menu, { attributes: true, attributeFilter: ['class'] });
    schedulePosition();
  };

  const bindTopMenu = () => {
    const anchor = root.querySelector<HTMLElement>('#mep-more');
    const menu = root.querySelector<HTMLElement>('#mep-more-menu')
      ?? document.querySelector<HTMLElement>('#mep-more-menu');
    if (anchor && menu) bindMenu(menu, anchor, 'top');
  };

  const bindCardMenus = () => {
    root.querySelectorAll<HTMLElement>('.mep-card-menu-popover:not([data-floating-menu-bound="1"])').forEach((menu) => {
      const card = menu.closest<HTMLElement>('.mep-card');
      const anchor = card?.querySelector<HTMLElement>('.mep-card-menu-button');
      if (anchor) bindMenu(menu, anchor, 'card');
    });
  };

  const bindAll = () => {
    bindTopMenu();
    bindCardMenus();
  };

  const observer = new MutationObserver(() => queueMicrotask(bindAll));
  observer.observe(root, { childList: true, subtree: true });
  bindAll();

  // Captura antes do onclick original. O requestAnimationFrame acontece depois,
  // quando o código original já adicionou/removeu hidden/open.
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('#mep-more,.mep-card-menu-button')) schedulePosition();
  }, true);

  const reposition = () => schedulePosition();
  window.addEventListener('resize', reposition, { passive: true });
  window.addEventListener('scroll', reposition, { passive: true, capture: true });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    for (const entry of entries.values()) {
      if (entry.kind === 'top') entry.menu.classList.add('hidden');
      else entry.menu.classList.remove('open');
    }
  });

  document.addEventListener('pointerdown', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('#mep-more,.mep-card-menu-button,.mep-floating-menu')) return;
    for (const entry of entries.values()) {
      if (entry.kind === 'card') entry.menu.classList.remove('open');
    }
  });
}
