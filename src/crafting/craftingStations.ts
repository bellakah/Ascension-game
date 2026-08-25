import { Container, Graphics, Text } from 'pixi.js';
import { getPreparedPublishedWorldRuntime, getPublishedObjectPositions } from '../map/publishedMapRuntime';
import { craftStationAssetId } from './craftStationPalette';
import { listPublishedCraftStationTypeRecords } from './craftStudioStore';
import { CRAFTING_STATIONS, type CraftingStationDefinition } from './recipeCatalog';

export type RuntimeCraftingStation = { definition: CraftingStationDefinition; view: Container; marker: Text };

function createForgeVisual() {
  const c = new Container();
  c.addChild(
    new Graphics().ellipse(0, 18, 34, 11).fill({ color: 0, alpha: .14 }),
    new Graphics().roundRect(-30, -16, 42, 18, 5).fill(0x666b70).stroke({ width: 2, color: 0x45494d }),
    new Graphics().poly([-18, 2, 5, 2, 17, 14, -10, 14]).fill(0x555a60),
    new Graphics().roundRect(18, -24, 22, 38, 5).fill(0x7a4933).stroke({ width: 2, color: 0x4d3026 }),
    new Graphics().circle(29, -5, 9).fill({ color: 0xe47d37, alpha: .8 }),
    new Graphics().circle(29, -5, 4).fill(0xffd466),
  );
  return c;
}
function createAlchemyVisual() {
  const c = new Container();
  c.addChild(
    new Graphics().ellipse(0, 18, 30, 10).fill({ color: 0, alpha: .13 }),
    new Graphics().ellipse(0, 0, 25, 16).fill(0x394b4a).stroke({ width: 3, color: 0x222d2c }),
    new Graphics().ellipse(0, -5, 19, 8).fill(0x6ec28b).stroke({ width: 2, color: 0xa2e2b4 }),
    new Graphics().moveTo(-16, 12).lineTo(-22, 25).stroke({ width: 4, color: 0x353535 }),
    new Graphics().moveTo(16, 12).lineTo(22, 25).stroke({ width: 4, color: 0x353535 }),
    new Graphics().circle(-8, -20, 4).fill({ color: 0xbce8c5, alpha: .65 }),
    new Graphics().circle(7, -28, 3).fill({ color: 0xbce8c5, alpha: .45 }),
  );
  return c;
}
function createStation(definition: CraftingStationDefinition): RuntimeCraftingStation {
  const view = new Container();
  view.addChild(definition.type === 'alchemy' ? createAlchemyVisual() : createForgeVisual());
  const marker = new Text({ text: definition.icon, style: { fill: 0xe8d9a2, fontSize: 16, fontWeight: 'bold', stroke: { color: 0x132018, width: 4 } } });
  marker.anchor.set(.5); marker.y = -55; marker.alpha = .55; view.addChild(marker);
  const label = new Text({ text: definition.name, style: { fill: 0xe8eee9, fontSize: 9, fontWeight: 'bold', stroke: { color: 0x132018, width: 3 } } });
  label.anchor.set(.5); label.y = 34; label.alpha = .72; view.addChild(label);
  view.position.set(definition.x, definition.y);
  return { definition, view, marker };
}

function publishedPositions(type: string) {
  const direct = getPublishedObjectPositions(craftStationAssetId(type));
  if (type === 'forge') return [...direct, ...getPublishedObjectPositions('anvil_station')];
  if (type === 'alchemy') return [...direct, ...getPublishedObjectPositions('alchemy_station')];
  return direct;
}

export function createCraftingStations(world: Container) {
  const publishedRuntime = getPreparedPublishedWorldRuntime();
  const stations: RuntimeCraftingStation[] = [];
  const stationTypes = listPublishedCraftStationTypeRecords();
  for (const type of stationTypes) {
    const points = publishedPositions(type.key);
    if (publishedRuntime) {
      points.forEach((point, index) => {
        const definition: CraftingStationDefinition = { id: `${type.key}:${index}`, name: type.name, type: type.key, map: publishedRuntime.document.name, x: point.x, y: point.y, radius: type.interactionRadius, icon: type.icon, hint: type.prompt };
        const station = createStation(definition); world.addChild(station.view); stations.push(station);
      });
      continue;
    }
    for (const fallback of CRAFTING_STATIONS.filter((entry) => entry.type === type.key)) {
      const definition = { ...fallback, name: type.name, radius: type.interactionRadius, icon: type.icon, hint: type.prompt };
      const station = createStation(definition); world.addChild(station.view); stations.push(station);
    }
  }
  return stations;
}

export function nearestCraftingStation(stations: RuntimeCraftingStation[], x: number, y: number, map = 'Floresta Inicial', hintExtra = 45) {
  let nearest: RuntimeCraftingStation | null = null, best = Infinity;
  for (const station of stations) {
    if (station.definition.map !== map) continue;
    const d = Math.hypot(x - station.definition.x, y - station.definition.y);
    if (d <= station.definition.radius + hintExtra && d < best) { nearest = station; best = d; }
  }
  return nearest ? { station: nearest, distance: best, actionable: best <= nearest.definition.radius } : null;
}
