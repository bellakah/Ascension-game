import './missionStudio.css';
import { PLAYABLE_CLASSES } from '../classes/classCatalog';
import { listCollectibleDefinitions } from '../gathering/collectibleStore';
import { itemStudioDisplay, listItemStudioRecords } from '../items/itemStudioStore';
import { listMonsterDefinitions } from '../monsterEditor/monsterStore';
import { listNpcDefinitions } from '../npc/npcStore';
import { QUEST_CATALOG } from './questCatalog';
import {
  createMissionStudioRecord,
  deleteMissionStudioRecord,
  duplicateMissionStudioRecord,
  ensureMissionStudioMigration,
  listMissionStudioRecords,
  normalizeMission,
  saveMissionStudioRecord,
} from './missionStudioStore';
import type { MissionStudioRecord, MissionStudioStage } from './missionStudioTypes';
import { validateMission } from './missionStudioValidation';
import type { QuestCategory, QuestObjective, QuestObjectiveType } from './questTypes';

const clone = <T>(value: T): T => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));

const CATEGORY_LABELS: Record<QuestCategory, string> = {
  story: 'História Principal', side: 'Secundária', tutorial: 'Tutorial', daily: 'Diária', weekly: 'Semanal', repeatable: 'Repetível', event: 'Evento', world: 'Mundo', hidden: 'Oculta',
};
const OBJECTIVE_LABELS: Record<QuestObjectiveType, string> = {
  kill: 'Matar monstro', boss: 'Matar boss', collect: 'Coletar item', deliver: 'Entregar item', talk: 'Falar com NPC', visit: 'Chegar ao local', interact: 'Interagir', gather: 'Coletar recurso', craft: 'Fabricar', use: 'Usar item', wait: 'Esperar / defender',
};
const TABS = [
  ['general', 'Geral'], ['flow', 'Fluxo'], ['objectives', 'Objetivos'], ['dialog', 'Diálogos'], ['rewards', 'Recompensas'], ['conditions', 'Condições'], ['test', 'Teste'],
] as const;
type MissionTab = typeof TABS[number][0];

function npcEntries() {
  const legacy = [
    { id: 'elandra', name: 'Elandra' }, { id: 'rowan', name: 'Rowan' }, { id: 'mira', name: 'Mira' }, { id: 'theo', name: 'Theo' },
  ];
  return [...legacy, ...listNpcDefinitions().map((npc) => ({ id: npc.id, name: npc.name }))];
}
function monsterEntries() {
  return [{ id: 'wolf', name: 'Lobo Sombrio' }, { id: 'sludge', name: 'Lodo Tóxico' }, ...listMonsterDefinitions().map((monster) => ({ id: monster.id, name: monster.name }))];
}
function option(value: string, label: string, selected?: string) {
  return `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`;
}
function npcOptions(selected = '') { return `<option value="">Selecione um NPC...</option>${npcEntries().map((entry) => option(entry.id, entry.name, selected)).join('')}`; }
function monsterOptions(selected = '') { return `<option value="">Selecione um monstro...</option>${monsterEntries().map((entry) => option(entry.id, entry.name, selected)).join('')}`; }
function itemOptions(selected = '') { return `<option value="">Selecione um item...</option>${listItemStudioRecords().map((item) => option(item.key, itemStudioDisplay(item), selected)).join('')}`; }
function resourceOptions(objective: QuestObjective) {
  const resources = listCollectibleDefinitions();
  const selected = objective.target || resources.find((entry) => entry.drops.some((drop) => drop.itemId === objective.itemId))?.id || '';
  return `<option value="">Selecione um coletável...</option>${resources.map((entry) => option(entry.id, `#${entry.numericId} · ${entry.name}`, selected)).join('')}`;
}
function categoryOptions(selected: QuestCategory) { return (Object.keys(CATEGORY_LABELS) as QuestCategory[]).map((value) => option(value, CATEGORY_LABELS[value], selected)).join(''); }

function newObjective(type: QuestObjectiveType = 'talk'): QuestObjective {
  return { id: uid('objective'), type, label: 'Novo objetivo', amount: 1, navigation: { enabled: true } };
}
function newStage(index: number): MissionStudioStage {
  return { id: uid('stage'), title: `Etapa ${index + 1}`, description: '', mode: 'sequential', objectives: [] };
}

export function createMissionStudio(host: HTMLElement) {
  ensureMissionStudioMigration(QUEST_CATALOG);
  const element = document.createElement('div');
  element.className = 'mission-studio';
  host.querySelector('.standalone-studio-empty')?.remove();
  host.appendChild(element);

  let records = listMissionStudioRecords();
  let current = clone(records[0] ?? createMissionStudioRecord());
  let tab: MissionTab = 'general';
  let query = '';
  let statusFilter = 'all';
  const simulation = new Map<string, number>();
  let toastTimer = 0;

  const toast = (message: string) => {
    element.querySelector('.mission-toast')?.remove();
    const node = document.createElement('div'); node.className = 'mission-toast'; node.textContent = message; element.appendChild(node);
    window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => node.remove(), 2400);
  };

  const refreshRecords = (keepId = current.numericId) => {
    records = listMissionStudioRecords();
    const saved = records.find((record) => record.numericId === keepId);
    if (saved) current = clone(saved);
  };

  const mutate = (fn: (mission: MissionStudioRecord) => void, rerender = true) => {
    fn(current);
    current.updatedAt = Date.now();
    if (rerender) render();
  };

  const filteredRecords = () => records.filter((record) => {
    if (statusFilter !== 'all' && record.status !== statusFilter) return false;
    const text = `${record.numericId} ${record.key} ${record.title} ${record.summary} ${record.tags.join(' ')}`.toLocaleLowerCase('pt-BR');
    return !query || text.includes(query.toLocaleLowerCase('pt-BR'));
  });

  function targetEditor(objective: QuestObjective, si: number, oi: number) {
    const prefix = `data-si="${si}" data-oi="${oi}"`;
    if (objective.type === 'talk') return `<select data-objective-field="npcId" ${prefix}>${npcOptions(objective.npcId)}</select>`;
    if (objective.type === 'kill' || objective.type === 'boss') return `<select data-objective-field="monsterKind" ${prefix}>${monsterOptions(objective.monsterKind === 'any' ? '' : objective.monsterKind)}</select>`;
    if (objective.type === 'collect' || objective.type === 'use') return `<select data-objective-field="itemId" ${prefix}>${itemOptions(objective.itemId)}</select>`;
    if (objective.type === 'deliver') return `<div style="display:grid;gap:5px"><select data-objective-field="npcId" ${prefix}>${npcOptions(objective.npcId)}</select><select data-objective-field="itemId" ${prefix}>${itemOptions(objective.itemId)}</select></div>`;
    if (objective.type === 'gather') return `<select data-objective-field="resource" ${prefix}>${resourceOptions(objective)}</select>`;
    if (objective.type === 'craft') return `<div style="display:grid;gap:5px"><input data-objective-field="target" ${prefix} value="${esc(objective.target || '')}" placeholder="ID da receita"><select data-objective-field="itemId" ${prefix}>${itemOptions(objective.itemId)}</select></div>`;
    if (objective.type === 'visit' || objective.type === 'interact') return `<input data-objective-field="target" ${prefix} value="${esc(objective.target || '')}" placeholder="ID do Marker / zona / objeto">`;
    if (objective.type === 'wait') return `<input data-objective-field="target" ${prefix} value="${esc(objective.target || '')}" placeholder="ID opcional da área">`;
    return `<input data-objective-field="target" ${prefix} value="${esc(objective.target || '')}" placeholder="Destino opcional">`;
  }

  function objectiveRow(objective: QuestObjective, si: number, oi: number) {
    return `<div class="mission-objective">
      <div><select data-objective-field="type" data-si="${si}" data-oi="${oi}">${(Object.keys(OBJECTIVE_LABELS) as QuestObjectiveType[]).map((type) => option(type, OBJECTIVE_LABELS[type], objective.type)).join('')}</select><label class="route-toggle"><input type="checkbox" data-objective-route data-si="${si}" data-oi="${oi}" ${objective.navigation?.enabled !== false ? 'checked' : ''}> Auto Path</label></div>
      <input data-objective-field="label" data-si="${si}" data-oi="${oi}" value="${esc(objective.label)}" placeholder="Descrição para o jogador">
      <input data-objective-field="amount" data-si="${si}" data-oi="${oi}" type="number" min="1" value="${Math.max(1, Number(objective.amount) || 1)}">
      ${targetEditor(objective, si, oi)}
      <div class="mission-objective-actions"><button class="mission-icon-btn" data-remove-objective data-si="${si}" data-oi="${oi}" title="Remover objetivo">×</button></div>
    </div>`;
  }

  function generalTab() {
    return `<section class="mission-section"><div class="mission-section-head"><strong>Identidade da missão</strong><span class="mission-id">Quest #${current.numericId}</span></div><div class="mission-section-body"><div class="mission-grid">
      <div class="mission-field"><label>Nome</label><input data-field="title" value="${esc(current.title)}"></div>
      <div class="mission-field"><label>Chave interna</label><input data-field="key" value="${esc(current.key)}" ${current.source === 'legacy' ? 'readonly' : ''}></div>
      <div class="mission-field"><label>Categoria</label><select data-field="category">${categoryOptions(current.category)}</select></div>
      <div class="mission-field"><label>Ícone</label><input data-field="icon" value="${esc(current.icon)}"></div>
      <div class="mission-field"><label>Nível recomendado</label><input data-number-field="recommendedLevel" type="number" min="1" value="${current.recommendedLevel}"></div>
      <div class="mission-field"><label>Prioridade / ordem</label><input data-number-field="priority" type="number" value="${current.priority}"></div>
      <div class="mission-field full"><label>Descrição</label><textarea data-field="summary">${esc(current.summary)}</textarea></div>
      <div class="mission-field full"><label>Tags (separadas por vírgula)</label><input data-tags value="${esc(current.tags.join(', '))}" placeholder="história, floresta, tutorial"></div>
    </div></div></section>
    <section class="mission-section"><div class="mission-section-head"><strong>Início e entrega</strong></div><div class="mission-section-body"><div class="mission-grid">
      <div class="mission-field"><label>Quest Giver</label><select data-field="startNpcId">${npcOptions(current.startNpcId)}</select></div>
      <div class="mission-field"><label>NPC de entrega</label><select data-field="endNpcId">${npcOptions(current.endNpcId)}</select></div>
      <label class="mission-check"><input type="checkbox" data-bool-field="autoStart" ${current.autoStart ? 'checked' : ''}> Início automático</label>
      <label class="mission-check"><input type="checkbox" data-bool-field="autoComplete" ${current.autoComplete ? 'checked' : ''}> Conclusão automática</label>
    </div></div></section>`;
  }

  function flowTab() {
    return `<section class="mission-section"><div class="mission-section-head"><strong>Fluxo de etapas</strong><button class="mission-btn" data-add-stage>+ Nova etapa</button></div><div class="mission-section-body">${current.stages.length ? current.stages.map((stage, index) => `<div class="mission-stage"><div class="mission-stage-head"><span class="mission-id">${index + 1}</span><input data-stage-title data-si="${index}" value="${esc(stage.title)}"><select data-stage-mode data-si="${index}">${option('sequential','Sequencial',stage.mode)}${option('parallel','Paralela',stage.mode)}</select><button class="mission-icon-btn" data-stage-up data-si="${index}" title="Subir">↑</button><button class="mission-icon-btn" data-stage-down data-si="${index}" title="Descer">↓</button><button class="mission-icon-btn" data-remove-stage data-si="${index}" title="Remover">×</button></div><div class="mission-section-body"><div class="mission-field"><label>Descrição interna da etapa</label><input data-stage-description data-si="${index}" value="${esc(stage.description)}" placeholder="Explique o propósito desta etapa"></div><p style="color:#7f949a;margin-bottom:0">${stage.objectives.length} objetivo(s) · ${stage.mode === 'parallel' ? 'podem progredir juntos' : 'seguem a ordem configurada'}</p></div></div>`).join('') : '<div class="mission-empty-note">Nenhuma etapa. Adicione a primeira etapa para montar o fluxo.</div>'}</div></section>`;
  }

  function objectivesTab() {
    return `<section class="mission-section"><div class="mission-section-head"><strong>Objetivos por etapa</strong><span>Seletores usam NPC, Monster, Item e Collectible Studios</span></div><div class="mission-section-body">${current.stages.map((stage, si) => `<div class="mission-stage"><div class="mission-stage-head"><strong style="flex:1">${si + 1}. ${esc(stage.title)}</strong><span>${stage.mode === 'parallel' ? 'Paralela' : 'Sequencial'}</span><button class="mission-btn" data-add-objective data-si="${si}">+ Objetivo</button></div><div class="mission-objectives">${stage.objectives.length ? stage.objectives.map((objective, oi) => objectiveRow(objective, si, oi)).join('') : '<div class="mission-empty-note">Esta etapa ainda não possui objetivos.</div>'}</div></div>`).join('') || '<div class="mission-empty-note">Crie uma etapa na aba Fluxo.</div>'}</div></section>`;
  }

  function dialogTab() {
    const fields = [['offer','Antes de aceitar'],['accepted','Ao aceitar'],['progress','Em andamento'],['ready','Pronta para entregar'],['completed','Concluída']] as const;
    return `<section class="mission-section"><div class="mission-section-head"><strong>Diálogos da missão</strong><span>Textos separados por estado</span></div><div class="mission-section-body"><div class="mission-grid">${fields.map(([field,label]) => `<div class="mission-field${field === 'offer' ? ' full' : ''}"><label>${label}</label><textarea data-dialog-field="${field}">${esc(current.dialog[field] || '')}</textarea></div>`).join('')}</div></div></section>`;
  }

  function rewardRows(kind: 'items' | 'chooseOne') {
    const rows = current.rewards[kind] ?? [];
    return rows.map((entry, index) => `<div class="mission-reward-row"><select data-reward-item="${kind}" data-ri="${index}">${itemOptions(entry.itemId)}</select><input data-reward-qty="${kind}" data-ri="${index}" type="number" min="1" value="${entry.quantity}"><button class="mission-icon-btn" data-remove-reward="${kind}" data-ri="${index}">×</button></div>`).join('') || '<div class="mission-empty-note">Nenhum item configurado.</div>';
  }

  function rewardsTab() {
    return `<section class="mission-section"><div class="mission-section-head"><strong>Recompensas principais</strong></div><div class="mission-section-body"><div class="mission-grid"><div class="mission-field"><label>EXP</label><input data-reward-number="exp" type="number" min="0" value="${current.rewards.exp || 0}"></div><div class="mission-field"><label>Moedas</label><input data-reward-number="coins" type="number" min="0" value="${current.rewards.coins || 0}"></div></div></div></section>
    <section class="mission-section"><div class="mission-section-head"><strong>Itens garantidos</strong><button class="mission-btn" data-add-reward="items">+ Item</button></div><div class="mission-section-body">${rewardRows('items')}</div></section>
    <section class="mission-section"><div class="mission-section-head"><strong>Escolha uma recompensa</strong><button class="mission-btn" data-add-reward="chooseOne">+ Opção</button></div><div class="mission-section-body">${rewardRows('chooseOne')}</div></section>`;
  }

  function conditionsTab() {
    const otherQuests = records.filter((record) => record.key !== current.key);
    return `<section class="mission-section"><div class="mission-section-head"><strong>Requisitos do jogador</strong></div><div class="mission-section-body"><div class="mission-grid three"><div class="mission-field"><label>Nível mínimo</label><input data-requirement-number="minLevel" type="number" min="1" value="${current.requirements.minLevel}"></div><div class="mission-field"><label>Nível máximo (0 = nenhum)</label><input data-requirement-number="maxLevel" type="number" min="0" value="${current.requirements.maxLevel || 0}"></div><div class="mission-field"><label>Regra de repetição</label><select data-field="reset">${option('once','Uma vez',current.reset)}${option('repeatable','Repetível',current.reset)}${option('daily','Diária',current.reset)}${option('weekly','Semanal',current.reset)}${option('event','Enquanto evento ativo',current.reset)}</select></div><div class="mission-field"><label>Cooldown (ms)</label><input data-number-field="cooldownMs" type="number" min="0" value="${current.cooldownMs}"></div><div class="mission-field full"><label>Classes permitidas</label><div style="display:flex;flex-wrap:wrap;gap:12px">${PLAYABLE_CLASSES.map((entry) => `<label class="mission-check"><input type="checkbox" data-class-id="${entry.id}" ${current.requirements.classIds.includes(entry.id) ? 'checked' : ''}> ${esc(entry.name)}</label>`).join('')}</div></div></div></div></section>
    <section class="mission-section"><div class="mission-section-head"><strong>Missões pré-requisito</strong></div><div class="mission-section-body">${otherQuests.length ? `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px">${otherQuests.map((mission) => `<label class="mission-check"><input type="checkbox" data-prerequisite="${esc(mission.key)}" ${current.requirements.completedQuests.includes(mission.key) ? 'checked' : ''}> #${mission.numericId} · ${esc(mission.title)}</label>`).join('')}</div>` : '<div class="mission-empty-note">Nenhuma outra missão no catálogo.</div>'}</div></section>`;
  }

  function testTab() {
    const totalObjectives = current.stages.reduce((sum, stage) => sum + stage.objectives.length, 0);
    return `<section class="mission-section"><div class="mission-section-head"><strong>Simulador de fluxo</strong><button class="mission-btn" data-sim-reset>Reiniciar</button></div><div class="mission-section-body"><p style="color:#82989e">O simulador não altera o save do personagem. Ele permite conferir ordem, contadores e transições antes de jogar.</p>${current.stages.map((stage, si) => `<div class="mission-sim-card"><header><strong>Etapa ${si + 1} · ${esc(stage.title)}</strong><span>${stage.mode === 'parallel' ? 'Paralela' : 'Sequencial'}</span></header>${stage.objectives.map((objective) => { const target = Math.max(1, Number(objective.amount) || 1); const value = Math.min(target, simulation.get(objective.id) || 0); return `<div class="mission-sim-objective"><span>${value >= target ? '✓ ' : ''}${esc(objective.label)}</span><b class="mission-sim-progress">${value}/${target}</b><button class="mission-btn" data-sim-add="${esc(objective.id)}" ${value >= target ? 'disabled' : ''}>+1</button><button class="mission-btn" data-sim-complete="${esc(objective.id)}" ${value >= target ? 'disabled' : ''}>Completar</button></div>`; }).join('') || '<div class="mission-empty-note">Etapa sem objetivos.</div>'}</div>`).join('') || '<div class="mission-empty-note">Sem fluxo para simular.</div>'}<p style="color:#6f858d">${totalObjectives} objetivo(s) configurado(s).</p></div></section>`;
  }

  function tabContent() {
    if (tab === 'general') return generalTab();
    if (tab === 'flow') return flowTab();
    if (tab === 'objectives') return objectivesTab();
    if (tab === 'dialog') return dialogTab();
    if (tab === 'rewards') return rewardsTab();
    if (tab === 'conditions') return conditionsTab();
    return testTab();
  }

  function render() {
    const issues = validateMission(current, records.map((record) => record.numericId === current.numericId ? current : record));
    const errors = issues.filter((issue) => issue.severity === 'error').length;
    const warnings = issues.filter((issue) => issue.severity === 'warning').length;
    const objectiveCount = current.stages.reduce((sum, stage) => sum + stage.objectives.length, 0);
    const shown = filteredRecords();
    element.innerHTML = `
      <aside class="mission-catalog"><div class="mission-panel-head"><h2>Mission Studio</h2><p>Catálogo central de missões do Ascension</p><div class="mission-toolbar"><button class="mission-btn primary" data-new>+ Nova</button><button class="mission-btn" data-duplicate>Duplicar</button></div><input class="mission-search" data-search value="${esc(query)}" placeholder="Buscar por ID, nome, chave ou tag"><div class="mission-filter-row"><select data-status-filter>${option('all','Todos os status',statusFilter)}${option('draft','Rascunhos',statusFilter)}${option('published','Publicadas',statusFilter)}${option('disabled','Desativadas',statusFilter)}</select></div></div><div class="mission-list">${shown.map((record) => `<button class="mission-card${record.numericId === current.numericId ? ' selected' : ''}" data-select-mission="${record.numericId}"><div class="mission-card-top"><span class="mission-id">#${record.numericId}</span><strong>${esc(record.title)}</strong><span class="mission-badge ${record.status}">${record.status === 'published' ? 'Publicada' : record.status === 'draft' ? 'Draft' : 'Off'}</span></div><small>${esc(CATEGORY_LABELS[record.category])} · ${esc(record.key)}</small></button>`).join('') || '<div class="mission-empty-note">Nenhuma missão encontrada.</div>'}</div></aside>
      <main class="mission-workspace"><header class="mission-work-head"><div class="mission-work-title"><strong>#${current.numericId} · ${esc(current.title)}</strong><span>${esc(current.key)} · ${current.source === 'legacy' ? 'Migrada do jogo' : 'Criada no editor'}</span></div><select class="mission-status-select" data-status>${option('draft','Draft',current.status)}${option('published','Published',current.status)}${option('disabled','Disabled',current.status)}</select><button class="mission-btn primary" data-save>Salvar</button></header><nav class="mission-tabs">${TABS.map(([id,label]) => `<button class="mission-tab${tab === id ? ' active' : ''}" data-tab="${id}">${label}</button>`).join('')}</nav><div class="mission-scroll">${tabContent()}</div></main>
      <aside class="mission-inspector"><div class="mission-panel-head"><h3>Inspector & Validação</h3><p>Publicação bloqueada por erros críticos.</p></div><div class="mission-inspector-body"><div class="mission-score"><div><strong>${current.stages.length}</strong><span>Etapas</span></div><div><strong>${objectiveCount}</strong><span>Objetivos</span></div><div><strong>${errors + warnings}</strong><span>Avisos</span></div></div>${issues.length ? issues.map((issue) => `<div class="mission-issue ${issue.severity}"><strong>${issue.severity === 'error' ? 'Erro' : issue.severity === 'warning' ? 'Atenção' : 'Info'}</strong><span>${esc(issue.message)}</span></div>`).join('') : '<div class="mission-issue info"><strong>Pronta para publicar</strong><span>Nenhum problema encontrado.</span></div>'}</div><div class="mission-inspector-actions"><button class="mission-btn" data-export>Exportar JSON</button><button class="mission-btn" data-import>Importar JSON</button><button class="mission-btn danger" data-delete ${current.source === 'legacy' ? 'disabled' : ''}>Excluir</button><button class="mission-btn" data-back-map>Mapa</button><input class="mission-hidden" type="file" accept="application/json" data-import-file></div></aside>`;
    bind();
  }

  function bind() {
    element.querySelectorAll<HTMLButtonElement>('[data-select-mission]').forEach((button) => button.onclick = () => { const found = records.find((record) => record.numericId === Number(button.dataset.selectMission)); if (found) { current = clone(found); simulation.clear(); render(); } });
    element.querySelector<HTMLInputElement>('[data-search]')!.oninput = (event) => { query = (event.currentTarget as HTMLInputElement).value; render(); };
    element.querySelector<HTMLSelectElement>('[data-status-filter]')!.onchange = (event) => { statusFilter = (event.currentTarget as HTMLSelectElement).value; render(); };
    element.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => button.onclick = () => { tab = button.dataset.tab as MissionTab; render(); });
    element.querySelector<HTMLSelectElement>('[data-status]')!.onchange = (event) => mutate((mission) => { mission.status = (event.currentTarget as HTMLSelectElement).value as MissionStudioRecord['status']; });

    element.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[data-field]').forEach((input) => input.onchange = () => mutate((mission) => { (mission as unknown as Record<string, unknown>)[input.dataset.field!] = input.value; }));
    element.querySelectorAll<HTMLInputElement>('[data-number-field]').forEach((input) => input.onchange = () => mutate((mission) => { (mission as unknown as Record<string, unknown>)[input.dataset.numberField!] = Number(input.value) || 0; }));
    element.querySelectorAll<HTMLInputElement>('[data-bool-field]').forEach((input) => input.onchange = () => mutate((mission) => { (mission as unknown as Record<string, unknown>)[input.dataset.boolField!] = input.checked; }));
    element.querySelector<HTMLInputElement>('[data-tags]')?.addEventListener('change', (event) => mutate((mission) => { mission.tags = (event.currentTarget as HTMLInputElement).value.split(',').map((value) => value.trim()).filter(Boolean); }));
    element.querySelectorAll<HTMLTextAreaElement>('[data-dialog-field]').forEach((input) => input.onchange = () => mutate((mission) => { mission.dialog[input.dataset.dialogField as keyof typeof mission.dialog] = input.value; }));

    element.querySelector<HTMLButtonElement>('[data-new]')!.onclick = () => { current = createMissionStudioRecord(); tab = 'general'; simulation.clear(); render(); toast('Nova missão criada como Draft.'); };
    element.querySelector<HTMLButtonElement>('[data-duplicate]')!.onclick = () => { const copy = duplicateMissionStudioRecord(current); refreshRecords(copy.numericId); current = clone(copy); render(); toast('Missão duplicada como Draft.'); };
    element.querySelector<HTMLButtonElement>('[data-save]')!.onclick = () => {
      const issues = validateMission(current, records.map((record) => record.numericId === current.numericId ? current : record));
      if (current.status === 'published' && issues.some((issue) => issue.severity === 'error')) { toast('Publicação bloqueada: corrija os erros críticos no Inspector.'); return; }
      try { const saved = saveMissionStudioRecord(current); refreshRecords(saved.numericId); current = clone(saved); render(); toast('Missão salva no catálogo. Reabra o jogo para recarregar o runtime.'); } catch (error) { toast(error instanceof Error ? error.message : 'Falha ao salvar a missão.'); }
    };
    element.querySelector<HTMLButtonElement>('[data-delete]')!.onclick = () => { try { deleteMissionStudioRecord(current); records = listMissionStudioRecords(); current = clone(records[0] ?? createMissionStudioRecord()); render(); toast('Missão removida.'); } catch (error) { toast(error instanceof Error ? error.message : 'Não foi possível remover.'); } };

    element.querySelector<HTMLButtonElement>('[data-add-stage]')?.addEventListener('click', () => mutate((mission) => mission.stages.push(newStage(mission.stages.length))));
    element.querySelectorAll<HTMLInputElement>('[data-stage-title]').forEach((input) => input.onchange = () => mutate((mission) => { mission.stages[Number(input.dataset.si)].title = input.value; }));
    element.querySelectorAll<HTMLInputElement>('[data-stage-description]').forEach((input) => input.onchange = () => mutate((mission) => { mission.stages[Number(input.dataset.si)].description = input.value; }));
    element.querySelectorAll<HTMLSelectElement>('[data-stage-mode]').forEach((input) => input.onchange = () => mutate((mission) => { mission.stages[Number(input.dataset.si)].mode = input.value === 'parallel' ? 'parallel' : 'sequential'; }));
    element.querySelectorAll<HTMLButtonElement>('[data-stage-up]').forEach((button) => button.onclick = () => mutate((mission) => { const index = Number(button.dataset.si); if (index > 0) [mission.stages[index - 1], mission.stages[index]] = [mission.stages[index], mission.stages[index - 1]]; }));
    element.querySelectorAll<HTMLButtonElement>('[data-stage-down]').forEach((button) => button.onclick = () => mutate((mission) => { const index = Number(button.dataset.si); if (index < mission.stages.length - 1) [mission.stages[index + 1], mission.stages[index]] = [mission.stages[index], mission.stages[index + 1]]; }));
    element.querySelectorAll<HTMLButtonElement>('[data-remove-stage]').forEach((button) => button.onclick = () => mutate((mission) => mission.stages.splice(Number(button.dataset.si), 1)));
    element.querySelectorAll<HTMLButtonElement>('[data-add-objective]').forEach((button) => button.onclick = () => mutate((mission) => mission.stages[Number(button.dataset.si)].objectives.push(newObjective())));
    element.querySelectorAll<HTMLButtonElement>('[data-remove-objective]').forEach((button) => button.onclick = () => mutate((mission) => mission.stages[Number(button.dataset.si)].objectives.splice(Number(button.dataset.oi), 1)));
    element.querySelectorAll<HTMLInputElement>('[data-objective-route]').forEach((input) => input.onchange = () => mutate((mission) => { const objective = mission.stages[Number(input.dataset.si)].objectives[Number(input.dataset.oi)]; objective.navigation = { ...(objective.navigation ?? {}), enabled: input.checked }; }));
    element.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-objective-field]').forEach((input) => input.onchange = () => mutate((mission) => {
      const objective = mission.stages[Number(input.dataset.si)].objectives[Number(input.dataset.oi)];
      const field = input.dataset.objectiveField!;
      if (field === 'amount') objective.amount = Math.max(1, Number(input.value) || 1);
      else if (field === 'type') { objective.type = input.value as QuestObjectiveType; objective.target = undefined; objective.npcId = undefined; objective.itemId = undefined; objective.monsterKind = undefined; objective.navigation = { enabled: true }; }
      else if (field === 'resource') { objective.target = input.value || undefined; const resource = listCollectibleDefinitions().find((entry) => entry.id === input.value); if (resource?.drops[0]) objective.itemId = resource.drops[0].itemId; objective.navigation = { ...(objective.navigation ?? {}), enabled: objective.navigation?.enabled !== false, targetType: 'resource', targetId: input.value || undefined }; }
      else { (objective as unknown as Record<string, unknown>)[field] = input.value || undefined; if (field === 'npcId') objective.navigation = { ...(objective.navigation ?? {}), targetType: 'npc', targetId: input.value || undefined }; if (field === 'monsterKind') objective.navigation = { ...(objective.navigation ?? {}), targetType: 'monster', targetId: input.value || undefined }; if (field === 'target' && (objective.type === 'visit' || objective.type === 'interact')) objective.navigation = { ...(objective.navigation ?? {}), targetType: 'marker', targetId: input.value || undefined }; }
    }));

    element.querySelectorAll<HTMLInputElement>('[data-reward-number]').forEach((input) => input.onchange = () => mutate((mission) => { mission.rewards[input.dataset.rewardNumber as 'exp'|'coins'] = Math.max(0, Number(input.value) || 0); }));
    element.querySelectorAll<HTMLButtonElement>('[data-add-reward]').forEach((button) => button.onclick = () => mutate((mission) => { const kind = button.dataset.addReward as 'items'|'chooseOne'; mission.rewards[kind] ??= []; mission.rewards[kind]!.push({ itemId: listItemStudioRecords()[0]?.key || '', quantity: 1 }); }));
    element.querySelectorAll<HTMLSelectElement>('[data-reward-item]').forEach((input) => input.onchange = () => mutate((mission) => { const kind = input.dataset.rewardItem as 'items'|'chooseOne'; mission.rewards[kind]![Number(input.dataset.ri)].itemId = input.value; }));
    element.querySelectorAll<HTMLInputElement>('[data-reward-qty]').forEach((input) => input.onchange = () => mutate((mission) => { const kind = input.dataset.rewardQty as 'items'|'chooseOne'; mission.rewards[kind]![Number(input.dataset.ri)].quantity = Math.max(1, Number(input.value) || 1); }));
    element.querySelectorAll<HTMLButtonElement>('[data-remove-reward]').forEach((button) => button.onclick = () => mutate((mission) => { const kind = button.dataset.removeReward as 'items'|'chooseOne'; mission.rewards[kind]!.splice(Number(button.dataset.ri), 1); }));

    element.querySelectorAll<HTMLInputElement>('[data-requirement-number]').forEach((input) => input.onchange = () => mutate((mission) => { const field = input.dataset.requirementNumber as 'minLevel'|'maxLevel'; const value = Math.max(0, Number(input.value) || 0); if (field === 'maxLevel' && value <= 0) delete mission.requirements.maxLevel; else (mission.requirements as unknown as Record<string, unknown>)[field] = field === 'minLevel' ? Math.max(1, value) : value; }));
    element.querySelectorAll<HTMLInputElement>('[data-class-id]').forEach((input) => input.onchange = () => mutate((mission) => { const id = input.dataset.classId as typeof mission.requirements.classIds[number]; const set = new Set(mission.requirements.classIds); input.checked ? set.add(id) : set.delete(id); mission.requirements.classIds = [...set]; }));
    element.querySelectorAll<HTMLInputElement>('[data-prerequisite]').forEach((input) => input.onchange = () => mutate((mission) => { const key = input.dataset.prerequisite!; const set = new Set(mission.requirements.completedQuests); input.checked ? set.add(key) : set.delete(key); mission.requirements.completedQuests = [...set]; }));

    element.querySelector<HTMLButtonElement>('[data-sim-reset]')?.addEventListener('click', () => { simulation.clear(); render(); });
    element.querySelectorAll<HTMLButtonElement>('[data-sim-add]').forEach((button) => button.onclick = () => { const id = button.dataset.simAdd!; simulation.set(id, (simulation.get(id) || 0) + 1); render(); });
    element.querySelectorAll<HTMLButtonElement>('[data-sim-complete]').forEach((button) => button.onclick = () => { const id = button.dataset.simComplete!; const objective = current.stages.flatMap((stage) => stage.objectives).find((entry) => entry.id === id); if (objective) simulation.set(id, Math.max(1, Number(objective.amount) || 1)); render(); });

    element.querySelector<HTMLButtonElement>('[data-export]')!.onclick = () => { const blob = new Blob([JSON.stringify(current, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `quest-${current.numericId}-${current.key.replace(/[^a-z0-9._-]+/gi,'-')}.json`; anchor.click(); URL.revokeObjectURL(url); };
    const importFile = element.querySelector<HTMLInputElement>('[data-import-file]')!;
    element.querySelector<HTMLButtonElement>('[data-import]')!.onclick = () => importFile.click();
    importFile.onchange = async () => { const file = importFile.files?.[0]; if (!file) return; try { const parsed = JSON.parse(await file.text()) as MissionStudioRecord; const imported = normalizeMission(parsed); imported.numericId = createMissionStudioRecord().numericId; imported.key = `quest_${imported.numericId}`; imported.source = 'custom'; imported.status = 'draft'; imported.createdAt = Date.now(); imported.updatedAt = imported.createdAt; current = imported; render(); toast('JSON importado como nova missão Draft. Revise e salve.'); } catch { toast('JSON de missão inválido.'); } };
    element.querySelector<HTMLButtonElement>('[data-back-map]')!.onclick = () => { const url = new URL(window.location.href); url.searchParams.set('editor','map'); url.searchParams.delete('section'); url.searchParams.delete('id'); window.location.href = url.toString(); };
  }

  render();
  return { element, open: render, refresh: () => { refreshRecords(); render(); } };
}
