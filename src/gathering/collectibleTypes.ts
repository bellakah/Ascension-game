export type CollectibleKind = 'woodcutting' | 'mining' | 'herbalism' | 'digging' | 'custom';
export type CollectibleAnimationState = 'idle' | 'harvest' | 'break' | 'depleted' | 'respawn';
export type CollectiblePlayerAnimation = 'chop' | 'mine' | 'dig' | 'gather' | 'slash' | 'emote';

export type CollectibleDrop = {
  itemId: string;
  numericId?: number;
  chance: number;
  min: number;
  max: number;
};

export type CollectibleAppearance = {
  idle?: string;
  harvest?: string;
  break?: string;
  depleted?: string;
  respawn?: string;
  fallbackAssetId: string;
  scale: number;
  showShadow: boolean;
};

export type CollectibleDefinition = {
  version: 1;
  id: string;
  numericId: number;
  name: string;
  kind: CollectibleKind;
  category: string;
  description: string;
  tags: string[];
  icon: string;
  hint: string;
  interactionRadiusTiles: number;
  harvestDurationMs: number;
  respawnMs: number;
  respawnJitterMs: number;
  requiredToolItemId?: string;
  requiredToolNumericId?: number;
  playerAnimation: CollectiblePlayerAnimation;
  appearance: CollectibleAppearance;
  drops: CollectibleDrop[];
  createdAt: number;
  updatedAt: number;
};

export const COLLECTIBLE_KIND_LABELS: Record<CollectibleKind, string> = {
  woodcutting: 'Lenha / Árvores',
  mining: 'Mineração',
  herbalism: 'Ervas / Plantas',
  digging: 'Escavação',
  custom: 'Personalizado',
};

export const COLLECTIBLE_PLAYER_ANIMATIONS: Array<[CollectiblePlayerAnimation, string]> = [
  ['chop', 'Cortar com machado (LPC backslash)'],
  ['mine', 'Minerar (LPC halfslash)'],
  ['dig', 'Cavar (LPC halfslash)'],
  ['gather', 'Coletar / apanhar (LPC emote)'],
  ['slash', 'Ataque slash'],
  ['emote', 'Emote'],
];
