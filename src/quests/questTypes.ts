import type { ClassId } from '../classes/classCatalog';

export type MonsterKind = string;
export type QuestStatus = 'not_started' | 'active' | 'ready' | 'completed';
export type QuestMode = 'sequential' | 'parallel';
export type QuestCategory = 'story' | 'side' | 'tutorial' | 'daily' | 'weekly' | 'repeatable' | 'event' | 'world' | 'hidden';
export type QuestObjectiveType = 'kill' | 'boss' | 'collect' | 'deliver' | 'talk' | 'visit' | 'interact' | 'gather' | 'craft' | 'use' | 'wait';

export type QuestNavigationTargetType = 'npc' | 'monster' | 'resource' | 'marker' | 'portal' | 'position';
export type QuestObjectiveNavigation = {
  enabled?: boolean;
  targetType?: QuestNavigationTargetType;
  targetId?: string;
  map?: string;
  x?: number;
  y?: number;
  arrivalRadius?: number;
  showOnMinimap?: boolean;
  allowInterMap?: boolean;
};

export type QuestObjective = {
  id: string;
  type: QuestObjectiveType;
  label: string;
  amount?: number;
  target?: string;
  npcId?: string;
  itemId?: string;
  monsterKind?: MonsterKind | 'any';
  navigation?: QuestObjectiveNavigation;
  stageId?: string;
  stageIndex?: number;
  stageTitle?: string;
  stageMode?: QuestMode;
};

export type QuestReward = {
  exp?: number;
  coins?: number;
  items?: Array<{ itemId: string; quantity: number; numericId?: number }>;
  chooseOne?: Array<{ itemId: string; quantity: number; numericId?: number }>;
};

export type QuestRequirements = {
  minLevel?: number;
  maxLevel?: number;
  classIds?: ClassId[];
  completedQuests?: string[];
  requiredItems?: Array<{ itemId: string; quantity: number }>;
};

export type QuestDialog = {
  offer?: string;
  accepted?: string;
  progress?: string;
  ready?: string;
  completed?: string;
};

export type QuestDefinition = {
  id: string;
  numericId?: number;
  title: string;
  summary: string;
  category: QuestCategory;
  startNpcId: string;
  endNpcId: string;
  mode: QuestMode;
  objectives: QuestObjective[];
  rewards: QuestReward;
  requirements?: QuestRequirements;
  dialog?: QuestDialog;
  repeatable?: boolean;
  reset?: 'once' | 'repeatable' | 'daily' | 'weekly' | 'event';
  cooldownMs?: number;
  autoStart?: boolean;
  autoComplete?: boolean;
  sortOrder?: number;
  tags?: string[];
  recommendedLevel?: number;
  icon?: string;
};

export type QuestRuntimeState = {
  status: QuestStatus;
  objectives: Record<string, number>;
  acceptedAt?: number;
  completedAt?: number;
  progress?: number;
  target?: number;
};

export type QuestEvent =
  | { type: 'kill'; monsterKind: MonsterKind; monsterId: string }
  | { type: 'boss'; monsterKind: MonsterKind; monsterId: string }
  | { type: 'talk'; npcId: string }
  | { type: 'visit'; zoneId: string }
  | { type: 'interact'; targetId: string }
  | { type: 'gather'; nodeId: string; itemId: string }
  | { type: 'craft'; recipeId: string; outputItemId: string };

export type QuestUpdate = {
  quest: QuestDefinition;
  objective: QuestObjective;
  objectiveCompleted: boolean;
  becameReady: boolean;
};
