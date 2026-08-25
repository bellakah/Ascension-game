import './shopSystem.css';
import type { CharacterProgress } from '../character/characterCreator';
import { createBankUi } from '../bank/bankUi';
import { ITEM_CATEGORY_LABELS, ITEM_RARITY_LABELS, addItem, ensureInventoryState, getItem, itemQuantity, removeItem, type EquipmentSlot, type ItemDefinition, type ItemStats } from '../items/itemCatalog';
import type { ShopStudioItem, ShopStudioRecord } from '../shops/shopStudioTypes';
import { consumeShopStock, getRuntimeShop, grantShopCurrency, shopAcceptsItem, shopBuyPrice, shopCurrencyAmount, shopSellPrice, shopStockRemaining, spendShopCurrency } from '../shops/shopRuntime';

export type ShopId = string;
type ShopCallbacks = { getCoins: () => number; setCoins: (value: number) => void; onChanged: () => void; notify: (message: string) => void };
type Mode = 'buy' | 'sell';
type RuntimeEntry = { item: ItemDefinition; price: number; owned: number; stock?: ShopStudioItem; remaining?: number };

const SLOT_LABELS: Record<EquipmentSlot, string> = { weapon: 'Arma', armor: 'Peitoral', boots: 'Botas', head: 'Cabeça', legs: 'Pernas', accessory1: 'Acessório I', accessory2: 'Acessório II' };
function equippedTarget(progress: CharacterProgress, item: ItemDefinition): EquipmentSlot | null {
  const state = ensureInventoryState(progress); if (!item.equipSlot) return null; if (item.equipSlot === 'accessory') return state.equipment.accessory1 ? 'accessory2' : 'accessory1'; return item.equipSlot;
}
function statValue(itemId: string | null | undefined, stat: keyof ItemStats) { return itemId ? (getItem(itemId)?.stats?.[stat] ?? 0) : 0; }
function comparisonHtml(progress: CharacterProgress, item: ItemDefinition) {
  const slot = equippedTarget(progress, item); if (!slot) return ''; const state = ensureInventoryState(progress), currentId = state.equipment[slot], current = currentId ? getItem(currentId) : undefined;
  const rows: Array<[keyof ItemStats,string]> = [['attack','Ataque'],['defense','Defesa'],['maxHp','HP máximo']];
  return `<section class="shop-comparison"><div class="shop-comparison-head"><span>Comparação · ${SLOT_LABELS[slot]}</span><strong>${current?.name ?? 'Slot vazio'}</strong></div>${rows.map(([stat,label]) => { const delta = statValue(item.id, stat) - statValue(currentId, stat), cls = delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral', text = delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : '— 0'; return `<div class="shop-comparison-row ${cls}"><span>${label}</span><strong>${text}</strong></div>`; }).join('')}</section>`;
}
function statHtml(item: ItemDefinition) {
  const rows: string[] = []; if (item.stats?.attack) rows.push(`⚔ Ataque +${item.stats.attack}`); if (item.stats?.defense) rows.push(`🛡 Defesa +${item.stats.defense}`); if (item.stats?.maxHp) rows.push(`♥ HP máximo +${item.stats.maxHp}`); if (item.heal) rows.push(`✚ Recupera ${item.heal} HP`); if (item.capacityBonus) rows.push(`🎒 Inventário +${item.capacityBonus} slots permanentes`); return rows.length ? `<div class="shop-stats">${rows.map((row) => `<span>${row}</span>`).join('')}</div>` : '';
}

export function createShop(progress: CharacterProgress, callbacks: ShopCallbacks) {
  const state = ensureInventoryState(progress), bankUi = createBankUi(progress, callbacks);
  let currentShop: ShopStudioRecord | null = null, mode: Mode = 'buy', selectedItemId: string | null = null, quantity = 1, search = '';
  const root = document.createElement('div'); root.id = 'shop-overlay'; root.className = 'shop-hidden';
  root.innerHTML = `<div class="shop-window" role="dialog" aria-label="Loja"><header class="shop-header"><div class="shop-merchant"><span id="shop-merchant-icon" class="shop-merchant-icon"></span><div><span class="shop-kicker">COMÉRCIO</span><h2 id="shop-merchant-name"></h2><p id="shop-merchant-role"></p></div></div><div class="shop-header-right"><div class="shop-balance"><span id="shop-currency-icon">🪙</span> <strong id="shop-balance"></strong></div><button id="shop-close" type="button">×</button></div></header><div class="shop-message"><span id="shop-greeting"></span><small id="shop-specialty"></small></div><div class="shop-toolbar"><div class="shop-tabs"><button id="shop-tab-buy">Comprar</button><button id="shop-tab-sell">Vender</button></div><label class="shop-search"><span>⌕</span><input id="shop-search" type="search" placeholder="Buscar item..."></label></div><div class="shop-body"><section class="shop-list-panel"><div class="shop-list-heading"><strong id="shop-list-title"></strong><span id="shop-list-count"></span></div><div id="shop-list" class="shop-list"></div></section><aside id="shop-detail" class="shop-detail"></aside></div><footer class="shop-footer"><span>Preços e estoque são definidos no Shop Studio.</span><span><kbd>Esc</kbd> fechar</span></footer></div>`;
  document.body.appendChild(root);
  const icon = root.querySelector<HTMLElement>('#shop-merchant-icon')!, name = root.querySelector<HTMLElement>('#shop-merchant-name')!, role = root.querySelector<HTMLElement>('#shop-merchant-role')!, greeting = root.querySelector<HTMLElement>('#shop-greeting')!, specialty = root.querySelector<HTMLElement>('#shop-specialty')!, balance = root.querySelector<HTMLElement>('#shop-balance')!, currencyIcon = root.querySelector<HTMLElement>('#shop-currency-icon')!, buyTab = root.querySelector<HTMLButtonElement>('#shop-tab-buy')!, sellTab = root.querySelector<HTMLButtonElement>('#shop-tab-sell')!, searchInput = root.querySelector<HTMLInputElement>('#shop-search')!, list = root.querySelector<HTMLElement>('#shop-list')!, listTitle = root.querySelector<HTMLElement>('#shop-list-title')!, listCount = root.querySelector<HTMLElement>('#shop-list-count')!, detail = root.querySelector<HTMLElement>('#shop-detail')!;

  const currencyLabel = () => currentShop?.currency.type === 'item' ? (getItem(currentShop.currency.itemId ?? '')?.name ?? 'Moeda especial') : 'moedas';
  const entries = (): RuntimeEntry[] => {
    if (!currentShop) return [];
    if (mode === 'buy') return currentShop.allowBuy ? currentShop.items.map((stock) => { const item = getItem(stock.itemId), remaining = shopStockRemaining(currentShop!, stock); return item && remaining > 0 ? { item, price: shopBuyPrice(currentShop!, stock), owned: itemQuantity(state, item.id), stock, remaining } : null; }).filter((value): value is RuntimeEntry => Boolean(value)) : [];
    return Array.from(new Set(state.inventory.map((stack) => stack.itemId))).map((itemId) => { const item = getItem(itemId); return item && shopAcceptsItem(currentShop!, item) ? { item, price: shopSellPrice(currentShop!, item), owned: itemQuantity(state, item.id) } : null; }).filter((value): value is RuntimeEntry => Boolean(value));
  };
  const visibleEntries = () => entries().filter((entry) => !search || entry.item.name.toLocaleLowerCase('pt-BR').includes(search));
  const selectFirst = () => { const available = visibleEntries(); if (!selectedItemId || !available.some((entry) => entry.item.id === selectedItemId)) { selectedItemId = available[0]?.item.id ?? null; quantity = 1; } };

  function renderList() {
    const available = visibleEntries(); list.innerHTML = ''; listTitle.textContent = mode === 'buy' ? 'Estoque da loja' : 'Seu inventário'; listCount.textContent = `${available.length} ${available.length === 1 ? 'item' : 'itens'}`;
    for (const entry of available) { const button = document.createElement('button'); button.type = 'button'; button.className = `shop-item rarity-${entry.item.rarity}${selectedItemId === entry.item.id ? ' selected' : ''}`; const stockText = mode === 'buy' && Number.isFinite(entry.remaining) ? ` · estoque ${entry.remaining}` : ''; button.innerHTML = `<span class="shop-item-icon">${entry.item.icon}</span><span class="shop-item-copy"><small>${ITEM_RARITY_LABELS[entry.item.rarity]} · ${ITEM_CATEGORY_LABELS[entry.item.category]}</small><strong>${entry.item.name}</strong><em>${mode === 'sell' ? `Você possui ${entry.owned}` : `${entry.item.description}${stockText}`}</em></span><span class="shop-item-price">${currentShop?.currency.type === 'item' ? '◆' : '🪙'} ${entry.price}</span>`; button.onclick = () => { selectedItemId = entry.item.id; quantity = 1; render(); }; list.appendChild(button); }
    if (!available.length) list.innerHTML = `<div class="shop-empty"><span>◇</span><strong>Nenhum item disponível</strong><p>${mode === 'sell' ? 'Esta loja não compra os itens que você possui.' : 'O estoque está vazio ou indisponível.'}</p></div>`;
  }

  function renderDetail() {
    if (!currentShop || !selectedItemId) { detail.innerHTML = '<div class="shop-detail-empty"><span>◇</span><strong>Selecione um item</strong><p>Detalhes e transação aparecerão aqui.</p></div>'; return; }
    const entry = entries().find((candidate) => candidate.item.id === selectedItemId); if (!entry) { selectedItemId = null; renderDetail(); return; }
    const currency = shopCurrencyAmount(progress, currentShop, callbacks.getCoins());
    const maxByMoney = entry.price <= 0 ? 99 : Math.floor(currency / entry.price);
    const maxByMode = mode === 'sell' ? Math.max(1, entry.owned) : Math.max(1, Math.min(entry.item.stackMax === 1 ? 1 : 99, Number.isFinite(entry.remaining) ? entry.remaining! : 99, Math.max(1, maxByMoney)));
    quantity = Math.max(1, Math.min(quantity, maxByMode)); const total = entry.price * quantity;
    detail.innerHTML = `<div class="shop-detail-top rarity-${entry.item.rarity}"><span class="shop-detail-icon">${entry.item.icon}</span><div><small>${ITEM_RARITY_LABELS[entry.item.rarity]} · ${ITEM_CATEGORY_LABELS[entry.item.category]}</small><h3>${entry.item.name}</h3><p>${entry.item.description}</p></div></div>${statHtml(entry.item)}${mode === 'buy' ? comparisonHtml(progress, entry.item) : ''}<div class="shop-transaction"><div class="shop-price-row"><span>${mode === 'buy' ? 'Preço unitário' : 'Valor unitário'}</span><strong>${entry.price} ${currencyLabel()}</strong></div><div class="shop-qty-row"><span>Quantidade</span><div><button id="shop-qty-minus">−</button><strong>${quantity}</strong><button id="shop-qty-plus">+</button><button id="shop-qty-max">MAX</button></div></div><div class="shop-total"><span>Total</span><strong>${total} ${currencyLabel()}</strong></div><button id="shop-confirm" class="shop-confirm ${mode}">${mode === 'buy' ? 'Comprar' : 'Vender'} ${quantity > 1 ? `${quantity}x` : ''}</button></div>`;
    const change = (delta: number) => { quantity = Math.max(1, Math.min(maxByMode, quantity + delta)); renderDetail(); };
    detail.querySelector<HTMLButtonElement>('#shop-qty-minus')!.onclick = () => change(-1); detail.querySelector<HTMLButtonElement>('#shop-qty-plus')!.onclick = () => change(1); detail.querySelector<HTMLButtonElement>('#shop-qty-max')!.onclick = () => { quantity = maxByMode; renderDetail(); };
    detail.querySelector<HTMLButtonElement>('#shop-confirm')!.onclick = () => {
      if (!currentShop) return;
      if (mode === 'buy') {
        if (shopCurrencyAmount(progress, currentShop, callbacks.getCoins()) < total) { callbacks.notify(`Saldo insuficiente de ${currencyLabel()}.`); return; }
        if (entry.stock && shopStockRemaining(currentShop, entry.stock) < quantity) { callbacks.notify('Estoque insuficiente.'); render(); return; }
        const added = addItem(state, entry.item.id, quantity); if (added.remaining > 0) { if (added.added) removeItem(state, entry.item.id, added.added); callbacks.notify('Inventário sem espaço suficiente.'); return; }
        const payment = spendShopCurrency(progress, currentShop, callbacks.getCoins(), total); if (!payment.ok) { removeItem(state, entry.item.id, quantity); callbacks.notify('Não foi possível processar o pagamento.'); return; }
        callbacks.setCoins(payment.coins);
        if (entry.stock && !consumeShopStock(currentShop, entry.stock, quantity)) { removeItem(state, entry.item.id, quantity); const refund = grantShopCurrency(progress, currentShop, callbacks.getCoins(), total); callbacks.setCoins(refund.coins); callbacks.notify('O estoque mudou durante a compra.'); return; }
        callbacks.notify(`${quantity}x ${entry.item.name} comprado.`);
      } else {
        const removed = removeItem(state, entry.item.id, quantity); if (!removed) { callbacks.notify('Item não encontrado no inventário.'); return; }
        const reward = grantShopCurrency(progress, currentShop, callbacks.getCoins(), removed * entry.price); if (!reward.ok) { addItem(state, entry.item.id, removed); callbacks.notify('Sem espaço para receber a moeda desta venda.'); return; }
        callbacks.setCoins(reward.coins); callbacks.notify(`${removed}x ${entry.item.name} vendido.`); if (itemQuantity(state, entry.item.id) <= 0) selectedItemId = null;
      }
      callbacks.onChanged(); selectFirst(); render();
    };
  }

  function render() {
    if (!currentShop) return; icon.textContent = currentShop.icon; name.textContent = currentShop.name; role.textContent = currentShop.role; greeting.textContent = currentShop.greeting; specialty.textContent = currentShop.specialty;
    const currencyItem = currentShop.currency.type === 'item' ? getItem(currentShop.currency.itemId ?? '') : null; currencyIcon.textContent = currentShop.currency.type === 'item' ? (currencyItem?.icon ?? '◆') : '🪙'; balance.textContent = String(shopCurrencyAmount(progress, currentShop, callbacks.getCoins())); buyTab.style.display = currentShop.allowBuy ? '' : 'none'; sellTab.style.display = currentShop.allowSell ? '' : 'none'; buyTab.classList.toggle('active', mode === 'buy'); sellTab.classList.toggle('active', mode === 'sell'); selectFirst(); renderList(); renderDetail();
  }
  const switchMode = (next: Mode) => { mode = next; selectedItemId = null; quantity = 1; render(); };
  buyTab.onclick = () => switchMode('buy'); sellTab.onclick = () => switchMode('sell'); searchInput.oninput = () => { search = searchInput.value.trim().toLocaleLowerCase('pt-BR'); selectedItemId = null; render(); };
  const closeShopWindow = () => { root.classList.add('shop-hidden'); root.classList.remove('shop-visible'); };
  const open = (shopId: ShopId) => {
    if (shopId === 'silas') { closeShopWindow(); bankUi.open(); return true; }
    const resolved = getRuntimeShop(shopId, progress); if (!resolved) { callbacks.notify('Esta loja não está disponível agora.'); return false; }
    bankUi.close(); currentShop = resolved; mode = resolved.allowBuy ? 'buy' : 'sell'; selectedItemId = null; quantity = 1; search = ''; searchInput.value = ''; root.classList.remove('shop-hidden'); root.classList.add('shop-visible'); render(); return true;
  };
  const close = () => { closeShopWindow(); bankUi.close(); };
  root.querySelector<HTMLButtonElement>('#shop-close')!.onclick = close; root.addEventListener('pointerdown', (event) => { if (event.target === root) close(); }); window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !root.classList.contains('shop-hidden')) close(); });
  return { root, open, close, refresh: () => { render(); bankUi.refresh(); }, isOpen: () => !root.classList.contains('shop-hidden') || bankUi.isOpen() };
}
