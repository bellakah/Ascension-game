import type { ClassId } from '../classes/classCatalog';

export type MonsterKind = 'wolf' | 'sludge';
export type QuestStatus = 'not_started' | 'active' | 'ready' | 'completed';
export type QuestMode = 'sequential' | 'parallel';
export type QuestObjectiveType = 'kill' | 'boss' | 'collect' | 'deliver' | 'talk' | 'visit' | 'interact';

export type QuestObjective = {
  id: string;
  type: QuestObjectiveType;
  label: string;
  amount?: number;
  target?: string;
  npcId?: string;
  itemId?: string;
  monsterKind?: MonsterKind | 'any';
};

export type QuestReward = {
  exp?: number;
  coins?: number;
  items?: Array<{ itemId: string; quantity: number }>;
};

export type QuestRequirements = {
  minLevel?: number;
  classIds?: ClassId[];
  completedQuests?: string[];
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
  title: string;
  summary: string;
  category: 'story' | 'side' | 'tutorial' | 'daily';
  startNpcId: string;
  endNpcId: string;
  mode: QuestMode;
  objectives: QuestObjective[];
  rewards: QuestReward;
  requirements?: QuestRequirements;
  dialog?: QuestDialog;
  repeatable?: boolean;
  sortOrder?: number;
};

export type QuestRuntimeState = {
  status: QuestStatus;
  objectives: Record<string, number>;
  acceptedAt?: number;
  completedAt?: number;
  // Campos legados mantidos durante a migração do protótipo antigo.
  progress?: number;
  target?: number;
};

export type QuestEvent =
  | { type: 'kill'; monsterKind: MonsterKind; monsterId: string }
  | { type: 'boss'; monsterKind: MonsterKind; monsterId: string }
  | { type: 'talk'; npcId: string }
  | { type: 'visit'; zoneId: string }
  | { type: 'interact'; targetId: string };

export type QuestUpdate = {
  quest: QuestDefinition;
  objective: QuestObjective;
  objectiveCompleted: boolean;
  becameReady: boolean;
};
