import { listClassDefinitions } from '../classes/classCatalog';
import { listMissionStudioRecords } from '../quests/missionStudioStore';
import { listPublishedSkills } from '../skills/skillStudioStore';
import type { EventStudioRecord, EventValidationIssue } from './eventStudioTypes';

const push = (issues: EventValidationIssue[], severity: EventValidationIssue['severity'], code: string, message: string) => issues.push({ severity, code, message });

export function validateEvent(record: EventStudioRecord) {
  const issues: EventValidationIssue[] = [];
  const missions = new Set(listMissionStudioRecords().map((mission) => mission.key));
  const classes = new Set(listClassDefinitions({ publishedOnly: true }).map((entry) => entry.id));
  const skills = new Set(listPublishedSkills().map((entry) => entry.id));
  if (!record.title.trim()) push(issues, 'error', 'title.empty', 'Defina um nome para o evento.');
  if (!record.key.trim()) push(issues, 'error', 'key.empty', 'A chave interna do evento está vazia.');

  if (record.schedule.mode === 'window') {
    const start = Date.parse(record.schedule.startsAt), end = Date.parse(record.schedule.endsAt);
    if (!Number.isFinite(start) || !Number.isFinite(end)) push(issues, 'error', 'schedule.window.invalid', 'Defina início e fim válidos para a janela do evento.');
    else if (end <= start) push(issues, 'error', 'schedule.window.order', 'O fim do evento precisa ocorrer depois do início.');
  }
  if (record.schedule.mode === 'recurring') {
    if (!record.schedule.weekdays.length) push(issues, 'error', 'schedule.days.empty', 'Selecione pelo menos um dia da semana.');
    if (!/^\d{2}:\d{2}$/.test(record.schedule.startTime) || !/^\d{2}:\d{2}$/.test(record.schedule.endTime)) push(issues, 'error', 'schedule.time.invalid', 'Defina horários válidos para a recorrência.');
  }

  if (!record.actions.length) push(issues, 'warning', 'actions.empty', 'O evento ainda não controla nenhum conteúdo.');
  for (const action of record.actions) {
    if (!action.targetId.trim()) push(issues, 'error', 'action.target.empty', `A ação “${action.label || action.type}” está sem destino.`);
    if (action.type === 'mission' && action.targetId && !missions.has(action.targetId)) push(issues, 'error', 'action.mission.invalid', `A missão “${action.targetId}” não existe no Mission Studio.`);
    if ((action.type === 'unlock-class' || action.type === 'change-class') && action.targetId && !classes.has(action.targetId)) push(issues, 'error', 'action.class.invalid', `A classe “${action.targetId}” não está publicada no Class Studio.`);
    if (action.type === 'learn-skill' && action.targetId && !skills.has(action.targetId)) push(issues, 'error', 'action.skill.invalid', `A Skill “${action.targetId}” não está publicada no Skill Studio.`);
    if (!['mission','unlock-class','change-class','learn-skill'].includes(action.type)) push(issues, 'info', 'action.adapter.future', `A ação “${action.type}” está estruturada no catálogo, mas seu adaptador de runtime será conectado em uma etapa posterior.`);
  }
  if (record.status === 'published' && issues.some((issue) => issue.severity === 'error')) push(issues, 'error', 'publish.blocked', 'Corrija os erros críticos antes de publicar o evento.');
  return issues;
}
