export type { MonsterKind, QuestDefinition, QuestEvent, QuestObjective, QuestReward, QuestRuntimeState, QuestStatus } from '../quests/questTypes';
export { QUEST_CATALOG as QUESTS, getQuestDefinition } from '../quests/questCatalog';
export {
  ensureQuestStates,
  getQuestState,
  getTrackedQuest,
  getNpcQuestMarker,
  grantQuestItemRewards,
  interactQuestNpc,
  isQuestAvailable,
  NPC_NAMES,
  questLists,
  questObjectiveProgress,
  questStatusLabel,
  registerQuestEvent,
  rewardText,
  setTrackedQuest,
  syncCollectObjectives,
} from '../quests/questEngine';
