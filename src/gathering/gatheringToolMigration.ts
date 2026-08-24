import { createItemStudioRecord, getItemStudioRecordByKey, saveItemStudioRecord, type ItemStudioRecord } from '../items/itemStudioStore';

type ToolSeed = Pick<ItemStudioRecord, 'key' | 'name' | 'description' | 'icon' | 'category' | 'rarity' | 'stackMax' | 'value' | 'tags'>;

const TOOLS: ToolSeed[] = [
  { key: 'woodcutting_axe', name: 'Machado de Lenhador', description: 'Ferramenta básica para cortar árvores e coletar madeira.', icon: '🪓', category: 'special', rarity: 'common', stackMax: 1, value: 18, tags: ['ferramenta', 'coleta', 'lenhador'] },
  { key: 'mining_pickaxe', name: 'Picareta de Mineração', description: 'Ferramenta básica para extrair minérios e quebrar pedras.', icon: '⛏️', category: 'special', rarity: 'common', stackMax: 1, value: 18, tags: ['ferramenta', 'coleta', 'mineração'] },
  { key: 'herbalism_shovel', name: 'Pá de Coleta', description: 'Ferramenta usada para retirar ervas, raízes e plantas do solo.', icon: '🪏', category: 'special', rarity: 'common', stackMax: 1, value: 14, tags: ['ferramenta', 'coleta', 'ervas'] },
];

export function ensureDefaultGatheringTools() {
  for (const seed of TOOLS) {
    if (getItemStudioRecordByKey(seed.key)) continue;
    const record = createItemStudioRecord();
    record.key = seed.key;
    record.name = seed.name;
    record.description = seed.description;
    record.icon = seed.icon;
    record.category = seed.category;
    record.rarity = seed.rarity;
    record.stackMax = seed.stackMax;
    record.value = seed.value;
    record.tags = [...seed.tags];
    record.flags = { tradeable: true, sellable: true, droppable: true, destroyable: true };
    saveItemStudioRecord(record);
  }
}
