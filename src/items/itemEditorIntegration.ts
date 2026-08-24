import { createItemStudio } from './itemStudio';
import { ensureItemStudioMigration } from './itemStudioStore';

const STUDIO_OPEN_EVENT = 'ascension-editor-studio-open';

export function installItemEditorIntegration() {
  const root = document.querySelector<HTMLElement>('.mep');
  const mode = root?.querySelector<HTMLElement>('.mep-mode');
  if (!root || !mode || root.dataset.itemStudioInstalled === '1') return;
  root.dataset.itemStudioInstalled = '1';
  ensureItemStudioMigration();

  const studio = createItemStudio(root);
  const button = document.createElement('button');
  button.id = 'mep-mode-items';
  button.textContent = 'Itens';
  button.title = 'Criador e editor central de itens';
  mode.appendChild(button);

  const close = () => {
    studio.close();
    button.classList.remove('active');
  };
  const open = (itemKey?: string) => {
    window.dispatchEvent(new CustomEvent(STUDIO_OPEN_EVENT, { detail: { kind: 'item' } }));
    studio.open(itemKey);
  };

  button.onclick = () => open();
  root.querySelector<HTMLButtonElement>('#mep-mode-map')?.addEventListener('click', close, { capture: true });
  root.querySelector<HTMLButtonElement>('#mep-mode-world')?.addEventListener('click', close, { capture: true });
  window.addEventListener(STUDIO_OPEN_EVENT, (event) => {
    const kind = (event as CustomEvent<{ kind?: string }>).detail?.kind;
    if (kind && kind !== 'item') close();
  });
}
