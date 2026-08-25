import '../quests/missionStudio.css';
import { listMissionStudioRecords } from '../quests/missionStudioStore';
import { isEventRecordActive } from './eventRuntime';
import { createEventAction, createEventStudioRecord, deleteEventStudioRecord, duplicateEventStudioRecord, listEventStudioRecords, saveEventStudioRecord } from './eventStudioStore';
import type { EventActionType, EventStudioRecord, EventStudioType } from './eventStudioTypes';
import { validateEvent } from './eventStudioValidation';

const clone = <T>(value: T): T => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
const TYPES: Record<EventStudioType, string> = { world: 'World Event', seasonal: 'Sazonal', boss: 'Boss Event', timed: 'Temporizado', pvp: 'PvP', gathering: 'Coleta', gm: 'GM Event' };
const ACTIONS: Record<EventActionType, string> = { mission: 'Ativar missão', 'spawn-group': 'Spawn Group', portal: 'Portal', marker: 'Marker', shop: 'Loja', 'drop-table': 'Drop Table', buff: 'Buff global' };
const DAYS = [['0','Dom'],['1','Seg'],['2','Ter'],['3','Qua'],['4','Qui'],['5','Sex'],['6','Sáb']] as const;
type EventTab = 'general'|'schedule'|'actions'|'test';
const option = (value: string, label: string, selected?: string) => `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`;

export function createEventStudio(host: HTMLElement) {
  host.querySelector('.standalone-studio-empty')?.remove();
  const root = document.createElement('div'); root.className = 'mission-studio event-studio'; host.appendChild(root);
  let records = listEventStudioRecords();
  let current = clone(records[0] ?? createEventStudioRecord());
  let tab: EventTab = 'general'; let query = ''; let statusFilter = 'all'; let toastTimer = 0;

  const toast = (message: string) => { root.querySelector('.mission-toast')?.remove(); const node = document.createElement('div'); node.className = 'mission-toast'; node.textContent = message; root.appendChild(node); window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => node.remove(), 2600); };
  const mutate = (fn: (event: EventStudioRecord) => void) => { fn(current); current.updatedAt = Date.now(); render(); };
  const refresh = (id = current.numericId) => { records = listEventStudioRecords(); const found = records.find((event) => event.numericId === id); if (found) current = clone(found); };
  const shown = () => records.filter((event) => (statusFilter === 'all' || event.status === statusFilter) && (!query || `${event.numericId} ${event.key} ${event.title} ${event.description} ${event.tags.join(' ')}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))));
  const missionOptions = (selected = '') => `<option value="">Selecione uma missão...</option>${listMissionStudioRecords().map((mission) => option(mission.key, `#${mission.numericId} · ${mission.title}`, selected)).join('')}`;

  function general() {
    return `<section class="mission-section"><div class="mission-section-head"><strong>Identidade do evento</strong><span class="mission-id">Event #${current.numericId}</span></div><div class="mission-section-body"><div class="mission-grid">
      <div class="mission-field"><label>Nome</label><input data-field="title" value="${esc(current.title)}"></div><div class="mission-field"><label>Chave interna</label><input data-field="key" value="${esc(current.key)}"></div>
      <div class="mission-field"><label>Tipo</label><select data-field="type">${(Object.keys(TYPES) as EventStudioType[]).map((type) => option(type,TYPES[type],current.type)).join('')}</select></div><div class="mission-field"><label>Ícone</label><input data-field="icon" value="${esc(current.icon)}"></div>
      <div class="mission-field"><label>Prioridade</label><input data-number="priority" type="number" value="${current.priority}"></div><div class="mission-field"><label>Tags</label><input data-tags value="${esc(current.tags.join(', '))}" placeholder="mundial, verão, boss"></div>
      <div class="mission-field full"><label>Descrição</label><textarea data-field="description">${esc(current.description)}</textarea></div>
    </div></div></section>`;
  }

  function schedule() {
    const mode = current.schedule.mode;
    return `<section class="mission-section"><div class="mission-section-head"><strong>Agenda e ativação</strong><span>O runtime avalia esta agenda em tempo real</span></div><div class="mission-section-body"><div class="mission-grid">
      <div class="mission-field"><label>Modo</label><select data-schedule="mode">${option('manual','Manual',mode)}${option('window','Janela de data/hora',mode)}${option('recurring','Recorrente semanal',mode)}</select></div>
      ${mode === 'manual' ? `<div class="mission-field"><label>Estado manual</label><label class="mission-check"><input type="checkbox" data-manual-active ${current.schedule.manualActive ? 'checked' : ''}> Evento ativo agora</label></div>` : ''}
      ${mode === 'window' ? `<div class="mission-field"><label>Início</label><input data-schedule="startsAt" type="datetime-local" value="${esc(current.schedule.startsAt)}"></div><div class="mission-field"><label>Fim</label><input data-schedule="endsAt" type="datetime-local" value="${esc(current.schedule.endsAt)}"></div>` : ''}
      ${mode === 'recurring' ? `<div class="mission-field"><label>Horário inicial</label><input data-schedule="startTime" type="time" value="${esc(current.schedule.startTime)}"></div><div class="mission-field"><label>Horário final</label><input data-schedule="endTime" type="time" value="${esc(current.schedule.endTime)}"></div><div class="mission-field full"><label>Dias da semana</label><div style="display:flex;flex-wrap:wrap;gap:12px">${DAYS.map(([value,label]) => `<label class="mission-check"><input type="checkbox" data-weekday="${value}" ${current.schedule.weekdays.includes(Number(value)) ? 'checked' : ''}> ${label}</label>`).join('')}</div></div>` : ''}
    </div></div></section><section class="mission-section"><div class="mission-section-head"><strong>Estado calculado</strong></div><div class="mission-section-body"><div class="mission-sim-card"><header><strong>${isEventRecordActive(current) ? 'ATIVO' : 'INATIVO'}</strong><span>${current.status === 'published' ? 'Publicado' : current.status === 'disabled' ? 'Desativado' : 'Draft'}</span></header><p style="color:#82989e;margin-bottom:0">Draft e Disabled nunca entram em execução. Eventos publicados seguem a agenda acima.</p></div></div></section>`;
  }

  function actionTarget(action: EventStudioRecord['actions'][number], index: number) {
    if (action.type === 'mission') return `<select data-action-target data-ai="${index}">${missionOptions(action.targetId)}</select>`;
    return `<input data-action-target data-ai="${index}" value="${esc(action.targetId)}" placeholder="ID do ${esc(ACTIONS[action.type])}">`;
  }

  function actions() {
    return `<section class="mission-section"><div class="mission-section-head"><strong>Ações do evento</strong><button class="mission-btn" data-add-action>+ Ação</button></div><div class="mission-section-body">${current.actions.length ? current.actions.map((action,index) => `<div class="mission-stage" style="margin-bottom:8px"><div class="mission-stage-head"><input type="checkbox" data-action-enabled data-ai="${index}" ${action.enabled ? 'checked' : ''} title="Ativa"><select data-action-type data-ai="${index}" style="flex:0 0 165px">${(Object.keys(ACTIONS) as EventActionType[]).map((type) => option(type,ACTIONS[type],action.type)).join('')}</select><input data-action-label data-ai="${index}" value="${esc(action.label)}" placeholder="Nome interno da ação">${actionTarget(action,index)}<button class="mission-icon-btn" data-remove-action data-ai="${index}">×</button></div></div>`).join('') : '<div class="mission-empty-note">Nenhuma ação. Adicione uma missão ou outro conteúdo controlado pelo evento.</div>'}<p style="color:#748a91">Nesta entrega, <b>Ativar missão</b> já possui adaptador de runtime. Spawn Group, Portal, Marker, Loja, Drop Table e Buff ficam registrados e validados para os próximos adaptadores.</p></div></section>`;
  }

  function test() {
    const active = isEventRecordActive(current); const missionActions = current.actions.filter((action) => action.enabled && action.type === 'mission');
    return `<section class="mission-section"><div class="mission-section-head"><strong>Simulador do evento</strong></div><div class="mission-section-body"><div class="mission-sim-card"><header><strong>${active ? 'Evento ativo neste instante' : 'Evento inativo neste instante'}</strong><span>${new Date().toLocaleString('pt-BR')}</span></header><p>Status: ${esc(current.status)} · Agenda: ${esc(current.schedule.mode)}</p></div><strong>Missões controladas</strong>${missionActions.length ? missionActions.map((action) => { const mission = listMissionStudioRecords().find((entry) => entry.key === action.targetId); return `<div class="mission-sim-card"><header><strong>${esc(mission?.title || action.targetId)}</strong><span>${active ? 'HABILITADA' : 'BLOQUEADA'}</span></header></div>`; }).join('') : '<div class="mission-empty-note">Nenhuma missão vinculada.</div>'}</div></section>`;
  }

  function content() { return tab === 'general' ? general() : tab === 'schedule' ? schedule() : tab === 'actions' ? actions() : test(); }

  function render() {
    const issues = validateEvent(current); const errors = issues.filter((issue) => issue.severity === 'error').length; const warnings = issues.filter((issue) => issue.severity === 'warning').length;
    root.innerHTML = `<aside class="mission-catalog"><div class="mission-panel-head"><h2>Event Studio</h2><p>Eventos globais, temporizados e sazonais</p><div class="mission-toolbar"><button class="mission-btn primary" data-new>+ Novo</button><button class="mission-btn" data-duplicate>Duplicar</button></div><input class="mission-search" data-search value="${esc(query)}" placeholder="Buscar evento"><div class="mission-filter-row"><select data-filter>${option('all','Todos os status',statusFilter)}${option('draft','Drafts',statusFilter)}${option('published','Publicados',statusFilter)}${option('disabled','Desativados',statusFilter)}</select></div></div><div class="mission-list">${shown().map((event) => `<button class="mission-card${event.numericId === current.numericId ? ' selected' : ''}" data-select="${event.numericId}"><div class="mission-card-top"><span class="mission-id">#${event.numericId}</span><strong>${esc(event.title)}</strong><span class="mission-badge ${event.status}">${event.status}</span></div><small>${esc(TYPES[event.type])} · ${esc(event.key)}</small></button>`).join('') || '<div class="mission-empty-note">Nenhum evento salvo.</div>'}</div></aside>
    <main class="mission-workspace"><header class="mission-work-head"><div class="mission-work-title"><strong>#${current.numericId} · ${esc(current.title)}</strong><span>${esc(current.key)} · ${isEventRecordActive(current) ? 'ATIVO AGORA' : 'inativo'}</span></div><select class="mission-status-select" data-status>${option('draft','Draft',current.status)}${option('published','Published',current.status)}${option('disabled','Disabled',current.status)}</select><button class="mission-btn primary" data-save>Salvar</button></header><nav class="mission-tabs">${([['general','Geral'],['schedule','Agenda'],['actions','Ações'],['test','Teste']] as [EventTab,string][]).map(([id,label]) => `<button class="mission-tab${tab === id ? ' active' : ''}" data-tab="${id}">${label}</button>`).join('')}</nav><div class="mission-scroll">${content()}</div></main>
    <aside class="mission-inspector"><div class="mission-panel-head"><h3>Inspector do Evento</h3><p>Agenda, referências e adaptadores.</p></div><div class="mission-inspector-body"><div class="mission-score"><div><strong>${current.actions.length}</strong><span>Ações</span></div><div><strong>${errors}</strong><span>Erros</span></div><div><strong>${warnings}</strong><span>Avisos</span></div></div>${issues.length ? issues.map((issue) => `<div class="mission-issue ${issue.severity}"><strong>${issue.severity === 'error' ? 'Erro' : issue.severity === 'warning' ? 'Atenção' : 'Info'}</strong><span>${esc(issue.message)}</span></div>`).join('') : '<div class="mission-issue info"><strong>Configuração válida</strong><span>Nenhum problema encontrado.</span></div>'}</div><div class="mission-inspector-actions"><button class="mission-btn danger" data-delete>Excluir</button><button class="mission-btn" data-missions>Missões</button></div></aside>`;
    bind();
  }

  function bind() {
    root.querySelectorAll<HTMLButtonElement>('[data-select]').forEach((button) => button.onclick = () => { const found = records.find((event) => event.numericId === Number(button.dataset.select)); if (found) { current = clone(found); render(); } });
    root.querySelector<HTMLInputElement>('[data-search]')!.oninput = (event) => { query = (event.currentTarget as HTMLInputElement).value; render(); };
    root.querySelector<HTMLSelectElement>('[data-filter]')!.onchange = (event) => { statusFilter = (event.currentTarget as HTMLSelectElement).value; render(); };
    root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => button.onclick = () => { tab = button.dataset.tab as EventTab; render(); });
    root.querySelector<HTMLSelectElement>('[data-status]')!.onchange = (event) => mutate((record) => { record.status = (event.currentTarget as HTMLSelectElement).value as EventStudioRecord['status']; });
    root.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('[data-field]').forEach((input) => input.onchange = () => mutate((record) => { (record as unknown as Record<string,unknown>)[input.dataset.field!] = input.value; }));
    root.querySelectorAll<HTMLInputElement>('[data-number]').forEach((input) => input.onchange = () => mutate((record) => { (record as unknown as Record<string,unknown>)[input.dataset.number!] = Number(input.value) || 0; }));
    root.querySelector<HTMLInputElement>('[data-tags]')?.addEventListener('change', (event) => mutate((record) => { record.tags = (event.currentTarget as HTMLInputElement).value.split(',').map((value) => value.trim()).filter(Boolean); }));
    root.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-schedule]').forEach((input) => input.onchange = () => mutate((record) => { (record.schedule as unknown as Record<string,unknown>)[input.dataset.schedule!] = input.value; }));
    root.querySelector<HTMLInputElement>('[data-manual-active]')?.addEventListener('change', (event) => mutate((record) => { record.schedule.manualActive = (event.currentTarget as HTMLInputElement).checked; }));
    root.querySelectorAll<HTMLInputElement>('[data-weekday]').forEach((input) => input.onchange = () => mutate((record) => { const day = Number(input.dataset.weekday); const set = new Set(record.schedule.weekdays); input.checked ? set.add(day) : set.delete(day); record.schedule.weekdays = [...set].sort(); }));

    root.querySelector<HTMLButtonElement>('[data-new]')!.onclick = () => { current = createEventStudioRecord(); tab = 'general'; render(); toast('Novo evento criado como Draft.'); };
    root.querySelector<HTMLButtonElement>('[data-duplicate]')!.onclick = () => { const copy = duplicateEventStudioRecord(current); refresh(copy.numericId); current = clone(copy); render(); toast('Evento duplicado como Draft.'); };
    root.querySelector<HTMLButtonElement>('[data-save]')!.onclick = () => { const issues = validateEvent(current); if (current.status === 'published' && issues.some((issue) => issue.severity === 'error')) { toast('Publicação bloqueada: corrija os erros críticos.'); return; } try { const saved = saveEventStudioRecord(current); refresh(saved.numericId); current = clone(saved); render(); toast('Evento salvo. O runtime passa a considerar a agenda imediatamente.'); } catch (error) { toast(error instanceof Error ? error.message : 'Falha ao salvar.'); } };
    root.querySelector<HTMLButtonElement>('[data-delete]')!.onclick = () => { deleteEventStudioRecord(current); records = listEventStudioRecords(); current = clone(records[0] ?? createEventStudioRecord()); render(); toast('Evento removido.'); };

    root.querySelector<HTMLButtonElement>('[data-add-action]')?.addEventListener('click', () => mutate((record) => record.actions.push(createEventAction())));
    root.querySelectorAll<HTMLInputElement>('[data-action-enabled]').forEach((input) => input.onchange = () => mutate((record) => { record.actions[Number(input.dataset.ai)].enabled = input.checked; }));
    root.querySelectorAll<HTMLSelectElement>('[data-action-type]').forEach((input) => input.onchange = () => mutate((record) => { const action = record.actions[Number(input.dataset.ai)]; action.type = input.value as EventActionType; action.targetId = ''; }));
    root.querySelectorAll<HTMLInputElement>('[data-action-label]').forEach((input) => input.onchange = () => mutate((record) => { record.actions[Number(input.dataset.ai)].label = input.value; }));
    root.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-action-target]').forEach((input) => input.onchange = () => mutate((record) => { record.actions[Number(input.dataset.ai)].targetId = input.value; }));
    root.querySelectorAll<HTMLButtonElement>('[data-remove-action]').forEach((button) => button.onclick = () => mutate((record) => record.actions.splice(Number(button.dataset.ai),1)));
    root.querySelector<HTMLButtonElement>('[data-missions]')!.onclick = () => { const url = new URL(window.location.href); url.searchParams.set('editor','quests'); window.location.href = url.toString(); };
  }

  render();
  return { element: root, refresh: () => { refresh(); render(); } };
}
