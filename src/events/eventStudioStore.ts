import type { EventStudioAction, EventStudioRecord } from './eventStudioTypes';

const STORAGE_KEY = 'ascension.event-studio.v1';
const CHANGE_EVENT = 'ascension-event-definitions-change';
type EventStudioFile = { version: 1; events: EventStudioRecord[] };
const clone = <T>(value: T): T => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function readFile(): EventStudioFile {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as Partial<EventStudioFile>;
    if (parsed.version !== 1 || !Array.isArray(parsed.events)) return { version: 1, events: [] };
    return { version: 1, events: parsed.events.filter(Boolean).map((event) => normalizeEvent(event as EventStudioRecord)) };
  } catch { return { version: 1, events: [] }; }
}

function writeFile(file: EventStudioFile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

function normalizeAction(action: EventStudioAction): EventStudioAction {
  return {
    id: String(action.id || uid('event-action')),
    type: action.type || 'mission',
    targetId: String(action.targetId || ''),
    label: String(action.label || ''),
    enabled: action.enabled !== false,
  };
}

export function normalizeEvent(record: EventStudioRecord): EventStudioRecord {
  const now = Date.now();
  const numericId = Math.max(1, Math.floor(Number(record.numericId) || 1));
  const weekdays = Array.isArray(record.schedule?.weekdays) ? [...new Set(record.schedule.weekdays.map(Number).filter((day) => day >= 0 && day <= 6))] : [];
  return {
    version: 1,
    numericId,
    key: String(record.key || `event_${numericId}`).trim(),
    status: record.status === 'published' || record.status === 'disabled' ? record.status : 'draft',
    type: record.type || 'world',
    title: String(record.title || 'Novo Evento'),
    description: String(record.description || ''),
    icon: String(record.icon || '✦'),
    tags: Array.isArray(record.tags) ? record.tags.map(String).filter(Boolean) : [],
    priority: Math.floor(Number(record.priority) || 0),
    schedule: {
      mode: record.schedule?.mode || 'manual',
      manualActive: Boolean(record.schedule?.manualActive),
      startsAt: String(record.schedule?.startsAt || ''),
      endsAt: String(record.schedule?.endsAt || ''),
      weekdays,
      startTime: String(record.schedule?.startTime || '18:00'),
      endTime: String(record.schedule?.endTime || '22:00'),
    },
    actions: Array.isArray(record.actions) ? record.actions.map(normalizeAction) : [],
    createdAt: Number(record.createdAt) || now,
    updatedAt: Number(record.updatedAt) || now,
  };
}

export function listEventStudioRecords() { return readFile().events.map(clone).sort((a, b) => a.numericId - b.numericId); }
export function nextEventNumericId() { return Math.max(0, ...listEventStudioRecords().map((event) => event.numericId)) + 1; }

export function createEventStudioRecord(): EventStudioRecord {
  const numericId = nextEventNumericId(); const now = Date.now();
  return normalizeEvent({
    version: 1, numericId, key: `event_${numericId}`, status: 'draft', type: 'world', title: 'Novo Evento', description: '', icon: '✦', tags: [], priority: numericId * 10,
    schedule: { mode: 'manual', manualActive: false, startsAt: '', endsAt: '', weekdays: [], startTime: '18:00', endTime: '22:00' },
    actions: [], createdAt: now, updatedAt: now,
  });
}

export function saveEventStudioRecord(input: EventStudioRecord) {
  const file = readFile(); const event = normalizeEvent({ ...input, updatedAt: Date.now() });
  const idCollision = file.events.find((entry) => entry.numericId === event.numericId && entry.key !== event.key);
  if (idCollision) throw new Error(`O Event ID #${event.numericId} já está em uso.`);
  const keyCollision = file.events.find((entry) => entry.key === event.key && entry.numericId !== event.numericId);
  if (keyCollision) throw new Error(`A chave “${event.key}” já pertence a outro evento.`);
  const index = file.events.findIndex((entry) => entry.numericId === event.numericId);
  if (index >= 0) file.events[index] = event; else file.events.push(event);
  writeFile(file); return clone(event);
}

export function duplicateEventStudioRecord(source: EventStudioRecord) {
  const copy = clone(source); copy.numericId = nextEventNumericId(); copy.key = `event_${copy.numericId}`; copy.status = 'draft'; copy.title = `${source.title} - Cópia`; copy.createdAt = Date.now(); copy.updatedAt = copy.createdAt;
  copy.actions = copy.actions.map((action) => ({ ...action, id: uid('event-action') }));
  return saveEventStudioRecord(copy);
}

export function deleteEventStudioRecord(record: EventStudioRecord) {
  const file = readFile(); file.events = file.events.filter((entry) => entry.numericId !== record.numericId); writeFile(file);
}

export function createEventAction(): EventStudioAction { return { id: uid('event-action'), type: 'mission', targetId: '', label: '', enabled: true }; }
export function onEventStudioChange(listener: () => void) { window.addEventListener(CHANGE_EVENT, listener); return () => window.removeEventListener(CHANGE_EVENT, listener); }
