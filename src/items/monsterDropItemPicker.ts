import { findItemStudioRecord, itemStudioDisplay, listItemStudioRecords, onItemStudioChange } from './itemStudioStore';

const LIST_ID = 'monster-item-studio-options';

function ensureDatalist(overlay: HTMLElement) {
  let list = overlay.querySelector<HTMLDataListElement>(`#${LIST_ID}`);
  if (!list) {
    list = document.createElement('datalist');
    list.id = LIST_ID;
    overlay.appendChild(list);
  }

  // O MutationObserver do Monster Studio observa a própria overlay. Reescrever o
  // datalist em toda sincronização criava uma nova mutação, que chamava sync(),
  // que reescrevia o datalist novamente e prendia a página em um loop de microtasks.
  const html = listItemStudioRecords().map((item) => `<option value="${itemStudioDisplay(item)}">${item.key}</option>`).join('');
  if (list.innerHTML !== html) list.innerHTML = html;
  return list;
}

function enhanceInput(input: HTMLInputElement) {
  if (input.dataset.itemStudioPicker === '1') return;
  input.dataset.itemStudioPicker = '1';
  input.setAttribute('list', LIST_ID);
  input.placeholder = '#ID, nome ou chave';
  input.autocomplete = 'off';

  const originalInput = input.oninput;
  input.oninput = null;

  const syncDisplay = () => {
    const found = findItemStudioRecord(input.value);
    if (found) {
      input.value = itemStudioDisplay(found);
      input.title = `${found.key} · ${found.description || found.name}`;
      input.classList.remove('monster-drop-invalid');
    }
  };

  const commit = () => {
    const raw = input.value.trim();
    if (!raw) {
      input.value = '';
      originalInput?.call(input, new InputEvent('input', { bubbles: false }));
      input.classList.remove('monster-drop-invalid');
      return true;
    }
    const found = findItemStudioRecord(raw);
    if (!found) {
      input.classList.add('monster-drop-invalid');
      input.title = 'Item não encontrado no Item Studio.';
      return false;
    }
    input.value = found.key;
    originalInput?.call(input, new InputEvent('input', { bubbles: false }));
    input.value = itemStudioDisplay(found);
    input.title = `Chave: ${found.key}`;
    input.classList.remove('monster-drop-invalid');
    return true;
  };

  input.addEventListener('change', commit);
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); commit(); }
  });
  syncDisplay();
}

export function installMonsterDropItemPicker() {
  const root = document.querySelector<HTMLElement>('.mep');
  const overlay = root?.querySelector<HTMLElement>('.monster-studio-overlay');
  if (!root || !overlay || root.dataset.monsterItemPickerInstalled === '1') return;
  root.dataset.monsterItemPickerInstalled = '1';

  let scheduled = 0;
  const sync = () => {
    scheduled = 0;
    ensureDatalist(overlay);
    overlay.querySelectorAll<HTMLInputElement>('[data-drop-item]').forEach(enhanceInput);
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = requestAnimationFrame(sync);
  };

  const observer = new MutationObserver((mutations) => {
    // Mudanças feitas apenas dentro do nosso datalist não precisam disparar uma
    // nova varredura. Isso também protege contra regressões se as opções mudarem.
    const relevant = mutations.some((mutation) => {
      const target = mutation.target as Node;
      const list = overlay.querySelector<HTMLDataListElement>(`#${LIST_ID}`);
      return !list || (target !== list && !list.contains(target));
    });
    if (relevant) schedule();
  });
  observer.observe(overlay, { childList: true, subtree: true });
  const unsubscribe = onItemStudioChange(schedule);
  window.addEventListener('pagehide', () => {
    observer.disconnect();
    unsubscribe();
    if (scheduled) cancelAnimationFrame(scheduled);
  }, { once: true });

  const style = document.createElement('style');
  style.textContent = `.monster-drop-row input.monster-drop-invalid{border-color:#bd5454!important;box-shadow:0 0 0 1px rgba(189,84,84,.22)!important}.monster-drop-row [data-drop-item]{min-width:155px}`;
  document.head.appendChild(style);
  sync();
}
