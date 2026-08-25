export type EventStudioStatus = 'draft' | 'published' | 'disabled';
export type EventStudioType = 'world' | 'seasonal' | 'boss' | 'timed' | 'pvp' | 'gathering' | 'gm';
export type EventScheduleMode = 'manual' | 'window' | 'recurring';
export type EventActionType = 'mission' | 'spawn-group' | 'portal' | 'marker' | 'shop' | 'drop-table' | 'buff' | 'unlock-class' | 'change-class' | 'learn-skill';

export type EventStudioSchedule = {
  mode: EventScheduleMode;
  manualActive: boolean;
  startsAt: string;
  endsAt: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
};

export type EventStudioAction = {
  id: string;
  type: EventActionType;
  targetId: string;
  label: string;
  enabled: boolean;
};

export type EventStudioRecord = {
  version: 1;
  numericId: number;
  key: string;
  status: EventStudioStatus;
  type: EventStudioType;
  title: string;
  description: string;
  icon: string;
  tags: string[];
  priority: number;
  schedule: EventStudioSchedule;
  actions: EventStudioAction[];
  createdAt: number;
  updatedAt: number;
};

export type EventValidationIssue = {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
};
