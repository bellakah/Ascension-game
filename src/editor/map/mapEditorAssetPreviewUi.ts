import './mapEditorAssetPreviewUi.css';
import { drawAssetThumbnail } from './mapAssetRenderer';
import { MAP_PALETTE_ENTRIES } from './mapEditorCatalog';
import type { MapPaletteEntry } from './mapEditorTypes';

const DENSITY_KEY = 'ascension.map-editor.asset-density.v1';
type Density = 'compact' | 'comfortable' | 'large';

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

function currentDensity(): Density {
  const value = localStorage.getItem(DENSITY_KEY);
  return value === 'compact' || value === 'large' ? value : 'comfortable';
}

function activeFolder() {
  return document.querySelector<HTMLButtonElement>('#me2-folders button.active[data-folder]')?.dataset.folder ?? 'all';
}

function findEntry(id?: string | null) {
  return id ? MAP_PALETTE_ENTRIES.find((entry) => entry.id === id) ?? null : null;
}

export function installMapEditorAssetPreviewUi() {
  const grid = document.querySelector<HTMLElement>('#me2-asset-grid');
  const head = document.querySelector<HTMLElement>('.me2-assets-head');
  if (!grid || !head || document.querySelector('.me2-asset-peek')) return;

  let density = currentDensity();
  let hovered: MapPaletteEntry | null = null;
  let hoverCard: HTMLElement | null = null;
  let lastFrame = 0;

  const controls = document.createElement('div');
  controls.className = 'me2-density';
  controls.innerHTML = '<span>Visual</span><button data-density="compact" title="Compacto">▦</button><button data-density="comfortable" title="Confortável">▤</button><button data-density="large" title="Grande">▣</button>';
  head.insertBefore(controls, head.lastElementChild);

  const peek = document.createElement('aside');
  peek.className = 'me2-asset-peek';
  peek.innerHTML = '<div class="me2-asset-peek-preview"><canvas></canvas></div><header><strong></strong><span class="type"></span></header><p></p><footer></footer>';
  document.body.appendChild(peek);
  const peekCanvas = peek.querySelector<HTMLCanvasElement>('canvas')!;

  const applyDensity = () => {
    grid.dataset.density = density;
    grid.dataset.folder = activeFolder();
    controls.querySelectorAll<HTMLButtonElement>('[data-density]').forEach((button) => button.classList.toggle('active', button.dataset.density === density));
  };

  controls.querySelectorAll<HTMLButtonElement>('[data-density]').forEach((button) => {
    button.onclick = () => {
      density = button.dataset.density as Density;
      localStorage.setItem(DENSITY_KEY, density);
      applyDensity();
      window.dispatchEvent(new Event('resize'));
    };
  });

  const positionPeek = (card: HTMLElement) => {
    const rect = card.getBoundingClientRect();
    const width = 250;
    const height = 300;
    let left = rect.right + 10;
    if (left + width > window.innerWidth - 8) left = rect.left - width - 10;
    left = Math.max(8, Math.min(window.innerWidth - width - 8, left));
    let top = rect.top - 14;
    if (top + height > window.innerHeight - 8) top = window.innerHeight - height - 8;
    peek.style.left = `${left}px`;
    peek.style.top = `${Math.max(8, top)}px`;
  };

  const showPeek = (card: HTMLElement, entry: MapPaletteEntry) => {
    hovered = entry;
    hoverCard = card;
    peek.querySelector('strong')!.textContent = entry.label;
    peek.querySelector<HTMLElement>('.type')!.textContent = entry.palette === 'npc' ? 'NPC' : entry.palette === 'monster' ? 'MONSTRO' : entry.palette.toUpperCase();
    peek.querySelector('p')!.textContent = entry.description;
    const sprite = entry.sprite;
    const info = [
      entry.source === 'pixel-crawler' ? 'Pixel Crawler' : entry.source === 'custom' ? 'Meu asset' : 'Ascension',
      sprite ? `${sprite.nativeWidth}×${sprite.nativeHeight}px` : 'Visual do jogo',
      sprite?.animation?.frames.length ? `${sprite.animation.frames.length} frames • ${sprite.animation.fps} FPS` : 'Estático',
    ];
    peek.querySelector('footer')!.innerHTML = info.map((value) => `<span>${escapeHtml(value)}</span>`).join('');
    positionPeek(card);
    peek.classList.add('show');
    drawAssetThumbnail(peekCanvas, entry);
  };

  const hidePeek = () => {
    hovered = null;
    hoverCard = null;
    peek.classList.remove('show');
  };

  const decorateCards = () => {
    applyDensity();
    document.querySelectorAll<HTMLElement>('.me2-asset-card[data-asset-card]').forEach((card) => {
      const entry = findEntry(card.dataset.assetCard);
      if (!entry) return;
      card.dataset.visualKind = entry.palette;
      if (card.dataset.previewBound === 'true') return;
      card.dataset.previewBound = 'true';
      card.addEventListener('pointerenter', () => showPeek(card, entry));
      card.addEventListener('pointerleave', () => { if (hoverCard === card) hidePeek(); });
      card.addEventListener('focusin', () => showPeek(card, entry));
      card.addEventListener('focusout', hidePeek);
      card.addEventListener('click', (event) => {
        if ((event.target as HTMLElement).closest('button')) return;
        window.setTimeout(() => document.querySelector<HTMLButtonElement>('[data-right-tab="inspector"]')?.click());
      });
    });
  };

  const animationLoop = (now: number) => {
    if (now - lastFrame > 90) {
      lastFrame = now;
      document.querySelectorAll<HTMLCanvasElement>('.me2-asset-thumb canvas[data-asset],.me2-recent canvas[data-asset],#me2-current-preview,#me2-ins-preview').forEach((canvas) => {
        const id = canvas.dataset.asset || canvas.closest<HTMLElement>('[data-asset-card]')?.dataset.assetCard;
        const entry = findEntry(id);
        if (entry?.sprite?.animation?.frames.length) drawAssetThumbnail(canvas, entry, now);
      });
      if (hovered) {
        drawAssetThumbnail(peekCanvas, hovered, now);
        if (hoverCard) positionPeek(hoverCard);
      }
    }
    requestAnimationFrame(animationLoop);
  };

  const observer = new MutationObserver(decorateCards);
  observer.observe(grid, { childList: true, subtree: true });
  const folderObserver = new MutationObserver(() => { grid.dataset.folder = activeFolder(); });
  const folders = document.querySelector('#me2-folders');
  if (folders) folderObserver.observe(folders, { attributes: true, subtree: true, attributeFilter: ['class'] });
  window.addEventListener('scroll', hidePeek, true);
  window.addEventListener('resize', () => { if (hoverCard) positionPeek(hoverCard); });
  window.addEventListener('pagehide', () => { observer.disconnect(); folderObserver.disconnect(); peek.remove(); }, { once: true });

  decorateCards();
  requestAnimationFrame(animationLoop);
}
