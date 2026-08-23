import { MAP_PALETTE_ENTRIES } from './mapEditorCatalog';

const PANEL_WIDTH_KEY = 'ascension.map-editor.panel-width.v1';
const DEFAULT_PANEL_WIDTH = 320;
const MIN_PANEL_WIDTH = 260;

const clampPanelWidth = (value: number) => {
  const max = Math.max(MIN_PANEL_WIDTH, Math.min(520, window.innerWidth * .46));
  return Math.max(MIN_PANEL_WIDTH, Math.min(max, value));
};

function installPanelResizer(root: HTMLElement, panel: HTMLElement) {
  if (panel.querySelector('.mep-panel-resizer')) return;

  const saved = Number(localStorage.getItem(PANEL_WIDTH_KEY));
  const initial = clampPanelWidth(Number.isFinite(saved) && saved > 0 ? saved : DEFAULT_PANEL_WIDTH);
  root.style.setProperty('--panel', `${initial}px`);

  const handle = document.createElement('div');
  handle.className = 'mep-panel-resizer';
  handle.title = 'Arraste para redimensionar a biblioteca • duplo clique restaura';
  panel.appendChild(handle);

  let dragging = false;
  let startX = 0;
  let startWidth = initial;
  let frame = 0;
  let pendingWidth = initial;

  const applyWidth = () => {
    frame = 0;
    root.style.setProperty('--panel', `${pendingWidth}px`);
  };

  const move = (event: PointerEvent) => {
    if (!dragging) return;
    pendingWidth = clampPanelWidth(startWidth + event.clientX - startX);
    if (!frame) frame = requestAnimationFrame(applyWidth);
  };

  const finish = () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('mep-resizing-panel');
    if (frame) { cancelAnimationFrame(frame); applyWidth(); }
    localStorage.setItem(PANEL_WIDTH_KEY, String(Math.round(pendingWidth)));
    window.dispatchEvent(new Event('resize'));
  };

  handle.onpointerdown = (event) => {
    if (event.button !== 0 || window.innerWidth <= 760) return;
    dragging = true;
    startX = event.clientX;
    startWidth = panel.getBoundingClientRect().width;
    pendingWidth = startWidth;
    document.body.classList.add('mep-resizing-panel');
    event.preventDefault();
  };
  handle.ondblclick = () => {
    pendingWidth = clampPanelWidth(DEFAULT_PANEL_WIDTH);
    applyWidth();
    localStorage.setItem(PANEL_WIDTH_KEY, String(Math.round(pendingWidth)));
    window.dispatchEvent(new Event('resize'));
  };

  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
}

function installSearchChrome(root: HTMLElement, panel: HTMLElement, assetGrid: HTMLElement) {
  const search = panel.querySelector<HTMLElement>('.mep-search');
  const input = panel.querySelector<HTMLInputElement>('#mep-search');
  const filter = panel.querySelector<HTMLElement>('#mep-filter-row');
  const title = panel.querySelector<HTMLElement>('#mep-panel-title');
  if (!search || !input || !filter || !title) return;

  if (!search.querySelector('.mep-search-icon')) {
    const icon = document.createElement('span');
    icon.className = 'mep-search-icon';
    icon.textContent = '⌕';
    search.prepend(icon);

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'mep-search-clear';
    clear.textContent = '×';
    clear.title = 'Limpar busca';
    clear.onclick = () => {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    };
    search.appendChild(clear);

    const syncClear = () => search.classList.toggle('has-value', Boolean(input.value.trim()));
    input.addEventListener('input', syncClear);
    syncClear();
  }

  let meta = panel.querySelector<HTMLElement>('.mep-library-meta');
  if (!meta) {
    meta = document.createElement('div');
    meta.className = 'mep-library-meta';
    meta.innerHTML = '<strong></strong><span class="mep-library-count"></span>';
    search.insertAdjacentElement('afterend', meta);
  }

  const updateMeta = () => {
    const label = meta!.querySelector<HTMLElement>('strong')!;
    const count = meta!.querySelector<HTMLElement>('.mep-library-count')!;
    label.textContent = title.textContent?.trim() || 'BIBLIOTECA';
    const loaded = assetGrid.querySelectorAll('[data-card]').length;
    const moreText = assetGrid.querySelector<HTMLElement>('#mep-load-more')?.textContent ?? '';
    const match = moreText.match(/\((\d+)\)/);
    const remaining = match ? Number(match[1]) : 0;
    const total = loaded + remaining;
    count.textContent = total ? `${total} ${total === 1 ? 'item' : 'itens'}` : '0 itens';
  };

  const gridObserver = new MutationObserver(updateMeta);
  gridObserver.observe(assetGrid, { childList: true, subtree: false });
  const titleObserver = new MutationObserver(updateMeta);
  titleObserver.observe(title, { childList: true, characterData: true, subtree: true });
  updateMeta();
}

function installCompactFilters(panel: HTMLElement) {
  const filter = panel.querySelector<HTMLElement>('#mep-filter-row');
  if (!filter) return;

  let applying = false;
  const apply = () => {
    if (applying) return;
    applying = true;
    try {
      const buttons = [...filter.querySelectorAll<HTMLButtonElement>('button[data-category]')];
      if (!buttons.length) return;

      const existing = filter.querySelector<HTMLSelectElement>('.mep-category-select');
      const categoryButtons = buttons.filter((button) => !['all', 'favorites'].includes(button.dataset.category ?? ''));
      const activeCategory = categoryButtons.find((button) => button.classList.contains('active'))?.dataset.category ?? '';

      buttons.forEach((button) => {
        const category = button.dataset.category ?? '';
        button.classList.toggle('mep-category-hidden', !['all', 'favorites'].includes(category));
        button.classList.toggle('mep-filter-primary', ['all', 'favorites'].includes(category));
        if (category === 'favorites') {
          button.textContent = '★';
          button.title = 'Favoritos';
          button.setAttribute('aria-label', 'Favoritos');
        }
      });

      const select = existing ?? document.createElement('select');
      select.className = 'mep-category-select';
      select.setAttribute('aria-label', 'Categoria');
      select.innerHTML = `<option value="">Categorias</option>${categoryButtons.map((button) => `<option value="${button.dataset.category ?? ''}">${button.textContent ?? ''}</option>`).join('')}`;
      select.value = activeCategory;
      select.onchange = () => {
        const target = buttons.find((button) => button.dataset.category === select.value);
        target?.click();
      };
      if (!existing) filter.appendChild(select);
    } finally {
      applying = false;
    }
  };

  const observer = new MutationObserver(() => queueMicrotask(apply));
  observer.observe(filter, { childList: true });
  apply();
}

function decorateCard(card: HTMLElement) {
  if (card.dataset.visualPolish === '1') return;
  card.dataset.visualPolish = '1';

  const id = card.dataset.card ?? '';
  const entry = MAP_PALETTE_ENTRIES.find((value) => value.id === id);
  const name = card.querySelector<HTMLElement>('strong');
  if (name?.textContent) {
    card.title = name.textContent;
    name.title = name.textContent;
  }

  const canvas = card.querySelector<HTMLCanvasElement>('canvas[data-asset]');
  if (canvas && !canvas.parentElement?.classList.contains('mep-card-preview')) {
    const preview = document.createElement('div');
    preview.className = 'mep-card-preview';
    canvas.before(preview);
    preview.appendChild(canvas);

    if (entry?.sprite?.animation?.frames.length) {
      const badge = document.createElement('span');
      badge.className = 'mep-card-badge';
      badge.textContent = '▶ ANIM';
      preview.appendChild(badge);
    }
  }

  const star = card.querySelector<HTMLButtonElement>('[data-star]');
  const originalDelete = card.querySelector<HTMLButtonElement>('[data-delete-asset]');
  card.classList.toggle('is-favorite', star?.textContent?.trim() === '★');

  const actions = document.createElement('div');
  actions.className = 'mep-card-actions';
  if (star) actions.appendChild(star);

  const menu = document.createElement('button');
  menu.type = 'button';
  menu.className = 'mep-card-menu-button';
  menu.textContent = '•••';
  menu.title = 'Ações';
  actions.appendChild(menu);
  card.appendChild(actions);

  const popup = document.createElement('div');
  popup.className = 'mep-card-menu-popover';

  if (entry && entry.palette !== 'terrain' && entry.palette !== 'zone') {
    const configure = document.createElement('button');
    configure.type = 'button';
    configure.textContent = 'Configurar';
    configure.onclick = (event) => {
      event.stopPropagation();
      popup.classList.remove('open');
      card.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    };
    popup.appendChild(configure);
  }

  if (star) {
    const favorite = document.createElement('button');
    favorite.type = 'button';
    favorite.textContent = card.classList.contains('is-favorite') ? 'Remover favorito' : 'Favoritar';
    favorite.onclick = (event) => { event.stopPropagation(); popup.classList.remove('open'); star.click(); };
    popup.appendChild(favorite);
  }

  if (originalDelete) {
    originalDelete.classList.add('mep-original-delete');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'danger';
    remove.textContent = 'Excluir';
    remove.onclick = (event) => { event.stopPropagation(); popup.classList.remove('open'); originalDelete.click(); };
    popup.appendChild(remove);
  }

  card.appendChild(popup);
  menu.onclick = (event) => {
    event.stopPropagation();
    document.querySelectorAll('.mep-card-menu-popover.open').forEach((node) => { if (node !== popup) node.classList.remove('open'); });
    popup.classList.toggle('open');
  };
}

function installCardPolish(assetGrid: HTMLElement) {
  const apply = () => assetGrid.querySelectorAll<HTMLElement>('[data-card]').forEach(decorateCard);
  const observer = new MutationObserver(apply);
  observer.observe(assetGrid, { childList: true });
  apply();

  document.addEventListener('pointerdown', (event) => {
    if ((event.target as HTMLElement).closest('.mep-card-menu-button,.mep-card-menu-popover')) return;
    document.querySelectorAll('.mep-card-menu-popover.open').forEach((node) => node.classList.remove('open'));
  });
}

function installRailGrouping(root: HTMLElement) {
  const rail = root.querySelector<HTMLElement>('.mep-rail');
  if (!rail || rail.querySelector('.mep-rail-bottom-group')) return;
  const bottom = document.createElement('div');
  bottom.className = 'mep-rail-bottom-group';
  ['lighting', 'layers', 'minimap'].forEach((id) => {
    const button = rail.querySelector<HTMLButtonElement>(`button[data-rail="${id}"]`);
    if (!button) return;
    button.classList.remove('bottom');
    bottom.appendChild(button);
  });
  rail.appendChild(bottom);
}

function installContextPolish(root: HTMLElement) {
  const context = root.querySelector<HTMLElement>('#mep-context');
  if (!context) return;
  const apply = () => {
    context.querySelectorAll<HTMLElement>('.group').forEach((group) => {
      const hint = [...group.querySelectorAll<HTMLElement>('span')].find((node) => (node.textContent ?? '').includes('Arraste para selecionar'));
      if (!hint) return;
      hint.classList.add('mep-context-hint');
      hint.title = hint.textContent ?? '';
      group.classList.add('mep-context-help');
    });
  };
  const observer = new MutationObserver(apply);
  observer.observe(context, { childList: true, subtree: true });
  apply();
}

export function installMapEditorVisualPolish() {
  const root = document.querySelector<HTMLElement>('.mep');
  const panel = document.querySelector<HTMLElement>('#mep-panel');
  const assetGrid = document.querySelector<HTMLElement>('#mep-asset-grid');
  if (!root || !panel || !assetGrid || root.dataset.visualPolish === '1') return;
  root.dataset.visualPolish = '1';

  installPanelResizer(root, panel);
  installSearchChrome(root, panel, assetGrid);
  installCompactFilters(panel);
  installCardPolish(assetGrid);
  installRailGrouping(root);
  installContextPolish(root);
}
