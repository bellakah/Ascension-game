import type { QuestDefinition, QuestObjective } from './questTypes';
import type { MissionStudioRecord, MissionStudioStage } from './missionStudioTypes';

const STORAGE_KEY = 'ascension.mission-studio.v1';
const CHANGE_EVENT = 'ascension-mission-definitions-change';
type MissionStudioFile = { version: 1; missions: MissionStudioRecord[] };

const clone = <T>(value: T): T => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
const now = () => Date.now();
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function readFile(): MissionStudioFile {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as Partial<MissionStudioFile>;
    if (parsed.version !== 1 || !Array.isArray(parsed.missions)) return { version: 1, missions: [] };
    return { version: 1, missions: parsed.missions.filter(Boolean).map((mission) => normalizeMission(mission as MissionStudioRecord)) };
  } catch {
    return { version: 1, missions: [] };
  }
}

function writeFile(file: MissionStudioFile, notify = true) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
  if (notify) window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

function normalizeObjective(objective: QuestObjective, fallbackId: string): QuestObjective {
  return {
    id: String(objective.id || fallbackId),
    type: objective.type || 'talk',
    label: String(objective.label || 'Novo objetivo'),
    amount: Math.max(1, Math.floor(Number(objective.amount) || 1)),
    ...(objective.target ? { target: String(objective.target) } : {}),
    ...(objective.npcId ? { npcId: String(objective.npcId) } : {}),
    ...(objective.itemId ? { itemId: String(objective.itemId) } : {}),
    ...(objective.monsterKind ? { monsterKind: String(objective.monsterKind) } : {}),
    ...(objective.navigation ? { navigation: { ...objective.navigation } } : {}),
  };
}

function normalizeStage(stage: MissionStudioStage, index: number): MissionStudioStage {
  return {
    id: String(stage.id || `stage-${index + 1}`),
    title: String(stage.title || `Etapa ${index + 1}`),
    description: String(stage.description || ''),
    mode: stage.mode === 'parallel' ? 'parallel' : 'sequential',
    objectives: Array.isArray(stage.objectives)
      ? stage.objectives.map((objective, objectiveIndex) => normalizeObjective(objective, `objective-${index + 1}-${objectiveIndex + 1}`))
      : [],
  };
}

export function normalizeMission(record: MissionStudioRecord): MissionStudioRecord {
  const timestamp = now();
  const numericId = Math.max(1, Math.floor(Number(record.numericId) || 1));
  const reset = ['repeatable', 'daily', 'weekly', 'event'].includes(record.reset) ? record.reset : 'once';
  return {
    version: 1,
    numericId,
    key: String(record.key || `quest_${numericId}`).trim(),
    source: record.source === 'legacy' ? 'legacy' : 'custom',
    status: record.status === 'draft' || record.status === 'disabled' ? record.status : 'published',
    title: String(record.title || 'Nova Missão'),
    summary: String(record.summary || ''),
    icon: String(record.icon || '!'),
    category: record.category || 'side',
    tags: Array.isArray(record.tags) ? record.tags.map(String).filter(Boolean) : [],
    recommendedLevel: Math.max(1, Math.floor(Number(record.recommendedLevel) || 1)),
    priority: Math.floor(Number(record.priority) || 0),
    startNpcId: String(record.startNpcId || ''),
    endNpcId: String(record.endNpcId || record.startNpcId || ''),
    autoStart: Boolean(record.autoStart),
    autoComplete: Boolean(record.autoComplete),
    reset,
    cooldownMs: Math.max(0, Math.floor(Number(record.cooldownMs) || 0)),
    requirements: {
      minLevel: Math.max(1, Math.floor(Number(record.requirements?.minLevel) || 1)),
      ...(Number(record.requirements?.maxLevel) > 0 ? { maxLevel: Math.floor(Number(record.requirements?.maxLevel)) } : {}),
      classIds: Array.isArray(record.requirements?.classIds) ? [...record.requirements.classIds] : [],
      completedQuests: Array.isArray(record.requirements?.completedQuests) ? record.requirements.completedQuests.map(String).filter(Boolean) : [],
    },
    stages: Array.isArray(record.stages) ? record.stages.map(normalizeStage) : [],
    rewards: {
      exp: Math.max(0, Math.floor(Number(record.rewards?.exp) || 0)),
      coins: Math.max(0, Math.floor(Number(record.rewards?.coins) || 0)),
      items: Array.isArray(record.rewards?.items) ? record.rewards.items.map((entry) => ({ ...entry, itemId: String(entry.itemId || ''), quantity: Math.max(1, Math.floor(Number(entry.quantity) || 1)) })).filter((entry) => entry.itemId) : [],
      chooseOne: Array.isArray(record.rewards?.chooseOne) ? record.rewards.chooseOne.map((entry) => ({ ...entry, itemId: String(entry.itemId || ''), quantity: Math.max(1, Math.floor(Number(entry.quantity) || 1)) })).filter((entry) => entry.itemId) : [],
    },
    dialog: { ...record.dialog },
    createdAt: Number(record.createdAt) || timestamp,
    updatedAt: Number(record.updatedAt) || timestamp,
  };
}

function legacyRecord(quest: QuestDefinition, numericId: number): MissionStudioRecord {
  const timestamp = now();
  return normalizeMission({
    version: 1,
    numericId,
    key: quest.id,
    source: 'legacy',
    status: 'published',
    title: quest.title,
    summary: quest.summary,
    icon: quest.icon || '!',
    category: quest.category,
    tags: quest.tags ?? [],
    recommendedLevel: quest.recommendedLevel ?? quest.requirements?.minLevel ?? 1,
    priority: quest.sortOrder ?? numericId * 10,
    startNpcId: quest.startNpcId,
    endNpcId: quest.endNpcId,
    autoStart: Boolean(quest.autoStart),
    autoComplete: Boolean(quest.autoComplete),
    reset: quest.reset ?? (quest.category === 'daily' ? 'daily' : quest.repeatable ? 'repeatable' : 'once'),
    cooldownMs: quest.cooldownMs ?? 0,
    requirements: {
      minLevel: quest.requirements?.minLevel ?? 1,
      ...(quest.requirements?.maxLevel ? { maxLevel: quest.requirements.maxLevel } : {}),
      classIds: quest.requirements?.classIds ?? [],
      completedQuests: quest.requirements?.completedQuests ?? [],
    },
    stages: [{ id: 'stage-1', title: 'Objetivos', description: '', mode: quest.mode, objectives: quest.objectives.map(clone) }],
    rewards: clone(quest.rewards),
    dialog: clone(quest.dialog ?? {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function ensureMissionStudioMigration(legacyCatalog: QuestDefinition[]) {
  const file = readFile();
  const existingKeys = new Set(file.missions.map((mission) => mission.key));
  let nextId = Math.max(0, ...file.missions.map((mission) => mission.numericId)) + 1;
  let changed = false;
  for (const quest of legacyCatalog) {
    if (existingKeys.has(quest.id)) continue;
    file.missions.push(legacyRecord(quest, nextId++));
    existingKeys.add(quest.id);
    changed = true;
  }
  if (changed) writeFile(file, false);
  return file.missions.map(clone).sort((a, b) => a.numericId - b.numericId);
}

export function listMissionStudioRecords() {
  return readFile().missions.map(clone).sort((a, b) => a.numericId - b.numericId);
}

export function nextMissionNumericId() {
  return Math.max(0, ...listMissionStudioRecords().map((mission) => mission.numericId)) + 1;
}

export function createMissionStudioRecord(): MissionStudioRecord {
  const numericId = nextMissionNumericId();
  const timestamp = now();
  return normalizeMission({
    version: 1,
    numericId,
    key: `quest_${numericId}`,
    source: 'custom',
    status: 'draft',
    title: 'Nova Missão',
    summary: '',
    icon: '!',
    category: 'side',
    tags: [],
    recommendedLevel: 1,
    priority: numericId * 10,
    startNpcId: '',
    endNpcId: '',
    autoStart: false,
    autoComplete: false,
    reset: 'once',
    cooldownMs: 0,
    requirements: { minLevel: 1, classIds: [], completedQuests: [] },
    stages: [{ id: uid('stage'), title: 'Etapa 1', description: '', mode: 'sequential', objectives: [] }],
    rewards: { exp: 0, coins: 0, items: [], chooseOne: [] },
    dialog: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function saveMissionStudioRecord(input: MissionStudioRecord) {
  const file = readFile();
  const mission = normalizeMission({ ...input, updatedAt: now() });
  const idCollision = file.missions.find((entry) => entry.numericId === mission.numericId && entry.key !== mission.key);
  if (idCollision) throw new Error(`O Quest ID #${mission.numericId} já pertence a “${idCollision.title}”.`);
  const keyCollision = file.missions.find((entry) => entry.key === mission.key && entry.numericId !== mission.numericId);
  if (keyCollision) throw new Error(`A chave interna “${mission.key}” já está em uso.`);
  const index = file.missions.findIndex((entry) => entry.numericId === mission.numericId);
  if (index >= 0) file.missions[index] = mission;
  else file.missions.push(mission);
  writeFile(file);
  return clone(mission);
}

export function duplicateMissionStudioRecord(source: MissionStudioRecord) {
  const copy = clone(source);
  copy.numericId = nextMissionNumericId();
  copy.key = `quest_${copy.numericId}`;
  copy.source = 'custom';
  copy.status = 'draft';
  copy.title = `${source.title} - Cópia`;
  copy.createdAt = now();
  copy.updatedAt = copy.createdAt;
  copy.stages = copy.stages.map((stage) => ({ ...stage, id: uid('stage'), objectives: stage.objectives.map((objective) => ({ ...objective, id: uid('objective') })) }));
  return saveMissionStudioRecord(copy);
}

export function deleteMissionStudioRecord(record: MissionStudioRecord) {
  if (record.source === 'legacy') throw new Error('Missões migradas do jogo não podem ser apagadas. Use o status Desativada para preservar saves antigos.');
  const file = readFile();
  file.missions = file.missions.filter((entry) => entry.numericId !== record.numericId);
  writeFile(file);
}

export function compileMission(record: MissionStudioRecord): QuestDefinition | null {
  const mission = normalizeMission(record);
  if (mission.status !== 'published') return null;
  const objectives = mission.stages.flatMap((stage) => stage.objectives.map(clone));
  const mode = mission.stages.length === 1 ? mission.stages[0].mode : 'sequential';
  return {
    id: mission.key,
    numericId: mission.numericId,
    title: mission.title,
    summary: mission.summary,
    category: mission.category,
    startNpcId: mission.startNpcId,
    endNpcId: mission.endNpcId,
    mode,
    objectives,
    rewards: clone(mission.rewards),
    requirements: {
      minLevel: mission.requirements.minLevel,
      ...(mission.requirements.maxLevel ? { maxLevel: mission.requirements.maxLevel } : {}),
      ...(mission.requirements.classIds.length ? { classIds: [...mission.requirements.classIds] } : {}),
      ...(mission.requirements.completedQuests.length ? { completedQuests: [...mission.requirements.completedQuests] } : {}),
    },
    dialog: clone(mission.dialog),
    repeatable: mission.reset !== 'once',
    reset: mission.reset,
    cooldownMs: mission.cooldownMs,
    autoStart: mission.autoStart,
    autoComplete: mission.autoComplete,
    sortOrder: mission.priority,
    tags: [...mission.tags],
    recommendedLevel: mission.recommendedLevel,
    icon: mission.icon,
  };
}

export function loadMissionRuntimeCatalog(legacyCatalog: QuestDefinition[]) {
  return ensureMissionStudioMigration(legacyCatalog).map(compileMission).filter((mission): mission is QuestDefinition => Boolean(mission)).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export function onMissionStudioChange(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}
