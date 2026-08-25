import type { CharacterProgress } from '../character/characterCreator';
import { addItem, getItem, itemQuantity, removeItem } from '../items/itemCatalog';
import { QUEST_CATALOG, getQuestDefinition } from './questCatalog';
import { listMissionStudioRecords } from './missionStudioStore';
import type { QuestDefinition, QuestEvent, QuestObjective, QuestRuntimeState, QuestUpdate } from './questTypes';

type QuestProgress = CharacterProgress & {
  trackedQuestId?: string | null;
  questData?: Record<string, QuestRuntimeState>;
};

export const NPC_NAMES: Record<string, string> = {
  elandra: 'Elandra', rowan: 'Rowan', mira: 'Mira', theo: 'Theo',
};

const MISSION_FLOW = new Map(listMissionStudioRecords().map((mission) => [mission.key, mission.stages]));

function totalTarget(quest: QuestDefinition) {
  return quest.objectives.reduce((total, objective) => total + Math.max(1, objective.amount ?? 1), 0);
}
function objectiveAmount(objective: QuestObjective) { return Math.max(1, objective.amount ?? 1); }

function localDayStamp(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
function localWeekStamp(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  return date.getTime();
}
function repeatResetDue(state: QuestRuntimeState, quest: QuestDefinition) {
  if (state.status !== 'completed' || !state.completedAt) return false;
  const mode = quest.reset ?? (quest.repeatable ? 'repeatable' : 'once');
  if (mode === 'once' || mode === 'event') return false;
  const now = Date.now();
  const cooldownReady = now >= state.completedAt + Math.max(0, quest.cooldownMs ?? 0);
  if (!cooldownReady) return false;
  if (mode === 'repeatable') return true;
  if (mode === 'daily') return localDayStamp(now) !== localDayStamp(state.completedAt);
  if (mode === 'weekly') return localWeekStamp(now) !== localWeekStamp(state.completedAt);
  return false;
}
function resetCompletedState(state: QuestRuntimeState) {
  state.status = 'not_started';
  state.objectives = {};
  state.progress = 0;
  state.acceptedAt = undefined;
  state.completedAt = undefined;
}

function stateFor(progress: CharacterProgress, quest: QuestDefinition): QuestRuntimeState {
  const extended = progress as QuestProgress;
  extended.questData ??= {};
  let raw = extended.questData[quest.id];
  if (!raw) {
    const legacy = progress.quests?.[quest.id];
    raw = {
      status: legacy?.status ?? 'not_started',
      objectives: {},
      progress: Math.max(0, Number(legacy?.progress ?? 0)),
      target: totalTarget(quest),
    };
    if (quest.objectives.length === 1 && legacy) raw.objectives[quest.objectives[0].id] = Math.max(0, Number(legacy.progress ?? 0));
    extended.questData[quest.id] = raw;
  }
  raw.objectives ??= {};
  raw.progress = Math.max(0, Number(raw.progress ?? 0));
  raw.target = totalTarget(quest);
  if (repeatResetDue(raw, quest)) resetCompletedState(raw);
  return raw;
}

function objectiveCount(progress: CharacterProgress, quest: QuestDefinition, objective: QuestObjective) {
  const state = stateFor(progress, quest);
  const stored = Math.max(0, Number(state.objectives[objective.id] ?? 0));
  if (objective.type === 'collect' && objective.itemId) return Math.min(objectiveAmount(objective), itemQuantity(progress, objective.itemId));
  if (objective.type === 'deliver' && objective.itemId && stored < objectiveAmount(objective)) return Math.min(objectiveAmount(objective), Math.max(stored, itemQuantity(progress, objective.itemId)));
  return Math.min(objectiveAmount(objective), stored);
}

function objectiveDone(progress: CharacterProgress, quest: QuestDefinition, objective: QuestObjective) {
  const state = stateFor(progress, quest);
  if (objective.type === 'deliver') return Number(state.objectives[objective.id] ?? 0) >= objectiveAmount(objective);
  return objectiveCount(progress, quest, objective) >= objectiveAmount(objective);
}

function stageForObjective(quest: QuestDefinition, objectiveId: string) {
  return MISSION_FLOW.get(quest.id)?.find((stage) => stage.objectives.some((objective) => objective.id === objectiveId));
}

function activeObjectives(progress: CharacterProgress, quest: QuestDefinition) {
  const flow = MISSION_FLOW.get(quest.id);
  if (flow?.length) {
    for (const stage of flow) {
      const runtimeObjectives = stage.objectives.map((entry) => quest.objectives.find((objective) => objective.id === entry.id)).filter((objective): objective is QuestObjective => Boolean(objective));
      const pending = runtimeObjectives.filter((objective) => !objectiveDone(progress, quest, objective));
      if (!pending.length) continue;
      return stage.mode === 'parallel' ? pending : [pending[0]];
    }
    return [];
  }
  if (quest.mode === 'parallel') return quest.objectives.filter((objective) => !objectiveDone(progress, quest, objective));
  const first = quest.objectives.find((objective) => !objectiveDone(progress, quest, objective));
  return first ? [first] : [];
}

function objectiveFlowIsSequential(quest: QuestDefinition, objective: QuestObjective) {
  return stageForObjective(quest, objective.id)?.mode === 'sequential' || (!stageForObjective(quest, objective.id) && quest.mode === 'sequential');
}

function updateAggregate(progress: CharacterProgress, quest: QuestDefinition) {
  const state = stateFor(progress, quest);
  state.progress = quest.objectives.reduce((sum, objective) => sum + Math.min(objectiveAmount(objective), Number(state.objectives[objective.id] ?? 0)), 0);
  state.target = totalTarget(quest);
  if (state.status === 'active' && quest.objectives.every((objective) => objectiveDone(progress, quest, objective))) state.status = 'ready';
}

function questIsReady(progress: CharacterProgress, quest: QuestDefinition) {
  return stateFor(progress, quest).status === 'ready';
}

export function ensureQuestStates(progress: CharacterProgress) {
  for (const quest of QUEST_CATALOG) {
    stateFor(progress, quest);
    updateAggregate(progress, quest);
    if (quest.autoStart && isQuestAvailable(progress, quest)) {
      const state = stateFor(progress, quest);
      state.status = 'active'; state.acceptedAt = Date.now(); state.objectives = {};
      updateAggregate(progress, quest);
    }
  }
  const extended = progress as QuestProgress;
  if (extended.trackedQuestId && !getQuestDefinition(extended.trackedQuestId)) extended.trackedQuestId = null;
  if (!extended.trackedQuestId) {
    const first = QUEST_CATALOG.find((quest) => ['active', 'ready'].includes(stateFor(progress, quest).status));
    if (first) extended.trackedQuestId = first.id;
  }
}

export function getQuestState(progress: CharacterProgress, questId: string) {
  const quest = getQuestDefinition(questId);
  return quest ? stateFor(progress, quest) : null;
}

export function isQuestAvailable(progress: CharacterProgress, quest: QuestDefinition) {
  const state = stateFor(progress, quest);
  if (state.status !== 'not_started') return false;
  const req = quest.requirements;
  if (!req) return true;
  if ((req.minLevel ?? 1) > progress.level) return false;
  if (req.maxLevel && progress.level > req.maxLevel) return false;
  if (req.classIds?.length && !req.classIds.includes(progress.classId)) return false;
  if (req.completedQuests?.some((id) => getQuestState(progress, id)?.status !== 'completed')) return false;
  if (req.requiredItems?.some((entry) => itemQuantity(progress, entry.itemId) < Math.max(1, entry.quantity))) return false;
  return true;
}

export function questsForNpc(progress: CharacterProgress, npcId: string) {
  ensureQuestStates(progress);
  return QUEST_CATALOG.filter((quest) => {
    const state = stateFor(progress, quest);
    return (quest.startNpcId === npcId && isQuestAvailable(progress, quest)) ||
      (quest.endNpcId === npcId && state.status === 'ready') ||
      (state.status === 'active' && activeObjectives(progress, quest).some((objective) => objective.npcId === npcId));
  }).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export function getNpcQuestMarker(progress: CharacterProgress, npcId: string) {
  ensureQuestStates(progress);
  if (QUEST_CATALOG.some((quest) => quest.endNpcId === npcId && stateFor(progress, quest).status === 'ready')) return { symbol: '?', color: 0x8fd3ff };
  if (QUEST_CATALOG.some((quest) => stateFor(progress, quest).status === 'active' && activeObjectives(progress, quest).some((objective) => objective.npcId === npcId))) return { symbol: '?', color: 0xc4b5fd };
  if (QUEST_CATALOG.some((quest) => quest.startNpcId === npcId && isQuestAvailable(progress, quest))) return { symbol: '!', color: 0xffdd57 };
  return { symbol: '', color: 0xffffff };
}

function matchesEvent(objective: QuestObjective, event: QuestEvent) {
  if (objective.type === 'kill' && event.type === 'kill') return objective.monsterKind === 'any' || objective.monsterKind === event.monsterKind;
  if (objective.type === 'boss' && (event.type === 'boss' || event.type === 'kill')) return objective.target === event.monsterId || objective.monsterKind === event.monsterKind;
  if (objective.type === 'talk' && event.type === 'talk') return objective.npcId === event.npcId;
  if (objective.type === 'visit' && event.type === 'visit') return objective.target === event.zoneId;
  if (objective.type === 'interact' && event.type === 'interact') return objective.target === event.targetId;
  if (objective.type === 'gather' && event.type === 'gather') return (!objective.target || objective.target === event.nodeId) && (!objective.itemId || objective.itemId === event.itemId);
  if (objective.type === 'craft' && event.type === 'craft') return (!objective.target || objective.target === event.recipeId) && (!objective.itemId || objective.itemId === event.outputItemId);
  return false;
}

export function registerQuestEvent(progress: CharacterProgress, event: QuestEvent): QuestUpdate[] {
  ensureQuestStates(progress);
  const updates: QuestUpdate[] = [];
  for (const quest of QUEST_CATALOG) {
    const state = stateFor(progress, quest);
    if (state.status !== 'active') continue;
    for (const objective of activeObjectives(progress, quest)) {
      if (!matchesEvent(objective, event)) continue;
      const wasDone = objectiveDone(progress, quest, objective);
      state.objectives[objective.id] = Math.min(objectiveAmount(objective), Number(state.objectives[objective.id] ?? 0) + 1);
      updateAggregate(progress, quest);
      updates.push({ quest, objective, objectiveCompleted: !wasDone && objectiveDone(progress, quest, objective), becameReady: questIsReady(progress, quest) });
      if (objectiveFlowIsSequential(quest, objective)) break;
    }
  }
  return updates;
}

export function syncCollectObjectives(progress: CharacterProgress) {
  ensureQuestStates(progress);
  const updates: QuestUpdate[] = [];
  for (const quest of QUEST_CATALOG) {
    const state = stateFor(progress, quest);
    if (state.status !== 'active') continue;
    for (const objective of activeObjectives(progress, quest)) {
      if (objective.type !== 'collect' || !objective.itemId) continue;
      const before = Number(state.objectives[objective.id] ?? 0);
      state.objectives[objective.id] = Math.min(objectiveAmount(objective), itemQuantity(progress, objective.itemId));
      updateAggregate(progress, quest);
      if (before !== state.objectives[objective.id]) updates.push({ quest, objective, objectiveCompleted: before < objectiveAmount(objective) && objectiveDone(progress, quest, objective), becameReady: questIsReady(progress, quest) });
    }
  }
  return updates;
}

function processNpcObjectives(progress: CharacterProgress, npcId: string) {
  const updates: QuestUpdate[] = [];
  for (const quest of QUEST_CATALOG) {
    const state = stateFor(progress, quest);
    if (state.status !== 'active') continue;
    const objectives = activeObjectives(progress, quest).filter((objective) => objective.npcId === npcId);
    for (const objective of objectives) {
      if (objective.type === 'talk') {
        const amount = objectiveAmount(objective);
        const wasDone = objectiveDone(progress, quest, objective);
        state.objectives[objective.id] = amount;
        updateAggregate(progress, quest);
        updates.push({ quest, objective, objectiveCompleted: !wasDone, becameReady: questIsReady(progress, quest) });
        if (objectiveFlowIsSequential(quest, objective)) break;
      } else if (objective.type === 'deliver' && objective.itemId) {
        const amount = objectiveAmount(objective);
        if (itemQuantity(progress, objective.itemId) < amount) continue;
        const removed = removeItem(progress, objective.itemId, amount);
        if (removed < amount) continue;
        state.objectives[objective.id] = amount;
        updateAggregate(progress, quest);
        updates.push({ quest, objective, objectiveCompleted: true, becameReady: questIsReady(progress, quest) });
        if (objectiveFlowIsSequential(quest, objective)) break;
      }
    }
  }
  return updates;
}

export type QuestNpcInteraction =
  | { type: 'accepted'; quest: QuestDefinition }
  | { type: 'completed'; quest: QuestDefinition }
  | { type: 'updated'; quest: QuestDefinition; becameReady: boolean }
  | { type: 'progress'; quest: QuestDefinition }
  | { type: 'none' };

export function interactQuestNpc(progress: CharacterProgress, npcId: string): QuestNpcInteraction {
  ensureQuestStates(progress);
  const ready = QUEST_CATALOG.find((quest) => quest.endNpcId === npcId && stateFor(progress, quest).status === 'ready');
  if (ready) {
    const state = stateFor(progress, ready);
    state.status = 'completed'; state.completedAt = Date.now();
    const extended = progress as QuestProgress;
    if (extended.trackedQuestId === ready.id) extended.trackedQuestId = null;
    return { type: 'completed', quest: ready };
  }
  const updates = processNpcObjectives(progress, npcId);
  if (updates.length) {
    const last = updates[updates.length - 1];
    return { type: 'updated', quest: last.quest, becameReady: updates.some((update) => update.becameReady) };
  }
  const available = QUEST_CATALOG.filter((quest) => quest.startNpcId === npcId && isQuestAvailable(progress, quest)).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))[0];
  if (available) {
    const state = stateFor(progress, available);
    state.status = 'active'; state.acceptedAt = Date.now(); state.objectives = {};
    updateAggregate(progress, available);
    (progress as QuestProgress).trackedQuestId = available.id;
    return { type: 'accepted', quest: available };
  }
  if (npcId === 'elandra') {
    const related = QUEST_CATALOG.find((quest) => stateFor(progress, quest).status === 'active' && (quest.startNpcId === npcId || quest.endNpcId === npcId));
    if (related) return { type: 'progress', quest: related };
  }
  return { type: 'none' };
}

export function grantQuestItemRewards(progress: CharacterProgress, quest: QuestDefinition) {
  const granted: string[] = [], missed: string[] = [];
  for (const reward of quest.rewards.items ?? []) {
    const item = getItem(reward.itemId);
    const result = addItem(progress, reward.itemId, reward.quantity);
    if (result.added > 0) granted.push(`${result.added}x ${item?.name ?? reward.itemId}`);
    if (result.remaining > 0) missed.push(`${result.remaining}x ${item?.name ?? reward.itemId}`);
  }
  return { granted, missed };
}

export function getTrackedQuest(progress: CharacterProgress) {
  ensureQuestStates(progress);
  const extended = progress as QuestProgress;
  const tracked = extended.trackedQuestId ? getQuestDefinition(extended.trackedQuestId) : undefined;
  if (tracked && ['active', 'ready'].includes(stateFor(progress, tracked).status)) return tracked;
  const fallback = QUEST_CATALOG.find((quest) => ['ready', 'active'].includes(stateFor(progress, quest).status));
  if (fallback) extended.trackedQuestId = fallback.id;
  return fallback ?? null;
}

export function setTrackedQuest(progress: CharacterProgress, questId: string | null) {
  const quest = questId ? getQuestDefinition(questId) : undefined;
  if (quest && !['active', 'ready'].includes(stateFor(progress, quest).status)) return false;
  (progress as QuestProgress).trackedQuestId = quest?.id ?? null;
  return true;
}

export function questObjectiveProgress(progress: CharacterProgress, quest: QuestDefinition, objective: QuestObjective) {
  return { current: objectiveCount(progress, quest, objective), target: objectiveAmount(objective), done: objectiveDone(progress, quest, objective) };
}

export function getActiveQuestObjectives(progress: CharacterProgress, quest: QuestDefinition) {
  return activeObjectives(progress, quest);
}

export function questLists(progress: CharacterProgress) {
  ensureQuestStates(progress);
  const active = QUEST_CATALOG.filter((quest) => ['active', 'ready'].includes(stateFor(progress, quest).status));
  const available = QUEST_CATALOG.filter((quest) => isQuestAvailable(progress, quest));
  const completed = QUEST_CATALOG.filter((quest) => stateFor(progress, quest).status === 'completed');
  return { active, available, completed };
}

export function questStatusLabel(progress: CharacterProgress, quest: QuestDefinition) {
  const status = stateFor(progress, quest).status;
  if (status === 'ready') return `Volte para ${NPC_NAMES[quest.endNpcId] ?? quest.endNpcId}`;
  if (status === 'active') return 'Em andamento';
  if (status === 'completed') return 'Concluída';
  return isQuestAvailable(progress, quest) ? `Disponível em ${NPC_NAMES[quest.startNpcId] ?? quest.startNpcId}` : 'Bloqueada';
}

export function rewardText(quest: QuestDefinition) {
  const parts: string[] = [];
  if (quest.rewards.exp) parts.push(`${quest.rewards.exp} EXP`);
  if (quest.rewards.coins) parts.push(`${quest.rewards.coins} moedas`);
  for (const reward of quest.rewards.items ?? []) parts.push(`${reward.quantity}x ${getItem(reward.itemId)?.name ?? reward.itemId}`);
  if (quest.rewards.chooseOne?.length) parts.push(`Escolha 1 de ${quest.rewards.chooseOne.length} recompensa(s)`);
  return parts.join(' · ');
}
