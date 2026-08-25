import './craftStudio.css';
import { PLAYABLE_CLASSES } from '../classes/classCatalog';
import { itemStudioDisplay, listItemStudioRecords } from '../items/itemStudioStore';
import {
  craftRecipeDisplay, craftStationDisplay, createCraftRecipeRecord, createCraftStationTypeRecord,
  deleteCraftRecipeRecord, deleteCraftStationTypeRecord, duplicateCraftRecipeRecord, duplicateCraftStationTypeRecord,
  listCraftRecipeRecords, listCraftStationTypeRecords, saveCraftRecipeRecord, saveCraftStationTypeRecord,
} from './craftStudioStore';
import type { CraftLearnMode, CraftRecipeStudioRecord, CraftStationTypeRecord, CraftStudioStatus } from './craftStudioTypes';
import { validateCraftRecipe, validateCraftStation } from './craftStudioValidation';

const clone = <T>(value: T): T => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
const STATUS_LABEL: Record<CraftStudioStatus, string> = { draft: 'Draft', published: 'Published', disabled: 'Disabled' };
const RECIPE_TABS = [['general','Geral'],['ingredients','Ingredientes'],['outputs','Resultados'],['requirements','Requisitos'],['test','Teste']] as const;
type RecipeTab = typeof RECIPE_TABS[number][0];
type CatalogMode = 'recipes' | 'stations';

function itemOptions(selected = '') {
  return `<option value="">Selecione um item...</option>${listItemStudioRecords().map((item) => `<option value="${esc(item.key)}" ${item.key === selected ? 'selected' : ''}>${esc(itemStudioDisplay(item))}</option>`).join('')}`;
}
function stationOptions(selected = '') {
  return `<option value="">Selecione uma estação...</option>${listCraftStationTypeRecords().map((station) => `<option value="${esc(station.key)}" ${station.key === selected ? 'selected' : ''}>${esc(craftStationDisplay(station))}</option>`).join('')}`;
}
function itemName(itemId: string) {
  return listItemStudioRecords().find((item) => item.key === itemId)?.name || itemId || 'Item';
}
function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}

export function createCraftStudio(host: HTMLElement) {
  host.querySelector('.standalone-studio-empty')?.remove();
  const element = document.createElement('div'); element.className = 'craft-studio'; host.appendChild(element);
  let recipeRecords = listCraftRecipeRecords(), stationRecords = listCraftStationTypeRecords();
  let recipe = clone(recipeRecords[0] ?? createCraftRecipeRecord()), station = clone(stationRecords[0] ?? createCraftStationTypeRecord());
  let mode: CatalogMode = 'recipes', recipeTab: RecipeTab = 'general', query = '', toastTimer = 0;

  const toast = (message: string) => {
    element.querySelector('.craft-toast')?.remove();
    const node = document.createElement('div'); node.className = 'craft-toast'; node.textContent = message; element.appendChild(node);
    clearTimeout(toastTimer); toastTimer = window.setTimeout(() => node.remove(), 2300);
  };
  const refreshRecords = () => {
    recipeRecords = listCraftRecipeRecords(); stationRecords = listCraftStationTypeRecords();
    recipe = clone(recipeRecords.find((entry) => entry.numericId === recipe.numericId) ?? recipeRecords[0] ?? createCraftRecipeRecord());
    station = clone(stationRecords.find((entry) => entry.numericId === station.numericId) ?? stationRecords[0] ?? createCraftStationTypeRecord());
  };

  function catalogHtml() {
    const values = mode === 'recipes' ? recipeRecords : stationRecords;
    const filtered = values.filter((entry) => !query || `${entry.numericId} ${entry.key} ${entry.name} ${entry.tags.join(' ')}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')));
    const activeId = mode === 'recipes' ? recipe.numericId : station.numericId;
    return `<aside class="craft-catalog"><div class="craft-catalog-head"><strong>CRAFT STUDIO</strong><div class="craft-mode-switch"><button id="craft-mode-recipes" class="${mode === 'recipes' ? 'active' : ''}">Receitas</button><button id="craft-mode-stations" class="${mode === 'stations' ? 'active' : ''}">Estações</button></div><div class="craft-catalog-tools"><input id="craft-search" value="${esc(query)}" placeholder="Buscar..."><button id="craft-new">＋</button></div></div><div class="craft-catalog-list">${filtered.length ? filtered.map((entry) => `<button class="craft-card ${activeId === entry.numericId ? 'active' : ''}" data-record-id="${entry.numericId}"><span class="craft-card-icon">${esc(entry.icon)}</span><span><strong>#${entry.numericId} · ${esc(entry.name)}</strong><small>${esc(mode === 'recipes' ? (entry as CraftRecipeStudioRecord).category : entry.key)}</small></span><span class="craft-status">${STATUS_LABEL[entry.status]}</span></button>`).join('') : '<div class="craft-empty">Nenhum registro encontrado.</div>'}</div></aside>`;
  }

  function recipeGeneral() {
    return `<section class="craft-section"><div class="craft-section-head"><strong>Identidade da receita</strong><span>Recipe #${recipe.numericId}</span></div><div class="craft-section-body"><div class="craft-grid"><div class="craft-field"><label>Nome</label><input data-rfield="name" value="${esc(recipe.name)}"></div><div class="craft-field"><label>Chave interna</label><input data-rfield="key" value="${esc(recipe.key)}" ${recipe.source === 'legacy' ? 'readonly' : ''}></div><div class="craft-field"><label>Categoria</label><input data-rfield="category" value="${esc(recipe.category)}"></div><div class="craft-field"><label>Ícone</label><input data-rfield="icon" value="${esc(recipe.icon)}"></div><div class="craft-field"><label>Estação</label><select id="recipe-station">${stationOptions(recipe.stationTypeId)}</select></div><div class="craft-field"><label>Status</label><select id="recipe-status">${(['draft','published','disabled'] as CraftStudioStatus[]).map((value) => `<option value="${value}" ${recipe.status === value ? 'selected' : ''}>${STATUS_LABEL[value]}</option>`).join('')}</select></div><div class="craft-field"><label>Ordem</label><input id="recipe-sort" type="number" value="${recipe.sortOrder}"></div><div class="craft-field full"><label>Descrição</label><textarea data-rfield="description">${esc(recipe.description)}</textarea></div><div class="craft-field full"><label>Tags</label><input id="recipe-tags" value="${esc(recipe.tags.join(', '))}"></div></div></div></section>`;
  }
  function recipeIngredients() {
    return `<section class="craft-section"><div class="craft-section-head"><strong>Ingredientes</strong><span>Ferramentas podem ser exigidas sem consumo</span><div style="flex:1"></div><button id="ingredient-add" class="craft-btn">＋ Ingrediente</button></div><div class="craft-section-body"><div class="craft-row-list">${recipe.ingredients.length ? recipe.ingredients.map((input,index) => `<div class="craft-row"><select data-ing-item="${index}">${itemOptions(input.itemId)}</select><input data-ing-qty="${index}" type="number" min="1" value="${input.quantity}"><label class="craft-check optional-hide"><input data-ing-consume="${index}" type="checkbox" ${input.consume ? 'checked' : ''}> Consumir</label><button data-ing-remove="${index}">×</button></div>`).join('') : '<div class="craft-empty">Nenhum ingrediente.</div>'}</div></div></section>`;
  }
  function recipeOutputs() {
    return `<section class="craft-section"><div class="craft-section-head"><strong>Resultados</strong><span>Principal e subprodutos</span><div style="flex:1"></div><button id="output-add" class="craft-btn">＋ Resultado</button></div><div class="craft-section-body"><div class="craft-row-list">${recipe.outputs.length ? recipe.outputs.map((output,index) => `<div class="craft-row output"><select data-out-item="${index}">${itemOptions(output.itemId)}</select><input data-out-qty="${index}" type="number" min="1" value="${output.quantity}"><input data-out-chance="${index}" type="number" min="0" max="100" value="${Math.round(output.chance * 100)}"><select class="optional-hide" data-out-kind="${index}"><option value="primary" ${output.kind === 'primary' ? 'selected' : ''}>Principal</option><option value="byproduct" ${output.kind === 'byproduct' ? 'selected' : ''}>Subproduto</option></select><button data-out-remove="${index}">×</button></div>`).join('') : '<div class="craft-empty">Adicione pelo menos um resultado principal.</div>'}</div></div></section>`;
  }
  function recipeRequirements() {
    const modes: Array<[CraftLearnMode,string]> = [['automatic','Automática'],['quest','Missão'],['item','Item / livro'],['event','Evento']];
    return `<section class="craft-section"><div class="craft-section-head"><strong>Requisitos e aprendizagem</strong></div><div class="craft-section-body"><div class="craft-grid"><div class="craft-field"><label>Nível mínimo</label><input id="recipe-min-level" type="number" min="1" value="${recipe.requirements.minLevel ?? ''}"></div><div class="craft-field"><label>Como aprender</label><select id="recipe-learn-mode">${modes.map(([value,label]) => `<option value="${value}" ${recipe.requirements.learnMode === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>${recipe.requirements.learnMode === 'item' ? `<div class="craft-field"><label>Item que ensina</label><select id="recipe-learn-item">${itemOptions(recipe.requirements.learnItemId)}</select></div>` : ''}${recipe.requirements.learnMode === 'quest' ? `<div class="craft-field"><label>Quest key</label><input id="recipe-learn-quest" value="${esc(recipe.requirements.learnQuestId ?? '')}"></div>` : ''}<div class="craft-field"><label>Evento obrigatório</label><input id="recipe-event" value="${esc(recipe.requirements.eventKey ?? '')}"></div><div class="craft-field full"><label>Quests concluídas (vírgula)</label><input id="recipe-completed-quests" value="${esc((recipe.requirements.completedQuests ?? []).join(', '))}"></div></div><div><strong style="font-size:9px">Classes permitidas</strong><div class="craft-grid" style="margin-top:8px">${PLAYABLE_CLASSES.map((entry) => `<label class="craft-check"><input data-recipe-class="${entry.id}" type="checkbox" ${(recipe.requirements.classIds ?? []).includes(entry.id) ? 'checked' : ''}> ${esc(entry.name)}</label>`).join('')}</div></div></div></section>`;
  }
  function recipeTest() {
    const primary = recipe.outputs.find((entry) => entry.kind === 'primary');
    const inputs = recipe.ingredients.map((input,index) => `<div class="craft-field"><label>${esc(itemName(input.itemId))} disponível</label><input data-sim-owned="${index}" type="number" min="0" value="10"></div>`).join('');
    return `<section class="craft-section"><div class="craft-section-head"><strong>Recipe Simulator</strong><span>Não altera o personagem</span></div><div class="craft-section-body"><div class="craft-sim">${inputs || '<div class="craft-empty">Adicione ingredientes para simular.</div>'}<button id="craft-sim-run" class="craft-btn primary" ${!recipe.ingredients.length || !primary ? 'disabled' : ''}>▶ Simular fabricação</button><div id="craft-sim-output" class="craft-sim-result">${primary ? `Resultado principal: ${primary.quantity}x ${esc(itemName(primary.itemId))}` : 'Configure um resultado principal.'}</div></div></div></section>`;
  }
  function stationEditor() {
    return `<section class="craft-section"><div class="craft-section-head"><strong>Tipo de estação</strong><span>Station #${station.numericId}</span></div><div class="craft-section-body"><div class="craft-grid"><div class="craft-field"><label>Nome</label><input data-sfield="name" value="${esc(station.name)}"></div><div class="craft-field"><label>Chave interna</label><input data-sfield="key" value="${esc(station.key)}" ${station.source === 'legacy' ? 'readonly' : ''}></div><div class="craft-field"><label>Ícone</label><input data-sfield="icon" value="${esc(station.icon)}"></div><div class="craft-field"><label>Status</label><select id="station-status">${(['draft','published','disabled'] as CraftStudioStatus[]).map((value) => `<option value="${value}" ${station.status === value ? 'selected' : ''}>${STATUS_LABEL[value]}</option>`).join('')}</select></div><div class="craft-field"><label>Prompt</label><input data-sfield="prompt" value="${esc(station.prompt)}"></div><div class="craft-field"><label>Raio de interação</label><input id="station-radius" type="number" min="1" value="${station.interactionRadius}"></div><div class="craft-field full"><label>Categorias (vírgula)</label><input id="station-categories" value="${esc(station.categories.join(', '))}"></div><div class="craft-field full"><label>Tags</label><input id="station-tags" value="${esc(station.tags.join(', '))}"></div></div><div class="craft-sim-result">O Craft Studio define o que esta estação faz. O Map Editor define onde ela existe.</div></div></section>`;
  }
  function inspectorHtml() {
    const issues = mode === 'recipes' ? validateCraftRecipe(recipe) : validateCraftStation(station);
    const uses = mode === 'stations' ? recipeRecords.filter((entry) => entry.stationTypeId === station.key) : [];
    return `<aside class="craft-inspector"><div class="craft-inspector-head"><strong>INSPECTOR</strong><span style="font-size:8px;color:#7898a8">${issues.filter((issue) => issue.severity === 'error').length} erro(s)</span></div><div class="craft-inspector-body">${issues.length ? issues.map((issue) => `<div class="craft-issue ${issue.severity}"><strong>${issue.severity.toUpperCase()}</strong><br>${esc(issue.message)}</div>`).join('') : '<div class="craft-issue info">✓ Conteúdo válido.</div>'}<div class="craft-section"><div class="craft-section-head"><strong>Dependências</strong></div><div class="craft-section-body" style="font-size:9px;color:#88a6b5">${mode === 'recipes' ? `${recipe.ingredients.length} ingrediente(s)<br>${recipe.outputs.length} resultado(s)<br>Station: ${esc(recipe.stationTypeId || 'nenhuma')}` : `${uses.length} receita(s) usam esta estação${uses.length ? `<br>${uses.slice(0,6).map((entry) => esc(craftRecipeDisplay(entry))).join('<br>')}` : ''}`}</div></div></div></aside>`;
  }

  function render() {
    const selected = mode === 'recipes' ? recipe : station;
    const body = mode === 'recipes' ? (recipeTab === 'general' ? recipeGeneral() : recipeTab === 'ingredients' ? recipeIngredients() : recipeTab === 'outputs' ? recipeOutputs() : recipeTab === 'requirements' ? recipeRequirements() : recipeTest()) : stationEditor();
    element.innerHTML = `${catalogHtml()}<main class="craft-editor"><div class="craft-titlebar"><span style="font-size:25px">${esc(selected.icon)}</span><div><h2>${esc(selected.name)}</h2><small style="color:#708f9f">${mode === 'recipes' ? 'Recipe' : 'Station'} #${selected.numericId} · ${esc(selected.key)}</small></div><div class="spacer"></div><button id="craft-duplicate" class="craft-btn">Duplicar</button><button id="craft-export" class="craft-btn">Exportar</button><button id="craft-import" class="craft-btn">Importar</button><button id="craft-save" class="craft-btn primary">Salvar</button></div>${mode === 'recipes' ? `<nav class="craft-tabs">${RECIPE_TABS.map(([id,label]) => `<button data-recipe-tab="${id}" class="${recipeTab === id ? 'active' : ''}">${label}</button>`).join('')}</nav>` : ''}${body}<div class="craft-footer-actions"><button id="craft-disable" class="craft-btn">${selected.status === 'disabled' ? 'Ativar como Draft' : 'Desativar'}</button><button id="craft-delete" class="craft-btn danger" ${selected.source === 'legacy' ? 'disabled' : ''}>Excluir custom</button></div></main>${inspectorHtml()}`;
    bind();
  }

  function bind() {
    element.querySelector<HTMLButtonElement>('#craft-mode-recipes')!.onclick = () => { mode = 'recipes'; query = ''; render(); };
    element.querySelector<HTMLButtonElement>('#craft-mode-stations')!.onclick = () => { mode = 'stations'; query = ''; render(); };
    element.querySelector<HTMLInputElement>('#craft-search')!.oninput = (event) => { query = (event.currentTarget as HTMLInputElement).value; render(); };
    element.querySelector<HTMLButtonElement>('#craft-new')!.onclick = () => { if (mode === 'recipes') { recipe = createCraftRecipeRecord(); recipeRecords = [...recipeRecords, clone(recipe)]; recipeTab = 'general'; } else { station = createCraftStationTypeRecord(); stationRecords = [...stationRecords, clone(station)]; } render(); };
    element.querySelectorAll<HTMLButtonElement>('[data-record-id]').forEach((button) => button.onclick = () => { const id = Number(button.dataset.recordId); if (mode === 'recipes') { const found = recipeRecords.find((entry) => entry.numericId === id); if (found) recipe = clone(found); } else { const found = stationRecords.find((entry) => entry.numericId === id); if (found) station = clone(found); } render(); });
    element.querySelectorAll<HTMLButtonElement>('[data-recipe-tab]').forEach((button) => button.onclick = () => { recipeTab = button.dataset.recipeTab as RecipeTab; render(); });
    element.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-rfield]').forEach((input) => input.oninput = () => { (recipe as unknown as Record<string,string>)[input.dataset.rfield!] = input.value; });
    element.querySelectorAll<HTMLInputElement>('[data-sfield]').forEach((input) => input.oninput = () => { (station as unknown as Record<string,string>)[input.dataset.sfield!] = input.value; });

    const recipeStation = element.querySelector<HTMLSelectElement>('#recipe-station'); if (recipeStation) recipeStation.onchange = () => recipe.stationTypeId = recipeStation.value;
    const recipeStatus = element.querySelector<HTMLSelectElement>('#recipe-status'); if (recipeStatus) recipeStatus.onchange = () => { const next = recipeStatus.value as CraftStudioStatus; if (next === 'published' && validateCraftRecipe(recipe).some((issue) => issue.severity === 'error')) { toast('Corrija os erros críticos antes de publicar.'); recipeStatus.value = recipe.status; return; } recipe.status = next; render(); };
    const recipeSort = element.querySelector<HTMLInputElement>('#recipe-sort'); if (recipeSort) recipeSort.oninput = () => recipe.sortOrder = Number(recipeSort.value) || 0;
    const recipeTags = element.querySelector<HTMLInputElement>('#recipe-tags'); if (recipeTags) recipeTags.oninput = () => recipe.tags = recipeTags.value.split(',').map((value) => value.trim()).filter(Boolean);

    element.querySelector<HTMLButtonElement>('#ingredient-add')?.addEventListener('click', () => { recipe.ingredients.push({ itemId: listItemStudioRecords()[0]?.key ?? '', quantity: 1, consume: true }); render(); });
    element.querySelectorAll<HTMLSelectElement>('[data-ing-item]').forEach((input) => input.onchange = () => recipe.ingredients[Number(input.dataset.ingItem)].itemId = input.value);
    element.querySelectorAll<HTMLInputElement>('[data-ing-qty]').forEach((input) => input.oninput = () => recipe.ingredients[Number(input.dataset.ingQty)].quantity = Math.max(1, Number(input.value) || 1));
    element.querySelectorAll<HTMLInputElement>('[data-ing-consume]').forEach((input) => input.onchange = () => recipe.ingredients[Number(input.dataset.ingConsume)].consume = input.checked);
    element.querySelectorAll<HTMLButtonElement>('[data-ing-remove]').forEach((button) => button.onclick = () => { recipe.ingredients.splice(Number(button.dataset.ingRemove), 1); render(); });

    element.querySelector<HTMLButtonElement>('#output-add')?.addEventListener('click', () => { recipe.outputs.push({ itemId: listItemStudioRecords()[0]?.key ?? '', quantity: 1, chance: 1, kind: recipe.outputs.some((entry) => entry.kind === 'primary') ? 'byproduct' : 'primary' }); render(); });
    element.querySelectorAll<HTMLSelectElement>('[data-out-item]').forEach((input) => input.onchange = () => recipe.outputs[Number(input.dataset.outItem)].itemId = input.value);
    element.querySelectorAll<HTMLInputElement>('[data-out-qty]').forEach((input) => input.oninput = () => recipe.outputs[Number(input.dataset.outQty)].quantity = Math.max(1, Number(input.value) || 1));
    element.querySelectorAll<HTMLInputElement>('[data-out-chance]').forEach((input) => input.oninput = () => recipe.outputs[Number(input.dataset.outChance)].chance = Math.max(0, Math.min(1, (Number(input.value) || 0) / 100)));
    element.querySelectorAll<HTMLSelectElement>('[data-out-kind]').forEach((input) => input.onchange = () => recipe.outputs[Number(input.dataset.outKind)].kind = input.value === 'byproduct' ? 'byproduct' : 'primary');
    element.querySelectorAll<HTMLButtonElement>('[data-out-remove]').forEach((button) => button.onclick = () => { recipe.outputs.splice(Number(button.dataset.outRemove), 1); render(); });

    const min = element.querySelector<HTMLInputElement>('#recipe-min-level'); if (min) min.oninput = () => recipe.requirements.minLevel = min.value ? Math.max(1, Number(min.value) || 1) : undefined;
    const learnMode = element.querySelector<HTMLSelectElement>('#recipe-learn-mode'); if (learnMode) learnMode.onchange = () => { recipe.requirements.learnMode = learnMode.value as CraftLearnMode; render(); };
    const learnItem = element.querySelector<HTMLSelectElement>('#recipe-learn-item'); if (learnItem) learnItem.onchange = () => recipe.requirements.learnItemId = learnItem.value || undefined;
    const learnQuest = element.querySelector<HTMLInputElement>('#recipe-learn-quest'); if (learnQuest) learnQuest.oninput = () => recipe.requirements.learnQuestId = learnQuest.value || undefined;
    const event = element.querySelector<HTMLInputElement>('#recipe-event'); if (event) event.oninput = () => recipe.requirements.eventKey = event.value || undefined;
    const completed = element.querySelector<HTMLInputElement>('#recipe-completed-quests'); if (completed) completed.oninput = () => recipe.requirements.completedQuests = completed.value.split(',').map((value) => value.trim()).filter(Boolean);
    element.querySelectorAll<HTMLInputElement>('[data-recipe-class]').forEach((input) => input.onchange = () => { const ids = new Set(recipe.requirements.classIds ?? []); const id = input.dataset.recipeClass as (typeof PLAYABLE_CLASSES)[number]['id']; if (input.checked) ids.add(id); else ids.delete(id); recipe.requirements.classIds = [...ids]; });

    const stationStatus = element.querySelector<HTMLSelectElement>('#station-status'); if (stationStatus) stationStatus.onchange = () => { station.status = stationStatus.value as CraftStudioStatus; render(); };
    const radius = element.querySelector<HTMLInputElement>('#station-radius'); if (radius) radius.oninput = () => station.interactionRadius = Math.max(1, Number(radius.value) || 1);
    const categories = element.querySelector<HTMLInputElement>('#station-categories'); if (categories) categories.oninput = () => station.categories = categories.value.split(',').map((value) => value.trim()).filter(Boolean);
    const stationTags = element.querySelector<HTMLInputElement>('#station-tags'); if (stationTags) stationTags.oninput = () => station.tags = stationTags.value.split(',').map((value) => value.trim()).filter(Boolean);

    element.querySelector<HTMLButtonElement>('#craft-sim-run')?.addEventListener('click', () => {
      const amounts = recipe.ingredients.map((input,index) => ({ input, owned: Math.max(0, Number(element.querySelector<HTMLInputElement>(`[data-sim-owned="${index}"]`)?.value) || 0) }));
      const maxCrafts = amounts.length ? Math.min(...amounts.map(({ input,owned }) => Math.floor(owned / Math.max(1, input.quantity)))) : 0;
      const output = element.querySelector<HTMLElement>('#craft-sim-output'); if (!output) return;
      const primary = recipe.outputs.filter((entry) => entry.kind === 'primary');
      output.textContent = maxCrafts > 0 ? `Máximo fabricável: ${maxCrafts}\nFabricação virtual: ${primary.map((entry) => `${entry.quantity}x ${itemName(entry.itemId)}`).join(', ')}\nIngredientes marcados como não consumíveis permanecem.` : 'Materiais insuficientes para fabricar 1 unidade.';
    });

    element.querySelector<HTMLButtonElement>('#craft-save')!.onclick = () => {
      try {
        if (mode === 'recipes') { if (recipe.status === 'published' && validateCraftRecipe(recipe).some((issue) => issue.severity === 'error')) throw new Error('Existem erros críticos no Inspector.'); recipe = saveCraftRecipeRecord(recipe); }
        else { if (station.status === 'published' && validateCraftStation(station).some((issue) => issue.severity === 'error')) throw new Error('Existem erros críticos no Inspector.'); station = saveCraftStationTypeRecord(station); }
        refreshRecords(); toast('Conteúdo salvo.'); render();
      } catch (error) { toast(error instanceof Error ? error.message : 'Falha ao salvar.'); }
    };
    element.querySelector<HTMLButtonElement>('#craft-duplicate')!.onclick = () => { if (mode === 'recipes') recipe = duplicateCraftRecipeRecord(recipe); else station = duplicateCraftStationTypeRecord(station); refreshRecords(); toast('Cópia criada como Draft.'); render(); };
    element.querySelector<HTMLButtonElement>('#craft-disable')!.onclick = () => { if (mode === 'recipes') { recipe.status = recipe.status === 'disabled' ? 'draft' : 'disabled'; recipe = saveCraftRecipeRecord(recipe); } else { station.status = station.status === 'disabled' ? 'draft' : 'disabled'; station = saveCraftStationTypeRecord(station); } refreshRecords(); render(); };
    element.querySelector<HTMLButtonElement>('#craft-delete')!.onclick = () => { try { if (mode === 'recipes') deleteCraftRecipeRecord(recipe); else deleteCraftStationTypeRecord(station); refreshRecords(); toast('Conteúdo removido.'); render(); } catch (error) { toast(error instanceof Error ? error.message : 'Falha ao excluir.'); } };
    element.querySelector<HTMLButtonElement>('#craft-export')!.onclick = () => { const value = mode === 'recipes' ? recipe : station; download(`${mode === 'recipes' ? 'recipe' : 'station'}-${value.numericId}-${value.key}.json`, JSON.stringify(value, null, 2)); };
    element.querySelector<HTMLButtonElement>('#craft-import')!.onclick = () => {
      const input = document.createElement('input'); input.type = 'file'; input.accept = 'application/json,.json';
      input.onchange = () => { const file = input.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const parsed = JSON.parse(String(reader.result)); if (mode === 'recipes') { const seed = createCraftRecipeRecord(); recipe = saveCraftRecipeRecord({ ...parsed, numericId: seed.numericId, key: seed.key, source: 'custom', status: 'draft' }); } else { const seed = createCraftStationTypeRecord(); station = saveCraftStationTypeRecord({ ...parsed, numericId: seed.numericId, key: seed.key, source: 'custom', status: 'draft' }); } refreshRecords(); toast('Importado como Draft.'); render(); } catch { toast('JSON inválido.'); } }; reader.readAsText(file); }; input.click();
    };
  }

  render();
  return { element, refresh: render };
}
