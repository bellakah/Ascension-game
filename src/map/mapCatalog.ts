import type { Container } from 'pixi.js';
import type { CharacterProgress } from '../character/characterCreator';
import { CRAFTING_STATIONS } from '../crafting/recipeCatalog';
import { GATHERING_NODES } from '../gathering/gatheringCatalog';
import type { Monster } from '../game/monsterSystem';
import type { VillageMerchant } from '../game/villageNpcs';
import { VILLAGES } from '../game/world';
import { getNpcQuestMarker } from '../quests/questEngine';
import { QUEST_INTERACTABLES, QUEST_VISIT_ZONES } from '../quests/worldQuestTargets';
import type { MapFilterKey } from './mapState';

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

function merchantPoi(merchant: VillageMerchant): MapPoi {
  const bank = merchant.id === 'silas';
  const icon = merchant.id === 'rowan' ? '⚒' : merchant.id === 'mira' ? '⚗' : merchant.id === 'theo' ? '🪙' : '🏦';
  return {
    id: `npc:${merchant.id}`,
    name: merchant.name,
    subtitle: merchant.role,
    map: 'Floresta Inicial',
    x: merchant.npc.x,
    y: merchant.npc.y,
    icon,
    filter: bank ? 'bank' : 'shops',
    tone: 'service',
  };
}

function questPoi(progress: CharacterProgress, npcId: string, name: string, x: number, y: number): MapPoi | null {
  const marker = getNpcQuestMarker(progress, npcId);
  if (!marker.symbol) return null;
  return {
    id: `quest:${npcId}`,
    name: marker.symbol === '!' ? `Missão disponível · ${name}` : `Missão · ${name}`,
    subtitle: marker.symbol === '!' ? 'Há uma missão disponível neste NPC.' : 'Há uma missão relacionada a este NPC.',
    map: 'Floresta Inicial',
    x,
    y: y - 58,
    icon: marker.symbol,
    filter: 'quests',
    tone: 'quest',
  };
}

export function getMapPois(context: MapCatalogContext): MapPoi[] {
  const { progress, elandra, merchants, monsters } = context;
  const pois: MapPoi[] = [
    {
      id: 'npc:elandra', name: 'Elandra', subtitle: 'Aventureira e guia de missões', map: 'Floresta Inicial',
      x: elandra.x, y: elandra.y, icon: '◆', filter: 'npc', tone: 'friendly',
    },
  ];

  const elandraQuest = questPoi(progress, 'elandra', 'Elandra', elandra.x, elandra.y);
  if (elandraQuest) pois.push(elandraQuest);

  for (const merchant of merchants) {
    pois.push(merchantPoi(merchant));
    const marker = questPoi(progress, merchant.id, merchant.name, merchant.npc.x, merchant.npc.y);
    if (marker) pois.push(marker);
  }

  for (const station of CRAFTING_STATIONS) {
    pois.push({
      id: `craft:${station.id}`, name: station.name, subtitle: station.hint, map: station.map,
      x: station.x, y: station.y, icon: station.icon, filter: 'crafting', tone: 'service',
    });
  }

  for (const node of GATHERING_NODES) {
    const filter: MapFilterKey = node.kind === 'mining' ? 'mining' : node.kind === 'herbalism' ? 'herbs' : 'wood';
    pois.push({
      id: `resource:${node.id}`, name: node.name, subtitle: node.hint, map: node.map,
      x: node.x, y: node.y, icon: node.icon, filter, tone: 'resource',
    });
  }

  for (const zone of QUEST_VISIT_ZONES) {
    pois.push({
      id: `landmark:${zone.id}`, name: zone.name, subtitle: 'Ponto de interesse', map: zone.map,
      x: zone.x, y: zone.y, icon: '⌖', filter: 'landmarks', tone: 'neutral',
    });
  }

  for (const target of QUEST_INTERACTABLES) {
    if (target.id === 'respawn-shrine') continue;
    pois.push({
      id: `landmark:${target.id}`, name: target.name, subtitle: 'Objeto interativo', map: target.map,
      x: target.x, y: target.y, icon: '✦', filter: 'landmarks', tone: 'neutral',
    });
  }

  for (const village of VILLAGES) {
    pois.push({
      id: `respawn:${village.id}`, name: 'Ponto de Renascimento', subtitle: village.name, map: village.map,
      x: village.respawn.x, y: village.respawn.y, icon: '✦', filter: 'respawn', tone: 'friendly',
    });
  }

  for (const monster of monsters) {
    if (!monster.alive) continue;
    pois.push({
      id: `monster:${monster.id}`, name: monster.name, subtitle: 'Monstro hostil', map: progress.map || 'Floresta Inicial',
      x: monster.view.x, y: monster.view.y, icon: monster.kind === 'wolf' ? '◆' : '●', filter: 'monsters', tone: 'danger',
    });
  }

  return pois;
}
