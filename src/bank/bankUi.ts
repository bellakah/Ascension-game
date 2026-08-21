import './bankUi.css';
import type { CharacterProgress } from '../character/characterCreator';
import { addItem, ensureInventoryState, getItem, normalizeEnhancement, type ItemCategory } from '../items/itemCatalog';
import { depositInventoryStack, ensureBankState, organizeBank, withdrawBankStack } from './bankState';

type BankCallbacks = {
  getCoins: () => number;
  setCoins: (value: number) => void;
  onChanged: () => void;
  notify: (message: string) => void;
};

type Selection = { side: 'inventory' | 'bank'; index: number } | null;
const CATEGORIES: Array<ItemCategory | 'all'> = ['all', 'consumable', 'material', 'weapon', 'equipment', 'accessory'];

export function createBankUi(progress: CharacterProgress, callbacks: BankCallbacks) {
  const root = document.createElement('div');
  root.id = 'bank-overlay'; root.className = 'bank-hidden'; document.body.appendChild(root);
  let selection: Selection = null, search = '', category: ItemCategory | 'all' = 'all', quantity = 1;

  const close = () => root.classList.add('bank-hidden');
  const open = () => { root.classList.remove('bank-hidden'); selection = null; quantity = 1; render(); };

  const renderStacks = (side: 'inventory' | 'bank') => {
    const inventory = ensureInventoryState(progress);
    const bank = ensureBankState(progress);
    const stacks = (side === 'inventory' ? inventory.inventory : bank.items)
      .map((stack, index) => ({ stack, index, item: getItem(stack.itemId) }))
      .filter((entry) => entry.item)
      .filter((entry) => category === 'all' || entry.item!.category === category)
      .filter((entry) => !search || entry.item!.name.toLocaleLowerCase('pt-BR').includes(search));
    return stacks.map(({ stack, index, item }) => {
      const refine = normalizeEnhancement(stack.enhancement).refine;
      const selected = selection?.side === side && selection.index === index ? ' selected' : '';
      return `<button class="bank-slot rarity-${item!.rarity}${selected}" data-side="${side}" data-index="${index}"><span>${item!.icon}</span><b>${item!.name}${refine ? ` +${refine}` : ''}</b><small>x${stack.quantity}</small></button>`;
    }).join('') || '<div class="bank-empty">Nenhum item aqui.</div>';
  };

  const selectedStack = () => {
    if (!selection) return null;
    const bank = ensureBankState(progress), inventory = ensureInventoryState(progress);
    return selection.side === 'inventory' ? inventory.inventory[selection.index] : bank.items[selection.index];
  };

  const render = () => {
    const bank = ensureBankState(progress), inventory = ensureInventoryState(progress), stack = selectedStack();
    const item = stack ? getItem(stack.itemId) : undefined;
    quantity = Math.max(1, Math.min(quantity, stack?.quantity ?? 1));
    root.innerHTML = `<section class="bank-window" role="dialog" aria-label="Banco Pessoal">
      <header class="bank-header"><div><span>BANCO DA CLAREIRA</span><h2>Banco Pessoal</h2></div><div class="bank-head-actions"><input id="bank-search" placeholder="Buscar item..." value="${search.replaceAll('"','&quot;')}"><button id="bank-sort">↕ Organizar</button><button id="bank-close">×</button></div></header>
      <div class="bank-tabs">${CATEGORIES.map((id)=>`<button data-cat="${id}" class="${category===id?'active':''}">${id==='all'?'Todos':id==='consumable'?'Consumíveis':id==='material'?'Materiais':id==='weapon'?'Armas':id==='equipment'?'Equipamentos':'Acessórios'}</button>`).join('')}</div>
      <div class="bank-coins"><div><span>Na bolsa</span><strong>🪙 ${callbacks.getCoins()}</strong></div><div><span>No cofre</span><strong>🏦 ${bank.storedCoins}</strong></div><div class="bank-coin-actions"><input id="bank-coin-amount" type="number" min="1" value="1"><button id="bank-deposit-coins">Depositar</button><button id="bank-withdraw-coins">Retirar</button></div></div>
      <div class="bank-body">
        <section><div class="bank-panel-title"><strong>🎒 Inventário</strong><small>${inventory.inventory.length}/${inventory.inventoryCapacity} slots</small></div><div class="bank-grid">${renderStacks('inventory')}</div></section>
        <aside class="bank-transfer"><div class="bank-selected">${item?`<span>${item.icon}</span><strong>${item.name}</strong><small>${item.description}</small>`:'<strong>Selecione um item</strong><small>Escolha em qual lado deseja mover.</small>'}</div>${item?`<div class="bank-qty"><button id="bank-minus">−</button><input id="bank-qty" type="number" min="1" max="${stack!.quantity}" value="${quantity}"><button id="bank-plus">+</button><button id="bank-max">MAX</button></div><button id="bank-transfer-btn" class="bank-primary">${selection!.side==='inventory'?'Depositar →':'← Retirar'}</button>`:''}</aside>
        <section><div class="bank-panel-title"><strong>🏦 Armazém</strong><small>${bank.items.length}/${bank.capacity} slots</small></div><div class="bank-grid">${renderStacks('bank')}</div></section>
      </div>
      <footer class="bank-footer">O Banco Pessoal pertence somente a este personagem. Banco compartilhado será adicionado futuramente.</footer>
    </section>`;

    root.querySelector<HTMLButtonElement>('#bank-close')!.onclick = close;
    root.querySelector<HTMLInputElement>('#bank-search')!.oninput = (e) => { search = (e.currentTarget as HTMLInputElement).value.trim().toLocaleLowerCase('pt-BR'); render(); };
    root.querySelectorAll<HTMLButtonElement>('[data-cat]').forEach((button)=>button.onclick=()=>{category=button.dataset.cat as ItemCategory|'all'; selection=null; render();});
    root.querySelectorAll<HTMLButtonElement>('[data-side]').forEach((button)=>button.onclick=()=>{selection={side:button.dataset.side as 'inventory'|'bank', index:Number(button.dataset.index)}; quantity=1; render();});
    root.querySelector<HTMLButtonElement>('#bank-sort')!.onclick=()=>{organizeBank(progress); callbacks.onChanged(); selection=null; render();};

    const coinAmount = () => Math.max(1, Math.floor(Number(root.querySelector<HTMLInputElement>('#bank-coin-amount')?.value || 1)));
    root.querySelector<HTMLButtonElement>('#bank-deposit-coins')!.onclick=()=>{const amount=Math.min(callbacks.getCoins(),coinAmount()); if(amount<=0){callbacks.notify('Você não possui moedas para depositar.');return;} callbacks.setCoins(callbacks.getCoins()-amount); bank.storedCoins+=amount; callbacks.onChanged(); render();};
    root.querySelector<HTMLButtonElement>('#bank-withdraw-coins')!.onclick=()=>{const amount=Math.min(bank.storedCoins,coinAmount()); if(amount<=0){callbacks.notify('O cofre está vazio.');return;} bank.storedCoins-=amount; callbacks.setCoins(callbacks.getCoins()+amount); callbacks.onChanged(); render();};

    if (!item || !selection) return;
    root.querySelector<HTMLButtonElement>('#bank-minus')!.onclick=()=>{quantity=Math.max(1,quantity-1);render();};
    root.querySelector<HTMLButtonElement>('#bank-plus')!.onclick=()=>{quantity=Math.min(stack!.quantity,quantity+1);render();};
    root.querySelector<HTMLButtonElement>('#bank-max')!.onclick=()=>{quantity=stack!.quantity;render();};
    root.querySelector<HTMLInputElement>('#bank-qty')!.onchange=(e)=>{quantity=Math.max(1,Math.min(stack!.quantity,Math.floor(Number((e.currentTarget as HTMLInputElement).value)||1)));render();};
    root.querySelector<HTMLButtonElement>('#bank-transfer-btn')!.onclick=()=>{
      if(selection!.side==='inventory'){
        const result=depositInventoryStack(progress,selection!.index,quantity);
        if(!result.ok){callbacks.notify(result.reason);return;} callbacks.notify(`${result.moved}x ${getItem(result.itemId!)?.name??'item'} depositado.`);
      }else{
        const result=withdrawBankStack(progress,selection!.index,quantity,(id,qty,enh)=>addItem(progress,id,qty,enh));
        if(!result.ok){callbacks.notify(result.reason);return;} callbacks.notify(`${result.moved}x ${getItem(result.itemId!)?.name??'item'} retirado.`);
      }
      callbacks.onChanged(); selection=null; quantity=1; render();
    };
  };

  root.addEventListener('pointerdown',(e)=>{if(e.target===root)close();});
  window.addEventListener('keydown',(e)=>{if(e.key==='Escape'&&!root.classList.contains('bank-hidden'))close();});
  return { open, close, refresh: render, isOpen:()=>!root.classList.contains('bank-hidden') };
}
