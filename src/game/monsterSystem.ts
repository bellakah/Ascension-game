import { Container, Graphics, Text, Ticker } from 'pixi.js';
import { ToxicSludgeView } from '../monsters/toxicSludge';
import type { MonsterKind } from './quests';
import { distance } from './world';

export type Monster = {
  id: string;
  kind: MonsterKind;
  name: string;
  view: Container;
  hpFill: Graphics;
  maxHp: number;
  hp: number;
  damage: number;
  speed: number;
  aggro: number;
  attackRange: number;
  attackCooldown: number;
  respawnMs: number;
  respawnLeft: number;
  spawnX: number;
  spawnY: number;
  alive: boolean;
  expReward: number;
  coinReward: number;
  sludge?: ToxicSludgeView;
};

function createWolf(world: Container, id: string, x: number, y: number): Monster {
  const view = new Container();
  const name = new Text({ text: 'Lobo Sombrio', style: { fill: 0xffd0ca, fontSize: 13, fontWeight: 'bold', stroke: { color: 0, width: 4 } } });
  name.anchor.set(.5); name.y = -50;
  const hpFill = new Graphics().roundRect(-30, -38, 60, 5, 2).fill(0xdb5b52);
  view.addChild(
    new Graphics().ellipse(0, 19, 23, 9).fill({ color: 0, alpha: .22 }),
    new Graphics().ellipse(0, -3, 30, 20).fill(0x71433f).stroke({ width: 3, color: 0xc66a58 }),
    new Graphics().circle(-14, -15, 10).fill(0x71433f),
    new Graphics().circle(-18, -17, 3).fill(0xffe06b),
    name, new Graphics().roundRect(-31, -39, 62, 7, 3).fill(0x301718), hpFill,
  );
  view.position.set(x, y);
  world.addChild(view);
  return { id, kind: 'wolf', name: 'Lobo Sombrio', view, hpFill, maxHp: 90, hp: 90, damage: 12, speed: 2.05, aggro: 360, attackRange: 72, attackCooldown: 0, respawnMs: 7000, respawnLeft: 0, spawnX: x, spawnY: y, alive: true, expReward: 25, coinReward: 3 };
}

async function createSludge(world: Container, id: string, x: number, y: number): Promise<Monster> {
  const sludge = await ToxicSludgeView.create('Lodo Tóxico');
  const view = sludge.view;
  const hpFill = new Graphics().roundRect(-30, -42, 60, 5, 2).fill(0x80d65f);
  view.addChild(new Graphics().roundRect(-31, -43, 62, 7, 3).fill(0x172514), hpFill);
  view.position.set(x, y);
  world.addChild(view);
  return { id, kind: 'sludge', name: 'Lodo Tóxico', view, hpFill, maxHp: 70, hp: 70, damage: 9, speed: 1.55, aggro: 310, attackRange: 62, attackCooldown: 0, respawnMs: 6500, respawnLeft: 0, spawnX: x, spawnY: y, alive: true, expReward: 18, coinReward: 2, sludge };
}

export async function createMonsters(world: Container) {
  return [
    createWolf(world, 'wolf-1', 1320, 930),
    createWolf(world, 'wolf-2', 1510, 720),
    createWolf(world, 'wolf-3', 1740, 1030),
    await createSludge(world, 'sludge-1', 430, 560),
    await createSludge(world, 'sludge-2', 560, 1080),
    await createSludge(world, 'sludge-3', 1520, 390),
    await createSludge(world, 'sludge-4', 1880, 690),
    await createSludge(world, 'sludge-5', 1680, 1320),
  ];
}

export function findAttackTarget(monsters: Monster[], x: number, y: number, range = 110) {
  let target: Monster | null = null;
  let best = Infinity;
  for (const monster of monsters) {
    if (!monster.alive) continue;
    const d = distance(x, y, monster.view.x, monster.view.y);
    if (d <= range && d < best) { best = d; target = monster; }
  }
  return target;
}

export function damageMonster(monster: Monster, amount: number) {
  if (!monster.alive) return false;
  monster.hp = Math.max(0, monster.hp - amount);
  monster.hpFill.scale.x = monster.hp / monster.maxHp;
  return monster.hp <= 0;
}

export function killMonster(monster: Monster) {
  if (!monster.alive) return;
  monster.alive = false;
  monster.respawnLeft = monster.respawnMs;
  monster.hp = 0;
  monster.hpFill.scale.x = 0;
  if (monster.sludge) monster.sludge.die();
  else monster.view.visible = false;
}

function respawn(monster: Monster) {
  monster.alive = true;
  monster.hp = monster.maxHp;
  monster.hpFill.scale.x = 1;
  monster.attackCooldown = 0;
  monster.view.position.set(monster.spawnX, monster.spawnY);
  monster.view.visible = true;
  monster.sludge?.reset();
}

export function updateMonsters(
  monsters: Monster[], ticker: Ticker, player: Container, defense: number,
  onPlayerDamage: (damage: number) => void,
) {
  const dt = ticker.deltaTime;
  for (const monster of monsters) {
    monster.sludge?.update(dt);
    if (!monster.alive) {
      monster.respawnLeft -= ticker.deltaMS;
      if (monster.sludge && monster.respawnLeft < monster.respawnMs - 700) monster.view.visible = false;
      if (monster.respawnLeft <= 0) respawn(monster);
      continue;
    }
    monster.attackCooldown = Math.max(0, monster.attackCooldown - dt);
    const d = distance(monster.view.x, monster.view.y, player.x, player.y);
    if (d < monster.aggro && d > monster.attackRange) {
      const vx = (player.x - monster.view.x) / Math.max(1, d);
      const vy = (player.y - monster.view.y) / Math.max(1, d);
      monster.view.x += vx * monster.speed * dt;
      monster.view.y += vy * monster.speed * dt;
      monster.sludge?.setFacingLeft(vx < 0);
    }
    if (d <= monster.attackRange && monster.attackCooldown <= 0) {
      monster.attackCooldown = monster.kind === 'wolf' ? 58 : 70;
      monster.sludge?.attack();
      onPlayerDamage(Math.max(1, monster.damage - Math.floor(defense / 3)));
    }
  }
}
