import type { ClassId } from '../classes/classCatalog';

export type CraftStudioStatus = 'draft' | 'published' | 'disabled';
export type CraftStudioSource = 'legacy' | 'custom';
export type CraftLearnMode = 'automatic' | 'quest' | 'item' | 'event';

export type CraftIngredientRecord = {
  itemId: string;
  numericId?: number;
  quantity: number;
  consume: boolean;
};

export type CraftOutputRecord = {
  itemId: string;
  numericId?: number;
  quantity: number;
  chance: number;
  kind: 'primary' | 'byproduct';
};

export type CraftRequirements = {
  minLevel?: number;
  classIds?: ClassId[];
  completedQuests?: string[];
  eventKey?: string;
  learnMode: CraftLearnMode;
  learnItemId?: string;
  learnQuestId?: string;
};

export type CraftRecipeStudioRecord = {
  version: 1;
  numericId: number;
  key: string;
  source: CraftStudioSource;
  status: CraftStudioStatus;
  name: string;
  description: string;
  icon: string;
  category: string;
  stationTypeId: string;
  ingredients: CraftIngredientRecord[];
  outputs: CraftOutputRecord[];
  requirements: CraftRequirements;
  sortOrder: number;
  tags: string[];
  createdAt: number;
  updatedAt: number;
};

export type CraftStationTypeRecord = {
  version: 1;
  numericId: number;
  key: string;
  source: CraftStudioSource;
  status: CraftStudioStatus;
  name: string;
  icon: string;
  prompt: string;
  interactionRadius: number;
  categories: string[];
  tags: string[];
  createdAt: number;
  updatedAt: number;
};

export type CraftValidationIssue = {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
};
