import './inventory.css';
import './inventoryComparison.css';
import type { CharacterProgress } from '../character/characterCreator';
import { GEM_BY_ID } from '../equipment/refinementConfig';
import {
  ITEM_CATEGORY_LABELS,
  ITEM_RARITY_LABELS,
  ensureInventoryState,
  equipItem,
  equipmentTotalStats,
  getItem,
  inventorySlotsUsed,
  normalizeEnhancement,
  organizeInventory,
  unequipItem,
  type EquipmentSlot,
  type ItemCategory,
  type ItemEnhancementData,
  type ItemStats,
} from './itemCatalog';

type InventoryCallbacks = {
  getHp: () => number;
  setHp: (value: number) => void;
  onChanged: () => void;
  notify: (message: string) => void;
};

type InventorySelection = { source: 'inventory'; itemId: string; index: number };
type EquipmentSelection = { source: 'equipment'; itemId: string; slot: EquipmentSlot };
type Selection = InventorySelection | EquipmentSelection | null;

const TABS: Array<{ id: ItemCategory | 'all'; icon: string }> = [
  { id: 'all', icon: '▦' },
  { id: 'consumable', icon: '✚' },
  { id: 'material', icon: '◆' },
  { id: 'weapon', icon: '⚔' },
  { id: 'equipment', icon: '♜' },
  { id: 'accessory', icon: '◇' },
];

const EQUIPMENT_SLOTS: Array<{ id: EquipmentSlot; label: string; icon: string }> = [
  { id: 'head', label: 'Cabeça', icon: '◒' },
  { id: 'armor', label: 'Peitoral', icon: '♜' },
  { id: 'legs', label: 'Pernas', icon: '▥' },
  { id: 'boots', label: 'Botas', icon: '⌄' },
  { id: 'weapon', label: 'Arma', icon: '⚔' },
  { id: 'accessory1', label: 'Acessório I', icon: '◇' },
  { id: 'accessory2', label: 'Acessório II', icon: '◇' },
];

function targetSlot(progress: CharacterProgress, itemId: string): EquipmentSlot | null {
  const state = ensureInventoryState(progress);
  const item = getItem(itemId);
  if (!item?.equipSlot) return null;
  if (item.equipSlot === 'accessory') return state.equipment.accessory1 ? 'accessory2' : 'accessory1';
  return item.equipSlot;
}

function displayName(name: string, meta?: ItemEnhancementData | null) {
  const refine = normalizeEnhancement(meta).refine;
  return `${name}${refine > 0 ? ` +${refine}` : ''}`;
}

function statsRows(stats: ItemStats) {
  const rows: string[] = [];
  if (stats.attack) rows.push(`Ataque +${stats.attack}`);
  if (stats.defense) rows.push(`Defesa +${stats.defense}`);
  if (stats.maxHp) rows.push(`HP máximo +${stats.maxHp}`);
  return rows;
}

function comparisonHtml(progress: CharacterProgress, itemId: string, incoming?: ItemEnhancementData) {
  const state = ensureInventoryState(progress);
  const slot = targetSlot(progress, itemId);
  if (!slot) return '';

  const currentId = state.equipment[slot];
  const current = currentId ? getItem(currentId) : undefined;
  const currentMeta = state.equipmentEnhancements?.[slot];
  const nextStats = equipmentTotalStats(itemId, slot, incoming);
  const currentStats = equipmentTotalStats(currentId, slot, currentMeta);
  const rows: Array<[keyof ItemStats, string]> = [
    ['attack', 'Ataque'],
    ['defense', 'Defesa'],
    ['maxHp', 'HP máximo'],
  ];

  const body = rows.map(([stat, name]) => {
    const delta = (nextStats[stat] ?? 0) - (currentStats[stat] ?? 0);
    const cls = delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral';
    const text = delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : '— 0';
    return `<div class="comparison-row ${cls}"><span>${name}</span><strong>${text}</strong></div>`;
  }).join('');

  return `<div class="detail-comparison"><div class="detail-comparison-head"><span>Comparação</span><strong>${current ? displayName(current.name, currentMeta) : 'Slot vazio'}</strong></div><div class="detail-comparison-rows">${body}</div></div>`;
}

export function createInventory(progress: CharacterProgress, callbacks: InventoryCallbacks) {
  const state = ensureInventoryState(progress);
  let activeTab: ItemCategory | 'all' = 'all';
  let search = '';
  let selection: Selection = null;

  const root = document.createElement('div');
  root.id = 'inventory-overlay';
  root.className = 'inventory-hidden';
  root.innerHTML = `
    <div class="inventory-window" role="dialog" aria-label="Inventário">
      <header class="inventory-header">
        <div class="inventory-title-block"><span class="inventory-kicker">ASCENSION</span><h2>Inventário</h2><span id="inventory-capacity"></span></div>
        <div class="inventory-header-actions">
          <label class="inventory-search"><span>⌕</span><input id="inventory-search" type="search" placeholder="Buscar item..." autocomplete="off" /></label>
          <button id="inventory-sort" class="inventory-tool" type="button" title="Auto-organizar">↕ <span>Organizar</span></button>
          <button id="inventory-close" class="inventory-close" type="button" aria-label="Fechar">×</button>
        </div>
      </header>
      <nav id="inventory-tabs" class="inventory-tabs"></nav>
      <div class="inventory-body">
        <main class="inventory-main"><div class="inventory-toolbar"><span id="inventory-filter-label"></span><span id="inventory-result-count"></span></div><div id="inventory-grid" class="inventory-grid"></div></main>
        <aside class="inventory-side"><section class="equipment-card"><div class="panel-heading"><span>Equipado</span><small id="inventory-power"></small></div><div id="equipment-grid" class="equipment-grid"></div></section><section id="item-details" class="item-details"></section></aside>
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

  const removeAt = (index: number, quantity = 1) => {
    const stack = state.inventory[index];
    if (!stack || stack.quantity < quantity) return false;
    stack.quantity -= quantity;
    if (stack.quantity <= 0) state.inventory.splice(index, 1);
    return true;
  };

  const renderTabs = () => {
    tabs.replaceChildren();
    for (const tab of TABS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `inventory-tab${activeTab === tab.id ? ' active' : ''}`;
      button.innerHTML = `<span>${tab.icon}</span><strong>${ITEM_CATEGORY_LABELS[tab.id]}</strong>`;
      button.addEventListener('click', () => {
        activeTab = tab.id;
        render();
      });
      tabs.appendChild(button);
    }
  };

  const renderGrid = () => {
    grid.replaceChildren();
    const stacks = state.inventory
      .map((stack, index) => ({ ...stack, index, item: getItem(stack.itemId) }))
      .filter((entry) => entry.item)
      .filter((entry) => activeTab === 'all' || entry.item!.category === activeTab)
      .filter((entry) => !search || entry.item!.name.toLocaleLowerCase('pt-BR').includes(search));

    for (const entry of stacks) {
      const item = entry.item!;
      const name = displayName(item.name, entry.enhancement);
      const button = document.createElement('button');
      button.type = 'button';
      const selected = selection?.source === 'inventory' && selection.index === entry.index;
      button.className = `inventory-slot rarity-${item.rarity}${selected ? ' selected' : ''}`;
      button.title = name;
      button.innerHTML = `<span class="slot-rarity"></span><span class="slot-icon">${item.icon}</span>${entry.quantity > 1 ? `<span class="slot-quantity">${entry.quantity}</span>` : ''}<span class="slot-name">${name}</span>`;
      button.addEventListener('click', () => setSelection({ source: 'inventory', itemId: item.id, index: entry.index }));
      grid.appendChild(button);
    }

    if (activeTab === 'all' && !search) {
      for (let i = 0; i < Math.max(0, state.inventoryCapacity - state.inventory.length); i++) {
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
      const itemId = state.equipment[slot.id];
      const item = itemId ? getItem(itemId) : undefined;
      const meta = state.equipmentEnhancements?.[slot.id];
      const button = document.createElement('button');
      button.type = 'button';
      const selected = selection?.source === 'equipment' && selection.slot === slot.id;
      button.className = `equipment-slot${item ? ` rarity-${item.rarity}` : ''}${selected ? ' selected' : ''}`;
      button.innerHTML = item
        ? `<span class="equipment-icon">${item.icon}</span><span><small>${slot.label}</small><strong>${displayName(item.name, meta)}</strong></span>`
        : `<span class="equipment-icon empty-equip">${slot.icon}</span><span><small>${slot.label}</small><strong>Vazio</strong></span>`;
      if (item) button.addEventListener('click', () => setSelection({ source: 'equipment', itemId: item.id, slot: slot.id }));
      equipmentGrid.appendChild(button);
    }
    power.textContent = `ATQ ${state.attack} · DEF ${state.defense}`;
  };

  const renderDetails = () => {
    if (!selection) {
      details.innerHTML = '<div class="details-empty"><span>◇</span><strong>Selecione um item</strong><p>As informações, atributos e ações aparecerão aqui.</p></div>';
      return;
    }

    const selected = selection;
    const item = getItem(selected.itemId);
    if (!item) {
      selection = null;
      renderDetails();
      return;
    }

    let meta: ItemEnhancementData | undefined;
    let slot: EquipmentSlot | null;

    if (selected.source === 'inventory') {
      const inventoryStack = state.inventory[selected.index];
      if (!inventoryStack || inventoryStack.itemId !== item.id) {
        selection = null;
        renderDetails();
        return;
      }
      meta = inventoryStack.enhancement;
      slot = targetSlot(progress, item.id);
    } else {
      meta = state.equipmentEnhancements?.[selected.slot];
      slot = selected.slot;
    }

    const effectiveStats = slot && item.equipSlot ? equipmentTotalStats(item.id, slot, meta) : item.stats ?? {};
    const statLines = statsRows(effectiveStats);
    const enhancement = normalizeEnhancement(meta);
    const refine = enhancement.refine;
    const gems = enhancement.gems.filter(Boolean).map((id) => GEM_BY_ID[id!]).filter(Boolean);
    const canUse = selected.source === 'inventory' && (Boolean(item.heal) || Boolean(item.capacityBonus));
    const canEquip = selected.source === 'inventory' && Boolean(item.equipSlot);
    const canUnequip = selected.source === 'equipment';

    details.innerHTML = `
      <div class="detail-top rarity-${item.rarity}"><span class="detail-icon">${item.icon}</span><div><span class="detail-rarity">${ITEM_RARITY_LABELS[item.rarity]}</span><h3>${displayName(item.name, meta)}</h3><small>${ITEM_CATEGORY_LABELS[item.category]}</small></div></div>
      <p class="detail-description">${item.description}</p>
      ${refine > 0 ? `<div class="detail-stats"><span>💠 Refino +${refine}</span></div>` : ''}
      ${gems.length ? `<div class="detail-stats">${gems.map((gem) => `<span>${gem.icon} ${gem.name}</span>`).join('')}</div>` : ''}
      ${statLines.length ? `<div class="detail-stats">${statLines.map((row) => `<span>${row}</span>`).join('')}</div>` : ''}
      ${item.heal ? `<div class="detail-stats"><span>Recupera ${item.heal} HP</span></div>` : ''}
      ${item.capacityBonus ? `<div class="detail-stats"><span>Inventário +${item.capacityBonus} slots permanentes</span><span>Capacidade atual: ${state.inventoryCapacity}/48</span></div>` : ''}
      ${canEquip ? comparisonHtml(progress, item.id, meta) : ''}
      <div class="detail-meta"><span>Valor base</span><strong>🪙 ${item.value}</strong></div>
      <div class="detail-actions">
        ${canUse ? '<button id="detail-use" class="primary-action" type="button">Usar</button>' : ''}
        ${canEquip ? '<button id="detail-equip" class="primary-action" type="button">Equipar</button>' : ''}
        ${canUnequip ? '<button id="detail-unequip" class="primary-action" type="button">Desequipar</button>' : ''}
        ${selected.source === 'inventory' ? '<button id="detail-discard" class="danger-action" type="button">Descartar 1</button>' : ''}
      </div>`;

    details.querySelector<HTMLButtonElement>('#detail-use')?.addEventListener('click', () => {
      if (selection?.source !== 'inventory') return;
      const inventorySelection = selection;

      if (item.capacityBonus) {
        if (state.inventoryCapacity >= 48) {
          callbacks.notify('Seu inventário já atingiu o limite atual de 48 slots.');
          return;
        }
        if (!removeAt(inventorySelection.index, 1)) return;
        const before = state.inventoryCapacity;
        state.inventoryCapacity = Math.min(48, state.inventoryCapacity + item.capacityBonus);
        callbacks.notify(`${item.name}: capacidade aumentada de ${before} para ${state.inventoryCapacity} slots.`);
        callbacks.onChanged();
        selection = null;
        render();
        return;
      }

      if (!item.heal) return;
      const hp = callbacks.getHp();
      if (hp >= state.maxHp) {
        callbacks.notify('Seu HP já está cheio.');
        return;
      }
      if (!removeAt(inventorySelection.index, 1)) return;
      const next = Math.min(state.maxHp, hp + item.heal);
      state.hp = next;
      callbacks.setHp(next);
      callbacks.notify(`${item.name}: +${Math.round(next - hp)} HP.`);
      callbacks.onChanged();
      selection = null;
      render();
    });

    details.querySelector<HTMLButtonElement>('#detail-equip')?.addEventListener('click', () => {
      if (selection?.source !== 'inventory') return;
      const inventorySelection = selection;
      const result = equipItem(progress, item.id, inventorySelection.index);
      if (!result.ok) {
        callbacks.notify(result.reason ?? 'Não foi possível equipar.');
        return;
      }
      const hp = Math.min(callbacks.getHp(), state.maxHp);
      state.hp = hp;
      callbacks.setHp(hp);
      callbacks.notify(`${displayName(item.name, state.equipmentEnhancements?.[result.slot!])} equipado.`);
      callbacks.onChanged();
      selection = { source: 'equipment', itemId: item.id, slot: result.slot! };
      render();
    });

    details.querySelector<HTMLButtonElement>('#detail-unequip')?.addEventListener('click', () => {
      if (selection?.source !== 'equipment') return;
      const equipmentSelection = selection;
      const result = unequipItem(progress, equipmentSelection.slot);
      if (!result.ok) {
        callbacks.notify(result.reason ?? 'Não foi possível desequipar.');
        return;
      }
      const hp = Math.min(callbacks.getHp(), state.maxHp);
      state.hp = hp;
      callbacks.setHp(hp);
      callbacks.notify(`${item.name} guardado no inventário com seus aprimoramentos.`);
      callbacks.onChanged();
      selection = null;
      render();
    });

    details.querySelector<HTMLButtonElement>('#detail-discard')?.addEventListener('click', () => {
      if (selection?.source !== 'inventory') return;
      const inventorySelection = selection;
      if (!removeAt(inventorySelection.index, 1)) return;
      callbacks.notify(`1x ${displayName(item.name, meta)} descartado.`);
      callbacks.onChanged();
      selection = null;
      render();
    });
  };

  const render = () => {
    renderTabs();
    renderGrid();
    renderEquipment();
    renderDetails();
    capacity.textContent = `${inventorySlotsUsed(progress)} / ${state.inventoryCapacity} slots`;
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
    selection = null;
    callbacks.notify('Inventário organizado.');
    callbacks.onChanged();
    render();
  });
  searchInput.addEventListener('input', () => {
    search = searchInput.value.trim().toLocaleLowerCase('pt-BR');
    render();
  });
  root.addEventListener('pointerdown', (event) => {
    if (event.target === root) close();
  });
  window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'i' && !event.repeat && document.activeElement !== searchInput) {
      event.preventDefault();
      toggle();
    }
    if (event.key === 'Escape' && !root.classList.contains('inventory-hidden')) close();
  });

  render();
  return { root, open, close, toggle, refresh: render, isOpen: () => !root.classList.contains('inventory-hidden') };
}
