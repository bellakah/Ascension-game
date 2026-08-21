import { Container, Graphics, Text, Ticker } from 'pixi.js';
import { getPreparedPublishedWorldRuntime, getPublishedObjectPositions } from '../map/publishedMapRuntime';
import { ToxicSludgeView } from '../monsters/toxicSludge';
import type { MonsterKind } from '../quests/questTypes';
import { distance, isInSafeZone } from './world';

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
  const publishedRuntime = getPreparedPublishedWorldRuntime();
  const wolves = getPublishedObjectPositions('wolf');
  const sludges = getPublishedObjectPositions('sludge');
  const wolfDefaults = [{ x: 1320, y: 930 }, { x: 1510, y: 720 }, { x: 1740, y: 1030 }];
  const sludgeDefaults = [{ x: 430, y: 560 }, { x: 560, y: 1080 }, { x: 1520, y: 390 }, { x: 1880, y: 690 }, { x: 1680, y: 1320 }];
  const wolfPositions = publishedRuntime ? wolves : wolfDefaults;
  const sludgePositions = publishedRuntime ? sludges : sludgeDefaults;
  const result: Monster[] = [];
  for (let index = 0; index < wolfPositions.length; index++) {
    const position = wolfPositions[index];
    result.push(createWolf(world, `wolf-${index + 1}`, position.x, position.y));
  }
  for (let index = 0; index < sludgePositions.length; index++) {
    const position = sludgePositions[index];
    result.push(await createSludge(world, `sludge-${index + 1}`, position.x, position.y));
  }
  return result;
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

function moveToward(monster: Monster, x: number, y: number, dt: number) {
  const d = distance(monster.view.x, monster.view.y, x, y);
  if (d <= 1) return;
  const vx = (x - monster.view.x) / d;
  const vy = (y - monster.view.y) / d;
  const nextX = monster.view.x + vx * monster.speed * dt;
  const nextY = monster.view.y + vy * monster.speed * dt;
  if (!isInSafeZone(nextX, nextY)) {
    monster.view.x = nextX;
    monster.view.y = nextY;
    monster.sludge?.setFacingLeft(vx < 0);
  }
}

export function updateMonsters(
  monsters: Monster[], ticker: Ticker, player: Container, defense: number,
  onPlayerDamage: (damage: number) => void,
) {
  const dt = ticker.deltaTime;
  const playerSafe = isInSafeZone(player.x, player.y);

  for (const monster of monsters) {
    monster.sludge?.update(dt);
    if (!monster.alive) {
      monster.respawnLeft -= ticker.deltaMS;
      if (monster.sludge && monster.respawnLeft < monster.respawnMs - 700) monster.view.visible = false;
      if (monster.respawnLeft <= 0) respawn(monster);
      continue;
    }

    if (isInSafeZone(monster.view.x, monster.view.y)) {
      monster.view.position.set(monster.spawnX, monster.spawnY);
      monster.attackCooldown = 0;
      continue;
    }

    monster.attackCooldown = Math.max(0, monster.attackCooldown - dt);

    if (playerSafe) {
      const homeDistance = distance(monster.view.x, monster.view.y, monster.spawnX, monster.spawnY);
      if (homeDistance > 8) moveToward(monster, monster.spawnX, monster.spawnY, dt * .8);
      continue;
    }

    const d = distance(monster.view.x, monster.view.y, player.x, player.y);
    if (d < monster.aggro && d > monster.attackRange) moveToward(monster, player.x, player.y, dt);

    if (d <= monster.attackRange && monster.attackCooldown <= 0) {
      monster.attackCooldown = monster.kind === 'wolf' ? 58 : 70;
      monster.sludge?.attack();
      onPlayerDamage(Math.max(1, monster.damage - Math.floor(defense / 3)));
    }
  }
}
