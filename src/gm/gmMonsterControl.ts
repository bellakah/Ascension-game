import { Container, Graphics, Text } from 'pixi.js';
import { getPreparedPublishedWorldRuntime } from '../map/publishedMapRuntime';
import { getMonsterDefinition } from '../monsterEditor/monsterStore';
import type { Monster } from '../game/monsterSystem';

function uid() {
  return `gm-monster-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function spawnGmMonster(world: Container, monsters: Monster[], definitionId: string, x: number, y: number) {
  const definition = getMonsterDefinition(definitionId);
  if (!definition) return null;
  const scale = Math.max(.1, definition.appearance.scale || 1);
  const view = new Container();
  view.sortableChildren = true;
  view.position.set(x, y);
  view.label = uid();

  if (definition.appearance.showShadow) {
    const shadow = new Graphics().ellipse(0, 4, 22 * scale, 8 * scale).fill({ color: 0, alpha: .24 });
    shadow.zIndex = 0; view.addChild(shadow);
  }
  const nameColor = definition.rank === 'boss' ? 0xffc35f : definition.rank === 'elite' ? 0xff8c83 : 0xffd2cd;
  const name = new Text({ text: `${definition.name}  Nv.${definition.level}`, style: { fill: nameColor, fontSize: 11, fontWeight: 'bold', stroke: { color: 0x08090b, width: 4 } } });
  name.anchor.set(.5, 1); name.position.set(0, -54 * scale); name.zIndex = 4; view.addChild(name);
  const hpBack = new Graphics().roundRect(-31 * scale, -46 * scale, 62 * scale, 7 * scale, 3).fill(0x351617); hpBack.zIndex = 4; view.addChild(hpBack);
  const hpFill = new Graphics().roundRect(-30 * scale, -45 * scale, 60 * scale, 5 * scale, 2).fill(definition.rank === 'boss' ? 0xe28a3d : definition.rank === 'elite' ? 0xdd5f65 : 0xc94d54); hpFill.zIndex = 5; view.addChild(hpFill);
  world.addChild(view);

  const tileSize = getPreparedPublishedWorldRuntime()?.document.tileSize ?? 48;
  const monster: Monster = {
    id: view.label,
    kind: definition.id,
    name: definition.name,
    view,
    hpFill,
    maxHp: Math.max(1, definition.stats.maxHp),
    hp: Math.max(1, definition.stats.maxHp),
    damage: Math.max(1, definition.stats.attack),
    defense: Math.max(0, definition.stats.defense),
    speed: Math.max(0, definition.stats.moveSpeed),
    aggro: Math.max(0, definition.ai.aggroRadius) * tileSize,
    attackRange: Math.max(.2, definition.stats.attackRange) * tileSize,
    attackCooldown: 0,
    attackCooldownFrames: Math.max(6, definition.stats.attackCooldownMs / 16.667),
    respawnMs: Math.max(500, definition.ai.respawnMs),
    respawnLeft: 0,
    spawnX: x,
    spawnY: y,
    alive: true,
    expReward: Math.max(0, definition.stats.expReward),
    coinReward: Math.max(0, definition.stats.coinReward),
    drops: definition.drops,
    definition,
    sprite: null,
    assetId: '',
    state: 'idle',
    facing: 'south',
    stateUntil: 0,
    provoked: false,
    leash: Math.max(1, definition.ai.leashRadius) * tileSize,
    wanderRadius: Math.max(0, definition.ai.wanderRadius) * tileSize,
    wanderWaitMs: 300,
    deathHideMs: 0,
    skillCooldowns: new Map(),
  };
  monsters.push(monster);
  return monster;
}

export function resetGmMonster(monster: Monster) {
  monster.alive = true;
  monster.hp = monster.maxHp;
  monster.hpFill.scale.x = 1;
  monster.attackCooldown = 0;
  monster.respawnLeft = 0;
  monster.view.visible = true;
  monster.view.position.set(monster.spawnX, monster.spawnY);
  monster.sludge?.reset();
  monster.provoked = false;
  monster.state = 'idle';
  monster.stateUntil = 0;
  monster.wanderTargetX = undefined;
  monster.wanderTargetY = undefined;
  monster.wanderWaitMs = 250;
}
