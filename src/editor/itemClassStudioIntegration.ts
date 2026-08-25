import { listClassDefinitions } from '../classes/classCatalog';
import { listItemStudioRecords } from '../items/itemStudioStore';

function activeItemKey(root: HTMLElement) {
  return root.querySelector<HTMLButtonElement>('[data-item-key].active')?.dataset.itemKey ?? '';
}

/**
 * Ponte de compatibilidade para o Item Studio legado. O formulário original
 * conhecia somente Guerreiro/Mago; esta integração injeta todas as classes
 * publicadas sem duplicar o estado de edição do Studio.
 */
export function installItemClassStudioIntegration(root: HTMLElement) {
  const pending = new Map<string, Set<string>>();
  let frame = 0;

  const sync = () => {
    frame = 0;
    const grid = root.querySelector<HTMLElement>('.item-class-grid');
    if (!grid) return;
    const key = activeItemKey(root);
    const saved = listItemStudioRecords().find((item) => item.key === key);
    const selected = pending.get(key) ?? new Set(saved?.allowedClasses ?? []);
    const classes = listClassDefinitions({ publishedOnly: true });

    for (const entry of classes) {
      let input = grid.querySelector<HTMLInputElement>(`input[data-item-class="${CSS.escape(entry.id)}"]`);
      if (!input) {
        const label = document.createElement('label');
        input = document.createElement('input');
        input.type = 'checkbox';
        input.dataset.itemClass = entry.id;
        input.checked = selected.has(entry.id);
        label.append(input, ` ${entry.name}`);
        grid.appendChild(label);
      }
      if (input.dataset.dynamicClassBound === '1') continue;
      input.dataset.dynamicClassBound = '1';
      input.addEventListener('change', () => {
        const currentKey = activeItemKey(root);
        const values = new Set([...grid.querySelectorAll<HTMLInputElement>('input[data-item-class]:checked')].map((node) => node.dataset.itemClass!).filter(Boolean));
        if (currentKey) pending.set(currentKey, values);
        // O handler original de Guerreiro/Mago coleta todos os checkboxes do grid.
        const bridge = [...grid.querySelectorAll<HTMLInputElement>('input[data-item-class]')].find((node) => node !== input && node.dataset.dynamicClassBound !== '1');
        bridge?.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
  };

  const schedule = () => { if (!frame) frame = requestAnimationFrame(sync); };
  const observer = new MutationObserver(schedule);
  observer.observe(root, { childList: true, subtree: true });
  root.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('#item-save')) window.setTimeout(() => { const key = activeItemKey(root); if (key) pending.delete(key); schedule(); }, 0);
    if (target.closest('[data-item-key]')) schedule();
  });
  window.addEventListener('pagehide', () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame); }, { once: true });
  schedule();
}
