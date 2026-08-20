import { Container, Graphics, Text } from 'pixi.js';

export const WORLD_W = 2200;
export const WORLD_H = 1600;
export const PLAYER_RADIUS = 20;
export const SPAWN = { x: 970, y: 900 };
export type Obstacle = { x: number; y: number; radius: number };

export function createWorld() {
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
    [1060,280],[900,1250],[1180,1380],[710,570],[1310,540],
  ];
  trees.forEach(([x, y], i) => addTree(x, y, i % 3 === 0 ? 1.15 : 1));
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
  npc.position.set(970, 520);
  world.addChild(npc);
  return { npc, mark };
}

export function distance(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

export function collides(obstacles: Obstacle[], x: number, y: number) {
  return obstacles.some((o) => distance(x, y, o.x, o.y) < PLAYER_RADIUS + o.radius);
}
