import { Application, Container, Graphics, Text, Ticker } from 'pixi.js';
import { LpcCharacter, type Facing } from '../character/lpcCharacter';
import { persistSelectedCharacter, showCharacterCreator } from '../character/characterCreator';
import { createInventory } from '../items/inventory';
import { ensureInventoryState, getItem } from '../items/itemCatalog';
import { spawnMonsterLoot, updateGroundLoot, type GroundLoot } from '../items/lootSystem';
import { createHud, showDialog, updateHud } from './hud';
import { createMonsters, damageMonster, findAttackTarget, killMonster, updateMonsters } from './monsterSystem';
import { currentQuest, ensureQuestStates, interactQuest, registerQuestKill } from './quests';
import { collides, createElandra, createWorld, distance, SPAWN, WORLD_H, WORLD_W } from './world';

const bootStatus = document.querySelector<HTMLDivElement>('#boot-status');
const setBootMessage = (message: string) => { if (bootStatus) bootStatus.textContent = message; };

export async function startGame() {
  try {
    setBootMessage('Abrindo seleção de personagem...');
    const selected = await showCharacterCreator();
    const config = selected.config;
    const progress = selected.progress;
    ensureQuestStates(progress);
    ensureInventoryState(progress);
    if (bootStatus) bootStatus.style.display = 'grid';
    setBootMessage(`Preparando ${config.name}...`);

    const app = new Application();
    await app.init({ resizeTo: window, backgroundColor: 0x14231d, antialias: false, preference: 'webgl' });
    const mount = document.querySelector<HTMLDivElement>('#app');
    if (!mount) throw new Error('Elemento #app não encontrado.');
    mount.appendChild(app.canvas);

    const { world, obstacles } = createWorld();
    app.stage.addChild(world);
    const { npc, mark: npcMark } = createElandra(world);

    const player = new Container();
    player.addChild(new Graphics().ellipse(0, 5, 25, 10).fill({ color: 0, alpha: .25 }));
    const hero = await LpcCharacter.create(config);
    player.addChild(hero.view);
    const playerName = new Text({ text: config.name, style: { fill: 0xffffff, fontSize: 14, fontWeight: 'bold', stroke: { color: 0, width: 4 } } });
    playerName.anchor.set(.5); playerName.y = -94; player.addChild(playerName);
    player.position.set(
      Math.max(40, Math.min(WORLD_W - 40, progress.position.x || SPAWN.x)),
      Math.max(80, Math.min(WORLD_H - 40, progress.position.y || SPAWN.y)),
    );
    world.addChild(player);

    const monsters = await createMonsters(world);
    const groundLoot: GroundLoot[] = [];
    const hud = createHud(progress);
    let playerHp = Math.max(1, Math.min(progress.maxHp, progress.hp));
    let coins = progress.coins;
    let attackCooldown = 0;
    let autosaveMs = 0;

    const save = () => {
      progress.hp = Math.max(1, Math.ceil(playerHp));
      progress.coins = coins;
      progress.map = 'Floresta Inicial';
      progress.position = { x: Math.round(player.x), y: Math.round(player.y) };
      progress.lastPlayedAt = Date.now();
      selected.progress = progress;
      persistSelectedCharacter(selected);
    };

    const syncNpc = () => {
      const quest = currentQuest(progress);
      if (!quest) { npcMark.text = '✓'; npcMark.style.fill = 0x9cf28f; return; }
      const state = progress.quests[quest.id];
      if (state.status === 'ready') { npcMark.text = '?'; npcMark.style.fill = 0x8fd3ff; }
      else if (state.status === 'not_started') { npcMark.text = '!'; npcMark.style.fill = 0xffdd57; }
      else npcMark.text = '';
    };

    const refresh = () => { updateHud(hud, progress, playerHp, coins); syncNpc(); };

    const inventory = createInventory(progress, {
      getHp: () => playerHp,
      setHp: (value) => { playerHp = Math.max(1, Math.min(progress.maxHp, value)); progress.hp = playerHp; refresh(); },
      onChanged: () => { refresh(); save(); },
      notify: (message) => showDialog(hud, message),
    });
    hud.inventory.addEventListener('pointerdown', () => inventory.toggle());

    const floating = (x: number, y: number, text: string, color: number) => {
      const node = new Text({ text, style: { fill: color, fontSize: 14, fontWeight: 'bold', stroke: { color: 0, width: 4 } } });
      node.anchor.set(.5); node.position.set(x, y); world.addChild(node);
      let life = 55;
      const tick = (ticker: Ticker) => {
        life -= ticker.deltaTime; node.y -= .55 * ticker.deltaTime; node.alpha = Math.max(0, life / 55);
        if (life <= 0) { app.ticker.remove(tick); world.removeChild(node); node.destroy(); }
      };
      app.ticker.add(tick);
    };

    const grantExp = (amount: number) => {
      progress.exp += amount;
      let leveled = false;
      while (progress.exp >= progress.expToNext) {
        progress.exp -= progress.expToNext;
        progress.level += 1;
        progress.expToNext = Math.round(progress.expToNext * 1.35);
        progress.maxHp += 12;
        progress.attack += 4;
        progress.defense += 1;
        playerHp = progress.maxHp;
        leveled = true;
      }
      if (leveled) showDialog(hud, `Nível ${progress.level}! HP, ataque e defesa aumentaram.`);
    };

    const onKill = (monster: typeof monsters[number]) => {
      grantExp(monster.expReward);
      coins += monster.coinReward;
      spawnMonsterLoot(world, monster.kind, monster.view.x, monster.view.y, groundLoot);
      floating(monster.view.x, monster.view.y - 45, `+${monster.expReward} EXP`, 0xaee8ff);
      const result = registerQuestKill(progress, monster.kind);
      if (result?.becameReady) showDialog(hud, `${result.quest.title}: objetivo concluído! Volte para Elandra.`);
      inventory.refresh(); refresh(); save();
    };

    const interact = () => {
      if (inventory.isOpen() || distance(player.x, player.y, npc.x, npc.y) >= 115) return;
      const result = interactQuest(progress);
      if (result.type === 'all_done') showDialog(hud, 'Elandra: Você já concluiu todas as missões de teste.');
      else if (result.type === 'accepted') showDialog(hud, `Elandra: ${result.quest.objective}. Recompensa: ${result.quest.rewardExp} EXP e ${result.quest.rewardCoins} moedas.`);
      else if (result.type === 'completed') {
        grantExp(result.quest.rewardExp); coins += result.quest.rewardCoins;
        showDialog(hud, `Missão concluída! +${result.quest.rewardExp} EXP e +${result.quest.rewardCoins} moedas.`);
      } else showDialog(hud, `Elandra: ${result.quest.objective}. Progresso ${result.state.progress}/${result.state.target}.`);
      refresh(); save();
    };

    const attack = () => {
      if (inventory.isOpen() || attackCooldown > 0 || hero.isAttacking || !hero.attack()) return;
      attackCooldown = 30;
      const target = findAttackTarget(monsters, player.x, player.y);
      if (!target) return;
      const died = damageMonster(target, progress.attack);
      floating(target.view.x, target.view.y - 25, `-${progress.attack}`, 0xffc2b8);
      if (died) { killMonster(target); onKill(target); }
    };

    hud.attack.addEventListener('pointerdown', attack);
    hud.interact.addEventListener('pointerdown', interact);
    const keys = new Set<string>();
    window.addEventListener('keydown', (event) => {
      if (inventory.isOpen() && event.key !== 'Escape' && event.key.toLowerCase() !== 'i') return;
      keys.add(event.key.toLowerCase());
      if (event.code === 'Space') attack();
      if (event.key.toLowerCase() === 'e') interact();
    });
    window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));

    let stickX = 0, stickY = 0;
    const updateStick = (clientX: number, clientY: number) => {
      const r = hud.stick.getBoundingClientRect();
      let dx = clientX - (r.left + r.width / 2), dy = clientY - (r.top + r.height / 2);
      const max = 42, len = Math.hypot(dx, dy);
      if (len > max) { dx = dx / len * max; dy = dy / len * max; }
      stickX = dx / max; stickY = dy / max; hud.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const resetStick = () => { stickX = 0; stickY = 0; hud.knob.style.transform = 'translate(0, 0)'; };
    hud.stick.addEventListener('pointerdown', (e) => { if (!inventory.isOpen()) { hud.stick.setPointerCapture(e.pointerId); updateStick(e.clientX, e.clientY); } });
    hud.stick.addEventListener('pointermove', (e) => { if (hud.stick.hasPointerCapture(e.pointerId)) updateStick(e.clientX, e.clientY); });
    hud.stick.addEventListener('pointerup', resetStick);
    hud.stick.addEventListener('pointercancel', resetStick);

    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
    window.addEventListener('pagehide', save);

    app.ticker.add((ticker: Ticker) => {
      autosaveMs += ticker.deltaMS;
      if (autosaveMs >= 3000) { autosaveMs = 0; save(); }
      attackCooldown = Math.max(0, attackCooldown - ticker.deltaTime);

      let dx = inventory.isOpen() ? 0 : stickX, dy = inventory.isOpen() ? 0 : stickY;
      if (!inventory.isOpen()) {
        if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
        if (keys.has('d') || keys.has('arrowright')) dx += 1;
        if (keys.has('w') || keys.has('arrowup')) dy -= 1;
        if (keys.has('s') || keys.has('arrowdown')) dy += 1;
      }
      const len = Math.hypot(dx, dy), moving = len > 0 && !hero.isAttacking;
      if (moving) {
        dx /= Math.max(1, len); dy /= Math.max(1, len);
        const facing: Facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
        hero.setFacing(facing);
        const speed = 4.4 * ticker.deltaTime;
        const nx = Math.max(40, Math.min(WORLD_W - 40, player.x + dx * speed));
        const ny = Math.max(80, Math.min(WORLD_H - 40, player.y + dy * speed));
        if (!collides(obstacles, nx, player.y)) player.x = nx;
        if (!collides(obstacles, player.x, ny)) player.y = ny;
      }
      hero.update(moving, ticker.deltaTime);

      if (!inventory.isOpen()) {
        updateMonsters(monsters, ticker, player, progress.defense, (damage) => {
          playerHp = Math.max(0, playerHp - damage);
          floating(player.x, player.y - 90, `-${damage}`, 0xff8f8f);
          if (playerHp <= 0) { playerHp = progress.maxHp; player.position.set(SPAWN.x, SPAWN.y); showDialog(hud, 'Você foi derrotado e retornou ao ponto inicial.'); save(); }
          refresh();
        });

        updateGroundLoot(groundLoot, ticker, player, progress, (itemId, quantity) => {
          const item = getItem(itemId);
          if (item) {
            floating(player.x, player.y - 75, `+${quantity} ${item.icon}`, 0xffe7a0);
            showDialog(hud, `${quantity}x ${item.name} adicionado ao inventário.`);
          }
          inventory.refresh(); save();
        }, () => showDialog(hud, 'Inventário cheio. O item continuará no chão por um tempo.'));
      }

      world.x = Math.max(Math.min(0, app.screen.width - WORLD_W), Math.min(0, app.screen.width / 2 - player.x));
      world.y = Math.max(Math.min(0, app.screen.height - WORLD_H), Math.min(0, app.screen.height / 2 - player.y));
    });

    refresh(); inventory.refresh(); save();
    if (bootStatus) bootStatus.remove();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(error);
    setBootMessage(`Erro ao iniciar o jogo: ${message}`);
    if (bootStatus) { bootStatus.style.display = 'grid'; bootStatus.style.background = '#2b1115'; bootStatus.style.color = '#ffd7dc'; }
  }
}
