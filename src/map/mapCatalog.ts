import type { Container } from 'pixi.js';
import type { CharacterProgress } from '../character/characterCreator';
import { CRAFTING_STATIONS } from '../crafting/recipeCatalog';
import { getPaletteEntry } from '../editor/map/mapEditorCatalog';
import { GATHERING_NODES, type GatheringKind } from '../gathering/gatheringCatalog';
import type { Monster } from '../game/monsterSystem';
import type { VillageMerchant } from '../game/villageNpcs';
import { VILLAGES } from '../game/world';
import { getNpcQuestMarker } from '../quests/questEngine';
import { QUEST_INTERACTABLES, QUEST_VISIT_ZONES } from '../quests/worldQuestTargets';
import type { MapFilterKey } from './mapState';
import { getPreparedPublishedWorldRuntime, getPublishedObjectPositions } from './publishedMapRuntime';

export type MapPoi = {
  id: string;
  name: string;
  subtitle: string;
  map: string;
  x: number;
  y: number;
  icon: string;
  filter: MapFilterKey;
  tone?: 'neutral' | 'friendly' | 'quest' | 'resource' | 'danger' | 'service';
};

export type MapCatalogContext = {
  progress: CharacterProgress;
  elandra: Container;
  merchants: VillageMerchant[];
  monsters: Monster[];
};

function merchantPoi(merchant: VillageMerchant, map: string): MapPoi {
  const bank = merchant.id === 'silas';
  const icon = merchant.id === 'rowan' ? '⚒' : merchant.id === 'mira' ? '⚗' : merchant.id === 'theo' ? '🪙' : '🏦';
  return {
    id: `npc:${merchant.id}`,
    name: merchant.name,
    subtitle: merchant.role,
    map,
    x: merchant.npc.x,
    y: merchant.npc.y,
    icon,
    filter: bank ? 'bank' : 'shops',
    tone: 'service',
  };
}

function questPoi(progress: CharacterProgress, npcId: string, name: string, x: number, y: number, map: string): MapPoi | null {
  const marker = getNpcQuestMarker(progress, npcId);
  if (!marker.symbol) return null;
  return {
    id: `quest:${npcId}`,
    name: marker.symbol === '!' ? `Missão disponível · ${name}` : `Missão · ${name}`,
    subtitle: marker.symbol === '!' ? 'Há uma missão disponível neste NPC.' : 'Há uma missão relacionada a este NPC.',
    map,
    x,
    y: y - 58,
    icon: marker.symbol,
    filter: 'quests',
    tone: 'quest',
  };
}

function publishedCraftingPois(mapName: string): MapPoi[] {
  const runtime = getPreparedPublishedWorldRuntime();
  if (!runtime) return CRAFTING_STATIONS.map((station) => ({
    id: `craft:${station.id}`, name: station.name, subtitle: station.hint, map: station.map,
    x: station.x, y: station.y, icon: station.icon, filter: 'crafting' as const, tone: 'service' as const,
  }));

  const positions = {
    forge: getPublishedObjectPositions('anvil_station'),
    alchemy: getPublishedObjectPositions('alchemy_station'),
  };
  const counters = { forge: 0, alchemy: 0 };
  const result: MapPoi[] = [];
  for (const station of CRAFTING_STATIONS) {
    const type = station.type === 'forge' ? 'forge' : 'alchemy';
    const position = positions[type][counters[type]++];
    if (!position) continue;
    result.push({
      id: `craft:${station.id}`, name: station.name, subtitle: station.hint, map: mapName,
      x: position.x, y: position.y, icon: station.icon, filter: 'crafting', tone: 'service',
    });
  }
  return result;
}

function publishedGatheringPois(mapName: string): MapPoi[] {
  const runtime = getPreparedPublishedWorldRuntime();
  if (!runtime) return GATHERING_NODES.map((node) => ({
    id: `resource:${node.id}`, name: node.name, subtitle: node.hint, map: node.map,
    x: node.x, y: node.y, icon: node.icon,
    filter: node.kind === 'mining' ? 'mining' as const : node.kind === 'herbalism' ? 'herbs' as const : 'wood' as const,
    tone: 'resource' as const,
  }));

  const positions: Record<GatheringKind, Array<{ x: number; y: number }>> = {
    mining: getPublishedObjectPositions('iron_vein'),
    herbalism: getPublishedObjectPositions('herb'),
    woodcutting: getPublishedObjectPositions('wood_node'),
  };
  const counters: Record<GatheringKind, number> = { mining: 0, herbalism: 0, woodcutting: 0 };
  const result: MapPoi[] = [];
  for (const node of GATHERING_NODES) {
    const position = positions[node.kind][counters[node.kind]++];
    if (!position) continue;
    const filter: MapFilterKey = node.kind === 'mining' ? 'mining' : node.kind === 'herbalism' ? 'herbs' : 'wood';
    result.push({
      id: `resource:${node.id}`, name: node.name, subtitle: node.hint, map: mapName,
      x: position.x, y: position.y, icon: node.icon, filter, tone: 'resource',
    });
  }
  return result;
}

function publishedWorldPois(mapName: string): MapPoi[] {
  const runtime = getPreparedPublishedWorldRuntime();
  if (!runtime) {
    const result: MapPoi[] = [];
    for (const zone of QUEST_VISIT_ZONES) {
      result.push({ id: `landmark:${zone.id}`, name: zone.name, subtitle: 'Ponto de interesse', map: zone.map, x: zone.x, y: zone.y, icon: '⌖', filter: 'landmarks', tone: 'neutral' });
    }
    for (const target of QUEST_INTERACTABLES) {
      if (target.id === 'respawn-shrine') continue;
      result.push({ id: `landmark:${target.id}`, name: target.name, subtitle: 'Objeto interativo', map: target.map, x: target.x, y: target.y, icon: '✦', filter: 'landmarks', tone: 'neutral' });
    }
    for (const village of VILLAGES) {
      result.push({ id: `respawn:${village.id}`, name: 'Ponto de Renascimento', subtitle: village.name, map: village.map, x: village.respawn.x, y: village.respawn.y, icon: '✦', filter: 'respawn', tone: 'friendly' });
    }
    return result;
  }

  const map = runtime.document;
  const result: MapPoi[] = [];
  for (const zone of map.zones) {
    const x = (zone.x + zone.width / 2) * map.tileSize;
    const y = (zone.y + zone.height / 2) * map.tileSize;
    if (zone.kind === 'respawn') {
      result.push({ id: `respawn:${zone.id}`, name: 'Ponto de Renascimento', subtitle: zone.name || mapName, map: mapName, x, y, icon: '✦', filter: 'respawn', tone: 'friendly' });
    } else if (zone.kind === 'quest' || zone.kind === 'custom') {
      result.push({ id: `landmark:${zone.id}`, name: zone.name || 'Ponto de interesse', subtitle: zone.kind === 'quest' ? 'Área relacionada a missões' : 'Área especial', map: mapName, x, y, icon: '⌖', filter: 'landmarks', tone: zone.kind === 'quest' ? 'quest' : 'neutral' });
    }
  }

  for (const object of map.objects.filter((entry) => entry.kind === 'portal')) {
    const entry = getPaletteEntry(object.assetId);
    result.push({
      id: `portal:${object.id}`,
      name: String(object.properties?.name || entry.label || 'Portal'),
      subtitle: String(object.properties?.destination || 'Passagem para outra área'),
      map: mapName,
      x: (object.x + .5) * map.tileSize,
      y: (object.y + 1) * map.tileSize,
      icon: entry.icon || '⇄',
      filter: 'portals',
      tone: 'service',
    });
  }
  return result;
}

export function getMapPois(context: MapCatalogContext): MapPoi[] {
  const { progress, elandra, merchants, monsters } = context;
  const runtime = getPreparedPublishedWorldRuntime();
  const mapName = runtime?.document.name || progress.map || 'Floresta Inicial';
  const pois: MapPoi[] = [
    {
      id: 'npc:elandra', name: 'Elandra', subtitle: 'Aventureira e guia de missões', map: mapName,
      x: elandra.x, y: elandra.y, icon: '◆', filter: 'npc', tone: 'friendly',
    },
  ];

  const elandraQuest = questPoi(progress, 'elandra', 'Elandra', elandra.x, elandra.y, mapName);
  if (elandraQuest) pois.push(elandraQuest);

  for (const merchant of merchants) {
    pois.push(merchantPoi(merchant, mapName));
    const marker = questPoi(progress, merchant.id, merchant.name, merchant.npc.x, merchant.npc.y, mapName);
    if (marker) pois.push(marker);
  }

  pois.push(...publishedCraftingPois(mapName));
  pois.push(...publishedGatheringPois(mapName));
  pois.push(...publishedWorldPois(mapName));

  for (const monster of monsters) {
    if (!monster.alive) continue;
    pois.push({
      id: `monster:${monster.id}`, name: monster.name, subtitle: 'Monstro hostil', map: mapName,
      x: monster.view.x, y: monster.view.y, icon: monster.kind === 'wolf' ? '◆' : '●', filter: 'monsters', tone: 'danger',
    });
  }

  return pois;
}
