import type { ClassId } from '../classes/classCatalog';
import type { QuestCategory, QuestDialog, QuestMode, QuestObjective, QuestReward } from './questTypes';

export type MissionStudioStatus = 'draft' | 'published' | 'disabled';
export type MissionStudioSource = 'legacy' | 'custom';
export type MissionResetMode = 'once' | 'repeatable' | 'daily' | 'weekly' | 'event';

export type MissionStudioStage = {
  id: string;
  title: string;
  description: string;
  mode: QuestMode;
  objectives: QuestObjective[];
};

export type MissionStudioRecord = {
  version: 1;
  numericId: number;
  key: string;
  source: MissionStudioSource;
  status: MissionStudioStatus;
  title: string;
  summary: string;
  icon: string;
  category: QuestCategory;
  tags: string[];
  recommendedLevel: number;
  priority: number;
  startNpcId: string;
  endNpcId: string;
  autoStart: boolean;
  autoComplete: boolean;
  reset: MissionResetMode;
  cooldownMs: number;
  requirements: {
    minLevel: number;
    maxLevel?: number;
    classIds: ClassId[];
    completedQuests: string[];
  };
  stages: MissionStudioStage[];
  rewards: QuestReward;
  dialog: QuestDialog;
  createdAt: number;
  updatedAt: number;
};

export type MissionValidationSeverity = 'error' | 'warning' | 'info';
export type MissionValidationIssue = {
  severity: MissionValidationSeverity;
  code: string;
  message: string;
  path?: string;
};
