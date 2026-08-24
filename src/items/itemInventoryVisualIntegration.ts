import { listItemStudioRecords, onItemStudioChange } from './itemStudioStore';

function normalizedName(value: string) {
  return value.replace(/\s+\+\d+\s*$/, '').trim().toLocaleLowerCase('pt-BR');
}

function installImage(node: HTMLElement, src: string) {
  if (node.dataset.itemStudioIconSrc === src) return;
  node.dataset.itemStudioIconSrc = src;
  node.replaceChildren();
  const image = document.createElement('img');
  image.src = src;
  image.alt = '';
  image.className = 'item-studio-inventory-icon';
  node.appendChild(image);
}

export function installItemInventoryVisualIntegration() {
  if (document.documentElement.dataset.itemInventoryVisuals === '1') return;
  document.documentElement.dataset.itemInventoryVisuals = '1';

  const style = document.createElement('style');
  style.textContent = `.item-studio-inventory-icon{display:block;width:90%;height:90%;margin:auto;object-fit:contain;image-rendering:pixelated}.detail-icon .item-studio-inventory-icon{width:100%;height:100%}`;
  document.head.appendChild(style);

  const sync = () => {
    const byName = new Map(listItemStudioRecords().filter((item) => item.iconImage).map((item) => [normalizedName(item.name), item.iconImage!]));
    document.querySelectorAll<HTMLElement>('#inventory-overlay .inventory-slot').forEach((slot) => {
      const src = byName.get(normalizedName(slot.title || ''));
      const icon = slot.querySelector<HTMLElement>('.slot-icon');
      if (src && icon) installImage(icon, src);
    });
    document.querySelectorAll<HTMLElement>('#inventory-overlay .equipment-slot').forEach((slot) => {
      const name = slot.querySelector<HTMLElement>('strong')?.textContent ?? '';
      const src = byName.get(normalizedName(name));
      const icon = slot.querySelector<HTMLElement>('.equipment-icon');
      if (src && icon) installImage(icon, src);
    });
    const detailName = document.querySelector<HTMLElement>('#inventory-overlay .detail-top h3')?.textContent ?? '';
    const detailSrc = byName.get(normalizedName(detailName));
    const detailIcon = document.querySelector<HTMLElement>('#inventory-overlay .detail-icon');
    if (detailSrc && detailIcon) installImage(detailIcon, detailSrc);
  };

  const observer = new MutationObserver(() => queueMicrotask(sync));
  observer.observe(document.body, { childList: true, subtree: true });
  const unsubscribe = onItemStudioChange(sync);
  window.addEventListener('pagehide', () => { observer.disconnect(); unsubscribe(); }, { once: true });
  sync();
}
