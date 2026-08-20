import { Application, Container, Graphics, Text, Ticker } from 'pixi.js';
import { LpcCharacter, type Facing } from '../character/lpcCharacter';
import { persistSelectedCharacter, showCharacterCreator } from '../character/characterCreator';
import { createCharacterSheet } from '../character/characterSheet';
import { createInventory } from '../items/inventory';
import { ensureInventoryState, getItem } from '../items/itemCatalog';
import { spawnMonsterLoot, updateGroundLoot, type GroundLoot } from '../items/lootSystem';
import { createSkillBar } from '../skills/skillBar';
import { createSkillController } from '../skills/skillController';
import { getSkill, type SkillId } from '../skills/skillCatalog';
import { createHud, showDialog, updateHud } from './hud';
import { createMonsters, damageMonster, findAttackTarget, killMonster, updateMonsters, type Monster } from './monsterSystem';
import { currentQuest, ensureQuestStates, interactQuest, registerQuestKill } from './quests';
import { createRespawnScreen } from './respawn';
import { createShop } from './shopSystem';
import { createVillageMerchants } from './villageNpcs';
import { collides, createElandra, createWorld, distance, isInSafeZone, nearestVillage, SPAWN, WORLD_H, WORLD_W } from './world';

const bootStatus = document.querySelector<HTMLDivElement>('#boot-status');
const setBootMessage = (message: string) => { if (bootStatus) bootStatus.textContent = message; };

export async function startGame() {
  try {
    setBootMessage('Abrindo seleção de personagem...');
    const selected = await showCharacterCreator();
    const config = selected.config;
    const progress = selected.progress;
    ensureQuestStates(progress);
    const inventoryState = ensureInventoryState(progress);
    const skillController = createSkillController(progress);
    const classDef = skillController.classDef;
    const classSkills = skillController.skills;
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
    const merchants = createVillageMerchants(world);

    const player = new Container();
    player.addChild(new Graphics().ellipse(0, 5, 25, 10).fill({ color: 0, alpha: .25 }));
    const hero = await LpcCharacter.create(config, inventoryState.equipment);
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
    let playerHp = Math.max(0, Math.min(progress.maxHp, Number.isFinite(progress.hp) ? progress.hp : progress.maxHp));
    let coins = progress.coins;
    let attackCooldown = 0;
    let autosaveMs = 0;
    let skillUiMs = 0;
    let isDead = playerHp <= 0;
    let deathPosition = { x: player.x, y: player.y };
    let wasSafe = isInSafeZone(player.x, player.y);
    const keys = new Set<string>();
    let stickX = 0, stickY = 0;
    const resetStick = () => { stickX = 0; stickY = 0; hud.knob.style.transform = 'translate(0, 0)'; };

    const save = () => {
      progress.hp = isDead ? 0 : Math.max(1, Math.ceil(playerHp));
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
    const characterSheet = createCharacterSheet(config, progress);

    const syncEquipmentVisuals = () => {
      void hero.setEquipment(ensureInventoryState(progress).equipment);
      characterSheet.refresh();
    };

    const inventory = createInventory(progress, {
      getHp: () => playerHp,
      setHp: (value) => {
        if (isDead) return;
        playerHp = Math.max(1, Math.min(progress.maxHp, value));
        progress.hp = playerHp;
        refresh();
      },
      onChanged: () => { syncEquipmentVisuals(); refresh(); save(); },
      notify: (message) => showDialog(hud, message),
    });

    const shop = createShop(progress, {
      getCoins: () => coins,
      setCoins: (value) => { coins = Math.max(0, Math.floor(value)); progress.coins = coins; },
      onChanged: () => { inventory.refresh(); characterSheet.refresh(); refresh(); save(); },
      notify: (message) => showDialog(hud, message),
    });

    let useSkill: (skillId: SkillId) => void = () => {};
    const skillBar = createSkillBar(classSkills, { onUse: (skillId) => useSkill(skillId) });

    const respawnScreen = createRespawnScreen({
      onRespawn: () => {
        const village = nearestVillage(deathPosition.x, deathPosition.y, progress.map || 'Floresta Inicial');
        if (!village) return;
        isDead = false;
        playerHp = progress.maxHp;
        progress.hp = playerHp;
        skillController.refill();
        player.alpha = 1;
        player.position.set(village.respawn.x, village.respawn.y);
        progress.position = { x: village.respawn.x, y: village.respawn.y };
        keys.clear();
        resetStick();
        wasSafe = true;
        respawnScreen.hide();
        refresh();
        characterSheet.refresh();
        skillBar.refresh(skillController.snapshot());
        save();
        showDialog(hud, `Você renasceu em ${village.name}. Esta é uma área segura.`);
      },
    });

    const uiOpen = () => isDead || respawnScreen.isOpen() || inventory.isOpen() || characterSheet.isOpen() || shop.isOpen();
    hud.inventory.addEventListener('pointerdown', () => { if (isDead) return; shop.close(); characterSheet.close(); inventory.toggle(); });
    hud.character.addEventListener('pointerdown', () => { if (isDead) return; shop.close(); inventory.close(); characterSheet.toggle(); });

    const enterDeathState = () => {
      if (respawnScreen.isOpen()) return;
      isDead = true;
      playerHp = 0;
      progress.hp = 0;
      deathPosition = { x: player.x, y: player.y };
      player.alpha = .42;
      keys.clear();
      resetStick();
      inventory.close();
      characterSheet.close();
      shop.close();
      skillBar.refresh(skillController.snapshot(), true);
      const village = nearestVillage(deathPosition.x, deathPosition.y, progress.map || 'Floresta Inicial');
      if (village) respawnScreen.show(village);
      refresh();
      save();
    };

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

    const pulse = (radius: number, color: number, durationMs = 420) => {
      const effect = new Graphics().circle(0, 0, radius).stroke({ width: 5, color, alpha: .8 });
      effect.position.set(player.x, player.y);
      world.addChild(effect);
      let remaining = durationMs;
      const tick = (ticker: Ticker) => {
        remaining -= ticker.deltaMS;
        const t = Math.max(0, remaining / durationMs);
        effect.alpha = t;
        effect.scale.set(1 + (1 - t) * .35);
        if (remaining <= 0) { app.ticker.remove(tick); world.removeChild(effect); effect.destroy(); }
      };
      app.ticker.add(tick);
    };

    const magicLink = (target: Monster, color: number) => {
      const effect = new Graphics().moveTo(player.x, player.y - 34).lineTo(target.view.x, target.view.y - 22).stroke({ width: 5, color, alpha: .85 });
      effect.circle(target.view.x, target.view.y - 22, 15).stroke({ width: 3, color, alpha: .75 });
      world.addChild(effect);
      let remaining = 180;
      const tick = (ticker: Ticker) => {
        remaining -= ticker.deltaMS;
        effect.alpha = Math.max(0, remaining / 180);
        if (remaining <= 0) { app.ticker.remove(tick); world.removeChild(effect); effect.destroy(); }
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
        progress.maxHp += classDef.id === 'mage' ? 8 : 12;
        progress.attack += classDef.id === 'mage' ? 5 : 4;
        progress.defense += classDef.id === 'mage' ? 1 : 1;
        playerHp = progress.maxHp;
        leveled = true;
      }
      if (leveled) showDialog(hud, `Nível ${progress.level}! HP, ataque e defesa aumentaram.`);
      characterSheet.refresh();
    };

    const onKill = (monster: Monster) => {
      grantExp(monster.expReward);
      coins += monster.coinReward;
      spawnMonsterLoot(world, monster.kind, monster.view.x, monster.view.y, groundLoot);
      floating(monster.view.x, monster.view.y - 45, `+${monster.expReward} EXP`, 0xaee8ff);
      const result = registerQuestKill(progress, monster.kind);
      if (result?.becameReady) showDialog(hud, `${result.quest.title}: objetivo concluído! Volte para Elandra.`);
      inventory.refresh(); refresh(); save(); characterSheet.refresh();
    };

    const attackPower = () => Math.max(1, Math.round(progress.attack * skillController.attackMultiplier()));

    const faceTarget = (target: Monster) => {
      const dx = target.view.x - player.x;
      const dy = target.view.y - player.y;
      const facing: Facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
      hero.setFacing(facing);
    };

    const hitMonster = (monster: Monster, amount: number, color = 0xffc2b8) => {
      const damage = Math.max(1, Math.round(amount));
      const died = damageMonster(monster, damage);
      floating(monster.view.x, monster.view.y - 25, `-${damage}`, color);
      if (died) { killMonster(monster); onKill(monster); }
    };

    const nearbyMonsters = (radius: number) => monsters.filter((monster) => monster.alive && distance(player.x, player.y, monster.view.x, monster.view.y) <= radius);

    const dashToward = (target: Monster) => {
      const dx = target.view.x - player.x;
      const dy = target.view.y - player.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const travel = Math.max(0, d - 66);
      const steps = Math.max(1, Math.ceil(travel / 12));
      let bestX = player.x, bestY = player.y;
      for (let i = 1; i <= steps; i++) {
        const step = Math.min(travel, i * 12);
        const x = Math.max(40, Math.min(WORLD_W - 40, player.x + dx / d * step));
        const y = Math.max(80, Math.min(WORLD_H - 40, player.y + dy / d * step));
        if (collides(obstacles, x, y) || isInSafeZone(x, y)) break;
        bestX = x; bestY = y;
      }
      player.position.set(bestX, bestY);
    };

    const playClassAction = () => classDef.basicAttack.animation === 'spellcast' ? hero.cast() : hero.attack();

    useSkill = (skillId: SkillId) => {
      if (uiOpen() || hero.isAttacking) return;
      if (isInSafeZone(player.x, player.y)) {
        showDialog(hud, 'Área segura: habilidades de combate não podem ser usadas aqui.');
        return;
      }

      const skill = getSkill(skillId);
      if (!skill || skill.classId !== classDef.id) return;
      let target: Monster | null = null;
      let targets: Monster[] = [];
      if (skill.kind === 'melee' || skill.kind === 'charge' || skill.kind === 'target') {
        target = findAttackTarget(monsters, player.x, player.y, skill.range ?? 120);
        if (!target) { showDialog(hud, `${skill.name}: nenhum alvo no alcance.`); return; }
      }
      if (skill.kind === 'aoe') {
        targets = nearbyMonsters(skill.radius ?? 150);
        if (!targets.length) { showDialog(hud, `${skill.name}: nenhum inimigo por perto.`); return; }
      }

      const check = skillController.canUse(skillId);
      if ('reason' in check && check.reason) { showDialog(hud, check.reason); return; }
      const activated = skillController.activate(skillId);
      if ('reason' in activated && activated.reason) { showDialog(hud, activated.reason); return; }

      const baseAttack = attackPower();
      const color = skill.effectColor ?? 0xf0b85d;
      if (skill.kind === 'melee' && target) {
        faceTarget(target); hero.attack(); attackCooldown = 30; pulse(82, color, 280); hitMonster(target, baseAttack * (skill.damageMultiplier ?? 1), color);
      } else if (skill.kind === 'charge' && target) {
        faceTarget(target); dashToward(target); hero.attack(); attackCooldown = 34; pulse(58, color, 300); hitMonster(target, baseAttack * (skill.damageMultiplier ?? 1), color);
      } else if (skill.kind === 'target' && target) {
        faceTarget(target); hero.cast(); attackCooldown = 32; magicLink(target, color); hitMonster(target, baseAttack * (skill.damageMultiplier ?? 1), color);
      } else if (skill.kind === 'aoe') {
        if (classDef.id === 'mage') hero.cast(); else hero.attack();
        attackCooldown = 38; pulse(skill.radius ?? 165, color, 480);
        for (const monster of targets) hitMonster(monster, baseAttack * (skill.damageMultiplier ?? 1), color);
      } else if (skill.kind === 'buff') {
        if (classDef.id === 'mage') hero.cast();
        pulse(105, color, 650);
        floating(player.x, player.y - 105, `ATQ +${skill.buffAttackPercent ?? 0}%`, color);
        showDialog(hud, `${skill.name}: Ataque +${skill.buffAttackPercent ?? 0}% por ${Math.round((skill.buffDurationMs ?? 0) / 1000)}s.`);
      }

      skillBar.refresh(skillController.snapshot());
      save();
    };

    const interact = () => {
      if (uiOpen()) return;
      let nearestMerchant: typeof merchants[number] | null = null;
      let merchantDistance = Infinity;
      for (const merchant of merchants) {
        const d = distance(player.x, player.y, merchant.npc.x, merchant.npc.y);
        if (d < merchantDistance) { merchantDistance = d; nearestMerchant = merchant; }
      }
      if (nearestMerchant && merchantDistance < 120) {
        keys.clear(); resetStick(); shop.open(nearestMerchant.shopId); return;
      }
      if (distance(player.x, player.y, npc.x, npc.y) >= 115) return;
      const result = interactQuest(progress);
      if (result.type === 'all_done') showDialog(hud, 'Elandra: Você já concluiu todas as missões de teste.');
      else if (result.type === 'accepted') showDialog(hud, `Elandra: ${result.quest.objective}. Recompensa: ${result.quest.rewardExp} EXP e ${result.quest.rewardCoins} moedas.`);
      else if (result.type === 'completed') {
        grantExp(result.quest.rewardExp); coins += result.quest.rewardCoins;
        showDialog(hud, `Missão concluída! +${result.quest.rewardExp} EXP e +${result.quest.rewardCoins} moedas.`);
      } else showDialog(hud, `Elandra: ${result.quest.objective}. Progresso ${result.state.progress}/${result.state.target}.`);
      refresh(); save(); characterSheet.refresh();
    };

    const attack = () => {
      if (uiOpen() || attackCooldown > 0 || hero.isAttacking) return;
      if (isInSafeZone(player.x, player.y)) { showDialog(hud, 'Área segura: combates não são permitidos dentro da vila.'); return; }
      const target = findAttackTarget(monsters, player.x, player.y, classDef.basicAttack.range);
      if (!target) return;
      faceTarget(target);
      if (!playClassAction()) return;
      attackCooldown = classDef.basicAttack.cooldownTicks;
      if (classDef.id === 'mage') magicLink(target, 0x82b7ff);
      hitMonster(target, attackPower(), classDef.id === 'mage' ? 0x9ddcff : 0xffc2b8);
    };

    hud.attack.addEventListener('pointerdown', attack);
    hud.interact.addEventListener('pointerdown', interact);
    window.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      if (isDead) { event.preventDefault(); return; }
      if (key === 'i' && characterSheet.isOpen()) characterSheet.close();
      if (key === 'i' && shop.isOpen()) shop.close();
      if (key === 'c' && inventory.isOpen()) inventory.close();
      if (key === 'c' && shop.isOpen()) shop.close();
      if (uiOpen() && event.key !== 'Escape' && key !== 'i' && key !== 'c') return;
      keys.add(key);
      if (event.code === 'Space') attack();
      if (key === 'e') interact();
      const skill = classSkills.find((entry) => String(entry.slot) === key);
      if (skill) { event.preventDefault(); useSkill(skill.id); }
    }, true);
    window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));

    const updateStick = (clientX: number, clientY: number) => {
      const r = hud.stick.getBoundingClientRect();
      let dx = clientX - (r.left + r.width / 2), dy = clientY - (r.top + r.height / 2);
      const max = 42, len = Math.hypot(dx, dy);
      if (len > max) { dx = dx / len * max; dy = dy / len * max; }
      stickX = dx / max; stickY = dy / max; hud.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    hud.stick.addEventListener('pointerdown', (e) => { if (!uiOpen()) { hud.stick.setPointerCapture(e.pointerId); updateStick(e.clientX, e.clientY); } });
    hud.stick.addEventListener('pointermove', (e) => { if (hud.stick.hasPointerCapture(e.pointerId)) updateStick(e.clientX, e.clientY); });
    hud.stick.addEventListener('pointerup', resetStick);
    hud.stick.addEventListener('pointercancel', resetStick);

    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
    window.addEventListener('pagehide', save);

    if (isDead) enterDeathState();

    app.ticker.add((ticker: Ticker) => {
      autosaveMs += ticker.deltaMS;
      if (autosaveMs >= 3000) { autosaveMs = 0; save(); }
      attackCooldown = Math.max(0, attackCooldown - ticker.deltaTime);
      skillController.tick(ticker.deltaMS, uiOpen());
      skillUiMs += ticker.deltaMS;
      if (skillUiMs >= 100) { skillUiMs = 0; skillBar.refresh(skillController.snapshot(), uiOpen()); }

      let dx = uiOpen() ? 0 : stickX, dy = uiOpen() ? 0 : stickY;
      if (!uiOpen()) {
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

      if (!isDead) {
        const safeNow = isInSafeZone(player.x, player.y);
        if (safeNow !== wasSafe) {
          wasSafe = safeNow;
          showDialog(hud, safeNow ? '🛡 Você entrou em uma área segura.' : 'Você saiu da área segura. Monstros podem atacar novamente.');
        }
      }

      if (!uiOpen()) {
        updateMonsters(monsters, ticker, player, progress.defense, (damage) => {
          if (isDead) return;
          playerHp = Math.max(0, playerHp - damage);
          floating(player.x, player.y - 90, `-${damage}`, 0xff8f8f);
          if (playerHp <= 0) { enterDeathState(); return; }
          refresh();
        });

        updateGroundLoot(groundLoot, ticker, player, progress, (itemId, quantity) => {
          const item = getItem(itemId);
          if (item) {
            floating(player.x, player.y - 75, `+${quantity} ${item.icon}`, 0xffe7a0);
            showDialog(hud, `${quantity}x ${item.name} adicionado ao inventário.`);
          }
          inventory.refresh(); save(); characterSheet.refresh();
        }, () => showDialog(hud, 'Inventário cheio. O item continuará no chão por um tempo.'));
      }

      world.x = Math.max(Math.min(0, app.screen.width - WORLD_W), Math.min(0, app.screen.width / 2 - player.x));
      world.y = Math.max(Math.min(0, app.screen.height - WORLD_H), Math.min(0, app.screen.height / 2 - player.y));
    });

    refresh(); inventory.refresh(); characterSheet.refresh(); skillBar.refresh(skillController.snapshot(), isDead); save();
    if (bootStatus) bootStatus.remove();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(error);
    setBootMessage(`Erro ao iniciar o jogo: ${message}`);
    if (bootStatus) { bootStatus.style.display = 'grid'; bootStatus.style.background = '#2b1115'; bootStatus.style.color = '#ffd7dc'; }
  }
}
