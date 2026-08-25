import { loadMissionRuntimeCatalog } from './missionStudioStore';
import type { QuestDefinition } from './questTypes';

const LEGACY_QUEST_CATALOG: QuestDefinition[] = [
  {
    id: 'forest.wolves.v2', title: 'Ameaça na trilha', summary: 'Elandra precisa reduzir a quantidade de Lobos Sombrios perto da estrada.', category: 'story', startNpcId: 'elandra', endNpcId: 'elandra', mode: 'parallel', sortOrder: 10,
    objectives: [{ id: 'kill-wolves', type: 'kill', label: 'Derrote Lobos Sombrios', monsterKind: 'wolf', amount: 3, navigation: { enabled: true, targetType: 'monster', targetId: 'wolf' } }], rewards: { exp: 60, coins: 30 },
    dialog: { offer: 'Os lobos estão se aproximando demais da trilha. Pode afastá-los?', accepted: 'Derrote 3 Lobos Sombrios e volte para mim.', progress: 'A trilha ainda não está segura.', ready: 'Ótimo trabalho. A estrada já está mais tranquila.', completed: 'Você provou que sabe se defender na floresta.' },
  },
  {
    id: 'forest.sludge.v1', title: 'Lodo tóxico', summary: 'Os Lodos Tóxicos estão contaminando a floresta.', category: 'story', startNpcId: 'elandra', endNpcId: 'elandra', mode: 'parallel', sortOrder: 20,
    requirements: { completedQuests: ['forest.wolves.v2'] }, objectives: [{ id: 'kill-sludge', type: 'kill', label: 'Derrote Lodos Tóxicos', monsterKind: 'sludge', amount: 4, navigation: { enabled: true, targetType: 'monster', targetId: 'sludge' } }], rewards: { exp: 100, coins: 45 },
    dialog: { offer: 'Agora temos outro problema. Lodos Tóxicos estão surgindo perto das árvores.', accepted: 'Elimine 4 Lodos Tóxicos.', progress: 'Ainda consigo sentir o cheiro do lodo na floresta.', ready: 'Excelente. Isso deve conter a contaminação por algum tempo.' },
  },
  {
    id: 'forest.cleanup.v1', title: 'Limpeza da floresta', summary: 'Uma última patrulha para estabilizar a região ao redor da Clareira.', category: 'story', startNpcId: 'elandra', endNpcId: 'elandra', mode: 'parallel', sortOrder: 30,
    requirements: { completedQuests: ['forest.sludge.v1'] }, objectives: [{ id: 'kill-any', type: 'kill', label: 'Derrote monstros na floresta', monsterKind: 'any', amount: 5 }], rewards: { exp: 150, coins: 70, items: [{ itemId: 'medium_health_potion', quantity: 2 }] },
    dialog: { offer: 'Faça uma patrulha completa antes de seguirmos para regiões mais perigosas.', accepted: 'Derrote 5 monstros de qualquer tipo.', ready: 'A Clareira está finalmente respirando melhor.' },
  },
  {
    id: 'village.supplies.v1', title: 'Suprimentos para a vila', summary: 'Theo quer materiais da floresta para reabastecer os estoques da Vila da Clareira.', category: 'side', startNpcId: 'theo', endNpcId: 'theo', mode: 'parallel', sortOrder: 40,
    requirements: { completedQuests: ['forest.wolves.v2'] }, objectives: [{ id: 'deliver-pelts', type: 'deliver', label: 'Entregue Peles de Lobo a Theo', itemId: 'wolf_pelt', npcId: 'theo', amount: 3, navigation: { enabled: true, targetType: 'npc', targetId: 'theo' } }, { id: 'deliver-sludge', type: 'deliver', label: 'Entregue Gosmas Tóxicas a Theo', itemId: 'toxic_sludge', npcId: 'theo', amount: 2, navigation: { enabled: true, targetType: 'npc', targetId: 'theo' } }],
    rewards: { exp: 90, coins: 85, items: [{ itemId: 'small_health_potion', quantity: 3 }] }, dialog: { offer: 'Se trouxer materiais da floresta, consigo manter os estoques da vila cheios.', accepted: 'Preciso de 3 Peles de Lobo e 2 Gosmas Tóxicas.', progress: 'Ainda faltam alguns materiais para fechar o lote.', ready: 'Perfeito. Isso vai ajudar bastante o comércio local.' },
  },
  {
    id: 'village.arcane-route.v1', title: 'Os pontos de energia', summary: 'Mira quer que você reconheça três pontos importantes da Vila da Clareira.', category: 'tutorial', startNpcId: 'mira', endNpcId: 'mira', mode: 'sequential', sortOrder: 50,
    requirements: { completedQuests: ['forest.sludge.v1'] }, objectives: [{ id: 'talk-theo', type: 'talk', label: 'Fale com Theo', npcId: 'theo', amount: 1, navigation: { enabled: true, targetType: 'npc', targetId: 'theo' } }, { id: 'visit-well', type: 'visit', label: 'Visite o poço da Vila da Clareira', target: 'village-well', amount: 1, navigation: { enabled: true, targetType: 'marker', targetId: 'village-well' } }, { id: 'touch-shrine', type: 'interact', label: 'Interaja com o Santuário de Renascimento', target: 'respawn-shrine', amount: 1, navigation: { enabled: true, targetType: 'marker', targetId: 'respawn-shrine' } }],
    rewards: { exp: 120, coins: 55, items: [{ itemId: 'medium_health_potion', quantity: 2 }] }, dialog: { offer: 'Quero que aprenda a reconhecer os pontos de energia e apoio da vila.', accepted: 'Siga as etapas na ordem indicada no seu Diário de Missões.', progress: 'A energia da Clareira se revela para quem observa cada ponto com atenção.', ready: 'Muito bem. Agora você conhece melhor a vila.' },
  },
  {
    id: 'profession.forge.v1', title: 'Ferro da Clareira', summary: 'Rowan quer ensinar o básico de mineração, refino e forja.', category: 'tutorial', startNpcId: 'rowan', endNpcId: 'rowan', mode: 'sequential', sortOrder: 60,
    requirements: { completedQuests: ['forest.wolves.v2'] }, objectives: [{ id: 'gather-iron', type: 'gather', label: 'Minere Veios de Ferro 2 vezes', itemId: 'iron_ore', amount: 2, navigation: { enabled: true, targetType: 'resource', targetId: 'iron_ore' } }, { id: 'craft-ingot', type: 'craft', label: 'Refine 1 Lingote de Ferro', target: 'refine-iron-ingot', itemId: 'iron_ingot', amount: 1 }],
    rewards: { exp: 130, coins: 75, items: [{ itemId: 'iron_ore', quantity: 3 }, { itemId: 'refinement_stone', quantity: 6 }, { itemId: 'ruby_shard', quantity: 1 }] },
    dialog: { offer: 'Uma boa arma começa muito antes da bigorna. Aprenda a reconhecer o minério e refinar o metal.', accepted: 'Minere dois veios de ferro e depois use a Forja da Clareira para criar um lingote.', progress: 'Minério, fogo e paciência. Essa é a base de todo ferreiro.', ready: 'Agora você já entende o primeiro ciclo da forja. Use estas pedras para testar o aprimoramento.' },
  },
  {
    id: 'profession.alchemy.v1', title: 'Ervas e frascos', summary: 'Mira ensina como transformar plantas coletadas em poções.', category: 'tutorial', startNpcId: 'mira', endNpcId: 'mira', mode: 'sequential', sortOrder: 70,
    requirements: { completedQuests: ['village.arcane-route.v1'] }, objectives: [{ id: 'gather-herbs', type: 'gather', label: 'Colete Ervas-da-Clareira 2 vezes', itemId: 'healing_herb', amount: 2, navigation: { enabled: true, targetType: 'resource', targetId: 'healing_herb' } }, { id: 'craft-potion', type: 'craft', label: 'Prepare 1 Poção Pequena de Vida', target: 'alchemy-small-potion', itemId: 'small_health_potion', amount: 1 }],
    rewards: { exp: 120, coins: 60, items: [{ itemId: 'healing_herb', quantity: 2 }, { itemId: 'sapphire_shard', quantity: 1 }, { itemId: 'citrine_shard', quantity: 1 }] },
    dialog: { offer: 'A floresta oferece remédios para quem sabe reconhecê-los.', accepted: 'Colete ervas e use a Bancada de Alquimia para preparar uma poção.', progress: 'Observe as plantas pequenas; elas têm um marcador suave quando você se aproxima.', ready: 'Muito bem. Essas pedras também podem reforçar seus equipamentos na forja.' },
  },
];

export const QUEST_CATALOG: QuestDefinition[] = loadMissionRuntimeCatalog(LEGACY_QUEST_CATALOG);
export const QUEST_BY_ID = Object.fromEntries(QUEST_CATALOG.map((quest) => [quest.id, quest])) as Record<string, QuestDefinition>;
export function getQuestDefinition(questId: string) { return QUEST_BY_ID[questId]; }
