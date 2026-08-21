export type GatheringKind = 'mining' | 'herbalism' | 'woodcutting';

export type GatheringNodeDefinition = {
  id: string;
  name: string;
  kind: GatheringKind;
  map: string;
  x: number;
  y: number;
  radius: number;
  yieldItemId: string;
  yieldMin: number;
  yieldMax: number;
  respawnMs: number;
  icon: string;
  hint: string;
  animation: 'slash' | 'emote';
};

// No futuro, este catálogo será gerado pelo Editor de Mapas/Recursos.
export const GATHERING_NODES: GatheringNodeDefinition[] = [
  { id: 'iron-vein-1', name: 'Veio de Ferro', kind: 'mining', map: 'Floresta Inicial', x: 560, y: 430, radius: 82, yieldItemId: 'iron_ore', yieldMin: 1, yieldMax: 3, respawnMs: 18000, icon: '⛏', hint: 'Minerar', animation: 'slash' },
  { id: 'iron-vein-2', name: 'Veio de Ferro', kind: 'mining', map: 'Floresta Inicial', x: 1810, y: 420, radius: 82, yieldItemId: 'iron_ore', yieldMin: 1, yieldMax: 3, respawnMs: 18000, icon: '⛏', hint: 'Minerar', animation: 'slash' },
  { id: 'silver-vein-1', name: 'Veio de Prata', kind: 'mining', map: 'Floresta Inicial', x: 1960, y: 1120, radius: 82, yieldItemId: 'silver_ore', yieldMin: 1, yieldMax: 2, respawnMs: 26000, icon: '⛏', hint: 'Minerar', animation: 'slash' },
  { id: 'healing-herb-1', name: 'Erva-da-Clareira', kind: 'herbalism', map: 'Floresta Inicial', x: 690, y: 760, radius: 70, yieldItemId: 'healing_herb', yieldMin: 1, yieldMax: 2, respawnMs: 12000, icon: '✿', hint: 'Coletar', animation: 'emote' },
  { id: 'healing-herb-2', name: 'Erva-da-Clareira', kind: 'herbalism', map: 'Floresta Inicial', x: 1460, y: 650, radius: 70, yieldItemId: 'healing_herb', yieldMin: 1, yieldMax: 2, respawnMs: 12000, icon: '✿', hint: 'Coletar', animation: 'emote' },
  { id: 'moon-herb-1', name: 'Folha Lunar', kind: 'herbalism', map: 'Floresta Inicial', x: 360, y: 1210, radius: 70, yieldItemId: 'moonleaf', yieldMin: 1, yieldMax: 2, respawnMs: 20000, icon: '✦', hint: 'Coletar', animation: 'emote' },
  { id: 'oak-tree-1', name: 'Carvalho Jovem', kind: 'woodcutting', map: 'Floresta Inicial', x: 420, y: 410, radius: 92, yieldItemId: 'oak_wood', yieldMin: 1, yieldMax: 3, respawnMs: 22000, icon: '🪓', hint: 'Cortar madeira', animation: 'slash' },
  { id: 'oak-tree-2', name: 'Carvalho Jovem', kind: 'woodcutting', map: 'Floresta Inicial', x: 1640, y: 390, radius: 92, yieldItemId: 'oak_wood', yieldMin: 1, yieldMax: 3, respawnMs: 22000, icon: '🪓', hint: 'Cortar madeira', animation: 'slash' },
];

export const GATHERING_KIND_LABELS: Record<GatheringKind, string> = {
  mining: 'Mineração',
  herbalism: 'Herborismo',
  woodcutting: 'Lenhador',
};
