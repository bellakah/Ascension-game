import './npcStudio.css';
import { drawAssetThumbnail } from '../editor/map/mapAssetRenderer';
import { MAP_PALETTE_ENTRIES, getPaletteEntry } from '../editor/map/mapEditorCatalog';
import { openMapAnimationStudio } from '../editor/map/mapAnimationStudio';
import type { MapPaletteEntry } from '../editor/map/mapEditorTypes';
import type { NpcAnimationState, NpcDefinition, NpcDirection, NpcDialogueChoice, NpcDialogueNode, NpcRole, NpcShopItem } from './npcTypes';
import { NPC_DIRECTIONS } from './npcTypes';
import { createNpcDefinition, deleteNpcDefinition, duplicateNpcDefinition, getNpcDefinition, listNpcDefinitions, NPC_ASSET_PREFIX, resolveNpcAppearanceAssetId, saveNpcDefinition, syncNpcDefinitionsIntoPalette } from './npcStore';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type StudioTab = 'general' | 'appearance' | 'interaction' | 'content' | 'behavior';

const ROLES: Array<{ id: NpcRole; label: string }> = [
  { id: 'civilian', label: 'Civil' }, { id: 'merchant', label: 'Comerciante' }, { id: 'guard', label: 'Guarda' },
  { id: 'quest', label: 'Missões' }, { id: 'healer', label: 'Curandeiro' }, { id: 'crafter', label: 'Artesão' },
  { id: 'trainer', label: 'Treinador' }, { id: 'special', label: 'Especial' }, { id: 'custom', label: 'Personalizado' },
];

function appearanceEntries() {
  return MAP_PALETTE_ENTRIES.filter((entry) => !entry.id.startsWith(NPC_ASSET_PREFIX) && entry.sprite && !['terrain', 'zone'].includes(entry.palette));
}

function optionList(selected?: string) {
  const values = appearanceEntries();
  return `<option value="">Usar fallback</option>${values.map((entry) => `<option value="${esc(entry.id)}" ${entry.id === selected ? 'selected' : ''}>${esc(entry.label)} • ${esc(entry.folder ?? entry.palette)}</option>`).join('')}`;
}

function previewEntry(definition: NpcDefinition, state: NpcAnimationState, direction: NpcDirection) {
  return getPaletteEntry(resolveNpcAppearanceAssetId(definition, state, direction));
}

export function createNpcStudio(root: HTMLElement) {
  let definitions = listNpcDefinitions();
  let activeId = definitions[0]?.id ?? '';
  let draft = activeId ? getNpcDefinition(activeId) : null;
  let tab: StudioTab = 'general';
  let previewState: NpcAnimationState = 'idle';
  let previewDirection: NpcDirection = 'south';
  let search = '';
  let raf = 0;
  let lastPreview = 0;

  const overlay = document.createElement('section');
  overlay.className = 'npc-studio-overlay hidden';
  overlay.innerHTML = `
    <header class="npc-studio-head"><div><strong>NPC STUDIO</strong><span>Personagens, aparência, interação, conteúdo e comportamento</span></div><div class="spacer"></div><button id="npc-studio-back">← Voltar ao mapa</button></header>
    <div class="npc-studio-shell">
      <aside class="npc-list"><div class="npc-list-tools"><input id="npc-list-search" placeholder="Buscar NPC..."><button id="npc-new" class="npc-primary">＋ Novo NPC</button></div><div id="npc-list-items" class="npc-list-items"></div></aside>
      <main class="npc-center"><div class="npc-preview-stage"><div class="npc-preview-toolbar"><label>Estado<select id="npc-preview-state"><option value="idle">Parado</option><option value="walk">Andando</option></select></label><label>Direção<select id="npc-preview-direction">${NPC_DIRECTIONS.map((value) => `<option value="${value.id}">${value.short}</option>`).join('')}</select></label></div><div class="npc-preview-card"><div class="npc-preview-box"><canvas id="npc-preview-canvas" width="280" height="280"></canvas></div><div class="npc-preview-name"><strong id="npc-preview-name">Nenhum NPC</strong><span id="npc-preview-title">Crie seu primeiro NPC</span></div></div></div><div id="npc-summary" class="npc-content-summary"></div></main>
      <aside class="npc-properties"><nav id="npc-tabs" class="npc-tabs"></nav><div id="npc-form" class="npc-form"></div><footer class="npc-properties-foot"><button id="npc-duplicate">Duplicar</button><button id="npc-delete" class="npc-danger">Excluir</button><div class="spacer"></div><button id="npc-save" class="npc-primary">Salvar NPC</button></footer></aside>
    </div>`;
  root.querySelector<HTMLElement>('.mep-stage-wrap')?.appendChild(overlay);

  const listNode = overlay.querySelector<HTMLElement>('#npc-list-items')!;
  const form = overlay.querySelector<HTMLElement>('#npc-form')!;
  const tabs = overlay.querySelector<HTMLElement>('#npc-tabs')!;
  const previewCanvas = overlay.querySelector<HTMLCanvasElement>('#npc-preview-canvas')!;
  const searchInput = overlay.querySelector<HTMLInputElement>('#npc-list-search')!;

  const refreshDefinitions = () => {
    definitions = listNpcDefinitions();
    if (activeId && !definitions.some((value) => value.id === activeId)) activeId = definitions[0]?.id ?? '';
    draft = activeId ? getNpcDefinition(activeId) : null;
  };

  const renderList = () => {
    const query = search.trim().toLocaleLowerCase('pt-BR');
    const values = definitions.filter((value) => !query || `${value.name} ${value.title} ${value.role} ${value.category} ${value.tags.join(' ')}`.toLocaleLowerCase('pt-BR').includes(query));
    listNode.innerHTML = values.length ? values.map((npc) => `<button class="npc-list-card ${npc.id === activeId ? 'active' : ''}" data-npc="${esc(npc.id)}"><span class="npc-list-avatar">♟</span><span><strong>${esc(npc.name)}</strong><span>${esc(npc.title || npc.category || 'Sem título')}</span></span><span class="npc-list-role">${esc(ROLES.find((value) => value.id === npc.role)?.label ?? npc.role)}</span></button>`).join('') : '<div style="padding:24px 10px;text-align:center;color:#6f8d9c;font-size:9px">Nenhum NPC encontrado.</div>';
    listNode.querySelectorAll<HTMLButtonElement>('[data-npc]').forEach((button) => button.onclick = () => { activeId = button.dataset.npc!; draft = getNpcDefinition(activeId); renderAll(); });
  };

  const renderTabs = () => {
    const values: Array<[StudioTab,string]> = [['general','Geral'],['appearance','Aparência'],['interaction','Interação'],['content','Conteúdo'],['behavior','Comportamento']];
    tabs.innerHTML = values.map(([id,label]) => `<button data-tab="${id}" class="${tab === id ? 'active' : ''}">${label}</button>`).join('');
    tabs.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => button.onclick = () => { tab = button.dataset.tab as StudioTab; renderTabs(); renderForm(); });
  };

  const bindText = (selector: string, apply: (value: string) => void) => {
    const input = form.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector);
    if (!input) return;
    input.oninput = () => { if (draft) { apply(input.value); renderSummary(); renderPreviewChrome(); } };
  };
  const bindNumber = (selector: string, apply: (value: number) => void) => {
    const input = form.querySelector<HTMLInputElement>(selector); if (!input) return;
    input.oninput = () => { if (draft) apply(Number(input.value)); };
  };
  const bindCheck = (selector: string, apply: (value: boolean) => void) => {
    const input = form.querySelector<HTMLInputElement>(selector); if (!input) return;
    input.onchange = () => { if (draft) { apply(input.checked); renderSummary(); } };
  };

  const renderGeneral = () => {
    if (!draft) return;
    form.innerHTML = `<section><h4>Identidade</h4><label>Nome<input id="npc-name" value="${esc(draft.name)}"></label><label>Título<input id="npc-title" value="${esc(draft.title)}" placeholder="Ex.: Ferreiro da Vila"></label><div class="npc-form-grid"><label>Tipo<select id="npc-role">${ROLES.map((value) => `<option value="${value.id}" ${draft!.role === value.id ? 'selected' : ''}>${value.label}</option>`).join('')}</select></label><label>Categoria<input id="npc-category" value="${esc(draft.category)}"></label></div><label>Tags<input id="npc-tags" value="${esc(draft.tags.join(', '))}" placeholder="vila, ferreiro, humano"></label><label>Notas<textarea id="npc-notes">${esc(draft.notes)}</textarea></label></section><section><h4>ID interno</h4><label>ID<input value="${esc(draft.id)}" readonly></label><p style="font-size:8px;color:#7592a1;margin:0">O ID permanece estável mesmo se você mudar o nome.</p></section>`;
    bindText('#npc-name', (value) => draft!.name = value || 'NPC sem nome'); bindText('#npc-title', (value) => draft!.title = value); bindText('#npc-role', (value) => draft!.role = value as NpcRole); bindText('#npc-category', (value) => draft!.category = value); bindText('#npc-tags', (value) => draft!.tags = value.split(',').map((item) => item.trim()).filter(Boolean)); bindText('#npc-notes', (value) => draft!.notes = value);
  };

  const renderAppearance = () => {
    if (!draft) return;
    const slot = (state: NpcAnimationState, direction: NpcDirection) => `<div class="npc-direction-slot"><strong>${state === 'idle' ? 'Parado' : 'Andando'} • ${NPC_DIRECTIONS.find((value) => value.id === direction)?.short}</strong><select data-appearance-state="${state}" data-appearance-direction="${direction}">${optionList(draft!.appearance[state][direction])}</select></div>`;
    form.innerHTML = `<section><h4>Aparência base</h4><label>Fallback<select id="npc-fallback">${optionList(draft.appearance.fallbackAssetId)}</select></label><div class="npc-form-grid"><label>Escala<input id="npc-scale" type="number" min="0.1" max="8" step="0.05" value="${draft.appearance.scale}"></label><label class="npc-check"><input id="npc-shadow" type="checkbox" ${draft.appearance.showShadow ? 'checked' : ''}> Usar sombra</label></div><button id="npc-import-animation" class="npc-small-action">＋ Importar aparência animada</button></section><section><h4>Estados e direções</h4><p style="font-size:8px;color:#7595a5">Configure somente as direções que possuir. Diagonais usam automaticamente a direção cardinal mais próxima quando vazias.</p><div class="npc-direction-grid">${NPC_DIRECTIONS.map((direction) => slot('idle', direction.id)).join('')}</div></section><section><h4>Caminhada</h4><div class="npc-direction-grid">${NPC_DIRECTIONS.map((direction) => slot('walk', direction.id)).join('')}</div></section>`;
    form.querySelector<HTMLSelectElement>('#npc-fallback')!.onchange = (event) => { draft!.appearance.fallbackAssetId = (event.currentTarget as HTMLSelectElement).value; renderPreview(); };
    bindNumber('#npc-scale', (value) => { draft!.appearance.scale = clamp(value || 1, .1, 8); renderPreview(); }); bindCheck('#npc-shadow', (value) => draft!.appearance.showShadow = value);
    form.querySelectorAll<HTMLSelectElement>('[data-appearance-state]').forEach((select) => select.onchange = () => { const state = select.dataset.appearanceState as NpcAnimationState, direction = select.dataset.appearanceDirection as NpcDirection; if (select.value) draft!.appearance[state][direction] = select.value; else delete draft!.appearance[state][direction]; renderPreview(); });
    form.querySelector<HTMLButtonElement>('#npc-import-animation')!.onclick = () => {
      const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/png,image/webp,image/jpeg'; input.multiple = true;
      input.onchange = () => { const files = [...(input.files ?? [])]; if (!files.length) return; void openMapAnimationStudio(files, (entries) => { const created = entries[0]; if (!created || !draft) return; draft.appearance.walk[previewDirection] = created.id; if (!draft.appearance.fallbackAssetId) draft.appearance.fallbackAssetId = created.id; renderForm(); renderPreview(); }); };
      input.click();
    };
  };

  const renderInteraction = () => {
    if (!draft) return;
    form.innerHTML = `<section><h4>Interação</h4><label class="npc-check"><input id="npc-interaction-enabled" type="checkbox" ${draft.interaction.enabled ? 'checked' : ''}> Jogador pode interagir</label><div class="npc-form-grid"><label>Distância (tiles)<input id="npc-radius" type="number" min="0.5" max="12" step="0.1" value="${draft.interaction.radiusTiles}"></label><label>Texto da ação<input id="npc-prompt" value="${esc(draft.interaction.prompt)}"></label></div><label class="npc-check"><input id="npc-face-player" type="checkbox" ${draft.interaction.facePlayer ? 'checked' : ''}> Olhar para o jogador ao conversar</label><label class="npc-check"><input id="npc-block-player" type="checkbox" ${draft.interaction.blockPlayer ? 'checked' : ''}> Bloquear passagem</label></section><section><h4>Diálogo inicial</h4><label class="npc-check"><input id="npc-dialogue-enabled" type="checkbox" ${draft.dialogue.enabled ? 'checked' : ''}> Diálogo habilitado</label><label>Texto<textarea id="npc-dialogue-text">${esc(draft.dialogue.nodes.find((node) => node.id === draft!.dialogue.startNodeId)?.text ?? '')}</textarea></label><div id="npc-dialogue-choices" class="npc-row-list"></div><button id="npc-choice-add">＋ Adicionar resposta</button></section>`;
    bindCheck('#npc-interaction-enabled', (value) => draft!.interaction.enabled = value); bindNumber('#npc-radius', (value) => draft!.interaction.radiusTiles = clamp(value || 1.6, .5, 12)); bindText('#npc-prompt', (value) => draft!.interaction.prompt = value); bindCheck('#npc-face-player', (value) => draft!.interaction.facePlayer = value); bindCheck('#npc-block-player', (value) => draft!.interaction.blockPlayer = value); bindCheck('#npc-dialogue-enabled', (value) => draft!.dialogue.enabled = value);
    let node = draft.dialogue.nodes.find((value) => value.id === draft!.dialogue.startNodeId); if (!node) { node = { id: 'start', text: '', choices: [] }; draft.dialogue.nodes = [node]; draft.dialogue.startNodeId = node.id; }
    const currentNode = node;
    bindText('#npc-dialogue-text', (value) => currentNode.text = value);
    const renderChoices = () => { const holder = form.querySelector<HTMLElement>('#npc-dialogue-choices')!; holder.innerHTML = currentNode.choices.map((choice, index) => `<div class="npc-row"><input data-choice-text="${index}" value="${esc(choice.text)}"><select data-choice-action="${index}"><option value="close" ${choice.action === 'close' ? 'selected' : ''}>Fechar</option><option value="dialogue" ${choice.action === 'dialogue' ? 'selected' : ''}>Outro diálogo</option><option value="shop" ${choice.action === 'shop' ? 'selected' : ''}>Abrir loja</option><option value="quest" ${choice.action === 'quest' ? 'selected' : ''}>Missão</option><option value="custom" ${choice.action === 'custom' ? 'selected' : ''}>Ação</option></select><button data-choice-remove="${index}">×</button></div>`).join(''); holder.querySelectorAll<HTMLInputElement>('[data-choice-text]').forEach((input) => input.oninput = () => currentNode.choices[Number(input.dataset.choiceText)].text = input.value); holder.querySelectorAll<HTMLSelectElement>('[data-choice-action]').forEach((select) => select.onchange = () => currentNode.choices[Number(select.dataset.choiceAction)].action = select.value as NpcDialogueChoice['action']); holder.querySelectorAll<HTMLButtonElement>('[data-choice-remove]').forEach((button) => button.onclick = () => { currentNode.choices.splice(Number(button.dataset.choiceRemove), 1); renderChoices(); }); };
    renderChoices(); form.querySelector<HTMLButtonElement>('#npc-choice-add')!.onclick = () => { currentNode.choices.push({ id: uid('choice'), text: 'Nova resposta', action: 'close' }); renderChoices(); };
  };

  const renderContent = () => {
    if (!draft) return;
    form.innerHTML = `<section><h4>Loja</h4><label class="npc-check"><input id="npc-shop-enabled" type="checkbox" ${draft.shop.enabled ? 'checked' : ''}> Este NPC possui loja</label><div class="npc-form-grid"><label>Moeda<input id="npc-currency" value="${esc(draft.shop.currencyId)}"></label><label>Venda do jogador ×<input id="npc-sell-mult" type="number" min="0" max="5" step="0.05" value="${draft.shop.sellMultiplier}"></label></div><div id="npc-shop-items" class="npc-row-list"></div><button id="npc-shop-add">＋ Item da loja</button></section><section><h4>Missões</h4><label>Oferece (IDs separados por vírgula)<textarea id="npc-quest-offers">${esc(draft.quests.offers.join(', '))}</textarea></label><label>Finaliza (IDs separados por vírgula)<textarea id="npc-quest-completes">${esc(draft.quests.completes.join(', '))}</textarea></label></section>`;
    bindCheck('#npc-shop-enabled', (value) => draft!.shop.enabled = value); bindText('#npc-currency', (value) => draft!.shop.currencyId = value); bindNumber('#npc-sell-mult', (value) => draft!.shop.sellMultiplier = clamp(value || .5, 0, 5)); bindText('#npc-quest-offers', (value) => draft!.quests.offers = value.split(',').map((item) => item.trim()).filter(Boolean)); bindText('#npc-quest-completes', (value) => draft!.quests.completes = value.split(',').map((item) => item.trim()).filter(Boolean));
    const renderItems = () => { const holder = form.querySelector<HTMLElement>('#npc-shop-items')!; holder.innerHTML = draft!.shop.items.map((item, index) => `<div class="npc-row"><input data-shop-id="${index}" value="${esc(item.itemId)}" placeholder="item.id"><input data-shop-price="${index}" type="number" min="0" value="${item.price}"><button data-shop-remove="${index}">×</button></div>`).join(''); holder.querySelectorAll<HTMLInputElement>('[data-shop-id]').forEach((input) => input.oninput = () => draft!.shop.items[Number(input.dataset.shopId)].itemId = input.value); holder.querySelectorAll<HTMLInputElement>('[data-shop-price]').forEach((input) => input.oninput = () => draft!.shop.items[Number(input.dataset.shopPrice)].price = Math.max(0, Number(input.value) || 0)); holder.querySelectorAll<HTMLButtonElement>('[data-shop-remove]').forEach((button) => button.onclick = () => { draft!.shop.items.splice(Number(button.dataset.shopRemove), 1); renderItems(); }); };
    renderItems(); form.querySelector<HTMLButtonElement>('#npc-shop-add')!.onclick = () => { const item: NpcShopItem = { itemId: '', price: 0, stock: null }; draft!.shop.items.push(item); renderItems(); };
  };

  const renderBehavior = () => {
    if (!draft) return;
    form.innerHTML = `<section><h4>Movimentação padrão</h4><label>Comportamento<select id="npc-behavior"><option value="stationary" ${draft.behavior.mode === 'stationary' ? 'selected' : ''}>Parado</option><option value="patrol" ${draft.behavior.mode === 'patrol' ? 'selected' : ''}>Patrulha</option><option value="loop" ${draft.behavior.mode === 'loop' ? 'selected' : ''}>Circuito</option><option value="once" ${draft.behavior.mode === 'once' ? 'selected' : ''}>Rota uma vez</option><option value="random" ${draft.behavior.mode === 'random' ? 'selected' : ''}>Andar aleatoriamente</option></select></label><div class="npc-form-grid"><label>Velocidade andando<input id="npc-walk-speed" type="number" min="0.1" max="12" step="0.05" value="${draft.behavior.walkSpeed}"></label><label>Velocidade correndo<input id="npc-run-speed" type="number" min="0.1" max="20" step="0.05" value="${draft.behavior.runSpeed}"></label><label>Raio aleatório<input id="npc-random-radius" type="number" min="1" max="40" step="0.5" value="${draft.behavior.randomRadius}"></label><label>Espera padrão (ms)<input id="npc-default-wait" type="number" min="0" max="60000" step="100" value="${draft.behavior.defaultWaitMs}"></label></div><p style="font-size:8px;color:#7594a4">A rota de cada cópia do NPC é desenhada diretamente no mapa pelo botão “Editar rota”.</p></section><section><h4>Rotina diária</h4><p style="font-size:8px;color:#7897a7">Estrutura pronta para horários. A primeira versão usa disponibilidade e movimento padrão; rotinas avançadas poderão reutilizar as rotas do NPC.</p><div id="npc-schedule-list" class="npc-row-list"></div><button id="npc-schedule-add">＋ Horário</button></section>`;
    bindText('#npc-behavior', (value) => draft!.behavior.mode = value as NpcDefinition['behavior']['mode']); bindNumber('#npc-walk-speed', (value) => draft!.behavior.walkSpeed = clamp(value || 1.25, .1, 12)); bindNumber('#npc-run-speed', (value) => draft!.behavior.runSpeed = clamp(value || 2.4, .1, 20)); bindNumber('#npc-random-radius', (value) => draft!.behavior.randomRadius = clamp(value || 4, 1, 40)); bindNumber('#npc-default-wait', (value) => draft!.behavior.defaultWaitMs = clamp(value || 0, 0, 60000));
    const renderSchedule = () => { const holder = form.querySelector<HTMLElement>('#npc-schedule-list')!; holder.innerHTML = draft!.schedule.map((entry, index) => `<div class="npc-row"><input data-schedule-hour="${index}" type="number" min="0" max="23.75" step="0.25" value="${entry.hour}"><select data-schedule-action="${index}"><option value="available" ${entry.action === 'available' ? 'selected' : ''}>Disponível</option><option value="hidden" ${entry.action === 'hidden' ? 'selected' : ''}>Oculto</option><option value="idle" ${entry.action === 'idle' ? 'selected' : ''}>Parado</option><option value="route" ${entry.action === 'route' ? 'selected' : ''}>Usar rota</option></select><button data-schedule-remove="${index}">×</button></div>`).join(''); holder.querySelectorAll<HTMLInputElement>('[data-schedule-hour]').forEach((input) => input.onchange = () => draft!.schedule[Number(input.dataset.scheduleHour)].hour = clamp(Number(input.value) || 0, 0, 23.75)); holder.querySelectorAll<HTMLSelectElement>('[data-schedule-action]').forEach((select) => select.onchange = () => draft!.schedule[Number(select.dataset.scheduleAction)].action = select.value as NpcDefinition['schedule'][number]['action']); holder.querySelectorAll<HTMLButtonElement>('[data-schedule-remove]').forEach((button) => button.onclick = () => { draft!.schedule.splice(Number(button.dataset.scheduleRemove), 1); renderSchedule(); }); };
    renderSchedule(); form.querySelector<HTMLButtonElement>('#npc-schedule-add')!.onclick = () => { draft!.schedule.push({ hour: 8, action: 'available' }); renderSchedule(); };
  };

  const renderForm = () => {
    if (!draft) { form.innerHTML = '<div style="padding:30px;text-align:center;color:#7594a4">Crie ou selecione um NPC.</div>'; return; }
    if (tab === 'general') renderGeneral(); else if (tab === 'appearance') renderAppearance(); else if (tab === 'interaction') renderInteraction(); else if (tab === 'content') renderContent(); else renderBehavior();
  };

  const renderSummary = () => {
    const summary = overlay.querySelector<HTMLElement>('#npc-summary')!;
    if (!draft) { summary.innerHTML = ''; return; }
    summary.innerHTML = `<div class="npc-summary-card"><span>Tipo</span><strong>${esc(ROLES.find((value) => value.id === draft!.role)?.label ?? draft.role)}</strong></div><div class="npc-summary-card"><span>Interação</span><strong>${draft.interaction.enabled ? `${draft.interaction.radiusTiles.toFixed(1)} tiles` : 'Desativada'}</strong></div><div class="npc-summary-card"><span>Comportamento</span><strong>${esc(draft.behavior.mode)}</strong></div><div class="npc-summary-card"><span>Loja</span><strong>${draft.shop.enabled ? `${draft.shop.items.length} item(ns)` : 'Não'}</strong></div><div class="npc-summary-card"><span>Missões</span><strong>${draft.quests.offers.length + draft.quests.completes.length}</strong></div><div class="npc-summary-card"><span>Aparência</span><strong>${Object.keys(draft.appearance.walk).length + Object.keys(draft.appearance.idle).length} slots</strong></div>`;
  };

  const renderPreviewChrome = () => {
    overlay.querySelector<HTMLElement>('#npc-preview-name')!.textContent = draft?.name ?? 'Nenhum NPC'; overlay.querySelector<HTMLElement>('#npc-preview-title')!.textContent = draft?.title || draft?.category || 'Crie seu primeiro NPC';
  };

  const renderPreview = (time = performance.now()) => {
    const ctx = previewCanvas.getContext('2d')!; ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height); ctx.fillStyle = '#0d1c25'; ctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
    if (!draft) return;
    const entry = previewEntry(draft, previewState, previewDirection); drawAssetThumbnail(previewCanvas, entry, time);
  };

  const previewLoop = (time: number) => { if (!overlay.classList.contains('hidden') && time - lastPreview > 90) { renderPreview(time); lastPreview = time; } raf = requestAnimationFrame(previewLoop); };

  const renderAll = () => { renderList(); renderTabs(); renderForm(); renderSummary(); renderPreviewChrome(); renderPreview(); };

  const saveDraft = () => {
    if (!draft) return;
    if (!draft.name.trim()) draft.name = 'NPC sem nome';
    draft = saveNpcDefinition(draft); activeId = draft.id; refreshDefinitions(); renderAll();
    const searchNode = document.querySelector<HTMLInputElement>('#mep-search'); searchNode?.dispatchEvent(new Event('input', { bubbles: true }));
  };

  overlay.querySelector<HTMLButtonElement>('#npc-new')!.onclick = () => { const created = saveNpcDefinition(createNpcDefinition()); definitions = listNpcDefinitions(); activeId = created.id; draft = created; tab = 'general'; renderAll(); };
  overlay.querySelector<HTMLButtonElement>('#npc-save')!.onclick = saveDraft;
  overlay.querySelector<HTMLButtonElement>('#npc-duplicate')!.onclick = () => { if (!activeId) return; const created = duplicateNpcDefinition(activeId); if (!created) return; definitions = listNpcDefinitions(); activeId = created.id; draft = created; renderAll(); };
  overlay.querySelector<HTMLButtonElement>('#npc-delete')!.onclick = () => { if (!draft || !confirm(`Excluir “${draft.name}”? As cópias já colocadas no mapa deixarão de ter definição.`)) return; deleteNpcDefinition(draft.id); refreshDefinitions(); renderAll(); };
  searchInput.oninput = () => { search = searchInput.value; renderList(); };
  overlay.querySelector<HTMLSelectElement>('#npc-preview-state')!.onchange = (event) => { previewState = (event.currentTarget as HTMLSelectElement).value as NpcAnimationState; renderPreview(); };
  overlay.querySelector<HTMLSelectElement>('#npc-preview-direction')!.onchange = (event) => { previewDirection = (event.currentTarget as HTMLSelectElement).value as NpcDirection; renderPreview(); };

  const close = () => { overlay.classList.add('hidden'); document.querySelector<HTMLButtonElement>('#mep-mode-npcs')?.classList.remove('active'); document.querySelector<HTMLButtonElement>('#mep-mode-map')?.classList.add('active'); };
  overlay.querySelector<HTMLButtonElement>('#npc-studio-back')!.onclick = close;

  const open = (npcId?: string) => {
    syncNpcDefinitionsIntoPalette(); definitions = listNpcDefinitions();
    if (npcId && definitions.some((value) => value.id === npcId)) activeId = npcId;
    if (!activeId && definitions.length) activeId = definitions[0].id;
    draft = activeId ? getNpcDefinition(activeId) : null;
    overlay.classList.remove('hidden'); document.querySelectorAll<HTMLButtonElement>('.mep-mode button').forEach((button) => button.classList.remove('active')); document.querySelector<HTMLButtonElement>('#mep-mode-npcs')?.classList.add('active'); renderAll();
  };

  window.addEventListener('ascension-npc-definitions-change', () => { syncNpcDefinitionsIntoPalette(); if (!overlay.classList.contains('hidden')) { const keep = draft?.id; definitions = listNpcDefinitions(); if (keep) draft = getNpcDefinition(keep); renderAll(); } });
  raf = requestAnimationFrame(previewLoop);

  return { open, close, element: overlay, destroy: () => { cancelAnimationFrame(raf); overlay.remove(); } };
}
