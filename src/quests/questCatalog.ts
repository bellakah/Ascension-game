import type { QuestDefinition } from './questTypes';

export const QUEST_CATALOG: QuestDefinition[] = [
  {
    id: 'forest.wolves.v2',
    title: 'Ameaça na trilha',
    summary: 'Elandra precisa reduzir a quantidade de Lobos Sombrios perto da estrada.',
    category: 'story',
    startNpcId: 'elandra',
    endNpcId: 'elandra',
    mode: 'parallel',
    sortOrder: 10,
    objectives: [
      { id: 'kill-wolves', type: 'kill', label: 'Derrote Lobos Sombrios', monsterKind: 'wolf', amount: 3 },
    ],
    rewards: { exp: 60, coins: 30 },
    dialog: {
      offer: 'Os lobos estão se aproximando demais da trilha. Pode afastá-los?',
      accepted: 'Derrote 3 Lobos Sombrios e volte para mim.',
      progress: 'A trilha ainda não está segura.',
      ready: 'Ótimo trabalho. A estrada já está mais tranquila.',
      completed: 'Você provou que sabe se defender na floresta.',
    },
  },
  {
    id: 'forest.sludge.v1',
    title: 'Lodo tóxico',
    summary: 'Os Lodos Tóxicos estão contaminando a floresta.',
    category: 'story',
    startNpcId: 'elandra',
    endNpcId: 'elandra',
    mode: 'parallel',
    sortOrder: 20,
    requirements: { completedQuests: ['forest.wolves.v2'] },
    objectives: [
      { id: 'kill-sludge', type: 'kill', label: 'Derrote Lodos Tóxicos', monsterKind: 'sludge', amount: 4 },
    ],
    rewards: { exp: 100, coins: 45 },
    dialog: {
      offer: 'Agora temos outro problema. Lodos Tóxicos estão surgindo perto das árvores.',
      accepted: 'Elimine 4 Lodos Tóxicos.',
      progress: 'Ainda consigo sentir o cheiro do lodo na floresta.',
      ready: 'Excelente. Isso deve conter a contaminação por algum tempo.',
    },
  },
  {
    id: 'forest.cleanup.v1',
    title: 'Limpeza da floresta',
    summary: 'Uma última patrulha para estabilizar a região ao redor da Clareira.',
    category: 'story',
    startNpcId: 'elandra',
    endNpcId: 'elandra',
    mode: 'parallel',
    sortOrder: 30,
    requirements: { completedQuests: ['forest.sludge.v1'] },
    objectives: [
      { id: 'kill-any', type: 'kill', label: 'Derrote monstros na floresta', monsterKind: 'any', amount: 5 },
    ],
    rewards: { exp: 150, coins: 70, items: [{ itemId: 'medium_health_potion', quantity: 2 }] },
    dialog: {
      offer: 'Faça uma patrulha completa antes de seguirmos para regiões mais perigosas.',
      accepted: 'Derrote 5 monstros de qualquer tipo.',
      ready: 'A Clareira está finalmente respirando melhor.',
    },
  },
  {
    id: 'village.supplies.v1',
    title: 'Suprimentos para a vila',
    summary: 'Theo quer materiais da floresta para reabastecer os estoques da Vila da Clareira.',
    category: 'side',
    startNpcId: 'theo',
    endNpcId: 'theo',
    mode: 'parallel',
    sortOrder: 40,
    requirements: { completedQuests: ['forest.wolves.v2'] },
    objectives: [
      { id: 'deliver-pelts', type: 'deliver', label: 'Entregue Peles de Lobo a Theo', itemId: 'wolf_pelt', npcId: 'theo', amount: 3 },
      { id: 'deliver-sludge', type: 'deliver', label: 'Entregue Gosmas Tóxicas a Theo', itemId: 'toxic_sludge', npcId: 'theo', amount: 2 },
    ],
    rewards: { exp: 90, coins: 85, items: [{ itemId: 'small_health_potion', quantity: 3 }] },
    dialog: {
      offer: 'Se trouxer materiais da floresta, consigo manter os estoques da vila cheios.',
      accepted: 'Preciso de 3 Peles de Lobo e 2 Gosmas Tóxicas.',
      progress: 'Ainda faltam alguns materiais para fechar o lote.',
      ready: 'Perfeito. Isso vai ajudar bastante o comércio local.',
    },
  },
  {
    id: 'village.arcane-route.v1',
    title: 'Os pontos de energia',
    summary: 'Mira quer que você reconheça três pontos importantes da Vila da Clareira.',
    category: 'tutorial',
    startNpcId: 'mira',
    endNpcId: 'mira',
    mode: 'sequential',
    sortOrder: 50,
    requirements: { completedQuests: ['forest.sludge.v1'] },
    objectives: [
      { id: 'talk-theo', type: 'talk', label: 'Fale com Theo', npcId: 'theo', amount: 1 },
      { id: 'visit-well', type: 'visit', label: 'Visite o poço da Vila da Clareira', target: 'village-well', amount: 1 },
      { id: 'touch-shrine', type: 'interact', label: 'Interaja com o Santuário de Renascimento', target: 'respawn-shrine', amount: 1 },
    ],
    rewards: { exp: 120, coins: 55, items: [{ itemId: 'medium_health_potion', quantity: 2 }] },
    dialog: {
      offer: 'Quero que aprenda a reconhecer os pontos de energia e apoio da vila.',
      accepted: 'Siga as etapas na ordem indicada no seu Diário de Missões.',
      progress: 'A energia da Clareira se revela para quem observa cada ponto com atenção.',
      ready: 'Muito bem. Agora você conhece melhor a vila.',
    },
  },
];

export const QUEST_BY_ID = Object.fromEntries(QUEST_CATALOG.map((quest) => [quest.id, quest])) as Record<string, QuestDefinition>;

export function getQuestDefinition(questId: string) {
  return QUEST_BY_ID[questId];
}
