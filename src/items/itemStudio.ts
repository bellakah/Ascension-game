import '../npc/npcStudio.css';
import './itemStudio.css';
import {
  ITEM_STUDIO_CATEGORY_LABELS,
  createItemStudioRecord,
  deleteItemStudioRecord,
  duplicateItemStudioRecord,
  findItemStudioRecord,
  itemStudioDisplay,
  listItemStudioRecords,
  saveItemStudioRecord,
  type ItemChestEntry,
  type ItemStudioCategory,
  type ItemStudioRecord,
} from './itemStudioStore';
import type { EquipSlot, ItemRarity } from './itemCatalog';
import type { ClassId } from '../classes/classCatalog';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const clone = <T>(value: T): T => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;

type ItemStudioTab = 'general' | 'properties' | 'chest';

const CATEGORIES = Object.entries(ITEM_STUDIO_CATEGORY_LABELS) as Array<[ItemStudioCategory, string]>;
const RARITIES: Array<[ItemRarity, string]> = [['common', 'Comum'], ['uncommon', 'Incomum'], ['rare', 'Raro'], ['epic', 'Épico']];
const EQUIP_SLOTS: Array<[EquipSlot, string]> = [['weapon', 'Arma'], ['armor', 'Peitoral'], ['head', 'Cabeça'], ['legs', 'Pernas'], ['boots', 'Botas'], ['accessory', 'Acessório']];
const CLASSES: Array<[ClassId, string]> = [['warrior', 'Guerreiro'], ['mage', 'Mago']];

function iconHtml(item: Pick<ItemStudioRecord, 'icon' | 'iconImage'>, className = '') {
  return item.iconImage
    ? `<img class="${className}" src="${esc(item.iconImage)}" alt="">`
    : `<span class="${className}">${esc(item.icon || '◆')}</span>`;
}

function resizeIcon(file: File) {
  return new Promise<string>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 96; canvas.height = 96;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('Falha ao preparar ícone.')); return; }
      ctx.imageSmoothingEnabled = false;
      const scale = Math.min(96 / image.naturalWidth, 96 / image.naturalHeight);
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      ctx.clearRect(0, 0, 96, 96);
      ctx.drawImage(image, Math.round((96 - width) / 2), Math.round((96 - height) / 2), width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível abrir a imagem.')); };
    image.src = url;
  });
}

export function createItemStudio(root: HTMLElement) {
  let items = listItemStudioRecords();
  let activeKey = items[0]?.key ?? '';
  let draft: ItemStudioRecord | null = activeKey ? clone(items[0]) : null;
  let tab: ItemStudioTab = 'general';
  let search = '';
  let categoryFilter: ItemStudioCategory | 'all' = 'all';
  let messageTimer = 0;

  const overlay = document.createElement('section');
  overlay.className = 'npc-studio-overlay item-studio-overlay hidden';
  overlay.innerHTML = `
    <header class="npc-studio-head item-studio-head"><div><strong>ITEM STUDIO</strong><span>Catálogo central de itens, equipamentos, consumíveis e baús</span></div><div class="spacer"></div><button id="item-studio-back">← Voltar ao mapa</button></header>
    <div class="npc-studio-shell item-studio-shell">
      <aside class="npc-list item-list"><div class="npc-list-tools item-list-tools"><input id="item-list-search" placeholder="Buscar nome, ID ou chave..."><select id="item-category-filter"><option value="all">Todas categorias</option>${CATEGORIES.map(([id,label]) => `<option value="${id}">${label}</option>`).join('')}</select><button id="item-new" class="npc-primary">＋ Novo item</button></div><div id="item-list-items" class="npc-list-items item-list-items"></div></aside>
      <main class="npc-center item-center"><div class="item-preview-card"><div id="item-preview-icon" class="item-preview-icon">◆</div><span id="item-preview-id" class="item-preview-id">ITEM #—</span><strong id="item-preview-name">Nenhum item</strong><span id="item-preview-meta"></span><p id="item-preview-description"></p></div><div id="item-summary" class="item-summary"></div></main>
      <aside class="npc-properties item-properties"><nav id="item-tabs" class="npc-tabs"></nav><div id="item-form" class="npc-form item-form"></div><div id="item-message" class="item-message"></div><footer class="npc-properties-foot"><button id="item-duplicate">Duplicar</button><button id="item-delete" class="npc-danger">Excluir</button><div class="spacer"></div><button id="item-save" class="npc-primary">Salvar item</button></footer></aside>
    </div>`;
  root.querySelector<HTMLElement>('.mep-stage-wrap')?.appendChild(overlay);

  const listNode = overlay.querySelector<HTMLElement>('#item-list-items')!;
  const form = overlay.querySelector<HTMLElement>('#item-form')!;
  const tabs = overlay.querySelector<HTMLElement>('#item-tabs')!;
  const searchInput = overlay.querySelector<HTMLInputElement>('#item-list-search')!;
  const categorySelect = overlay.querySelector<HTMLSelectElement>('#item-category-filter')!;
  const message = overlay.querySelector<HTMLElement>('#item-message')!;

  const showMessage = (text: string, error = false) => {
    message.textContent = text;
    message.classList.toggle('error', error);
    message.classList.add('show');
    window.clearTimeout(messageTimer);
    messageTimer = window.setTimeout(() => message.classList.remove('show'), 2600);
  };

  const reload = (keepKey = activeKey) => {
    items = listItemStudioRecords();
    activeKey = items.some((item) => item.key === keepKey) ? keepKey : items[0]?.key ?? '';
    draft = activeKey ? clone(items.find((item) => item.key === activeKey)!) : null;
  };

  const renderList = () => {
    const query = search.trim().toLocaleLowerCase('pt-BR');
    const values = items.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (!query) return true;
      return `${item.numericId} ${item.key} ${item.name} ${item.description} ${item.tags.join(' ')}`.toLocaleLowerCase('pt-BR').includes(query.replace(/^#/, ''));
    });
    listNode.innerHTML = values.length ? values.map((item) => `<button class="npc-list-card item-list-card ${item.key === activeKey ? 'active' : ''}" data-item-key="${esc(item.key)}"><span class="item-list-icon">${iconHtml(item)}</span><span class="item-list-copy"><strong>${esc(item.name)}</strong><span>#${item.numericId} · ${esc(ITEM_STUDIO_CATEGORY_LABELS[item.category])}</span></span><span class="item-rarity-dot rarity-${item.rarity}" title="${item.rarity}"></span></button>`).join('') : '<div class="item-empty">Nenhum item encontrado.</div>';
    listNode.querySelectorAll<HTMLButtonElement>('[data-item-key]').forEach((button) => button.onclick = () => {
      activeKey = button.dataset.itemKey!;
      draft = clone(items.find((item) => item.key === activeKey)!);
      renderAll();
    });
  };

  const renderTabs = () => {
    const values: Array<[ItemStudioTab,string]> = [['general','Geral'], ['properties','Propriedades'], ['chest','Baú / Loot']];
    tabs.innerHTML = values.map(([id,label]) => `<button data-item-tab="${id}" class="${tab === id ? 'active' : ''}">${label}</button>`).join('');
    tabs.querySelectorAll<HTMLButtonElement>('[data-item-tab]').forEach((button) => button.onclick = () => { tab = button.dataset.itemTab as ItemStudioTab; renderTabs(); renderForm(); });
  };

  const bindText = (selector: string, apply: (value: string) => void) => {
    const input = form.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector); if (!input) return;
    input.oninput = () => { if (!draft) return; apply(input.value); renderPreview(); };
  };
  const bindNumber = (selector: string, apply: (value: number) => void) => {
    const input = form.querySelector<HTMLInputElement>(selector); if (!input) return;
    input.oninput = () => { if (!draft) return; apply(Number(input.value)); renderPreview(); };
  };
  const bindCheck = (selector: string, apply: (value: boolean) => void) => {
    const input = form.querySelector<HTMLInputElement>(selector); if (!input) return;
    input.onchange = () => { if (!draft) return; apply(input.checked); renderPreview(); };
  };

  const renderGeneral = () => {
    if (!draft) return;
    const persisted = items.some((item) => item.key === draft!.key);
    form.innerHTML = `
      <section><h4>Identidade</h4><div class="item-id-grid"><label>Item ID<input id="item-numeric-id" type="number" min="1" value="${draft.numericId}" ${persisted ? 'disabled' : ''}></label><label>Chave interna<input value="${esc(draft.key)}" disabled></label></div><p class="monster-inline-note">O Item ID numérico é permanente. A chave interna mantém compatibilidade com saves antigos.</p><label>Nome<input id="item-name" value="${esc(draft.name)}"></label><label>Descrição<textarea id="item-description">${esc(draft.description)}</textarea></label><div class="npc-form-grid"><label>Categoria<select id="item-category">${CATEGORIES.map(([id,label]) => `<option value="${id}" ${draft!.category === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Raridade<select id="item-rarity">${RARITIES.map(([id,label]) => `<option value="${id}" ${draft!.rarity === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><label>Tags<input id="item-tags" value="${esc(draft.tags.join(', '))}" placeholder="floresta, crafting, evento"></label></section>
      <section><h4>Ícone do inventário</h4><div class="item-icon-editor"><div class="item-icon-preview">${iconHtml(draft)}</div><div><label>Fallback / símbolo<input id="item-icon" value="${esc(draft.icon)}" maxlength="8"></label><div class="item-icon-actions"><button id="item-icon-upload" type="button">Carregar PNG/WebP/JPG</button>${draft.iconImage ? '<button id="item-icon-remove" type="button">Remover imagem</button>' : ''}</div><p class="monster-inline-note">A imagem é otimizada para 96×96 e usada como ícone visual. O símbolo continua como fallback.</p></div></div></section>`;
    const idInput = form.querySelector<HTMLInputElement>('#item-numeric-id');
    if (idInput && !persisted) idInput.oninput = () => { if (!draft) return; draft.numericId = Math.max(1, Math.floor(Number(idInput.value) || 1)); draft.key = `item_${draft.numericId}`; renderPreview(); };
    bindText('#item-name', (value) => draft!.name = value || 'Item sem nome');
    bindText('#item-description', (value) => draft!.description = value);
    bindText('#item-category', (value) => { draft!.category = value as ItemStudioCategory; if (value === 'chest' && !draft!.chest) draft!.chest = { mode: 'independent', rolls: 1, entries: [] }; });
    bindText('#item-rarity', (value) => draft!.rarity = value as ItemRarity);
    bindText('#item-tags', (value) => draft!.tags = value.split(',').map((tag) => tag.trim()).filter(Boolean));
    bindText('#item-icon', (value) => draft!.icon = value || '◆');
    form.querySelector<HTMLButtonElement>('#item-icon-upload')!.onclick = () => {
      const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/png,image/webp,image/jpeg';
      input.onchange = () => { const file = input.files?.[0]; if (!file || !draft) return; void resizeIcon(file).then((data) => { draft!.iconImage = data; renderForm(); renderPreview(); }).catch((error) => showMessage(error instanceof Error ? error.message : 'Falha ao carregar ícone.', true)); };
      input.click();
    };
    form.querySelector<HTMLButtonElement>('#item-icon-remove')?.addEventListener('click', () => { if (!draft) return; delete draft.iconImage; renderForm(); renderPreview(); });
  };

  const renderProperties = () => {
    if (!draft) return;
    const equipCategory = ['weapon', 'armor', 'accessory'].includes(draft.category);
    const consumable = draft.category === 'consumable';
    form.innerHTML = `
      <section><h4>Inventário e economia</h4><div class="npc-form-grid"><label>Máx. por pilha<input id="item-stack" type="number" min="1" max="9999" value="${draft.stackMax}"></label><label>Valor base<input id="item-value" type="number" min="0" value="${draft.value}"></label><label>Nível requerido<input id="item-level" type="number" min="0" value="${draft.levelRequirement ?? 0}"></label></div><div class="item-flags"><label><input id="item-tradeable" type="checkbox" ${draft.flags.tradeable ? 'checked' : ''}> Negociável</label><label><input id="item-sellable" type="checkbox" ${draft.flags.sellable ? 'checked' : ''}> Vendável</label><label><input id="item-droppable" type="checkbox" ${draft.flags.droppable ? 'checked' : ''}> Pode dropar</label><label><input id="item-destroyable" type="checkbox" ${draft.flags.destroyable ? 'checked' : ''}> Pode destruir</label></div></section>
      ${equipCategory ? `<section><h4>Equipamento</h4><label>Slot<select id="item-equip-slot">${EQUIP_SLOTS.map(([id,label]) => `<option value="${id}" ${draft!.equipSlot === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label><div class="npc-form-grid"><label>Ataque<input id="item-attack" type="number" value="${draft.stats?.attack ?? 0}"></label><label>Defesa<input id="item-defense" type="number" value="${draft.stats?.defense ?? 0}"></label><label>HP máximo<input id="item-maxhp" type="number" value="${draft.stats?.maxHp ?? 0}"></label></div><h5>Classes permitidas</h5><div class="item-class-grid">${CLASSES.map(([id,label]) => `<label><input type="checkbox" data-item-class="${id}" ${draft!.allowedClasses?.includes(id) ? 'checked' : ''}> ${label}</label>`).join('')}</div><p class="monster-inline-note">Nenhuma classe marcada = qualquer classe pode usar.</p></section>` : ''}
      ${consumable ? `<section><h4>Efeito consumível</h4><div class="npc-form-grid"><label>Recuperar HP<input id="item-heal" type="number" min="0" value="${draft.heal ?? 0}"></label><label>Recuperar Mana<input id="item-mana" type="number" min="0" value="${draft.manaHeal ?? 0}"></label><label>Slots de inventário<input id="item-capacity" type="number" min="0" value="${draft.capacityBonus ?? 0}"></label></div></section>` : ''}`;
    bindNumber('#item-stack', (value) => draft!.stackMax = clamp(Math.floor(value || 1), 1, 9999));
    bindNumber('#item-value', (value) => draft!.value = Math.max(0, Math.floor(value || 0)));
    bindNumber('#item-level', (value) => { const next = Math.max(0, Math.floor(value || 0)); if (next) draft!.levelRequirement = next; else delete draft!.levelRequirement; });
    bindCheck('#item-tradeable', (value) => draft!.flags.tradeable = value);
    bindCheck('#item-sellable', (value) => draft!.flags.sellable = value);
    bindCheck('#item-droppable', (value) => draft!.flags.droppable = value);
    bindCheck('#item-destroyable', (value) => draft!.flags.destroyable = value);
    if (equipCategory) {
      bindText('#item-equip-slot', (value) => draft!.equipSlot = value as EquipSlot);
      const stat = (key: 'attack' | 'defense' | 'maxHp', value: number) => { draft!.stats ??= {}; const next = Number(value) || 0; if (next) draft!.stats[key] = next; else delete draft!.stats[key]; };
      bindNumber('#item-attack', (value) => stat('attack', value)); bindNumber('#item-defense', (value) => stat('defense', value)); bindNumber('#item-maxhp', (value) => stat('maxHp', value));
      form.querySelectorAll<HTMLInputElement>('[data-item-class]').forEach((input) => input.onchange = () => {
        const values = [...form.querySelectorAll<HTMLInputElement>('[data-item-class]:checked')].map((node) => node.dataset.itemClass as ClassId);
        if (values.length) draft!.allowedClasses = values; else delete draft!.allowedClasses;
      });
    }
    if (consumable) {
      bindNumber('#item-heal', (value) => { if (value > 0) draft!.heal = value; else delete draft!.heal; });
      bindNumber('#item-mana', (value) => { if (value > 0) draft!.manaHeal = value; else delete draft!.manaHeal; });
      bindNumber('#item-capacity', (value) => { if (value > 0) draft!.capacityBonus = Math.floor(value); else delete draft!.capacityBonus; });
    }
  };

  const itemOptions = (excludeKey?: string) => items.filter((item) => item.key !== excludeKey).map((item) => `<option value="${esc(itemStudioDisplay(item))}">${esc(item.key)}</option>`).join('');

  const renderChest = () => {
    if (!draft) return;
    draft.chest ??= { mode: 'independent', rolls: 1, entries: [] };
    const chest = draft.chest;
    form.innerHTML = `
      <section><h4>Tipo de baú</h4>${draft.category !== 'chest' ? '<div class="item-chest-warning">Este item ainda não está na categoria <b>Baús</b>. Você pode configurar agora e mudar a categoria depois.</div>' : ''}<label>Modo<select id="item-chest-mode"><option value="independent" ${chest.mode === 'independent' ? 'selected' : ''}>Chance individual — cada item rola separadamente</option><option value="weighted" ${chest.mode === 'weighted' ? 'selected' : ''}>Sorteio ponderado — escolhe itens aleatoriamente</option></select></label>${chest.mode === 'weighted' ? `<label>Quantidade de sorteios ao abrir<input id="item-chest-rolls" type="number" min="1" max="100" value="${chest.rolls}"></label>` : ''}<p class="monster-inline-note">Chance individual permite vários itens com 100%: todos eles virão sempre. Valores menores criam drops independentes. No modo ponderado, o peso define a frequência relativa de cada prêmio.</p></section>
      <section><h4>Recompensas do baú</h4><datalist id="item-chest-options">${itemOptions(draft.key)}</datalist><div id="item-chest-entries"></div><button id="item-chest-add" type="button">＋ Adicionar recompensa</button></section>`;
    const renderEntries = () => {
      const holder = form.querySelector<HTMLElement>('#item-chest-entries')!;
      holder.innerHTML = chest.entries.map((entry, index) => {
        const linked = findItemStudioRecord(entry.numericId ?? entry.itemId);
        const display = linked ? itemStudioDisplay(linked) : entry.itemId;
        return `<div class="item-chest-row"><label class="item-chest-pick">Item<input data-chest-item="${index}" list="item-chest-options" value="${esc(display)}" placeholder="#ID ou nome"></label>${chest.mode === 'independent' ? `<label>Chance %<input data-chest-chance="${index}" type="number" min="0" max="100" step="0.1" value="${(entry.chance * 100).toFixed(1)}"></label>` : `<label>Peso<input data-chest-weight="${index}" type="number" min="0" step="0.1" value="${entry.weight}"></label>`}<label>Mín.<input data-chest-min="${index}" type="number" min="1" value="${entry.min}"></label><label>Máx.<input data-chest-max="${index}" type="number" min="1" value="${entry.max}"></label><button data-chest-remove="${index}" class="monster-danger" type="button">×</button></div>`;
      }).join('') || '<div class="item-empty small">Nenhuma recompensa configurada.</div>';
      holder.querySelectorAll<HTMLInputElement>('[data-chest-item]').forEach((input) => input.onchange = () => {
        const index = Number(input.dataset.chestItem); const found = findItemStudioRecord(input.value);
        if (!found) { input.classList.add('invalid'); showMessage('Item não encontrado. Pesquise pelo Item ID ou nome.', true); return; }
        input.classList.remove('invalid'); chest.entries[index].itemId = found.key; chest.entries[index].numericId = found.numericId; input.value = itemStudioDisplay(found);
      });
      holder.querySelectorAll<HTMLInputElement>('[data-chest-chance]').forEach((input) => input.oninput = () => chest.entries[Number(input.dataset.chestChance)].chance = clamp((Number(input.value) || 0) / 100, 0, 1));
      holder.querySelectorAll<HTMLInputElement>('[data-chest-weight]').forEach((input) => input.oninput = () => chest.entries[Number(input.dataset.chestWeight)].weight = Math.max(0, Number(input.value) || 0));
      holder.querySelectorAll<HTMLInputElement>('[data-chest-min]').forEach((input) => input.oninput = () => chest.entries[Number(input.dataset.chestMin)].min = Math.max(1, Math.floor(Number(input.value) || 1)));
      holder.querySelectorAll<HTMLInputElement>('[data-chest-max]').forEach((input) => input.oninput = () => chest.entries[Number(input.dataset.chestMax)].max = Math.max(1, Math.floor(Number(input.value) || 1)));
      holder.querySelectorAll<HTMLButtonElement>('[data-chest-remove]').forEach((button) => button.onclick = () => { chest.entries.splice(Number(button.dataset.chestRemove), 1); renderEntries(); });
    };
    form.querySelector<HTMLSelectElement>('#item-chest-mode')!.onchange = (event) => { chest.mode = (event.currentTarget as HTMLSelectElement).value === 'weighted' ? 'weighted' : 'independent'; renderChest(); };
    const rolls = form.querySelector<HTMLInputElement>('#item-chest-rolls'); if (rolls) rolls.oninput = () => chest.rolls = clamp(Math.floor(Number(rolls.value) || 1), 1, 100);
    form.querySelector<HTMLButtonElement>('#item-chest-add')!.onclick = () => {
      const target = items.find((item) => item.key !== draft!.key);
      const entry: ItemChestEntry = { itemId: target?.key ?? '', numericId: target?.numericId, chance: 1, weight: 1, min: 1, max: 1 };
      chest.entries.push(entry); renderEntries();
    };
    renderEntries();
  };

  const renderForm = () => {
    if (!draft) { form.innerHTML = '<div class="item-empty">Crie ou selecione um item.</div>'; return; }
    if (tab === 'general') renderGeneral(); else if (tab === 'properties') renderProperties(); else renderChest();
  };

  const renderPreview = () => {
    const icon = overlay.querySelector<HTMLElement>('#item-preview-icon')!;
    const id = overlay.querySelector<HTMLElement>('#item-preview-id')!;
    const name = overlay.querySelector<HTMLElement>('#item-preview-name')!;
    const meta = overlay.querySelector<HTMLElement>('#item-preview-meta')!;
    const description = overlay.querySelector<HTMLElement>('#item-preview-description')!;
    const summary = overlay.querySelector<HTMLElement>('#item-summary')!;
    if (!draft) { icon.textContent = '◆'; id.textContent = 'ITEM #—'; name.textContent = 'Nenhum item'; meta.textContent = ''; description.textContent = ''; summary.innerHTML = ''; return; }
    icon.innerHTML = iconHtml(draft, 'item-preview-image');
    id.textContent = `ITEM #${draft.numericId}`;
    name.textContent = draft.name;
    meta.textContent = `${ITEM_STUDIO_CATEGORY_LABELS[draft.category]} · ${RARITIES.find(([value]) => value === draft!.rarity)?.[1] ?? draft.rarity}`;
    description.textContent = draft.description || 'Sem descrição.';
    const stats = draft.stats ?? {};
    summary.innerHTML = `<div><span>Pilha</span><strong>${draft.stackMax}</strong></div><div><span>Valor</span><strong>${draft.value}</strong></div><div><span>ATQ</span><strong>${stats.attack ?? 0}</strong></div><div><span>DEF</span><strong>${stats.defense ?? 0}</strong></div>${draft.category === 'chest' ? `<div><span>Prêmios</span><strong>${draft.chest?.entries.length ?? 0}</strong></div>` : ''}`;
  };

  const renderAll = () => { renderList(); renderTabs(); renderForm(); renderPreview(); };

  const saveDraft = () => {
    if (!draft) return;
    try {
      draft.name = draft.name.trim() || 'Item sem nome';
      const saved = saveItemStudioRecord(draft);
      activeKey = saved.key; reload(saved.key); renderAll(); showMessage(`Item #${saved.numericId} salvo.`);
    } catch (error) { showMessage(error instanceof Error ? error.message : 'Não foi possível salvar o item.', true); }
  };

  overlay.querySelector<HTMLButtonElement>('#item-new')!.onclick = () => { draft = createItemStudioRecord(); activeKey = draft.key; tab = 'general'; renderAll(); };
  overlay.querySelector<HTMLButtonElement>('#item-save')!.onclick = saveDraft;
  overlay.querySelector<HTMLButtonElement>('#item-duplicate')!.onclick = () => {
    if (!draft) return;
    try { const savedCurrent = items.some((item) => item.key === draft!.key) ? draft : saveItemStudioRecord(draft); const copy = duplicateItemStudioRecord(savedCurrent); activeKey = copy.key; reload(copy.key); renderAll(); showMessage(`Cópia criada como Item #${copy.numericId}.`); }
    catch (error) { showMessage(error instanceof Error ? error.message : 'Falha ao duplicar.', true); }
  };
  overlay.querySelector<HTMLButtonElement>('#item-delete')!.onclick = () => {
    if (!draft) return;
    if (draft.source === 'legacy') { showMessage('Itens migrados não podem ser apagados para não quebrar saves antigos.', true); return; }
    if (!confirm(`Excluir Item #${draft.numericId} “${draft.name}”?`)) return;
    try { deleteItemStudioRecord(draft); reload(''); renderAll(); showMessage('Item excluído.'); } catch (error) { showMessage(error instanceof Error ? error.message : 'Falha ao excluir.', true); }
  };
  searchInput.oninput = () => { search = searchInput.value; renderList(); };
  categorySelect.onchange = () => { categoryFilter = categorySelect.value as ItemStudioCategory | 'all'; renderList(); };

  const close = () => { overlay.classList.add('hidden'); document.querySelector<HTMLButtonElement>('#mep-mode-items')?.classList.remove('active'); document.querySelector<HTMLButtonElement>('#mep-mode-map')?.classList.add('active'); };
  overlay.querySelector<HTMLButtonElement>('#item-studio-back')!.onclick = close;
  const open = (itemKey?: string) => {
    items = listItemStudioRecords();
    if (itemKey && items.some((item) => item.key === itemKey)) activeKey = itemKey;
    if (!activeKey && items.length) activeKey = items[0].key;
    draft = activeKey ? clone(items.find((item) => item.key === activeKey)!) : null;
    overlay.classList.remove('hidden');
    document.querySelectorAll<HTMLButtonElement>('.mep-mode button').forEach((button) => button.classList.remove('active'));
    document.querySelector<HTMLButtonElement>('#mep-mode-items')?.classList.add('active');
    renderAll();
  };

  window.addEventListener('ascension-item-definitions-change', () => { const key = draft?.key ?? activeKey; reload(key); if (!overlay.classList.contains('hidden')) renderAll(); });
  renderAll();
  return { open, close, element: overlay };
}
