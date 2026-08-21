import { Container, Graphics, Text } from 'pixi.js';
import { getPreparedPublishedWorldRuntime, getPublishedObjectPositions } from '../map/publishedMapRuntime';

export let WORLD_W = 2200;
export let WORLD_H = 1600;
export const PLAYER_RADIUS = 20;
export type Obstacle = { x: number; y: number; radius: number };
export type SafeZone = { x: number; y: number; width: number; height: number };
export type Village = {
  id: string;
  name: string;
  map: string;
  safeZone: SafeZone;
  respawn: { x: number; y: number };
};

export const VILLAGES: Village[] = [
  {
    id: 'clearing-village',
    name: 'Vila da Clareira',
    map: 'Floresta Inicial',
    safeZone: { x: 600, y: 1000, width: 740, height: 550 },
    respawn: { x: 970, y: 1380 },
  },
];

export const SPAWN = { ...VILLAGES[0].respawn };

function publishedVillages() {
  const runtime = getPreparedPublishedWorldRuntime();
  if (!runtime) return [] as Village[];
  const map = runtime.document;
  const respawns = map.zones.filter((zone) => zone.kind === 'respawn');
  const safeZones = map.zones.filter((zone) => zone.kind === 'safe');
  return safeZones.map((zone, index) => {
    const centerX = (zone.x + zone.width / 2) * map.tileSize;
    const centerY = (zone.y + zone.height / 2) * map.tileSize;
    const nearestRespawn = respawns.reduce<typeof respawns[number] | null>((best, next) => {
      if (!best) return next;
      const bestD = Math.hypot((best.x + best.width / 2) * map.tileSize - centerX, (best.y + best.height / 2) * map.tileSize - centerY);
      const nextD = Math.hypot((next.x + next.width / 2) * map.tileSize - centerX, (next.y + next.height / 2) * map.tileSize - centerY);
      return nextD < bestD ? next : best;
    }, null);
    const respawn = nearestRespawn
      ? { x: (nearestRespawn.x + nearestRespawn.width / 2) * map.tileSize, y: (nearestRespawn.y + nearestRespawn.height / 2) * map.tileSize }
      : runtime.spawn;
    return {
      id: `published-village-${index}`,
      name: zone.name || map.name,
      map: map.name,
      safeZone: { x: zone.x * map.tileSize, y: zone.y * map.tileSize, width: zone.width * map.tileSize, height: zone.height * map.tileSize },
      respawn,
    };
  });
}

export function isInSafeZone(x: number, y: number, map = 'Floresta Inicial') {
  const runtime = getPreparedPublishedWorldRuntime();
  if (runtime) {
    return runtime.document.zones.some((zone) => zone.kind === 'safe'
      && x >= zone.x * runtime.document.tileSize
      && x <= (zone.x + zone.width) * runtime.document.tileSize
      && y >= zone.y * runtime.document.tileSize
      && y <= (zone.y + zone.height) * runtime.document.tileSize);
  }
  return VILLAGES.some((village) => {
    if (village.map !== map) return false;
    const zone = village.safeZone;
    return x >= zone.x && x <= zone.x + zone.width && y >= zone.y && y <= zone.y + zone.height;
  });
}

export function nearestVillage(x: number, y: number, map = 'Floresta Inicial') {
  const published = publishedVillages();
  if (published.length) {
    return published.reduce((best, village) => {
      if (!best) return village;
      const bestDistance = distance(x, y, best.respawn.x, best.respawn.y);
      const nextDistance = distance(x, y, village.respawn.x, village.respawn.y);
      return nextDistance < bestDistance ? village : best;
    }, published[0]);
  }
  const candidates = VILLAGES.filter((village) => village.map === map);
  const pool = candidates.length ? candidates : VILLAGES;
  return pool.reduce((best, village) => {
    if (!best) return village;
    const bestDistance = distance(x, y, best.respawn.x, best.respawn.y);
    const nextDistance = distance(x, y, village.respawn.x, village.respawn.y);
    return nextDistance < bestDistance ? village : best;
  }, pool[0]);
}

function createVillage(world: Container, obstacles: Obstacle[], village: Village) {
  const zone = village.safeZone;
  world.addChild(
    new Graphics()
      .roundRect(zone.x, zone.y, zone.width, zone.height, 32)
      .fill({ color: 0x6f985c, alpha: .6 })
      .stroke({ width: 5, color: 0xbfe6a3, alpha: .68 }),
  );

  world.addChild(
    new Graphics().roundRect(925, 1055, 90, 450, 28).fill({ color: 0xb89a6c, alpha: .3 }),
    new Graphics().roundRect(645, 1318, 650, 86, 28).fill({ color: 0xb89a6c, alpha: .26 }),
    new Graphics().circle(village.respawn.x, village.respawn.y, 88).fill({ color: 0xd7c392, alpha: .12 }).stroke({ width: 2, color: 0xe6d7a9, alpha: .25 }),
  );

  const safeLabel = new Text({
    text: `🛡 ${village.name} • ÁREA SEGURA`,
    style: { fill: 0xe9ffd8, fontSize: 15, fontWeight: 'bold', stroke: { color: 0x17321f, width: 5 } },
  });
  safeLabel.anchor.set(.5);
  safeLabel.position.set(zone.x + zone.width / 2, zone.y + 23);
  world.addChild(safeLabel);

  const addHouse = (x: number, y: number, roof: number) => {
    const house = new Container();
    house.addChild(
      new Graphics().ellipse(0, 34, 57, 17).fill({ color: 0, alpha: .16 }),
      new Graphics().roundRect(-48, -30, 96, 68, 9).fill(0xd1b17a).stroke({ width: 3, color: 0x76583c }),
      new Graphics().poly([-59, -28, 0, -78, 59, -28]).fill(roof).stroke({ width: 3, color: 0x5a3d2e }),
      new Graphics().roundRect(-12, 2, 24, 36, 4).fill(0x6e4833),
      new Graphics().roundRect(-37, -8, 20, 18, 3).fill(0x9ed0d8).stroke({ width: 2, color: 0x5b745f }),
      new Graphics().roundRect(17, -8, 20, 18, 3).fill(0x9ed0d8).stroke({ width: 2, color: 0x5b745f }),
    );
    house.position.set(x, y);
    world.addChild(house);
    obstacles.push({ x, y: y + 10, radius: 48 });
  };

  addHouse(700, 1160, 0x8d523b);
  addHouse(1240, 1160, 0x5b6f91);

  const well = new Container();
  well.addChild(
    new Graphics().ellipse(0, 15, 29, 11).fill({ color: 0, alpha: .16 }),
    new Graphics().circle(0, 0, 24).fill(0x8c8a78).stroke({ width: 4, color: 0x55584e }),
    new Graphics().circle(0, 0, 14).fill(0x4b8291),
    new Graphics().rect(-28, -42, 6, 44).fill(0x704b30),
    new Graphics().rect(22, -42, 6, 44).fill(0x704b30),
    new Graphics().rect(-31, -45, 62, 7).fill(0x704b30),
  );
  well.position.set(1090, 1500);
  world.addChild(well);
  obstacles.push({ x: 1090, y: 1500, radius: 25 });

  const fire = new Container();
  fire.addChild(
    new Graphics().circle(0, 8, 19).stroke({ width: 6, color: 0x777065 }),
    new Graphics().poly([-10, 7, 0, -22, 10, 7]).fill(0xf28d42),
    new Graphics().poly([-6, 5, 0, -12, 6, 5]).fill(0xffdc67),
  );
  fire.position.set(850, 1500);
  world.addChild(fire);

  const shrine = new Container();
  shrine.addChild(
    new Graphics().circle(0, 0, 32).fill({ color: 0xcdf2b1, alpha: .13 }).stroke({ width: 2, color: 0xcdf2b1, alpha: .45 }),
    new Graphics().circle(0, 0, 15).fill({ color: 0xe6ffd2, alpha: .22 }).stroke({ width: 2, color: 0xeaffdc }),
    new Graphics().poly([0, -12, 8, 0, 0, 12, -8, 0]).fill(0xe8ffd9),
  );
  shrine.position.set(village.respawn.x, village.respawn.y);
  world.addChild(shrine);

  const respawnText = new Text({
    text: 'Ponto de Renascimento',
    style: { fill: 0xdfffd2, fontSize: 11, fontWeight: 'bold', stroke: { color: 0x17321f, width: 4 } },
  });
  respawnText.anchor.set(.5);
  respawnText.position.set(village.respawn.x, village.respawn.y + 43);
  world.addChild(respawnText);

  const sign = new Container();
  sign.addChild(
    new Graphics().rect(-4, 0, 8, 36).fill(0x68482f),
    new Graphics().roundRect(-55, -28, 110, 34, 6).fill(0x8e653e).stroke({ width: 3, color: 0x553b29 }),
  );
  const signText = new Text({ text: village.name, style: { fill: 0xffefc1, fontSize: 11, fontWeight: 'bold' } });
  signText.anchor.set(.5); signText.y = -11; sign.addChild(signText);
  sign.position.set(970, 1040);
  world.addChild(sign);

  const fence = (x: number, y: number, width: number) => {
    world.addChild(
      new Graphics().rect(x, y, width, 5).fill(0x8a6745),
      new Graphics().rect(x + 8, y - 10, 6, 25).fill(0x735238),
      new Graphics().rect(x + width - 14, y - 10, 6, 25).fill(0x735238),
    );
  };
  fence(620, 1070, 190);
  fence(1130, 1070, 190);
  fence(620, 1530, 190);
  fence(1130, 1530, 190);
}

export function createWorld() {
  const published = getPreparedPublishedWorldRuntime();
  if (published) {
    WORLD_W = published.width;
    WORLD_H = published.height;
    SPAWN.x = published.spawn.x;
    SPAWN.y = published.spawn.y;
    return { world: published.view, obstacles: published.obstacles };
  }

  WORLD_W = 2200;
  WORLD_H = 1600;
  SPAWN.x = VILLAGES[0].respawn.x;
  SPAWN.y = VILLAGES[0].respawn.y;
  const world = new Container();
  const obstacles: Obstacle[] = [];
  world.addChild(new Graphics().rect(0, 0, WORLD_W, WORLD_H).fill(0x527b45));
  world.addChild(new Graphics().roundRect(760, 0, 420, WORLD_H, 100).fill({ color: 0xa58458, alpha: .88 }));

  for (let i = 0; i < 80; i++) {
    const flower = new Graphics().circle(0, 0, 3).fill(i % 2 ? 0xf4d35e : 0xd983a6);
    flower.position.set(80 + ((i * 149) % 2040), 70 + ((i * 227) % 1460));
    world.addChild(flower);
  }

  const addTree = (x: number, y: number, scale = 1) => {
    const tree = new Container();
    tree.addChild(
      new Graphics().ellipse(0, 26, 32 * scale, 13 * scale).fill({ color: 0, alpha: .18 }),
      new Graphics().roundRect(-9 * scale, -6 * scale, 18 * scale, 48 * scale, 5).fill(0x765034),
      new Graphics().circle(-17 * scale, -28 * scale, 30 * scale).fill(0x245638),
      new Graphics().circle(15 * scale, -34 * scale, 34 * scale).fill(0x317044),
      new Graphics().circle(0, -58 * scale, 33 * scale).fill(0x3d8150),
    );
    tree.position.set(x, y);
    world.addChild(tree);
    obstacles.push({ x, y: y + 12, radius: 25 * scale });
  };
  const trees = [
    [220,240],[420,410],[610,220],[300,720],[590,880],[250,1180],[540,1390],
    [1400,220],[1640,390],[1900,250],[1470,760],[1840,840],[1430,1200],[1740,1370],
    [1060,280],[520,1280],[1420,1420],[710,570],[1310,540],
  ];
  trees.forEach(([x, y], i) => addTree(x, y, i % 3 === 0 ? 1.15 : 1));

  for (const village of VILLAGES) createVillage(world, obstacles, village);
  return { world, obstacles };
}

export function createElandra(world: Container) {
  const npc = new Container();
  const mark = new Text({ text: '!', style: { fill: 0xffdd57, fontSize: 32, fontWeight: 'bold', stroke: { color: 0, width: 5 } } });
  mark.anchor.set(.5); mark.y = -82;
  const name = new Text({ text: 'Elandra', style: { fill: 0xffffff, fontSize: 14, fontWeight: 'bold', stroke: { color: 0, width: 4 } } });
  name.anchor.set(.5); name.y = -62;
  npc.addChild(
    new Graphics().ellipse(0, 22, 22, 9).fill({ color: 0, alpha: .22 }),
    new Graphics().roundRect(-18, -28, 36, 50, 9).fill(0x4f78b8).stroke({ width: 3, color: 0xbfd8ff }),
    new Graphics().circle(0, -39, 14).fill(0xe4b991), mark, name,
  );
  const publishedPosition = getPublishedObjectPositions('elandra')[0];
  npc.position.set(publishedPosition?.x ?? 970, publishedPosition?.y ?? 520);
  world.addChild(npc);
  return { npc, mark };
}

export function distance(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

export function collides(obstacles: Obstacle[], x: number, y: number) {
  return obstacles.some((o) => distance(x, y, o.x, o.y) < PLAYER_RADIUS + o.radius);
}
