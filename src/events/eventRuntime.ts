import { listEventStudioRecords } from './eventStudioStore';
import type { EventStudioRecord } from './eventStudioTypes';

function minutes(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Math.max(0, Math.min(1439, Number(match[1]) * 60 + Number(match[2])));
}

export function isEventRecordActive(event: EventStudioRecord, timestamp = Date.now()) {
  if (event.status !== 'published') return false;
  const schedule = event.schedule;
  if (schedule.mode === 'manual') return schedule.manualActive;
  const now = new Date(timestamp);
  if (schedule.mode === 'window') {
    const start = Date.parse(schedule.startsAt);
    const end = Date.parse(schedule.endsAt);
    return Number.isFinite(start) && Number.isFinite(end) && timestamp >= start && timestamp <= end;
  }
  const start = minutes(schedule.startTime), end = minutes(schedule.endTime);
  if (start == null || end == null) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  if (start <= end) return schedule.weekdays.includes(now.getDay()) && current >= start && current <= end;

  // Janela que cruza meia-noite: segunda 22:00–02:00 continua ativa
  // na madrugada de terça, vinculada ao dia em que começou.
  const previousDay = (now.getDay() + 6) % 7;
  return (schedule.weekdays.includes(now.getDay()) && current >= start)
    || (schedule.weekdays.includes(previousDay) && current <= end);
}

export function activeEventRecords(timestamp = Date.now()) {
  return listEventStudioRecords().filter((event) => isEventRecordActive(event, timestamp)).sort((a, b) => b.priority - a.priority || a.numericId - b.numericId);
}

export function isMissionEnabledByEvents(missionKey: string, timestamp = Date.now()) {
  const controllers = listEventStudioRecords().filter((event) => event.status !== 'draft' && event.actions.some((action) => action.enabled && action.type === 'mission' && action.targetId === missionKey));
  if (!controllers.length) return true;
  return controllers.some((event) => isEventRecordActive(event, timestamp));
}

export function eventRuntimeSummary(timestamp = Date.now()) {
  const all = listEventStudioRecords();
  const active = all.filter((event) => isEventRecordActive(event, timestamp));
  return { total: all.length, active: active.length, activeKeys: active.map((event) => event.key) };
}
