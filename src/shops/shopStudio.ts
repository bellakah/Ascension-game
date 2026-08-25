import './shopStudio.css';
import { PLAYABLE_CLASSES } from '../classes/classCatalog';
import { ITEM_STUDIO_CATEGORY_LABELS, itemStudioDisplay, listItemStudioRecords } from '../items/itemStudioStore';
import { createShopStudioRecord, deleteShopStudioRecord, duplicateShopStudioRecord, listShopStudioRecords, saveShopStudioRecord } from './shopStudioStore';
import type { ShopRestockMode, ShopStudioRecord, ShopStudioStatus } from './shopStudioTypes';
import { validateShop } from './shopStudioValidation';

const clone = <T>(value: T): T => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
const statusLabel: Record<ShopStudioStatus, string> = { draft: 'Draft', published: 'Published', disabled: 'Disabled' };
const tabs = [['general','Geral'],['stock','Estoque'],['rules','Compra / Venda'],['conditions','Condições'],['test','Teste']] as const;
type Tab = typeof tabs[number][0];

function itemOptions(selected = '') {
  return `<option value="">Selecione um item...</option>${listItemStudioRecords().map((item) => `<option value="${esc(item.key)}" ${item.key === selected ? 'selected' : ''}>${esc(itemStudioDisplay(item))}</option>`).join('')}`;
}
function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

export function createShopStudio(host: HTMLElement) {
  host.querySelector('.standalone-studio-empty')?.remove();
  const element = document.createElement('div'); element.className = 'shop-studio'; host.appendChild(element);
  let records = listShopStudioRecords();
  let current = clone(records[0] ?? createShopStudioRecord());
  let tab: Tab = 'general';
  let query = '';
  let toastTimer = 0;
  const toast = (message: string) => {
    element.querySelector('.shop-toast')?.remove(); const node = document.createElement('div'); node.className = 'shop-toast'; node.textContent = message; element.appendChild(node);
    clearTimeout(toastTimer); toastTimer = window.setTimeout(() => node.remove(), 2200);
  };
  const refreshRecords = (id = current.numericId) => { records = listShopStudioRecords(); const found = records.find((record) => record.numericId === id); if (found) current = clone(found); };
  const mutate = (fn: (shop: ShopStudioRecord) => void) => { fn(current); current.updatedAt = Date.now(); render(); };

  function catalog() {
    const values = records.filter((record) => !query || `${record.numericId} ${record.key} ${record.name} ${record.role} ${record.tags.join(' ')}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')));
    return `<aside class="shop-catalog"><div class="shop-catalog-head"><strong>SHOP CATALOG</strong><div class="shop-catalog-tools"><input id="shop-search" placeholder="Buscar loja..." value="${esc(query)}"><button id="shop-new">＋</button></div></div><div class="shop-catalog-list">${values.length ? values.map((record) => `<button class="shop-card ${record.numericId === current.numericId ? 'active' : ''}" data-shop-id="${record.numericId}"><span class="shop-card-icon">${esc(record.icon)}</span><span><strong>#${record.numericId} · ${esc(record.name)}</strong><small>${esc(record.role || record.key)}</small></span><span class="shop-status">${statusLabel[record.status]}</span></button>`).join('') : '<div class="shop-empty">Nenhuma loja encontrada.</div>'}</div></aside>`;
  }

  function general() {
    return `<section class="shop-section"><div class="shop-section-head"><strong>Identidade da loja</strong><span>Shop #${current.numericId}</span></div><div class="shop-section-body"><div class="shop-grid">
      <div class="shop-field"><label>Nome</label><input data-field="name" value="${esc(current.name)}"></div>
      <div class="shop-field"><label>Chave interna</label><input data-field="key" value="${esc(current.key)}" ${current.source === 'legacy' ? 'readonly' : ''}></div>
      <div class="shop-field"><label>Papel / tipo</label><input data-field="role" value="${esc(current.role)}"></div>
      <div class="shop-field"><label>Ícone</label><input data-field="icon" value="${esc(current.icon)}"></div>
      <div class="shop-field"><label>Status</label><select id="shop-status">${(['draft','published','disabled'] as ShopStudioStatus[]).map((value) => `<option value="${value}" ${current.status === value ? 'selected' : ''}>${statusLabel[value]}</option>`).join('')}</select></div>
      <div class="shop-field"><label>Prioridade</label><input data-number="priority" type="number" value="${current.priority}"></div>
      <div class="shop-field full"><label>Descrição</label><textarea data-field="description">${esc(current.description)}</textarea></div>
      <div class="shop-field full"><label>Saudação</label><textarea data-field="greeting">${esc(current.greeting)}</textarea></div>
      <div class="shop-field full"><label>Especialidade</label><input data-field="specialty" value="${esc(current.specialty)}"></div>
      <div class="shop-field full"><label>Tags</label><input id="shop-tags" value="${esc(current.tags.join(', '))}" placeholder="ferreiro, vila, evento"></div>
    </div></div></section>`;
  }

  function stock() {
    return `<section class="shop-section"><div class="shop-section-head"><strong>Estoque</strong><span>${current.items.length} item(ns)</span><div style="flex:1"></div><button class="shop-btn" id="shop-add-item">＋ Adicionar item</button></div><div class="shop-section-body"><div class="shop-stock-table">${current.items.length ? current.items.map((entry, index) => `<div class="shop-stock-row">
      <select data-stock-item="${index}">${itemOptions(entry.itemId)}</select>
      <input data-stock-buy="${index}" type="number" min="0" value="${entry.buyPrice}" title="Preço de compra">
      <input data-stock-sell="${index}" type="number" min="0" value="${entry.sellPrice ?? ''}" placeholder="auto" title="Preço de venda">
      <select data-stock-mode="${index}"><option value="infinite" ${entry.stock.mode === 'infinite' ? 'selected' : ''}>∞ Infinito</option><option value="limited" ${entry.stock.mode === 'limited' ? 'selected' : ''}>Limitado</option></select>
      <select class="restock" data-stock-restock="${index}">${(['never','minutes','daily','weekly','event'] as ShopRestockMode[]).map((value) => `<option value="${value}" ${entry.stock.restock === value ? 'selected' : ''}>${value}</option>`).join('')}</select>
      <button data-stock-remove="${index}">×</button>
    </div>`).join('') : '<div class="shop-empty">Adicione itens usando o catálogo do Item Studio.</div>'}</div>${current.items.some((entry) => entry.stock.mode === 'limited') ? `<div class="shop-grid">${current.items.map((entry,index) => entry.stock.mode === 'limited' ? `<div class="shop-field"><label>${esc(listItemStudioRecords().find((item) => item.key === entry.itemId)?.name ?? entry.itemId)} · quantidade</label><input data-stock-qty="${index}" type="number" min="1" value="${entry.stock.quantity || 1}"></div>${entry.stock.restock === 'minutes' ? `<div class="shop-field"><label>Reposição em minutos</label><input data-stock-minutes="${index}" type="number" min="1" value="${entry.stock.intervalMinutes ?? 60}"></div>` : ''}` : '').join('')}</div>` : ''}</div></section>`;
  }

  function rules() {
    const categories = Object.entries(ITEM_STUDIO_CATEGORY_LABELS);
    return `<section class="shop-section"><div class="shop-section-head"><strong>Transações</strong></div><div class="shop-section-body"><div class="shop-grid">
      <label class="shop-check"><input id="shop-allow-buy" type="checkbox" ${current.allowBuy ? 'checked' : ''}> Jogador pode comprar</label>
      <label class="shop-check"><input id="shop-allow-sell" type="checkbox" ${current.allowSell ? 'checked' : ''}> Loja compra do jogador</label>
      <div class="shop-field"><label>Multiplicador padrão de compra</label><input id="shop-buy-mult" type="number" min="0" step="0.05" value="${current.defaultBuyMultiplier}"></div>
      <div class="shop-field"><label>Multiplicador padrão de venda</label><input id="shop-sell-mult" type="number" min="0" step="0.05" value="${current.defaultSellMultiplier}"></div>
      <div class="shop-field"><label>Moeda</label><select id="shop-currency-type"><option value="coins" ${current.currency.type === 'coins' ? 'selected' : ''}>Coins</option><option value="item" ${current.currency.type === 'item' ? 'selected' : ''}>Item como moeda</option></select></div>
      ${current.currency.type === 'item' ? `<div class="shop-field"><label>Item moeda</label><select id="shop-currency-item">${itemOptions(current.currency.itemId)}</select></div>` : ''}
    </div><div><strong style="font-size:9px">Categorias aceitas na venda</strong><div class="shop-grid" style="margin-top:8px">${categories.map(([id,label]) => `<label class="shop-check"><input type="checkbox" data-accepted="${id}" ${current.acceptedCategories.includes(id as never) ? 'checked' : ''}> ${esc(label)}</label>`).join('')}</div></div></div></section>
    <section class="shop-section"><div class="shop-section-head"><strong>Regras especiais de preço</strong><div style="flex:1"></div><button id="shop-add-rule" class="shop-btn">＋ Regra</button></div><div class="shop-section-body">${current.priceRules.length ? current.priceRules.map((rule,index) => `<div class="shop-stock-row" style="grid-template-columns:1fr 90px 90px 30px"><select data-rule-category="${index}"><option value="">Categoria...</option>${categories.map(([id,label]) => `<option value="${id}" ${rule.category === id ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select><input data-rule-buy="${index}" type="number" min="0" step="0.05" value="${rule.buyMultiplier}" title="Compra ×"><input data-rule-sell="${index}" type="number" min="0" step="0.05" value="${rule.sellMultiplier}" title="Venda ×"><button data-rule-remove="${index}">×</button></div>`).join('') : '<div class="shop-empty">Sem regras especiais.</div>'}</div></section>`;
  }

  function conditions() {
    return `<section class="shop-section"><div class="shop-section-head"><strong>Condições de acesso</strong></div><div class="shop-section-body"><div class="shop-grid">
      <div class="shop-field"><label>Nível mínimo</label><input id="req-min" type="number" min="1" value="${current.requirements.minLevel ?? ''}"></div>
      <div class="shop-field"><label>Nível máximo</label><input id="req-max" type="number" min="1" value="${current.requirements.maxLevel ?? ''}"></div>
      <div class="shop-field full"><label>Missões concluídas (keys separadas por vírgula)</label><input id="req-quests" value="${esc((current.requirements.completedQuests ?? []).join(', '))}"></div>
      <div class="shop-field"><label>Evento ativo</label><input id="req-event" value="${esc(current.requirements.eventKey ?? '')}" placeholder="event_key"></div>
      <div class="shop-field"><label>Missão ativa</label><input id="req-active-quest" value="${esc(current.requirements.activeQuest ?? '')}" placeholder="quest_key"></div>
    </div><div><strong style="font-size:9px">Classes permitidas</strong><div class="shop-grid" style="margin-top:8px">${PLAYABLE_CLASSES.map((entry) => `<label class="shop-check"><input type="checkbox" data-class="${entry.id}" ${(current.requirements.classIds ?? []).includes(entry.id) ? 'checked' : ''}> ${esc(entry.name)}</label>`).join('')}</div></div></div></section>`;
  }

  function test() {
    const first = current.items[0]; const item = first ? listItemStudioRecords().find((entry) => entry.key === first.itemId) : null;
    const buy = first ? Math.round(first.buyPrice * current.defaultBuyMultiplier) : 0;
    const sellBase = first?.sellPrice ?? item?.value ?? 0;
    const rule = item ? current.priceRules.find((entry) => entry.category === item.category || (entry.tag && item.tags.includes(entry.tag))) : undefined;
    const sell = Math.round(sellBase * current.defaultSellMultiplier * (rule?.sellMultiplier ?? 1));
    return `<section class="shop-section"><div class="shop-section-head"><strong>Shop Simulator</strong><span>Não altera save</span></div><div class="shop-section-body"><div class="shop-simulator"><div class="shop-field"><label>Saldo de teste</label><input id="sim-balance" type="number" min="0" value="1000"></div><div class="shop-sim-result">${first && item ? `<strong>${esc(item.name)}</strong><br>Comprar 1: ${buy} ${current.currency.type === 'coins' ? 'coins' : 'unidades da moeda'}<br>Vender 1: ${sell}<br>Estoque: ${first.stock.mode === 'infinite' ? '∞' : first.stock.quantity}` : 'Adicione ao menos um item para simular.'}</div><button id="sim-run" class="shop-btn primary" ${!first ? 'disabled' : ''}>▶ Simular compra</button><div id="sim-output" class="shop-sim-result">A simulação considera preço, multiplicadores e moeda.</div></div></div></section>`;
  }

  function inspector() {
    const issues = validateShop(current);
    return `<aside class="shop-inspector"><div class="shop-inspector-head"><strong>INSPECTOR</strong><span style="font-size:8px;color:#7897a7">${issues.filter((issue) => issue.severity === 'error').length} erro(s)</span></div><div class="shop-inspector-body">${issues.length ? issues.map((issue) => `<div class="shop-issue ${issue.severity}"><strong>${issue.severity.toUpperCase()}</strong><br>${esc(issue.message)}</div>`).join('') : '<div class="shop-issue info">✓ Loja válida para publicação.</div>'}<div class="shop-section"><div class="shop-section-head"><strong>Dependências</strong></div><div class="shop-section-body" style="font-size:9px;color:#88a6b5">${current.items.length} item(ns) do Item Studio<br>Key estável: ${esc(current.key)}<br>Integração com NPCs entra na próxima etapa.</div></div></div></aside>`;
  }

  function render() {
    const body = tab === 'general' ? general() : tab === 'stock' ? stock() : tab === 'rules' ? rules() : tab === 'conditions' ? conditions() : test();
    element.innerHTML = `${catalog()}<main class="shop-center"><div class="shop-titlebar"><span style="font-size:24px">${esc(current.icon)}</span><div><h2>${esc(current.name)}</h2><small style="color:#708f9f">Shop #${current.numericId} · ${esc(current.key)}</small></div><div class="spacer"></div><button id="shop-duplicate" class="shop-btn">Duplicar</button><button id="shop-export" class="shop-btn">Exportar</button><button id="shop-import" class="shop-btn">Importar</button><button id="shop-save" class="shop-btn primary">Salvar</button></div><nav class="shop-tabs">${tabs.map(([id,label]) => `<button data-tab="${id}" class="${tab === id ? 'active' : ''}">${label}</button>`).join('')}</nav>${body}<div class="shop-footer-actions"><button id="shop-disable" class="shop-btn">${current.status === 'disabled' ? 'Ativar como Draft' : 'Desativar'}</button><button id="shop-delete" class="shop-btn danger" ${current.source === 'legacy' ? 'disabled' : ''}>Excluir custom</button></div></main>${inspector()}`;
    bind();
  }

  function bind() {
    element.querySelector<HTMLInputElement>('#shop-search')!.oninput = (event) => { query = (event.currentTarget as HTMLInputElement).value; render(); };
    element.querySelector<HTMLButtonElement>('#shop-new')!.onclick = () => { current = createShopStudioRecord(); records = [...records, clone(current)]; tab = 'general'; render(); };
    element.querySelectorAll<HTMLButtonElement>('[data-shop-id]').forEach((button) => button.onclick = () => { const record = records.find((entry) => entry.numericId === Number(button.dataset.shopId)); if (record) { current = clone(record); tab = 'general'; render(); } });
    element.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => button.onclick = () => { tab = button.dataset.tab as Tab; render(); });
    element.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-field]').forEach((input) => input.oninput = () => { (current as unknown as Record<string,string>)[input.dataset.field!] = input.value; });
    element.querySelectorAll<HTMLInputElement>('[data-number]').forEach((input) => input.oninput = () => { (current as unknown as Record<string,number>)[input.dataset.number!] = Number(input.value) || 0; });
    const status = element.querySelector<HTMLSelectElement>('#shop-status'); if (status) status.onchange = () => { const next = status.value as ShopStudioStatus; if (next === 'published' && validateShop(current).some((issue) => issue.severity === 'error')) { toast('Corrija os erros críticos antes de publicar.'); status.value = current.status; return; } current.status = next; render(); };
    const tags = element.querySelector<HTMLInputElement>('#shop-tags'); if (tags) tags.oninput = () => current.tags = tags.value.split(',').map((value) => value.trim()).filter(Boolean);

    element.querySelector<HTMLButtonElement>('#shop-add-item')?.addEventListener('click', () => { current.items.push({ itemId: listItemStudioRecords()[0]?.key ?? '', buyPrice: 0, useItemValueForSell: true, stock: { mode: 'infinite', quantity: 0, restock: 'never' }, sortOrder: current.items.length * 10 }); render(); });
    element.querySelectorAll<HTMLSelectElement>('[data-stock-item]').forEach((input) => input.onchange = () => { current.items[Number(input.dataset.stockItem)].itemId = input.value; render(); });
    element.querySelectorAll<HTMLInputElement>('[data-stock-buy]').forEach((input) => input.oninput = () => current.items[Number(input.dataset.stockBuy)].buyPrice = Math.max(0, Number(input.value) || 0));
    element.querySelectorAll<HTMLInputElement>('[data-stock-sell]').forEach((input) => input.oninput = () => { const entry = current.items[Number(input.dataset.stockSell)]; if (input.value === '') delete entry.sellPrice; else entry.sellPrice = Math.max(0, Number(input.value) || 0); });
    element.querySelectorAll<HTMLSelectElement>('[data-stock-mode]').forEach((input) => input.onchange = () => { const entry = current.items[Number(input.dataset.stockMode)]; entry.stock.mode = input.value as 'infinite' | 'limited'; if (entry.stock.mode === 'limited' && entry.stock.quantity <= 0) entry.stock.quantity = 1; render(); });
    element.querySelectorAll<HTMLSelectElement>('[data-stock-restock]').forEach((input) => input.onchange = () => { current.items[Number(input.dataset.stockRestock)].stock.restock = input.value as ShopRestockMode; render(); });
    element.querySelectorAll<HTMLInputElement>('[data-stock-qty]').forEach((input) => input.oninput = () => current.items[Number(input.dataset.stockQty)].stock.quantity = Math.max(1, Number(input.value) || 1));
    element.querySelectorAll<HTMLInputElement>('[data-stock-minutes]').forEach((input) => input.oninput = () => current.items[Number(input.dataset.stockMinutes)].stock.intervalMinutes = Math.max(1, Number(input.value) || 1));
    element.querySelectorAll<HTMLButtonElement>('[data-stock-remove]').forEach((button) => button.onclick = () => { current.items.splice(Number(button.dataset.stockRemove), 1); render(); });

    const allowBuy = element.querySelector<HTMLInputElement>('#shop-allow-buy'); if (allowBuy) allowBuy.onchange = () => current.allowBuy = allowBuy.checked;
    const allowSell = element.querySelector<HTMLInputElement>('#shop-allow-sell'); if (allowSell) allowSell.onchange = () => current.allowSell = allowSell.checked;
    const buyMult = element.querySelector<HTMLInputElement>('#shop-buy-mult'); if (buyMult) buyMult.oninput = () => current.defaultBuyMultiplier = Math.max(0, Number(buyMult.value) || 0);
    const sellMult = element.querySelector<HTMLInputElement>('#shop-sell-mult'); if (sellMult) sellMult.oninput = () => current.defaultSellMultiplier = Math.max(0, Number(sellMult.value) || 0);
    const currencyType = element.querySelector<HTMLSelectElement>('#shop-currency-type'); if (currencyType) currencyType.onchange = () => { current.currency = currencyType.value === 'item' ? { type: 'item', itemId: '' } : { type: 'coins' }; render(); };
    const currencyItem = element.querySelector<HTMLSelectElement>('#shop-currency-item'); if (currencyItem) currencyItem.onchange = () => current.currency.itemId = currencyItem.value;
    element.querySelectorAll<HTMLInputElement>('[data-accepted]').forEach((input) => input.onchange = () => { const id = input.dataset.accepted as never; if (input.checked && !current.acceptedCategories.includes(id)) current.acceptedCategories.push(id); if (!input.checked) current.acceptedCategories = current.acceptedCategories.filter((value) => value !== id); });
    element.querySelector<HTMLButtonElement>('#shop-add-rule')?.addEventListener('click', () => { current.priceRules.push({ id: `rule_${Date.now()}`, buyMultiplier: 1, sellMultiplier: 1 }); render(); });
    element.querySelectorAll<HTMLSelectElement>('[data-rule-category]').forEach((input) => input.onchange = () => current.priceRules[Number(input.dataset.ruleCategory)].category = input.value as never);
    element.querySelectorAll<HTMLInputElement>('[data-rule-buy]').forEach((input) => input.oninput = () => current.priceRules[Number(input.dataset.ruleBuy)].buyMultiplier = Math.max(0, Number(input.value) || 0));
    element.querySelectorAll<HTMLInputElement>('[data-rule-sell]').forEach((input) => input.oninput = () => current.priceRules[Number(input.dataset.ruleSell)].sellMultiplier = Math.max(0, Number(input.value) || 0));
    element.querySelectorAll<HTMLButtonElement>('[data-rule-remove]').forEach((button) => button.onclick = () => { current.priceRules.splice(Number(button.dataset.ruleRemove), 1); render(); });

    const min = element.querySelector<HTMLInputElement>('#req-min'); if (min) min.oninput = () => current.requirements.minLevel = min.value ? Math.max(1, Number(min.value) || 1) : undefined;
    const max = element.querySelector<HTMLInputElement>('#req-max'); if (max) max.oninput = () => current.requirements.maxLevel = max.value ? Math.max(1, Number(max.value) || 1) : undefined;
    const quests = element.querySelector<HTMLInputElement>('#req-quests'); if (quests) quests.oninput = () => current.requirements.completedQuests = quests.value.split(',').map((value) => value.trim()).filter(Boolean);
    const event = element.querySelector<HTMLInputElement>('#req-event'); if (event) event.oninput = () => current.requirements.eventKey = event.value || undefined;
    const activeQuest = element.querySelector<HTMLInputElement>('#req-active-quest'); if (activeQuest) activeQuest.oninput = () => current.requirements.activeQuest = activeQuest.value || undefined;
    element.querySelectorAll<HTMLInputElement>('[data-class]').forEach((input) => input.onchange = () => { const ids = new Set(current.requirements.classIds ?? []); if (input.checked) ids.add(input.dataset.class as never); else ids.delete(input.dataset.class as never); current.requirements.classIds = [...ids]; });

    element.querySelector<HTMLButtonElement>('#sim-run')?.addEventListener('click', () => { const balance = Math.max(0, Number(element.querySelector<HTMLInputElement>('#sim-balance')?.value) || 0); const first = current.items[0]; const cost = first ? Math.round(first.buyPrice * current.defaultBuyMultiplier) : 0; const output = element.querySelector<HTMLElement>('#sim-output'); if (output) output.textContent = balance >= cost ? `Compra permitida. Saldo final: ${balance - cost}.` : `Compra bloqueada: faltam ${cost - balance}.`; });

    element.querySelector<HTMLButtonElement>('#shop-save')!.onclick = () => { try { if (current.status === 'published' && validateShop(current).some((issue) => issue.severity === 'error')) throw new Error('Existem erros críticos no Inspector.'); current = saveShopStudioRecord(current); refreshRecords(); toast('Loja salva.'); render(); } catch (error) { toast(error instanceof Error ? error.message : 'Falha ao salvar.'); } };
    element.querySelector<HTMLButtonElement>('#shop-duplicate')!.onclick = () => { current = duplicateShopStudioRecord(current); refreshRecords(current.numericId); toast('Cópia criada como Draft.'); render(); };
    element.querySelector<HTMLButtonElement>('#shop-disable')!.onclick = () => { current.status = current.status === 'disabled' ? 'draft' : 'disabled'; current = saveShopStudioRecord(current); refreshRecords(); render(); };
    element.querySelector<HTMLButtonElement>('#shop-delete')!.onclick = () => { try { deleteShopStudioRecord(current); records = listShopStudioRecords(); current = clone(records[0] ?? createShopStudioRecord()); toast('Loja removida.'); render(); } catch (error) { toast(error instanceof Error ? error.message : 'Falha ao excluir.'); } };
    element.querySelector<HTMLButtonElement>('#shop-export')!.onclick = () => download(`shop-${current.numericId}-${current.key}.json`, JSON.stringify(current, null, 2));
    element.querySelector<HTMLButtonElement>('#shop-import')!.onclick = () => { const input = document.createElement('input'); input.type = 'file'; input.accept = 'application/json,.json'; input.onchange = () => { const file = input.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const parsed = JSON.parse(String(reader.result)) as ShopStudioRecord; parsed.source = 'custom'; parsed.status = 'draft'; parsed.numericId = createShopStudioRecord().numericId; parsed.key = `shop_${parsed.numericId}`; current = saveShopStudioRecord(parsed); refreshRecords(current.numericId); toast('Loja importada como Draft.'); render(); } catch { toast('JSON de loja inválido.'); } }; reader.readAsText(file); }; input.click(); };
  }
  render();
  return { element, refresh: render };
}
