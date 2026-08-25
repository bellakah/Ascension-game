import { GATHERING_NODES } from '../gathering/gatheringCatalog';
import { collectibleAssetId, listCollectibleDefinitions } from '../gathering/collectibleStore';
import { getLastMapPois } from '../map/mapCatalog';
import { getPreparedPublishedWorldRuntime, getPublishedObjectPositions } from '../map/publishedMapRuntime';
import { monsterAssetId } from '../monsterEditor/monsterStore';
import { npcAssetId } from '../npc/npcStore';
import type { QuestObjective } from './questTypes';

export type QuestRouteTarget = { x: number; y: number; map?: string; label: string };
export type QuestNavigationResult = { ok: boolean; message: string; target?: QuestRouteTarget };

const LEGACY_MONSTER_NAMES: Record<string, string> = { wolf: 'Lobo Sombrio', sludge: 'Lodo Tóxico' };

function playerPoint() {
  const text = document.querySelector<HTMLElement>('#minimap-coords')?.textContent ?? '';
  const match = text.match(/(-?\d+)\s*,\s*(-?\d+)/);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
}

function nearest(points: QuestRouteTarget[]) {
  const player = playerPoint();
  if (!points.length) return null;
  if (!player) return points[0];
  return points.slice().sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0];
}

function currentMapName() {
  return document.querySelector<HTMLElement>('#minimap-name')?.textContent?.trim() || getPreparedPublishedWorldRuntime()?.document.name || '';
}

function pointsForAsset(assetId: string, label: string): QuestRouteTarget[] {
  const map = getPreparedPublishedWorldRuntime()?.document.name;
  return getPublishedObjectPositions(assetId).map((point) => ({ ...point, map, label }));
}

export function resolveNpcRoute(npcId: string, label?: string) {
  const pois = getLastMapPois().filter((poi) => poi.id === `npc:${npcId}` || poi.id === `quest:${npcId}`);
  const fromPois = pois.map((poi) => ({ x: poi.x, y: poi.y, map: poi.map, label: label || poi.name.replace(/^Missão(?: disponível)? · /, '') }));
  const custom = pointsForAsset(npcAssetId(npcId), label || npcId);
  return nearest([...fromPois, ...custom]);
}

export function resolveMonsterRoute(monsterId: string, label?: string) {
  if (!monsterId || monsterId === 'any') return null;
  const custom = pointsForAsset(monsterAssetId(monsterId), label || monsterId);
  const legacyPositions = pointsForAsset(monsterId, label || LEGACY_MONSTER_NAMES[monsterId] || monsterId);
  const expectedName = LEGACY_MONSTER_NAMES[monsterId];
  const live = getLastMapPois().filter((poi) => poi.id.startsWith('monster:') && (!expectedName || poi.name === expectedName)).map((poi) => ({ x: poi.x, y: poi.y, map: poi.map, label: label || poi.name }));
  return nearest([...custom, ...legacyPositions, ...live]);
}

export function resolveResourceRoute(resourceOrItemId: string, label?: string) {
  const definitions = listCollectibleDefinitions().filter((definition) => definition.id === resourceOrItemId || definition.drops.some((drop) => drop.itemId === resourceOrItemId));
  const custom = definitions.flatMap((definition) => pointsForAsset(collectibleAssetId(definition.id), label || definition.name));
  const legacyNodes = GATHERING_NODES.filter((node) => node.id === resourceOrItemId || node.yieldItemId === resourceOrItemId).map((node) => ({ x: node.x, y: node.y, map: node.map, label: label || node.name }));
  const resourcePois = getLastMapPois().filter((poi) => poi.id.startsWith('resource:') && legacyNodes.some((node) => node.label === poi.name || Math.hypot(node.x - poi.x, node.y - poi.y) < 8)).map((poi) => ({ x: poi.x, y: poi.y, map: poi.map, label: label || poi.name }));
  return nearest([...custom, ...resourcePois, ...legacyNodes]);
}

export function resolveMarkerRoute(markerId: string, label?: string) {
  const ids = new Set([`landmark:${markerId}`, `respawn:${markerId}`, `portal:${markerId}`]);
  const pois = getLastMapPois().filter((poi) => ids.has(poi.id));
  return nearest(pois.map((poi) => ({ x: poi.x, y: poi.y, map: poi.map, label: label || poi.name })));
}

export function resolveObjectiveRoute(objective: QuestObjective): QuestRouteTarget | null {
  if (objective.navigation?.enabled === false) return null;
  const nav = objective.navigation;
  if (nav?.targetType === 'position' && Number.isFinite(nav.x) && Number.isFinite(nav.y)) return { x: Number(nav.x), y: Number(nav.y), map: nav.map, label: objective.label };
  const targetId = nav?.targetId;
  if (nav?.targetType === 'npc' && targetId) return resolveNpcRoute(targetId, objective.label);
  if (nav?.targetType === 'monster' && targetId) return resolveMonsterRoute(targetId, objective.label);
  if (nav?.targetType === 'resource' && targetId) return resolveResourceRoute(targetId, objective.label);
  if ((nav?.targetType === 'marker' || nav?.targetType === 'portal') && targetId) return resolveMarkerRoute(targetId, objective.label);

  if ((objective.type === 'talk' || objective.type === 'deliver') && objective.npcId) return resolveNpcRoute(objective.npcId, objective.label);
  if ((objective.type === 'kill' || objective.type === 'boss') && objective.monsterKind && objective.monsterKind !== 'any') return resolveMonsterRoute(objective.monsterKind, objective.label);
  if (objective.type === 'gather' && (objective.target || objective.itemId)) return resolveResourceRoute(objective.target || objective.itemId!, objective.label);
  if ((objective.type === 'visit' || objective.type === 'interact') && objective.target) return resolveMarkerRoute(objective.target, objective.label);
  return null;
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function dispatchToExistingAutoRoute(target: QuestRouteTarget) {
  const overlay = document.querySelector<HTMLElement>('#map-overlay');
  const viewport = document.querySelector<HTMLElement>('#map-viewport');
  const world = document.querySelector<HTMLElement>('#map-world');
  const minimap = document.querySelector<HTMLButtonElement>('#minimap-shell');
  if (!overlay || !viewport || !world || !minimap) return false;

  const currentMap = currentMapName();
  if (target.map && currentMap && target.map !== currentMap) return false;
  if (overlay.classList.contains('map-hidden')) {
    minimap.click();
    await nextFrame();
    await nextFrame();
  }

  const rect = world.getBoundingClientRect();
  const logicalWidth = Number.parseFloat(world.style.width);
  const logicalHeight = Number.parseFloat(world.style.height);
  if (rect.width <= 0 || rect.height <= 0 || !Number.isFinite(logicalWidth) || !Number.isFinite(logicalHeight)) return false;
  const clientX = rect.left + target.x / logicalWidth * rect.width;
  const clientY = rect.top + target.y / logicalHeight * rect.height;
  viewport.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX, clientY, button: 0 }));
  return true;
}

export async function navigateToQuestTarget(target: QuestRouteTarget | null): Promise<QuestNavigationResult> {
  if (!target) return { ok: false, message: 'Nenhum destino de auto-rota está configurado para este objetivo.' };
  const currentMap = currentMapName();
  if (target.map && currentMap && target.map !== currentMap) return { ok: false, message: `O destino está em ${target.map}. A rota entre mapas será calculada quando a malha de portais estiver disponível.`, target };
  const ok = await dispatchToExistingAutoRoute(target);
  return ok
    ? { ok: true, message: `Auto-rota iniciada para ${target.label}.`, target }
    : { ok: false, message: 'Não foi possível iniciar a auto-rota neste momento.', target };
}

export async function navigateToQuestObjective(objective: QuestObjective) {
  return navigateToQuestTarget(resolveObjectiveRoute(objective));
}

export async function navigateToQuestNpc(npcId: string, label?: string) {
  return navigateToQuestTarget(resolveNpcRoute(npcId, label));
}
