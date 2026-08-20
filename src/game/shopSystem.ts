import './shopSystem.css';
import type { CharacterProgress } from '../character/characterCreator';
import {
  ITEM_CATEGORY_LABELS,
  ITEM_RARITY_LABELS,
  addItem,
  ensureInventoryState,
  getItem,
  itemQuantity,
  removeItem,
  type EquipmentSlot,
  type ItemCategory,
  type ItemDefinition,
  type ItemStats,
} from '../items/itemCatalog';

export type ShopId = 'rowan' | 'mira' | 'theo';

type StockEntry = { itemId: string; price: number };
type ShopDefinition = {
  id: ShopId;
  name: string;
  role: string;
  icon: string;
  greeting: string;
  specialty: string;
  stock: StockEntry[];
  accepts: ItemCategory[];
};

type ShopCallbacks = {
  getCoins: () => number;
  setCoins: (value: number) => void;
  onChanged: () => void;
  notify: (message: string) => void;
};

type Mode = 'buy' | 'sell';

export const SHOPS: Record<ShopId, ShopDefinition> = {
  rowan: {
    id: 'rowan', name: 'Rowan', role: 'Ferreiro da Clareira', icon: '⚒️',
    greeting: 'Aço bom mantém aventureiro vivo. Veja o que preparei na forja.',
    specialty: 'Compra armas, equipamentos e acessórios.',
    stock: [
      { itemId: 'iron_sword', price: 120 },
      { itemId: 'hunter_armor', price: 145 },
      { itemId: 'forest_boots', price: 95 },
      { itemId: 'ranger_legs', price: 110 },
      { itemId: 'wolf_hood', price: 245 },
      { itemId: 'fang_charm', price: 280 },
    ],
    accepts: ['weapon', 'equipment', 'accessory'],
  },
  mira: {
    id: 'mira', name: 'Mira', role: 'Alquimista', icon: '⚗️',
    greeting: 'Minhas misturas são testadas. Na maior parte do tempo.',
    specialty: 'Poções de vida e compra de ingredientes alquímicos.',
    stock: [
      { itemId: 'small_health_potion', price: 20 },
      { itemId: 'medium_health_potion', price: 45 },
      { itemId: 'large_health_potion', price: 90 },
    ],
    accepts: ['consumable', 'material'],
  },
  theo: {
    id: 'theo', name: 'Theo', role: 'Comerciante', icon: '🪙',
    greeting: 'Tudo tem valor para a pessoa certa. Principalmente materiais da floresta.',
    specialty: 'Compra qualquer item e paga 25% a mais por materiais.',
    stock: [
      { itemId: 'adventurer_bag', price: 180 },
      { itemId: 'reinforced_bag', price: 360 },
      { itemId: 'small_health_potion', price: 24 },
      { itemId: 'basic_sword', price: 30 },
      { itemId: 'basic_boots', price: 25 },
    ],
    accepts: ['consumable', 'material', 'weapon', 'equipment', 'accessory'],
  },
};

const SLOT_LABELS: Record<EquipmentSlot, string> = {
  weapon: 'Arma', armor: 'Peitoral', boots: 'Botas', head: 'Cabeça', legs: 'Pernas', accessory1: 'Acessório I', accessory2: 'Acessório II',
};

function sellPrice(shop: ShopDefinition, item: ItemDefinition) {
  const bonus = shop.id === 'theo' && item.category === 'material' ? 1.25 : 1;
  return Math.max(1, Math.ceil(item.value * bonus));
}

function equippedTarget(progress: CharacterProgress, item: ItemDefinition): EquipmentSlot | null {
  const state = ensureInventoryState(progress);
  if (!item.equipSlot) return null;
  if (item.equipSlot === 'accessory') return state.equipment.accessory1 ? 'accessory2' : 'accessory1';
  return item.equipSlot;
}

function statValue(itemId: string | null | undefined, stat: keyof ItemStats) {
  return itemId ? (getItem(itemId)?.stats?.[stat] ?? 0) : 0;
}

function comparisonHtml(progress: CharacterProgress, item: ItemDefinition) {
  const slot = equippedTarget(progress, item);
  if (!slot) return '';
  const state = ensureInventoryState(progress);
  const currentId = state.equipment[slot];
  const current = currentId ? getItem(currentId) : undefined;
  const rows: Array<[keyof ItemStats, string]> = [['attack', 'Ataque'], ['defense', 'Defesa'], ['maxHp', 'HP máximo']];
  return `<section class="shop-comparison"><div class="shop-comparison-head"><span>Comparação · ${SLOT_LABELS[slot]}</span><strong>${current?.name ?? 'Slot vazio'}</strong></div>${rows.map(([stat, label]) => {
    const delta = statValue(item.id, stat) - statValue(currentId, stat);
    const cls = delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral';
    const text = delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : '— 0';
    return `<div class="shop-comparison-row ${cls}"><span>${label}</span><strong>${text}</strong></div>`;
  }).join('')}</section>`;
}

function statHtml(item: ItemDefinition) {
  const rows: string[] = [];
  if (item.stats?.attack) rows.push(`⚔ Ataque +${item.stats.attack}`);
  if (item.stats?.defense) rows.push(`🛡 Defesa +${item.stats.defense}`);
  if (item.stats?.maxHp) rows.push(`♥ HP máximo +${item.stats.maxHp}`);
  if (item.heal) rows.push(`✚ Recupera ${item.heal} HP`);
  if (item.capacityBonus) rows.push(`🎒 Inventário +${item.capacityBonus} slots permanentes`);
  return rows.length ? `<div class="shop-stats">${rows.map((row) => `<span>${row}</span>`).join('')}</div>` : '';
}

export function createShop(progress: CharacterProgress, callbacks: ShopCallbacks) {
  const state = ensureInventoryState(progress);
  let currentShop: ShopDefinition | null = null;
  let mode: Mode = 'buy';
  let selectedItemId: string | null = null;
  let quantity = 1;
  let search = '';

  const root = document.createElement('div');
  root.id = 'shop-overlay';
  root.className = 'shop-hidden';
  root.innerHTML = `
    <div class="shop-window" role="dialog" aria-label="Loja">
      <header class="shop-header">
        <div class="shop-merchant"><span id="shop-merchant-icon" class="shop-merchant-icon"></span><div><span class="shop-kicker">VILA DA CLAREIRA</span><h2 id="shop-merchant-name"></h2><p id="shop-merchant-role"></p></div></div>
        <div class="shop-header-right"><div class="shop-balance">🪙 <strong id="shop-balance"></strong></div><button id="shop-close" type="button" aria-label="Fechar">×</button></div>
      </header>
      <div class="shop-message"><span id="shop-greeting"></span><small id="shop-specialty"></small></div>
      <div class="shop-toolbar">
        <div class="shop-tabs"><button id="shop-tab-buy" type="button">Comprar</button><button id="shop-tab-sell" type="button">Vender</button></div>
        <label class="shop-search"><span>⌕</span><input id="shop-search" type="search" autocomplete="off" placeholder="Buscar item..." /></label>
      </div>
      <div class="shop-body">
        <section class="shop-list-panel"><div class="shop-list-heading"><strong id="shop-list-title"></strong><span id="shop-list-count"></span></div><div id="shop-list" class="shop-list"></div></section>
        <aside id="shop-detail" class="shop-detail"></aside>
      </div>
      <footer class="shop-footer"><span>Preços de venda variam conforme o especialista.</span><span><kbd>Esc</kbd> fechar</span></footer>
    </div>`;
  document.body.appendChild(root);

  const merchantIcon = root.querySelector<HTMLElement>('#shop-merchant-icon')!;
  const merchantName = root.querySelector<HTMLElement>('#shop-merchant-name')!;
  const merchantRole = root.querySelector<HTMLElement>('#shop-merchant-role')!;
  const greeting = root.querySelector<HTMLElement>('#shop-greeting')!;
  const specialty = root.querySelector<HTMLElement>('#shop-specialty')!;
  const balance = root.querySelector<HTMLElement>('#shop-balance')!;
  const buyTab = root.querySelector<HTMLButtonElement>('#shop-tab-buy')!;
  const sellTab = root.querySelector<HTMLButtonElement>('#shop-tab-sell')!;
  const searchInput = root.querySelector<HTMLInputElement>('#shop-search')!;
  const list = root.querySelector<HTMLElement>('#shop-list')!;
  const listTitle = root.querySelector<HTMLElement>('#shop-list-title')!;
  const listCount = root.querySelector<HTMLElement>('#shop-list-count')!;
  const detail = root.querySelector<HTMLElement>('#shop-detail')!;

  const entries = () => {
    if (!currentShop) return [] as Array<{ item: ItemDefinition; price: number; owned: number }>;
    if (mode === 'buy') {
      return currentShop.stock.map((stock) => {
        const item = getItem(stock.itemId);
        return item ? { item, price: stock.price, owned: itemQuantity(state, item.id) } : null;
      }).filter((entry): entry is { item: ItemDefinition; price: number; owned: number } => Boolean(entry));
    }
    const ids = Array.from(new Set(state.inventory.map((stack) => stack.itemId)));
    return ids.map((itemId) => {
      const item = getItem(itemId);
      if (!item || !currentShop!.accepts.includes(item.category)) return null;
      return { item, price: sellPrice(currentShop!, item), owned: itemQuantity(state, item.id) };
    }).filter((entry): entry is { item: ItemDefinition; price: number; owned: number } => Boolean(entry));
  };

  const visibleEntries = () => entries().filter((entry) => !search || entry.item.name.toLocaleLowerCase('pt-BR').includes(search));

  const selectFirstIfNeeded = () => {
    const available = visibleEntries();
    if (!selectedItemId || !available.some((entry) => entry.item.id === selectedItemId)) {
      selectedItemId = available[0]?.item.id ?? null;
      quantity = 1;
    }
  };

  const renderList = () => {
    list.replaceChildren();
    const available = visibleEntries();
    listTitle.textContent = mode === 'buy' ? 'Estoque da loja' : 'Seu inventário';
    listCount.textContent = `${available.length} ${available.length === 1 ? 'item' : 'itens'}`;
    for (const entry of available) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `shop-item rarity-${entry.item.rarity}${selectedItemId === entry.item.id ? ' selected' : ''}`;
      button.innerHTML = `<span class="shop-item-icon">${entry.item.icon}</span><span class="shop-item-copy"><small>${ITEM_RARITY_LABELS[entry.item.rarity]} · ${ITEM_CATEGORY_LABELS[entry.item.category]}</small><strong>${entry.item.name}</strong><em>${mode === 'sell' ? `Você possui ${entry.owned}` : entry.item.description}</em></span><span class="shop-item-price">🪙 ${entry.price}</span>`;
      button.addEventListener('click', () => { selectedItemId = entry.item.id; quantity = 1; render(); });
      list.appendChild(button);
    }
    if (!available.length) list.innerHTML = `<div class="shop-empty"><span>◇</span><strong>Nenhum item disponível</strong><p>${mode === 'sell' ? 'Este comerciante não compra os itens que você possui.' : 'Nenhum item corresponde à busca.'}</p></div>`;
  };

  const renderDetail = () => {
    if (!currentShop || !selectedItemId) {
      detail.innerHTML = '<div class="shop-detail-empty"><span>◇</span><strong>Selecione um item</strong><p>Detalhes e transação aparecerão aqui.</p></div>';
      return;
    }
    const entry = entries().find((candidate) => candidate.item.id === selectedItemId);
    if (!entry) { selectedItemId = null; renderDetail(); return; }
    const item = entry.item;
    const maxByMode = mode === 'sell'
      ? Math.max(1, entry.owned)
      : item.stackMax === 1 ? 1 : Math.max(1, Math.min(99, Math.floor(callbacks.getCoins() / Math.max(1, entry.price)) || 1));
    quantity = Math.max(1, Math.min(quantity, maxByMode));
    const total = entry.price * quantity;
    const comparison = mode === 'buy' ? comparisonHtml(state, item) : '';
    detail.innerHTML = `
      <div class="shop-detail-top rarity-${item.rarity}"><span class="shop-detail-icon">${item.icon}</span><div><small>${ITEM_RARITY_LABELS[item.rarity]} · ${ITEM_CATEGORY_LABELS[item.category]}</small><h3>${item.name}</h3><p>${item.description}</p></div></div>
      ${statHtml(item)}
      ${comparison}
      ${mode === 'sell' && currentShop.id === 'theo' && item.category === 'material' ? '<div class="shop-bonus-note">Theo paga +25% por materiais da floresta.</div>' : ''}
      <div class="shop-transaction">
        <div class="shop-price-row"><span>${mode === 'buy' ? 'Preço unitário' : 'Valor unitário'}</span><strong>🪙 ${entry.price}</strong></div>
        <div class="shop-qty-row"><span>Quantidade</span><div><button id="shop-qty-minus" type="button">−</button><strong id="shop-qty-value">${quantity}</strong><button id="shop-qty-plus" type="button">+</button><button id="shop-qty-max" type="button">MAX</button></div></div>
        <div class="shop-total"><span>Total</span><strong>🪙 ${total}</strong></div>
        <button id="shop-confirm" class="shop-confirm ${mode}" type="button">${mode === 'buy' ? 'Comprar' : 'Vender'} ${quantity > 1 ? `${quantity}x` : ''}</button>
      </div>`;

    const changeQuantity = (delta: number) => { quantity = Math.max(1, Math.min(maxByMode, quantity + delta)); renderDetail(); };
    detail.querySelector<HTMLButtonElement>('#shop-qty-minus')?.addEventListener('click', () => changeQuantity(-1));
    detail.querySelector<HTMLButtonElement>('#shop-qty-plus')?.addEventListener('click', () => changeQuantity(1));
    detail.querySelector<HTMLButtonElement>('#shop-qty-max')?.addEventListener('click', () => { quantity = maxByMode; renderDetail(); });
    detail.querySelector<HTMLButtonElement>('#shop-confirm')?.addEventListener('click', () => {
      if (!currentShop) return;
      if (mode === 'buy') {
        const cost = entry.price * quantity;
        if (callbacks.getCoins() < cost) { callbacks.notify('Moedas insuficientes para esta compra.'); return; }
        const result = addItem(state, item.id, quantity);
        if (result.remaining > 0) {
          if (result.added > 0) removeItem(state, item.id, result.added);
          callbacks.notify('Inventário sem espaço suficiente para esta compra.');
          return;
        }
        callbacks.setCoins(callbacks.getCoins() - cost);
        callbacks.notify(`${quantity}x ${item.name} comprado por ${cost} moedas.`);
      } else {
        const removed = removeItem(state, item.id, quantity);
        if (!removed) { callbacks.notify('Item não encontrado no inventário.'); return; }
        const earned = removed * entry.price;
        callbacks.setCoins(callbacks.getCoins() + earned);
        callbacks.notify(`${removed}x ${item.name} vendido por ${earned} moedas.`);
        if (itemQuantity(state, item.id) <= 0) selectedItemId = null;
      }
      callbacks.onChanged();
      selectFirstIfNeeded();
      render();
    });
  };

  const render = () => {
    if (!currentShop) return;
    merchantIcon.textContent = currentShop.icon;
    merchantName.textContent = currentShop.name;
    merchantRole.textContent = currentShop.role;
    greeting.textContent = currentShop.greeting;
    specialty.textContent = currentShop.specialty;
    balance.textContent = String(callbacks.getCoins());
    buyTab.classList.toggle('active', mode === 'buy');
    sellTab.classList.toggle('active', mode === 'sell');
    selectFirstIfNeeded();
    renderList();
    renderDetail();
  };

  const switchMode = (next: Mode) => { mode = next; selectedItemId = null; quantity = 1; render(); };
  buyTab.addEventListener('click', () => switchMode('buy'));
  sellTab.addEventListener('click', () => switchMode('sell'));
  searchInput.addEventListener('input', () => { search = searchInput.value.trim().toLocaleLowerCase('pt-BR'); selectedItemId = null; render(); });

  const open = (shopId: ShopId) => {
    currentShop = SHOPS[shopId];
    mode = 'buy'; selectedItemId = null; quantity = 1; search = ''; searchInput.value = '';
    root.classList.remove('shop-hidden'); root.classList.add('shop-visible');
    render();
  };
  const close = () => { root.classList.add('shop-hidden'); root.classList.remove('shop-visible'); };

  root.querySelector<HTMLButtonElement>('#shop-close')!.addEventListener('click', close);
  root.addEventListener('pointerdown', (event) => { if (event.target === root) close(); });
  window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !root.classList.contains('shop-hidden')) close(); });

  return { root, open, close, refresh: render, isOpen: () => !root.classList.contains('shop-hidden') };
}
