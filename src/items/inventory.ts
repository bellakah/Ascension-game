import './inventory.css';
import type { CharacterProgress } from '../character/characterCreator';
import {
  ITEM_CATEGORY_LABELS,
  ITEM_RARITY_LABELS,
  equipItem,
  getItem,
  inventorySlotsUsed,
  organizeInventory,
  removeItem,
  unequipItem,
  type ItemCategory,
} from './itemCatalog';

type InventoryCallbacks = {
  getHp: () => number;
  setHp: (value: number) => void;
  onChanged: () => void;
  notify: (message: string) => void;
};

type Selection =
  | { source: 'inventory'; itemId: string }
  | { source: 'equipment'; itemId: string; slot: keyof CharacterProgress['equipment'] }
  | null;

const TABS: Array<{ id: ItemCategory | 'all'; icon: string }> = [
  { id: 'all', icon: '▦' },
  { id: 'consumable', icon: '✚' },
  { id: 'material', icon: '◆' },
  { id: 'weapon', icon: '⚔' },
  { id: 'equipment', icon: '♜' },
  { id: 'accessory', icon: '◇' },
];

const EQUIPMENT_SLOTS: Array<{ id: keyof CharacterProgress['equipment']; label: string; icon: string }> = [
  { id: 'head', label: 'Cabeça', icon: '◒' },
  { id: 'armor', label: 'Peitoral', icon: '♜' },
  { id: 'legs', label: 'Pernas', icon: '▥' },
  { id: 'boots', label: 'Botas', icon: '⌄' },
  { id: 'weapon', label: 'Arma', icon: '⚔' },
  { id: 'accessory1', label: 'Acessório I', icon: '◇' },
  { id: 'accessory2', label: 'Acessório II', icon: '◇' },
];

function statText(itemId: string) {
  const item = getItem(itemId);
  if (!item?.stats) return [];
  const rows: string[] = [];
  if (item.stats.attack) rows.push(`Ataque +${item.stats.attack}`);
  if (item.stats.defense) rows.push(`Defesa +${item.stats.defense}`);
  if (item.stats.maxHp) rows.push(`HP máximo +${item.stats.maxHp}`);
  return rows;
}

export function createInventory(progress: CharacterProgress, callbacks: InventoryCallbacks) {
  let activeTab: ItemCategory | 'all' = 'all';
  let search = '';
  let selection: Selection = null;

  const root = document.createElement('div');
  root.id = 'inventory-overlay';
  root.className = 'inventory-hidden';
  root.innerHTML = `
    <div class="inventory-window" role="dialog" aria-label="Inventário">
      <header class="inventory-header">
        <div class="inventory-title-block">
          <span class="inventory-kicker">ASCENSION</span>
          <h2>Inventário</h2>
          <span id="inventory-capacity"></span>
        </div>
        <div class="inventory-header-actions">
          <label class="inventory-search"><span>⌕</span><input id="inventory-search" type="search" placeholder="Buscar item..." autocomplete="off" /></label>
          <button id="inventory-sort" class="inventory-tool" type="button" title="Auto-organizar">↕ <span>Organizar</span></button>
          <button id="inventory-close" class="inventory-close" type="button" aria-label="Fechar">×</button>
        </div>
      </header>
      <nav id="inventory-tabs" class="inventory-tabs"></nav>
      <div class="inventory-body">
        <main class="inventory-main">
          <div class="inventory-toolbar"><span id="inventory-filter-label"></span><span id="inventory-result-count"></span></div>
          <div id="inventory-grid" class="inventory-grid"></div>
        </main>
        <aside class="inventory-side">
          <section class="equipment-card">
            <div class="panel-heading"><span>Equipado</span><small id="inventory-power"></small></div>
            <div id="equipment-grid" class="equipment-grid"></div>
          </section>
          <section id="item-details" class="item-details"></section>
        </aside>
      </div>
      <footer class="inventory-footer"><span>Toque em um item para ver os detalhes.</span><span><kbd>I</kbd> abrir/fechar · <kbd>Esc</kbd> fechar</span></footer>
    </div>`;
  document.body.appendChild(root);

  const tabs = root.querySelector<HTMLElement>('#inventory-tabs')!;
  const grid = root.querySelector<HTMLElement>('#inventory-grid')!;
  const equipmentGrid = root.querySelector<HTMLElement>('#equipment-grid')!;
  const details = root.querySelector<HTMLElement>('#item-details')!;
  const capacity = root.querySelector<HTMLElement>('#inventory-capacity')!;
  const filterLabel = root.querySelector<HTMLElement>('#inventory-filter-label')!;
  const resultCount = root.querySelector<HTMLElement>('#inventory-result-count')!;
  const power = root.querySelector<HTMLElement>('#inventory-power')!;
  const searchInput = root.querySelector<HTMLInputElement>('#inventory-search')!;

  const setSelection = (next: Selection) => {
    selection = next;
    render();
  };

  const renderTabs = () => {
    tabs.replaceChildren();
    for (const tab of TABS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `inventory-tab${activeTab === tab.id ? ' active' : ''}`;
      button.innerHTML = `<span>${tab.icon}</span><strong>${ITEM_CATEGORY_LABELS[tab.id]}</strong>`;
      button.addEventListener('click', () => { activeTab = tab.id; render(); });
      tabs.appendChild(button);
    }
  };

  const renderGrid = () => {
    grid.replaceChildren();
    const stacks = progress.inventory
      .map((stack, index) => ({ ...stack, index, item: getItem(stack.itemId) }))
      .filter((entry) => entry.item)
      .filter((entry) => activeTab === 'all' || entry.item!.category === activeTab)
      .filter((entry) => !search || entry.item!.name.toLocaleLowerCase('pt-BR').includes(search));

    for (const entry of stacks) {
      const item = entry.item!;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `inventory-slot rarity-${item.rarity}${selection?.source === 'inventory' && selection.itemId === item.id ? ' selected' : ''}`;
      button.title = item.name;
      button.innerHTML = `<span class="slot-rarity"></span><span class="slot-icon">${item.icon}</span>${entry.quantity > 1 ? `<span class="slot-quantity">${entry.quantity}</span>` : ''}<span class="slot-name">${item.name}</span>`;
      button.addEventListener('click', () => setSelection({ source: 'inventory', itemId: item.id }));
      grid.appendChild(button);
    }

    if (activeTab === 'all' && !search) {
      const empty = Math.max(0, progress.inventoryCapacity - progress.inventory.length);
      for (let i = 0; i < empty; i++) {
        const node = document.createElement('span');
        node.className = 'inventory-slot empty';
        node.innerHTML = '<span class="empty-mark">·</span>';
        grid.appendChild(node);
      }
    }

    filterLabel.textContent = ITEM_CATEGORY_LABELS[activeTab];
    resultCount.textContent = `${stacks.length} ${stacks.length === 1 ? 'pilha' : 'pilhas'}`;
  };

  const renderEquipment = () => {
    equipmentGrid.replaceChildren();
    for (const slot of EQUIPMENT_SLOTS) {
      const itemId = progress.equipment[slot.id];
      const item = itemId ? getItem(itemId) : undefined;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `equipment-slot${item ? ` rarity-${item.rarity}` : ''}${selection?.source === 'equipment' && selection.slot === slot.id ? ' selected' : ''}`;
      button.innerHTML = item
        ? `<span class="equipment-icon">${item.icon}</span><span><small>${slot.label}</small><strong>${item.name}</strong></span>`
        : `<span class="equipment-icon empty-equip">${slot.icon}</span><span><small>${slot.label}</small><strong>Vazio</strong></span>`;
      if (item) button.addEventListener('click', () => setSelection({ source: 'equipment', itemId: item.id, slot: slot.id }));
      equipmentGrid.appendChild(button);
    }
    power.textContent = `ATQ ${progress.attack} · DEF ${progress.defense}`;
  };

  const renderDetails = () => {
    if (!selection) {
      details.innerHTML = `<div class="details-empty"><span>◇</span><strong>Selecione um item</strong><p>As informações, atributos e ações aparecerão aqui.</p></div>`;
      return;
    }
    const item = getItem(selection.itemId);
    if (!item) { selection = null; renderDetails(); return; }
    const stats = statText(item.id);
    const isInventory = selection.source === 'inventory';
    const canUse = isInventory && item.category === 'consumable';
    const canEquip = isInventory && Boolean(item.equipSlot);
    const canUnequip = selection.source === 'equipment';
    details.innerHTML = `
      <div class="detail-top rarity-${item.rarity}">
        <span class="detail-icon">${item.icon}</span>
        <div><span class="detail-rarity">${ITEM_RARITY_LABELS[item.rarity]}</span><h3>${item.name}</h3><small>${ITEM_CATEGORY_LABELS[item.category]}</small></div>
      </div>
      <p class="detail-description">${item.description}</p>
      ${stats.length ? `<div class="detail-stats">${stats.map((row) => `<span>${row}</span>`).join('')}</div>` : ''}
      ${item.heal ? `<div class="detail-stats"><span>Recupera ${item.heal} HP</span></div>` : ''}
      <div class="detail-meta"><span>Valor base</span><strong>🪙 ${item.value}</strong></div>
      <div class="detail-actions">
        ${canUse ? '<button id="detail-use" class="primary-action" type="button">Usar</button>' : ''}
        ${canEquip ? '<button id="detail-equip" class="primary-action" type="button">Equipar</button>' : ''}
        ${canUnequip ? '<button id="detail-unequip" class="primary-action" type="button">Desequipar</button>' : ''}
        ${isInventory ? '<button id="detail-discard" class="danger-action" type="button">Descartar 1</button>' : ''}
      </div>`;

    details.querySelector<HTMLButtonElement>('#detail-use')?.addEventListener('click', () => {
      if (!item.heal) return;
      const hp = callbacks.getHp();
      if (hp >= progress.maxHp) { callbacks.notify('Seu HP já está cheio.'); return; }
      if (!removeItem(progress, item.id, 1)) return;
      const next = Math.min(progress.maxHp, hp + item.heal);
      progress.hp = next;
      callbacks.setHp(next);
      callbacks.notify(`${item.name}: +${Math.round(next - hp)} HP.`);
      callbacks.onChanged();
      if (!progress.inventory.some((stack) => stack.itemId === item.id)) selection = null;
      render();
    });

    details.querySelector<HTMLButtonElement>('#detail-equip')?.addEventListener('click', () => {
      const result = equipItem(progress, item.id);
      if (!result.ok) { callbacks.notify(result.reason ?? 'Não foi possível equipar.'); return; }
      const hp = Math.min(callbacks.getHp(), progress.maxHp);
      progress.hp = hp;
      callbacks.setHp(hp);
      callbacks.notify(`${item.name} equipado.`);
      callbacks.onChanged();
      selection = { source: 'equipment', itemId: item.id, slot: result.slot! };
      render();
    });

    details.querySelector<HTMLButtonElement>('#detail-unequip')?.addEventListener('click', () => {
      if (selection?.source !== 'equipment') return;
      const result = unequipItem(progress, selection.slot);
      if (!result.ok) { callbacks.notify(result.reason ?? 'Não foi possível desequipar.'); return; }
      const hp = Math.min(callbacks.getHp(), progress.maxHp);
      progress.hp = hp;
      callbacks.setHp(hp);
      callbacks.notify(`${item.name} guardado no inventário.`);
      callbacks.onChanged();
      selection = { source: 'inventory', itemId: item.id };
      render();
    });

    details.querySelector<HTMLButtonElement>('#detail-discard')?.addEventListener('click', () => {
      if (!removeItem(progress, item.id, 1)) return;
      callbacks.notify(`1x ${item.name} descartado.`);
      callbacks.onChanged();
      if (!progress.inventory.some((stack) => stack.itemId === item.id)) selection = null;
      render();
    });
  };

  const render = () => {
    renderTabs();
    renderGrid();
    renderEquipment();
    renderDetails();
    capacity.textContent = `${inventorySlotsUsed(progress)} / ${progress.inventoryCapacity} slots`;
  };

  const open = () => {
    root.classList.remove('inventory-hidden');
    root.classList.add('inventory-visible');
    render();
  };
  const close = () => {
    root.classList.add('inventory-hidden');
    root.classList.remove('inventory-visible');
  };
  const toggle = () => root.classList.contains('inventory-hidden') ? open() : close();

  root.querySelector<HTMLButtonElement>('#inventory-close')!.addEventListener('click', close);
  root.querySelector<HTMLButtonElement>('#inventory-sort')!.addEventListener('click', () => {
    organizeInventory(progress);
    callbacks.notify('Inventário organizado.');
    callbacks.onChanged();
    render();
  });
  searchInput.addEventListener('input', () => { search = searchInput.value.trim().toLocaleLowerCase('pt-BR'); render(); });
  root.addEventListener('pointerdown', (event) => { if (event.target === root) close(); });

  window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'i' && !event.repeat && document.activeElement !== searchInput) { event.preventDefault(); toggle(); }
    if (event.key === 'Escape' && !root.classList.contains('inventory-hidden')) close();
  });

  render();
  return { root, open, close, toggle, refresh: render, isOpen: () => !root.classList.contains('inventory-hidden') };
}
