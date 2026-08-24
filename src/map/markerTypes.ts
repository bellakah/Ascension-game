export type MarkerCategory =
  | 'player'
  | 'npc'
  | 'shop'
  | 'bank'
  | 'crafting'
  | 'monster'
  | 'boss'
  | 'resource'
  | 'landmark'
  | 'respawn'
  | 'portal'
  | 'questAvailable'
  | 'questReady'
  | 'routeTarget';

export type MarkerSourceKind = 'symbol' | 'fa' | 'svg' | 'image';
export type MarkerLabelMode = 'always' | 'hover' | 'selected' | 'never';

export type MarkerSource = {
  kind: MarkerSourceKind;
  value: string;
  fallback?: string;
};

export type MarkerStyle = {
  source: MarkerSource;
  size: number;
  color: string;
  opacity: number;
  background: boolean;
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  shadow: boolean;
  glow: boolean;
  labelMode: MarkerLabelMode;
  labelSize: number;
};

export type MarkerConfig = {
  version: 2;
  styles: Record<MarkerCategory, MarkerStyle>;
  overrides: Record<string, Partial<MarkerStyle>>;
};
