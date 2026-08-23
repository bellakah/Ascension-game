const NPC_STORAGE_KEY = 'ascension.npc.definitions.v1';
const MONSTER_STORAGE_KEY = 'ascension.monster.definitions.v1';
const MIGRATION_KEY = 'ascension.studio.legacy-content-imported.v2';

type DefinitionFile = { version: 1; definitions: any[] };

function readFile(key: string): DefinitionFile {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '') as Partial<DefinitionFile>;
    return { version: 1, definitions: Array.isArray(parsed.definitions) ? parsed.definitions : [] };
  } catch {
    return { version: 1, definitions: [] };
  }
}

function legacyNpc(id: string, name: string, title: string, role: string, assetId: string) {
  const now = Date.now();
  return {
    version: 1,
    id: `legacy-${id}`,
    name,
    title,
    role,
    category: 'Conteúdo original',
    tags: ['legado', 'original', id],
    notes: 'NPC original do projeto importado automaticamente para o NPC Studio.',
    appearance: {
      fallbackAssetId: assetId,
      idle: { south: assetId },
      walk: { south: assetId },
      scale: 1,
      showShadow: true,
    },
    interaction: {
      enabled: true,
      radiusTiles: 1.6,
      facePlayer: true,
      blockPlayer: true,
      prompt: role === 'merchant' ? 'Comprar' : 'Conversar',
    },
    dialogue: {
      enabled: true,
      startNodeId: 'start',
      nodes: [{ id: 'start', text: `Olá, eu sou ${name}.`, choices: [{ id: `legacy-choice-${id}`, text: 'Até logo.', action: 'close' }] }],
    },
    shop: {
      enabled: role === 'merchant',
      currencyId: 'coins',
      buyMultiplier: 1,
      sellMultiplier: .5,
      items: [],
    },
    quests: { offers: [], completes: [] },
    behavior: {
      mode: 'stationary',
      walkSpeed: 1.25,
      runSpeed: 2.4,
      randomRadius: 4,
      defaultWaitMs: 900,
    },
    schedule: [],
    createdAt: now,
    updatedAt: now,
  };
}

function legacyMonster(
  id: string,
  name: string,
  title: string,
  assetId: string,
  stats: { maxHp: number; attack: number; moveSpeed: number; expReward: number; coinReward: number; respawnMs: number },
  drops: Array<{ itemId: string; chance: number; min: number; max: number }>,
) {
  const now = Date.now();
  return {
    version: 1,
    id: `legacy-${id}`,
    name,
    title,
    category: 'Conteúdo original',
    rank: 'normal',
    level: id === 'wolf' ? 3 : 2,
    tags: ['legado', 'original', id],
    notes: 'Monstro original do projeto importado automaticamente para o Monster Studio.',
    appearance: {
      fallbackAssetId: assetId,
      idle: { south: assetId },
      walk: { south: assetId },
      attack: {},
      hurt: {},
      death: {},
      scale: 1,
      showShadow: true,
    },
    stats: {
      maxHp: stats.maxHp,
      attack: stats.attack,
      defense: 0,
      moveSpeed: stats.moveSpeed,
      attackRange: id === 'wolf' ? 2.2 : 1.9,
      attackCooldownMs: id === 'wolf' ? 970 : 1160,
      expReward: stats.expReward,
      coinReward: stats.coinReward,
    },
    ai: {
      temperament: 'aggressive',
      aggroRadius: id === 'wolf' ? 11 : 9.5,
      leashRadius: 15,
      wanderRadius: 3,
      respawnMs: stats.respawnMs,
      idleMinMs: 800,
      idleMaxMs: 2200,
    },
    drops,
    skills: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function ensureLegacyStudioDefinitions() {
  if (localStorage.getItem(MIGRATION_KEY) === '1') return;

  const npcFile = readFile(NPC_STORAGE_KEY);
  const npcSeeds = [
    legacyNpc('elandra', 'Elandra', 'Guia de missões', 'quest', 'elandra'),
    legacyNpc('rowan', 'Rowan', 'Ferreiro', 'merchant', 'rowan'),
    legacyNpc('mira', 'Mira', 'Alquimista', 'merchant', 'mira'),
    legacyNpc('silas', 'Silas', 'Banqueiro', 'merchant', 'silas'),
    legacyNpc('theo', 'Theo', 'Comerciante', 'merchant', 'theo'),
  ];
  const npcIds = new Set(npcFile.definitions.map((entry) => entry?.id));
  for (const seed of npcSeeds) if (!npcIds.has(seed.id)) npcFile.definitions.push(seed);

  const monsterFile = readFile(MONSTER_STORAGE_KEY);
  const monsterSeeds = [
    legacyMonster('wolf', 'Lobo Sombrio', 'Predador da floresta', 'wolf', {
      maxHp: 90, attack: 12, moveSpeed: 2.05, expReward: 25, coinReward: 3, respawnMs: 7000,
    }, [
      { itemId: 'wolf_pelt', chance: 1, min: 1, max: 1 },
      { itemId: 'wolf_fang', chance: .46, min: 1, max: 1 },
      { itemId: 'small_health_potion', chance: .18, min: 1, max: 1 },
      { itemId: 'iron_sword', chance: .07, min: 1, max: 1 },
    ]),
    legacyMonster('sludge', 'Lodo Tóxico', 'Criatura contaminada', 'sludge', {
      maxHp: 70, attack: 9, moveSpeed: 1.55, expReward: 18, coinReward: 2, respawnMs: 6500,
    }, [
      { itemId: 'toxic_sludge', chance: 1, min: 1, max: 1 },
      { itemId: 'sludge_core', chance: .36, min: 1, max: 1 },
      { itemId: 'small_health_potion', chance: .2, min: 1, max: 1 },
    ]),
  ];
  const monsterIds = new Set(monsterFile.definitions.map((entry) => entry?.id));
  for (const seed of monsterSeeds) if (!monsterIds.has(seed.id)) monsterFile.definitions.push(seed);

  localStorage.setItem(NPC_STORAGE_KEY, JSON.stringify(npcFile));
  localStorage.setItem(MONSTER_STORAGE_KEY, JSON.stringify(monsterFile));
  localStorage.setItem(MIGRATION_KEY, '1');
}
