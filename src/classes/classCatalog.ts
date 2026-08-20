export type ClassId = 'warrior' | 'mage';
export type ClassName = 'Guerreiro' | 'Mago';

export type ClassDefinition = {
  id: ClassId;
  name: ClassName;
  icon: string;
  tagline: string;
  description: string;
  colorHint: string;
  baseStats: { maxHp: number; attack: number; defense: number };
  resource: { label: string; max: number; regenPerSecond: number };
  basicAttack: { range: number; cooldownTicks: number; animation: 'slash' | 'spellcast' };
  startingEquipment: { weapon: string | null; armor: string | null; boots: string | null };
};

export const CLASS_CATALOG: Record<ClassId, ClassDefinition> = {
  warrior: {
    id: 'warrior',
    name: 'Guerreiro',
    icon: '⚔️',
    tagline: 'Combate corpo a corpo',
    description: 'Resistente e direto. Usa espadas, investidas e golpes em área para dominar a linha de frente.',
    colorHint: '#d59a54',
    baseStats: { maxHp: 100, attack: 34, defense: 5 },
    resource: { label: 'Energia', max: 100, regenPerSecond: 12 },
    basicAttack: { range: 110, cooldownTicks: 30, animation: 'slash' },
    startingEquipment: { weapon: 'basic_sword', armor: 'chainmail', boots: 'basic_boots' },
  },
  mage: {
    id: 'mage',
    name: 'Mago',
    icon: '🔮',
    tagline: 'Magia de longo alcance',
    description: 'Atacante arcano de longo alcance. Tem menos resistência, mas mais alcance, Mana e explosões mágicas.',
    colorHint: '#7aa7f2',
    baseStats: { maxHp: 82, attack: 38, defense: 2 },
    resource: { label: 'Mana', max: 120, regenPerSecond: 16 },
    basicAttack: { range: 390, cooldownTicks: 38, animation: 'spellcast' },
    startingEquipment: { weapon: 'apprentice_staff', armor: null, boots: 'basic_boots' },
  },
};

export const PLAYABLE_CLASSES = Object.values(CLASS_CATALOG);

export function normalizeClassId(value?: string | null): ClassId {
  if (value === 'mage' || value === 'Mago') return 'mage';
  return 'warrior';
}

export function getClassDefinition(classId?: string | null) {
  return CLASS_CATALOG[normalizeClassId(classId)];
}
