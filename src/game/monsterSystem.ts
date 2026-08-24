import { Container, Graphics, Sprite, Text, Texture, Ticker } from 'pixi.js';
import { animationFrameIndex } from '../editor/map/mapAnimationRuntime';
import { getMapAssetImage } from '../editor/map/mapAssetRenderer';
import { getPaletteEntry } from '../editor/map/mapEditorCatalog';
import type { MapAnimationFrame, MapPaletteEntry, MapSpriteRect } from '../editor/map/mapEditorTypes';
import { generateSpawnOffsets, readSpawnGroupConfig, spawnRespawnDelay } from '../editor/map/spawnGroupConfig';
import { getSpawnGroup } from '../editor/map/spawnGroupStore';
import { getPreparedPublishedWorldRuntime } from '../map/publishedMapRuntime';
import { getMonsterDefinition, monsterIdFromAssetId, resolveMonsterAppearanceAssetId } from '../monsterEditor/monsterStore';
import type { MonsterAnimationState, MonsterDefinition, MonsterDirection, MonsterDrop } from '../monsterEditor/monsterTypes';
import { ToxicSludgeView } from '../monsters/toxicSludge';
import type { MonsterKind } from '../quests/questTypes';
import { distance, isInSafeZone } from './world';

const textureCache = new Map<string, Texture[]>();

export type Monster = {
  id: string;
  kind: MonsterKind;
  name: string;
  view: Container;
  hpFill: Graphics;
  maxHp: number;
  hp: number;
  damage: number;
  defense: number;
  speed: number;
  aggro: number;
  attackRange: number;
  attackCooldown: number;
  attackCooldownFrames: number;
  respawnMs: number;
  respawnLeft: number;
  spawnX: number;
  spawnY: number;
  alive: boolean;
  expReward: number;
  coinReward: number;
  drops?: MonsterDrop[];
  sludge?: ToxicSludgeView;
  definition?: MonsterDefinition;
  sprite?: Sprite | null;
  assetId?: string;
  state?: MonsterAnimationState;
  facing?: MonsterDirection;
  stateUntil?: number;
  provoked?: boolean;
  leash?: number;
  wanderRadius?: number;
  wanderTargetX?: number;
  wanderTargetY?: number;
  wanderWaitMs?: number;
  deathHideMs?: number;
  skillCooldowns?: Map<string, number>;
};

function createWolf(world: Container, id: string, x: number, y: number): Monster {
  const view = new Container();
  const name = new Text({ text: 'Lobo Sombrio', style: { fill: 0xffd0ca, fontSize: 13, fontWeight: 'bold', stroke: { color: 0, width: 4 } } });
  name.anchor.set(.5); name.y = -50;
  const hpFill = new Graphics().roundRect(-30, -38, 60, 5, 2).fill(0xdb5b52);
  view.addChild(new Graphics().ellipse(0, 19, 23, 9).fill({ color: 0, alpha: .22 }), new Graphics().ellipse(0, -3, 30, 20).fill(0x71433f).stroke({ width: 3, color: 0xc66a58 }), new Graphics().circle(-14, -15, 10).fill(0x71433f), new Graphics().circle(-18, -17, 3).fill(0xffe06b), name, new Graphics().roundRect(-31, -39, 62, 7, 3).fill(0x301718), hpFill);
  view.position.set(x, y); world.addChild(view);
  return { id, kind: 'wolf', name: 'Lobo Sombrio', view, hpFill, maxHp: 90, hp: 90, damage: 12, defense: 0, speed: 2.05, aggro: 360, attackRange: 72, attackCooldown: 0, attackCooldownFrames: 58, respawnMs: 7000, respawnLeft: 0, spawnX: x, spawnY: y, alive: true, expReward: 25, coinReward: 3 };
}

async function createSludge(world: Container, id: string, x: number, y: number): Promise<Monster> {
  const sludge = await ToxicSludgeView.create('Lodo Tóxico');
  const view = sludge.view;
  const hpFill = new Graphics().roundRect(-30, -42, 60, 5, 2).fill(0x80d65f);
  view.addChild(new Graphics().roundRect(-31, -43, 62, 7, 3).fill(0x172514), hpFill);
  view.position.set(x, y); world.addChild(view);
  return { id, kind: 'sludge', name: 'Lodo Tóxico', view, hpFill, maxHp: 70, hp: 70, damage: 9, defense: 0, speed: 1.55, aggro: 310, attackRange: 62, attackCooldown: 0, attackCooldownFrames: 70, respawnMs: 6500, respawnLeft: 0, spawnX: x, spawnY: y, alive: true, expReward: 18, coinReward: 2, sludge };
}

function directionFromDelta(dx: number, dy: number): MonsterDirection {
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  if (angle >= -22.5 && angle < 22.5) return 'east';
  if (angle >= 22.5 && angle < 67.5) return 'south-east';
  if (angle >= 67.5 && angle < 112.5) return 'south';
  if (angle >= 112.5 && angle < 157.5) return 'south-west';
  if (angle >= 157.5 || angle < -157.5) return 'west';
  if (angle >= -157.5 && angle < -112.5) return 'north-west';
  if (angle >= -112.5 && angle < -67.5) return 'north';
  return 'north-east';
}

function frameCanvas(entry: MapPaletteEntry, rect?: MapSpriteRect) {
  const image = getMapAssetImage(entry);
  if (!image || !image.complete || image.naturalWidth <= 0) return null;
  const source = rect ?? entry.sprite?.sourceRect ?? { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(source.width)); canvas.height = Math.max(1, Math.round(source.height));
  const ctx = canvas.getContext('2d'); if (!ctx) return null;
  ctx.imageSmoothingEnabled = false; ctx.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}
function texturesFor(entry: MapPaletteEntry) {
  const cached = textureCache.get(entry.id); if (cached) return cached;
  const animation = entry.sprite?.animation;
  const canvases = animation?.frames.length ? animation.frames.map((frame: MapAnimationFrame) => frameCanvas(entry, frame)).filter((value): value is HTMLCanvasElement => Boolean(value)) : [frameCanvas(entry)].filter((value): value is HTMLCanvasElement => Boolean(value));
  const textures = canvases.map((canvas) => Texture.from(canvas)); if (textures.length) textureCache.set(entry.id, textures); return textures;
}
function waitForEntry(entry: MapPaletteEntry) {
  return new Promise<void>((resolve) => {
    const image = getMapAssetImage(entry); if (!image || (image.complete && image.naturalWidth > 0)) { resolve(); return; }
    const done = () => resolve(); image.addEventListener('load', done, { once: true }); image.addEventListener('error', done, { once: true });
  });
}

function applyCustomAppearance(monster: Monster, time: number) {
  const definition = monster.definition; if (!definition) return;
  const state = monster.state ?? 'idle', facing = monster.facing ?? 'south';
  const nextId = resolveMonsterAppearanceAssetId(definition, state, facing);
  const entry = getPaletteEntry(nextId), textures = texturesFor(entry); if (!textures.length) return;
  if (!monster.sprite || monster.assetId !== nextId) {
    monster.sprite?.destroy();
    const sprite = new Sprite(textures[0]); const def = entry.sprite;
    sprite.anchor.set(def?.anchorX ?? .5, def?.anchorY ?? 1);
    const runtime = getPreparedPublishedWorldRuntime(); const tileSize = runtime?.document.tileSize ?? 48;
    sprite.width = tileSize * (def?.widthTiles ?? 1) * definition.appearance.scale;
    sprite.height = tileSize * (def?.heightTiles ?? 1) * definition.appearance.scale;
    sprite.zIndex = 2; monster.view.addChildAt(sprite, definition.appearance.showShadow ? 1 : 0); monster.sprite = sprite; monster.assetId = nextId;
  }
  const animation = entry.sprite?.animation;
  if (animation?.frames.length && textures.length > 1 && monster.sprite) {
    const index = Math.min(textures.length - 1, animationFrameIndex(animation, time, `monster:${monster.id}`));
    monster.sprite.texture = textures[index];
  }
}

async function createCustomMonster(world: Container, objectId: string, definition: MonsterDefinition, x: number, y: number): Promise<Monster> {
  const appearanceIds = new Set<string>([definition.appearance.fallbackAssetId]);
  (['idle','walk','attack','hurt','death'] as MonsterAnimationState[]).forEach((state) => Object.values(definition.appearance[state]).forEach((id) => id && appearanceIds.add(id)));
  await Promise.all([...appearanceIds].filter(Boolean).map((id) => waitForEntry(getPaletteEntry(id))));

  const view = new Container(); view.sortableChildren = true; view.position.set(x, y); view.label = objectId;
  const scale = Math.max(.1, definition.appearance.scale);
  if (definition.appearance.showShadow) { const shadow = new Graphics().ellipse(0, 4, 22 * scale, 8 * scale).fill({ color: 0, alpha: .24 }); shadow.zIndex = 0; view.addChild(shadow); }
  const nameColor = definition.rank === 'boss' ? 0xffc35f : definition.rank === 'elite' ? 0xff8c83 : 0xffd2cd;
  const name = new Text({ text: definition.title ? `${definition.name}  Nv.${definition.level}\n${definition.title}` : `${definition.name}  Nv.${definition.level}`, style: { fill: nameColor, fontSize: definition.rank === 'boss' ? 13 : 11, align: 'center', fontWeight: 'bold', stroke: { color: 0x08090b, width: 4 } } });
  name.anchor.set(.5, 1); name.position.set(0, -54 * scale); name.zIndex = 4; view.addChild(name);
  const hpBack = new Graphics().roundRect(-31 * scale, -46 * scale, 62 * scale, 7 * scale, 3).fill(0x351617); hpBack.zIndex = 4; view.addChild(hpBack);
  const hpFill = new Graphics().roundRect(-30 * scale, -45 * scale, 60 * scale, 5 * scale, 2).fill(definition.rank === 'boss' ? 0xe28a3d : definition.rank === 'elite' ? 0xdd5f65 : 0xc94d54); hpFill.zIndex = 5; view.addChild(hpFill);
  world.addChild(view);

  const runtime = getPreparedPublishedWorldRuntime();
  const original = runtime?.view.children.find((child) => child !== view && Math.abs(child.x - x) < .5 && Math.abs(child.y - y) < .5 && child.zIndex > -900000);
  if (original) original.visible = false;

  const monster: Monster = {
    id: objectId, kind: definition.id, name: definition.name, view, hpFill,
    maxHp: Math.max(1, definition.stats.maxHp), hp: Math.max(1, definition.stats.maxHp),
    damage: Math.max(1, definition.stats.attack), defense: Math.max(0, definition.stats.defense),
    speed: Math.max(0, definition.stats.moveSpeed),
    aggro: Math.max(0, definition.ai.aggroRadius) * (runtime?.document.tileSize ?? 48),
    attackRange: Math.max(.2, definition.stats.attackRange) * (runtime?.document.tileSize ?? 48),
    attackCooldown: 0, attackCooldownFrames: Math.max(6, definition.stats.attackCooldownMs / 16.667),
    respawnMs: Math.max(500, definition.ai.respawnMs), respawnLeft: 0,
    spawnX: x, spawnY: y, alive: true,
    expReward: Math.max(0, definition.stats.expReward), coinReward: Math.max(0, definition.stats.coinReward), drops: definition.drops,
    definition, sprite: null, assetId: '', state: 'idle', facing: 'south', stateUntil: 0, provoked: false,
    leash: Math.max(1, definition.ai.leashRadius) * (runtime?.document.tileSize ?? 48),
    wanderRadius: Math.max(0, definition.ai.wanderRadius) * (runtime?.document.tileSize ?? 48),
    wanderWaitMs: 200 + Math.random() * 1200, deathHideMs: 0, skillCooldowns: new Map(),
  };
  applyCustomAppearance(monster, performance.now()); return monster;
}

export async function createMonsters(world: Container) {
  const publishedRuntime = getPreparedPublishedWorldRuntime();
  const wolfDefaults = [{ x: 1320, y: 930 }, { x: 1510, y: 720 }, { x: 1740, y: 1030 }];
  const sludgeDefaults = [{ x: 430, y: 560 }, { x: 560, y: 1080 }, { x: 1520, y: 390 }, { x: 1880, y: 690 }, { x: 1680, y: 1320 }];
  const result: Monster[] = [];

  if (!publishedRuntime) {
    for (let index = 0; index < wolfDefaults.length; index++) result.push(createWolf(world, `wolf-${index + 1}`, wolfDefaults[index].x, wolfDefaults[index].y));
    for (let index = 0; index < sludgeDefaults.length; index++) result.push(await createSludge(world, `sludge-${index + 1}`, sludgeDefaults[index].x, sludgeDefaults[index].y));
    return result;
  }

  const document = publishedRuntime.document;
  for (const object of document.objects) {
    if (object.assetId === 'wolf' || object.assetId === 'sludge') {
      const baseRespawn = object.assetId === 'wolf' ? 7000 : 6500;
      const stored = getSpawnGroup(document.id, object.id);
      const config = stored ?? readSpawnGroupConfig(object, baseRespawn);
      const offsets = generateSpawnOffsets(config, `${document.id}:${object.id}:${object.assetId}`);
      for (let index = 0; index < offsets.length; index++) {
        const offset = offsets[index];
        const x = (object.x + .5 + offset.x) * document.tileSize;
        const y = (object.y + 1 + offset.y) * document.tileSize;
        const monster = object.assetId === 'wolf'
          ? createWolf(world, `${object.id}:${index}`, x, y)
          : await createSludge(world, `${object.id}:${index}`, x, y);
        monster.respawnMs = Math.max(500, spawnRespawnDelay(config, baseRespawn));
        result.push(monster);
      }
      continue;
    }

    const monsterId = monsterIdFromAssetId(object.assetId); if (!monsterId) continue;
    const definition = getMonsterDefinition(monsterId); if (!definition) continue;
    const stored = getSpawnGroup(document.id, object.id);
    const config = stored ?? readSpawnGroupConfig(object, definition.ai.respawnMs);
    const offsets = generateSpawnOffsets(config, `${document.id}:${object.id}:monster`);
    for (let index = 0; index < offsets.length; index++) {
      const offset = offsets[index];
      const x = (object.x + .5 + offset.x) * document.tileSize;
      const y = (object.y + 1 + offset.y) * document.tileSize;
      const monster = await createCustomMonster(world, `${object.id}:${index}`, definition, x, y);
      monster.respawnMs = Math.max(500, spawnRespawnDelay(config, definition.ai.respawnMs));
      result.push(monster);
    }
  }
  return result;
}

export function findAttackTarget(monsters: Monster[], x: number, y: number, range = 110) {
  let target: Monster | null = null, best = Infinity;
  for (const monster of monsters) { if (!monster.alive) continue; const d = distance(x, y, monster.view.x, monster.view.y); if (d <= range && d < best) { best = d; target = monster; } }
  return target;
}

export function damageMonster(monster: Monster, amount: number) {
  if (!monster.alive) return false;
  monster.provoked = true;
  const effective = Math.max(1, Math.round(amount - monster.defense * .45));
  monster.hp = Math.max(0, monster.hp - effective); monster.hpFill.scale.x = monster.hp / monster.maxHp;
  if (monster.definition && monster.hp > 0) { monster.state = 'hurt'; monster.stateUntil = performance.now() + 220; applyCustomAppearance(monster, performance.now()); }
  return monster.hp <= 0;
}

export function killMonster(monster: Monster) {
  if (!monster.alive) return;
  monster.alive = false; monster.respawnLeft = monster.respawnMs; monster.hp = 0; monster.hpFill.scale.x = 0;
  if (monster.sludge) monster.sludge.die();
  else if (monster.definition) { monster.state = 'death'; monster.deathHideMs = Math.min(900, Math.max(400, monster.respawnMs * .18)); applyCustomAppearance(monster, performance.now()); }
  else monster.view.visible = false;
}

function respawn(monster: Monster) {
  monster.alive = true; monster.hp = monster.maxHp; monster.hpFill.scale.x = 1; monster.attackCooldown = 0; monster.view.position.set(monster.spawnX, monster.spawnY); monster.view.visible = true; monster.sludge?.reset();
  monster.provoked = false; monster.state = 'idle'; monster.stateUntil = 0; monster.wanderTargetX = undefined; monster.wanderTargetY = undefined; monster.wanderWaitMs = 200 + Math.random() * 700;
}

function moveToward(monster: Monster, x: number, y: number, dt: number) {
  const d = distance(monster.view.x, monster.view.y, x, y); if (d <= 1) return false;
  const vx = (x - monster.view.x) / d, vy = (y - monster.view.y) / d;
  const nextX = monster.view.x + vx * monster.speed * dt, nextY = monster.view.y + vy * monster.speed * dt;
  if (!isInSafeZone(nextX, nextY)) {
    monster.view.x = nextX; monster.view.y = nextY; monster.sludge?.setFacingLeft(vx < 0);
    if (monster.definition) { monster.facing = directionFromDelta(vx, vy); monster.state = 'walk'; }
    return true;
  }
  return false;
}

function updateWander(monster: Monster, dt: number, deltaMs: number) {
  if (!monster.definition || !monster.wanderRadius || monster.speed <= 0) return;
  monster.wanderWaitMs = Math.max(0, (monster.wanderWaitMs ?? 0) - deltaMs);
  if (monster.wanderTargetX != null && monster.wanderTargetY != null) {
    const d = distance(monster.view.x, monster.view.y, monster.wanderTargetX, monster.wanderTargetY);
    if (d < 5) { monster.wanderTargetX = undefined; monster.wanderTargetY = undefined; const min = monster.definition.ai.idleMinMs, max = Math.max(min, monster.definition.ai.idleMaxMs); monster.wanderWaitMs = min + Math.random() * (max - min); monster.state = 'idle'; }
    else moveToward(monster, monster.wanderTargetX, monster.wanderTargetY, dt * .55);
    return;
  }
  if ((monster.wanderWaitMs ?? 0) > 0) return;
  const angle = Math.random() * Math.PI * 2, radius = Math.sqrt(Math.random()) * monster.wanderRadius;
  monster.wanderTargetX = monster.spawnX + Math.cos(angle) * radius; monster.wanderTargetY = monster.spawnY + Math.sin(angle) * radius;
}

function customAttack(monster: Monster, playerDistance: number, defense: number, onPlayerDamage: (damage: number) => void) {
  const def = monster.definition; if (!def) return false;
  let multiplier = 1;
  for (const skill of def.skills) {
    const left = monster.skillCooldowns?.get(skill.id) ?? 0;
    if (left > 0 || playerDistance > skill.range * (getPreparedPublishedWorldRuntime()?.document.tileSize ?? 48) || Math.random() > skill.chance) continue;
    multiplier = Math.max(0, skill.damageMultiplier); monster.skillCooldowns?.set(skill.id, Math.max(100, skill.cooldownMs)); break;
  }
  monster.state = 'attack'; monster.stateUntil = performance.now() + 330; monster.attackCooldown = monster.attackCooldownFrames;
  onPlayerDamage(Math.max(1, Math.round(monster.damage * multiplier) - Math.floor(defense / 3))); return true;
}

export function updateMonsters(monsters: Monster[], ticker: Ticker, player: Container, defense: number, onPlayerDamage: (damage: number) => void) {
  const dt = ticker.deltaTime, playerSafe = isInSafeZone(player.x, player.y), now = performance.now();
  for (const monster of monsters) {
    monster.sludge?.update(dt);
    if (monster.skillCooldowns) for (const [id, value] of monster.skillCooldowns) monster.skillCooldowns.set(id, Math.max(0, value - ticker.deltaMS));
    if (!monster.alive) {
      monster.respawnLeft -= ticker.deltaMS;
      if (monster.definition) { monster.deathHideMs = Math.max(0, (monster.deathHideMs ?? 0) - ticker.deltaMS); applyCustomAppearance(monster, now); if ((monster.deathHideMs ?? 0) <= 0) monster.view.visible = false; }
      else if (monster.sludge && monster.respawnLeft < monster.respawnMs - 700) monster.view.visible = false;
      if (monster.respawnLeft <= 0) respawn(monster);
      continue;
    }
    if (monster.definition && (monster.stateUntil ?? 0) <= now && monster.state !== 'walk') monster.state = 'idle';
    if (isInSafeZone(monster.view.x, monster.view.y)) { monster.view.position.set(monster.spawnX, monster.spawnY); monster.attackCooldown = 0; monster.state = 'idle'; applyCustomAppearance(monster, now); continue; }
    monster.attackCooldown = Math.max(0, monster.attackCooldown - dt);

    const homeDistance = distance(monster.view.x, monster.view.y, monster.spawnX, monster.spawnY);
    const d = distance(monster.view.x, monster.view.y, player.x, player.y);
    const temperament = monster.definition?.ai.temperament ?? 'aggressive';
    const engaged = !playerSafe && temperament !== 'passive' && (temperament === 'aggressive' ? d < monster.aggro : Boolean(monster.provoked));
    const leashExceeded = Boolean(monster.leash && homeDistance > monster.leash);

    if (playerSafe || leashExceeded) {
      monster.provoked = false;
      if (homeDistance > 5) moveToward(monster, monster.spawnX, monster.spawnY, dt * .85); else monster.state = 'idle';
    } else if (engaged) {
      if (d > monster.attackRange) moveToward(monster, player.x, player.y, dt);
      else if (monster.attackCooldown <= 0) {
        if (monster.definition) customAttack(monster, d, defense, onPlayerDamage);
        else { monster.attackCooldown = monster.attackCooldownFrames; monster.sludge?.attack(); onPlayerDamage(Math.max(1, monster.damage - Math.floor(defense / 3))); }
      } else if (monster.definition && (monster.stateUntil ?? 0) <= now) monster.state = 'idle';
    } else if (monster.definition) {
      monster.state = 'idle'; updateWander(monster, dt, ticker.deltaMS);
    }

    if (monster.definition) { applyCustomAppearance(monster, now); monster.view.zIndex = monster.view.y; }
  }
}
