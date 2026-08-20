import type { CharacterProgress } from '../character/characterCreator';

export type MonsterKind = 'wolf' | 'sludge';
export type QuestDef = {
  id: string;
  title: string;
  objective: string;
  kind: MonsterKind | 'any';
  target: number;
  rewardExp: number;
  rewardCoins: number;
};

export const QUESTS: QuestDef[] = [
  { id: 'forest.wolves.v2', title: 'Ameaça na trilha', objective: 'Derrote 3 Lobos Sombrios', kind: 'wolf', target: 3, rewardExp: 60, rewardCoins: 30 },
  { id: 'forest.sludge.v1', title: 'Lodo tóxico', objective: 'Derrote 4 Lodos Tóxicos', kind: 'sludge', target: 4, rewardExp: 100, rewardCoins: 45 },
  { id: 'forest.cleanup.v1', title: 'Limpeza da floresta', objective: 'Derrote 5 monstros na floresta', kind: 'any', target: 5, rewardExp: 150, rewardCoins: 70 },
];

export function ensureQuestStates(progress: CharacterProgress) {
  for (const quest of QUESTS) {
    const state = progress.quests[quest.id];
    if (!state) progress.quests[quest.id] = { status: 'not_started', progress: 0, target: quest.target };
    else state.target = quest.target;
  }
}

export function currentQuest(progress: CharacterProgress): QuestDef | null {
  for (let i = 0; i < QUESTS.length; i++) {
    const quest = QUESTS[i];
    const previousDone = QUESTS.slice(0, i).every((item) => progress.quests[item.id].status === 'completed');
    if (!previousDone) return null;
    if (progress.quests[quest.id].status !== 'completed') return quest;
  }
  return null;
}

export function registerQuestKill(progress: CharacterProgress, kind: MonsterKind) {
  const quest = currentQuest(progress);
  if (!quest) return null;
  const state = progress.quests[quest.id];
  const matches = quest.kind === 'any' || quest.kind === kind;
  if (state.status !== 'active' || !matches) return null;
  state.progress = Math.min(state.target, state.progress + 1);
  if (state.progress >= state.target) state.status = 'ready';
  return { quest, state, becameReady: state.status === 'ready' };
}

export function interactQuest(progress: CharacterProgress) {
  const quest = currentQuest(progress);
  if (!quest) return { type: 'all_done' as const };
  const state = progress.quests[quest.id];
  if (state.status === 'not_started') {
    state.status = 'active';
    state.progress = 0;
    state.target = quest.target;
    return { type: 'accepted' as const, quest, state };
  }
  if (state.status === 'ready') {
    state.status = 'completed';
    return { type: 'completed' as const, quest, state };
  }
  return { type: 'progress' as const, quest, state };
}
