export type NpcDirection = 'south' | 'south-west' | 'west' | 'north-west' | 'north' | 'north-east' | 'east' | 'south-east';
export type NpcAnimationState = 'idle' | 'walk';
export type NpcBehaviorMode = 'stationary' | 'patrol' | 'loop' | 'once' | 'random';
export type NpcRole = 'civilian' | 'merchant' | 'guard' | 'quest' | 'healer' | 'crafter' | 'trainer' | 'special' | 'custom';

export type NpcAppearance = {
  fallbackAssetId: string;
  idle: Partial<Record<NpcDirection, string>>;
  walk: Partial<Record<NpcDirection, string>>;
  scale: number;
  showShadow: boolean;
};

export type NpcDialogueChoice = {
  id: string;
  text: string;
  action: 'close' | 'dialogue' | 'shop' | 'quest' | 'custom';
  target?: string;
};

export type NpcDialogueNode = {
  id: string;
  text: string;
  choices: NpcDialogueChoice[];
};

export type NpcShopItem = {
  itemId: string;
  price: number;
  stock: number | null;
};

export type NpcScheduleEntry = {
  hour: number;
  action: 'available' | 'hidden' | 'route' | 'idle';
  routeId?: string;
};

export type NpcDefinition = {
  version: 1;
  id: string;
  name: string;
  title: string;
  role: NpcRole;
  category: string;
  tags: string[];
  notes: string;
  appearance: NpcAppearance;
  interaction: {
    enabled: boolean;
    radiusTiles: number;
    facePlayer: boolean;
    blockPlayer: boolean;
    prompt: string;
  };
  dialogue: {
    enabled: boolean;
    startNodeId: string;
    nodes: NpcDialogueNode[];
  };
  shop: {
    enabled: boolean;
    currencyId: string;
    buyMultiplier: number;
    sellMultiplier: number;
    items: NpcShopItem[];
  };
  quests: {
    offers: string[];
    completes: string[];
  };
  behavior: {
    mode: NpcBehaviorMode;
    walkSpeed: number;
    runSpeed: number;
    randomRadius: number;
    defaultWaitMs: number;
  };
  schedule: NpcScheduleEntry[];
  createdAt: number;
  updatedAt: number;
};

export type NpcRoutePoint = {
  id: string;
  x: number;
  y: number;
  waitMs: number;
  face?: NpcDirection | 'auto';
};

export type NpcInstanceRoute = {
  version: 1;
  mapId: string;
  objectId: string;
  npcId: string;
  mode: Exclude<NpcBehaviorMode, 'random'>;
  speed: number;
  points: NpcRoutePoint[];
  updatedAt: number;
};

export const NPC_DIRECTIONS: Array<{ id: NpcDirection; label: string; short: string }> = [
  { id: 'north', label: 'Norte', short: 'N' },
  { id: 'north-east', label: 'Nordeste', short: 'NE' },
  { id: 'east', label: 'Leste', short: 'L' },
  { id: 'south-east', label: 'Sudeste', short: 'SE' },
  { id: 'south', label: 'Sul', short: 'S' },
  { id: 'south-west', label: 'Sudoeste', short: 'SO' },
  { id: 'west', label: 'Oeste', short: 'O' },
  { id: 'north-west', label: 'Noroeste', short: 'NO' },
];
