import type { MapPaletteEntry, MapPaletteId } from './mapEditorTypes';

export const MAP_PALETTES: Array<{ id: MapPaletteId; label: string; icon: string; description: string }> = [
  { id: 'terrain', label: 'Terreno', icon: '▦', description: 'Pisos, caminhos, água e superfícies.' },
  { id: 'doodad', label: 'Cenário', icon: '🌲', description: 'Árvores, pedras, casas e decoração.' },
  { id: 'npc', label: 'NPCs', icon: '◆', description: 'Personagens e serviços do mundo.' },
  { id: 'monster', label: 'Monstros', icon: '☠', description: 'Criaturas e pontos de spawn.' },
  { id: 'resource', label: 'Recursos', icon: '⛏', description: 'Ervas, minério e madeira coletável.' },
  { id: 'zone', label: 'Zonas', icon: '▣', description: 'Área segura, respawn e regras especiais.' },
  { id: 'portal', label: 'Portais', icon: '⇄', description: 'Entradas, saídas e transições de mapa.' },
  { id: 'raw', label: 'Raw', icon: '◇', description: 'Elementos genéricos e futuros assets.' },
];

export const MAP_PALETTE_ENTRIES: MapPaletteEntry[] = [
  { id: 'grass', palette: 'terrain', label: 'Grama', icon: '▩', color: '#527b45', description: 'Terreno padrão de floresta.', defaultLayer: 'ground', tags: ['verde', 'forest'] },
  { id: 'forest_grass', palette: 'terrain', label: 'Grama escura', icon: '▩', color: '#3f6b3b', description: 'Grama para áreas densas.', defaultLayer: 'ground', tags: ['forest'] },
  { id: 'dirt', palette: 'terrain', label: 'Terra', icon: '▧', color: '#8b6b45', description: 'Solo de terra.', defaultLayer: 'ground' },
  { id: 'road', palette: 'terrain', label: 'Estrada', icon: '▥', color: '#a58458', description: 'Caminho principal.', defaultLayer: 'ground' },
  { id: 'stone', palette: 'terrain', label: 'Pedra', icon: '▦', color: '#7c817a', description: 'Piso de pedra.', defaultLayer: 'ground' },
  { id: 'water', palette: 'terrain', label: 'Água', icon: '≈', color: '#477f93', description: 'Água profunda.', defaultLayer: 'ground' },
  { id: 'sand', palette: 'terrain', label: 'Areia', icon: '░', color: '#c4ad72', description: 'Areia e margens.', defaultLayer: 'ground' },

  { id: 'tree_oak', palette: 'doodad', label: 'Árvore', icon: '🌲', color: '#2f7045', description: 'Árvore de floresta.', defaultLayer: 'objects', objectKind: 'doodad', tags: ['natureza'] },
  { id: 'bush', palette: 'doodad', label: 'Arbusto', icon: '♣', color: '#4f8b49', description: 'Arbusto decorativo.', defaultLayer: 'objects', objectKind: 'doodad' },
  { id: 'rock', palette: 'doodad', label: 'Pedra grande', icon: '●', color: '#767b78', description: 'Rocha de cenário.', defaultLayer: 'objects', objectKind: 'doodad' },
  { id: 'flower', palette: 'doodad', label: 'Flores', icon: '✿', color: '#d983a6', description: 'Grupo de flores.', defaultLayer: 'objects', objectKind: 'doodad' },
  { id: 'house', palette: 'doodad', label: 'Casa', icon: '⌂', color: '#d1b17a', description: 'Casa simples da vila.', defaultLayer: 'objects', objectKind: 'doodad', tags: ['cidade'] },
  { id: 'well', palette: 'doodad', label: 'Poço', icon: '◉', color: '#718d91', description: 'Poço da vila.', defaultLayer: 'objects', objectKind: 'doodad' },
  { id: 'campfire', palette: 'doodad', label: 'Fogueira', icon: '♨', color: '#ef8e45', description: 'Fogueira decorativa.', defaultLayer: 'objects', objectKind: 'doodad' },

  { id: 'elandra', palette: 'npc', label: 'Elandra', icon: '!', color: '#4f78b8', description: 'NPC de missões.', defaultLayer: 'objects', objectKind: 'npc' },
  { id: 'rowan', palette: 'npc', label: 'Rowan', icon: '⚒', color: '#8d6650', description: 'Ferreiro.', defaultLayer: 'objects', objectKind: 'npc' },
  { id: 'mira', palette: 'npc', label: 'Mira', icon: '⚗', color: '#8c67a8', description: 'Alquimista.', defaultLayer: 'objects', objectKind: 'npc' },
  { id: 'theo', palette: 'npc', label: 'Theo', icon: '🪙', color: '#aa8757', description: 'Comerciante.', defaultLayer: 'objects', objectKind: 'npc' },
  { id: 'silas', palette: 'npc', label: 'Silas', icon: '🏦', color: '#547b8f', description: 'Banqueiro.', defaultLayer: 'objects', objectKind: 'npc' },

  { id: 'wolf', palette: 'monster', label: 'Lobo', icon: 'W', color: '#8f8476', description: 'Spawn de Lobo.', defaultLayer: 'objects', objectKind: 'monster' },
  { id: 'sludge', palette: 'monster', label: 'Lodo', icon: 'S', color: '#6d9458', description: 'Spawn de Lodo.', defaultLayer: 'objects', objectKind: 'monster' },

  { id: 'herb', palette: 'resource', label: 'Erva', icon: '✿', color: '#7dbf68', description: 'Recurso coletável: ervas.', defaultLayer: 'objects', objectKind: 'resource' },
  { id: 'iron_vein', palette: 'resource', label: 'Minério', icon: '⛏', color: '#89929a', description: 'Veio de minério.', defaultLayer: 'objects', objectKind: 'resource' },
  { id: 'wood_node', palette: 'resource', label: 'Madeira', icon: '🪵', color: '#8b6340', description: 'Fonte de madeira.', defaultLayer: 'objects', objectKind: 'resource' },

  { id: 'safe_zone', palette: 'zone', label: 'Área segura', icon: '🛡', color: '#79b86a', description: 'Combate bloqueado.', defaultLayer: 'zones', zoneKind: 'safe' },
  { id: 'respawn', palette: 'zone', label: 'Respawn', icon: '✦', color: '#d4f2b6', description: 'Ponto/região de renascimento.', defaultLayer: 'zones', zoneKind: 'respawn' },
  { id: 'pvp_zone', palette: 'zone', label: 'Zona PvP', icon: '⚔', color: '#bc6262', description: 'Região com regra especial de PvP.', defaultLayer: 'zones', zoneKind: 'pvp' },
  { id: 'quest_zone', palette: 'zone', label: 'Zona de Quest', icon: '!', color: '#d7b85c', description: 'Área usada por objetivos de visita.', defaultLayer: 'zones', zoneKind: 'quest' },

  { id: 'portal', palette: 'portal', label: 'Portal', icon: '⇄', color: '#67a7ce', description: 'Transição entre mapas.', defaultLayer: 'objects', objectKind: 'portal' },
  { id: 'waypoint', palette: 'raw', label: 'Waypoint', icon: '⌖', color: '#e1cb72', description: 'Marcador genérico de posição.', defaultLayer: 'objects', objectKind: 'raw' },
];

export function getPaletteEntry(id: string) {
  return MAP_PALETTE_ENTRIES.find((entry) => entry.id === id) ?? MAP_PALETTE_ENTRIES[0];
}
