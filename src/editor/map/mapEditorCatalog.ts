import { PIXEL_CRAWLER_ASSETS } from './pixelCrawlerPack';
import type { MapObject, MapPaletteEntry, MapPaletteId } from './mapEditorTypes';

const CUSTOM_ASSET_KEY = 'ascension.map-editor.custom-assets.v1';

type StoredCustomAsset = {
  id: string;
  label: string;
  dataUrl: string;
  palette: MapPaletteId;
  objectKind: MapObject['kind'];
  widthTiles: number;
  heightTiles: number;
};

export const MAP_PALETTES: Array<{ id: MapPaletteId; label: string; icon: string; description: string }> = [
  { id: 'terrain', label: 'Terreno', icon: '▦', description: 'Pisos, caminhos, água e superfícies.' },
  { id: 'doodad', label: 'Cenário', icon: '🌲', description: 'Árvores, pedras, casas e decoração.' },
  { id: 'npc', label: 'NPCs', icon: '◆', description: 'Personagens e serviços do mundo.' },
  { id: 'monster', label: 'Monstros', icon: '☠', description: 'Criaturas e pontos de spawn.' },
  { id: 'resource', label: 'Recursos', icon: '⛏', description: 'Ervas, minério e madeira coletável.' },
  { id: 'zone', label: 'Zonas', icon: '▣', description: 'Área segura, respawn e regras especiais.' },
  { id: 'portal', label: 'Portais', icon: '⇄', description: 'Entradas, saídas e transições de mapa.' },
  { id: 'raw', label: 'Raw', icon: '◇', description: 'Assets importados e elementos genéricos.' },
];

const BASE_ENTRIES: MapPaletteEntry[] = [
  { id: 'grass', palette: 'terrain', label: 'Grama Pixel Crawler', icon: '▩', color: '#327603', description: 'Tile 16px ampliado com nearest-neighbor.', defaultLayer: 'ground', tags: ['verde', 'forest', 'pixel crawler'], source: 'pixel-crawler', sprite: { src: PIXEL_CRAWLER_ASSETS.pc_grass, nativeWidth: 16, nativeHeight: 16, pixelated: true } },
  { id: 'forest_grass', palette: 'terrain', label: 'Grama escura', icon: '▩', color: '#3f6b3b', description: 'Grama alternativa para áreas densas.', defaultLayer: 'ground', tags: ['forest'], source: 'ascension' },
  { id: 'dirt', palette: 'terrain', label: 'Terra Pixel Crawler', icon: '▧', color: '#9d6a3d', description: 'Solo de terra do pack.', defaultLayer: 'ground', tags: ['pixel crawler'], source: 'pixel-crawler', sprite: { src: PIXEL_CRAWLER_ASSETS.pc_dirt, nativeWidth: 16, nativeHeight: 16, pixelated: true } },
  { id: 'road', palette: 'terrain', label: 'Estrada', icon: '▥', color: '#a58458', description: 'Caminho principal do protótipo.', defaultLayer: 'ground', source: 'ascension' },
  { id: 'stone', palette: 'terrain', label: 'Pedra Pixel Crawler', icon: '▦', color: '#756b5f', description: 'Piso de pedra do pack.', defaultLayer: 'ground', tags: ['pixel crawler'], source: 'pixel-crawler', sprite: { src: PIXEL_CRAWLER_ASSETS.pc_stone, nativeWidth: 16, nativeHeight: 16, pixelated: true } },
  { id: 'water', palette: 'terrain', label: 'Água Pixel Crawler', icon: '≈', color: '#3e91d0', description: 'Tile de água do pack.', defaultLayer: 'ground', tags: ['pixel crawler'], source: 'pixel-crawler', sprite: { src: PIXEL_CRAWLER_ASSETS.pc_water, nativeWidth: 16, nativeHeight: 16, pixelated: true } },
  { id: 'sand', palette: 'terrain', label: 'Areia', icon: '░', color: '#c4ad72', description: 'Areia e margens.', defaultLayer: 'ground', source: 'ascension' },

  { id: 'tree_oak', palette: 'doodad', label: 'Árvore Pixel Crawler', icon: '🌲', color: '#2f7045', description: 'Árvore multi-tile com pivot na base.', defaultLayer: 'objects', objectKind: 'doodad', tags: ['natureza', 'pixel crawler'], source: 'pixel-crawler', sprite: { src: PIXEL_CRAWLER_ASSETS.pc_tree, nativeWidth: 45, nativeHeight: 47, widthTiles: 1.5, heightTiles: 1.6, anchorX: .5, anchorY: 1, pixelated: true }, footprint: { width: 1, height: 1, collision: [{ x: 0, y: 0 }] } },
  { id: 'bush', palette: 'doodad', label: 'Arbusto Pixel Crawler', icon: '♣', color: '#4f8b49', description: 'Arbusto real do pack.', defaultLayer: 'objects', objectKind: 'doodad', tags: ['pixel crawler'], source: 'pixel-crawler', sprite: { src: PIXEL_CRAWLER_ASSETS.pc_bush, nativeWidth: 29, nativeHeight: 27, widthTiles: 1, heightTiles: 1, anchorX: .5, anchorY: 1, pixelated: true } },
  { id: 'rock', palette: 'doodad', label: 'Pedra grande', icon: '●', color: '#767b78', description: 'Rocha de cenário.', defaultLayer: 'objects', objectKind: 'doodad', source: 'ascension' },
  { id: 'flower', palette: 'doodad', label: 'Flores', icon: '✿', color: '#d983a6', description: 'Grupo de flores.', defaultLayer: 'objects', objectKind: 'doodad', source: 'ascension' },
  { id: 'house', palette: 'doodad', label: 'Casa', icon: '⌂', color: '#d1b17a', description: 'Casa simples da vila.', defaultLayer: 'objects', objectKind: 'doodad', tags: ['cidade'], source: 'ascension', footprint: { width: 3, height: 2, collision: [{ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }] } },
  { id: 'well', palette: 'doodad', label: 'Poço', icon: '◉', color: '#718d91', description: 'Poço da vila.', defaultLayer: 'objects', objectKind: 'doodad', source: 'ascension' },
  { id: 'campfire', palette: 'doodad', label: 'Fogueira Pixel Crawler', icon: '♨', color: '#ef8e45', description: 'Base de fogueira do pack.', defaultLayer: 'objects', objectKind: 'doodad', tags: ['pixel crawler'], source: 'pixel-crawler', sprite: { src: PIXEL_CRAWLER_ASSETS.pc_bonfire, nativeWidth: 28, nativeHeight: 11, widthTiles: 1, heightTiles: .5, anchorX: .5, anchorY: 1, pixelated: true } },
  { id: 'anvil_station', palette: 'doodad', label: 'Forja Pixel Crawler', icon: '⚒', color: '#8d6650', description: 'Estação de ferreiro real do pack.', defaultLayer: 'objects', objectKind: 'doodad', tags: ['craft', 'pixel crawler'], source: 'pixel-crawler', sprite: { src: PIXEL_CRAWLER_ASSETS.pc_anvil, nativeWidth: 53, nativeHeight: 34, widthTiles: 2, heightTiles: 1.3, anchorX: .5, anchorY: 1, pixelated: true }, footprint: { width: 2, height: 1, collision: [{ x: 0, y: 0 }] } },
  { id: 'alchemy_station', palette: 'doodad', label: 'Alquimia Pixel Crawler', icon: '⚗', color: '#8c67a8', description: 'Mesa de alquimia do pack.', defaultLayer: 'objects', objectKind: 'doodad', tags: ['craft', 'pixel crawler'], source: 'pixel-crawler', sprite: { src: PIXEL_CRAWLER_ASSETS.pc_alchemy, nativeWidth: 80, nativeHeight: 72, widthTiles: 2.5, heightTiles: 2.25, anchorX: .5, anchorY: 1, pixelated: true }, footprint: { width: 2, height: 1, collision: [{ x: 0, y: 0 }, { x: 1, y: 0 }] } },

  { id: 'elandra', palette: 'npc', label: 'Elandra', icon: '!', color: '#4f78b8', description: 'NPC de missões.', defaultLayer: 'objects', objectKind: 'npc', source: 'ascension' },
  { id: 'rowan', palette: 'npc', label: 'Rowan', icon: '⚒', color: '#8d6650', description: 'Ferreiro.', defaultLayer: 'objects', objectKind: 'npc', source: 'ascension' },
  { id: 'mira', palette: 'npc', label: 'Mira', icon: '⚗', color: '#8c67a8', description: 'Alquimista.', defaultLayer: 'objects', objectKind: 'npc', source: 'ascension' },
  { id: 'theo', palette: 'npc', label: 'Theo', icon: '🪙', color: '#aa8757', description: 'Comerciante.', defaultLayer: 'objects', objectKind: 'npc', source: 'ascension' },
  { id: 'silas', palette: 'npc', label: 'Silas', icon: '🏦', color: '#547b8f', description: 'Banqueiro.', defaultLayer: 'objects', objectKind: 'npc', source: 'ascension' },
  { id: 'pc_knight_npc', palette: 'npc', label: 'Cavaleiro Pixel Crawler', icon: '♞', color: '#60778b', description: 'NPC de demonstração usando sprite real.', defaultLayer: 'objects', objectKind: 'npc', tags: ['pixel crawler'], source: 'pixel-crawler', sprite: { src: PIXEL_CRAWLER_ASSETS.pc_knight, nativeWidth: 19, nativeHeight: 29, widthTiles: .8, heightTiles: 1, anchorX: .5, anchorY: 1, pixelated: true } },

  { id: 'wolf', palette: 'monster', label: 'Lobo', icon: 'W', color: '#8f8476', description: 'Spawn de Lobo.', defaultLayer: 'objects', objectKind: 'monster', source: 'ascension' },
  { id: 'sludge', palette: 'monster', label: 'Lodo', icon: 'S', color: '#6d9458', description: 'Spawn de Lodo.', defaultLayer: 'objects', objectKind: 'monster', source: 'ascension' },
  { id: 'pc_orc', palette: 'monster', label: 'Orc Pixel Crawler', icon: 'O', color: '#668a55', description: 'Monstro de demonstração usando sprite real.', defaultLayer: 'objects', objectKind: 'monster', tags: ['pixel crawler'], source: 'pixel-crawler', sprite: { src: PIXEL_CRAWLER_ASSETS.pc_orc, nativeWidth: 20, nativeHeight: 30, widthTiles: .8, heightTiles: 1, anchorX: .5, anchorY: 1, pixelated: true } },

  { id: 'herb', palette: 'resource', label: 'Erva', icon: '✿', color: '#7dbf68', description: 'Recurso coletável: ervas.', defaultLayer: 'objects', objectKind: 'resource', source: 'ascension' },
  { id: 'iron_vein', palette: 'resource', label: 'Minério', icon: '⛏', color: '#89929a', description: 'Veio de minério.', defaultLayer: 'objects', objectKind: 'resource', source: 'ascension' },
  { id: 'wood_node', palette: 'resource', label: 'Madeira', icon: '🪵', color: '#8b6340', description: 'Fonte de madeira.', defaultLayer: 'objects', objectKind: 'resource', source: 'ascension' },

  { id: 'safe_zone', palette: 'zone', label: 'Área segura', icon: '🛡', color: '#79b86a', description: 'Combate bloqueado.', defaultLayer: 'zones', zoneKind: 'safe', source: 'ascension' },
  { id: 'respawn', palette: 'zone', label: 'Respawn', icon: '✦', color: '#d4f2b6', description: 'Ponto/região de renascimento.', defaultLayer: 'zones', zoneKind: 'respawn', source: 'ascension' },
  { id: 'pvp_zone', palette: 'zone', label: 'Zona PvP', icon: '⚔', color: '#bc6262', description: 'Região com regra especial de PvP.', defaultLayer: 'zones', zoneKind: 'pvp', source: 'ascension' },
  { id: 'quest_zone', palette: 'zone', label: 'Zona de Quest', icon: '!', color: '#d7b85c', description: 'Área usada por objetivos de visita.', defaultLayer: 'zones', zoneKind: 'quest', source: 'ascension' },

  { id: 'portal', palette: 'portal', label: 'Portal', icon: '⇄', color: '#67a7ce', description: 'Transição entre mapas.', defaultLayer: 'objects', objectKind: 'portal', source: 'ascension' },
  { id: 'waypoint', palette: 'raw', label: 'Waypoint', icon: '⌖', color: '#e1cb72', description: 'Marcador genérico de posição.', defaultLayer: 'objects', objectKind: 'raw', source: 'ascension' },
];

function loadCustomAssets(): StoredCustomAsset[] {
  try {
    const value = JSON.parse(localStorage.getItem(CUSTOM_ASSET_KEY) ?? '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function customToEntry(value: StoredCustomAsset): MapPaletteEntry {
  return {
    id: value.id,
    palette: value.palette,
    label: value.label,
    icon: '◇',
    color: '#687b8a',
    description: 'Asset PNG importado localmente.',
    defaultLayer: 'objects',
    objectKind: value.objectKind,
    source: 'custom',
    tags: ['custom', 'importado'],
    sprite: { src: value.dataUrl, nativeWidth: 32, nativeHeight: 32, widthTiles: value.widthTiles, heightTiles: value.heightTiles, anchorX: .5, anchorY: 1, pixelated: true },
    footprint: { width: Math.max(1, Math.ceil(value.widthTiles)), height: Math.max(1, Math.ceil(value.heightTiles)) },
  };
}

export const MAP_PALETTE_ENTRIES: MapPaletteEntry[] = [...BASE_ENTRIES, ...loadCustomAssets().map(customToEntry)];

export function getPaletteEntry(id: string) {
  return MAP_PALETTE_ENTRIES.find((value) => value.id === id) ?? MAP_PALETTE_ENTRIES[0];
}

export function registerCustomMapAsset(input: Omit<StoredCustomAsset, 'id'>) {
  const value: StoredCustomAsset = { ...input, id: `custom-${Date.now()}-${Math.random().toString(36).slice(2)}` };
  const stored = loadCustomAssets();
  stored.push(value);
  localStorage.setItem(CUSTOM_ASSET_KEY, JSON.stringify(stored));
  const entry = customToEntry(value);
  MAP_PALETTE_ENTRIES.push(entry);
  return entry;
}
