import { Application, Container, Graphics, Text, Ticker } from 'pixi.js';
import { basicAttackColor, basicAttackDamage, classUsesProjectile, executeSkillEffects, playClassAnimation } from '../classes/classCombatRuntime';
import { ensureAdvancedClassStats, levelUpCharacterProgress } from '../classes/classProgression';
import { LpcCharacter, type Facing } from '../character/lpcCharacter';
import { persistSelectedCharacter, showCharacterCreator } from '../character/characterCreator';
import { createCharacterSheet } from '../character/characterSheet';
import { createCraftingStations, nearestCraftingStation } from '../crafting/craftingStations';
import { createCraftingUi } from '../crafting/craftingUi';
import { createGatheringSystem, gatheringItemName } from '../gathering/gatheringSystem';
import { ensureGmAuthorityBootstrap, getGmRole, type GmRole } from '../gm/gmAuthority';
import { createGmPanel, type GmRuntimeFlags } from '../gm/gmPanel';
import { createInventory } from '../items/inventory';
import { ensureInventoryState, getItem } from '../items/itemCatalog';
import { spawnMonsterLoot, updateGroundLoot, type GroundLoot } from '../items/lootSystem';
import { createMapSystem } from '../map/mapSystem';
import { createPetSystem } from '../pets/petSystem';
import { ensurePetState } from '../pets/petState';
import { createPetUi } from '../pets/petUi';
import { createQuestJournal } from '../quests/questJournal';
import { ensureQuestStates, getNpcQuestMarker, grantQuestItemRewards, interactQuestNpc, NPC_NAMES, registerQuestEvent, syncCollectObjectives } from '../quests/questEngine';
import { nearestQuestInteractable, visitZonesAt } from '../quests/worldQuestTargets';
import { createAudioManager } from '../settings/audioManager';
import { createGameMenu } from '../settings/gameMenu';
import { createInputManager } from '../settings/inputManager';
import { createSettingsStore, graphicsBootstrap, type GameSettings } from '../settings/settingsState';
import { createSkillBar } from '../skills/skillBar';
import { createSkillController } from '../skills/skillController';
import { getSkill, type SkillId } from '../skills/skillCatalog';
import { createHud, showDialog, updateHud } from './hud';
import { createMonsters, damageMonster, findAttackTarget, killMonster, updateMonsters, type Monster } from './monsterSystem';
import { createRespawnScreen } from './respawn';
import { createShop } from './shopSystem';
import { createVillageMerchants, type VillageMerchant } from './villageNpcs';
import { collides, createElandra, createWorld, distance, isInSafeZone, nearestVillage, SPAWN, WORLD_H, WORLD_W } from './world';

const bootStatus = document.querySelector<HTMLDivElement>('#boot-status');
const setBootMessage = (message: string) => { if (bootStatus) bootStatus.textContent = message; };

export async function startGame() {
  try {
    setBootMessage('Abrindo seleção de personagem...');
    const selected = await showCharacterCreator();
    const config = selected.config;
    const progress = selected.progress;
    ensureGmAuthorityBootstrap();
    const settingsStore = createSettingsStore(selected.accountKey);
    const input = createInputManager(settingsStore);
    const graphics = graphicsBootstrap(settingsStore.settings);
    ensureQuestStates(progress);
    ensurePetState(progress);
    const inventoryState = ensureInventoryState(progress);
    const skillController = createSkillController(progress);
    const classDef = skillController.classDef;
    const classRuntime = ensureAdvancedClassStats(progress, classDef);
    const classSkills = skillController.skills;
    if (bootStatus) bootStatus.style.display = 'grid';
    setBootMessage(`Preparando ${config.name}...`);

    const app = new Application();
    await app.init({ resizeTo: window, backgroundColor: 0x14231d, antialias: graphics.antialias, resolution: graphics.resolution, preference: 'webgl' });
    const mount = document.querySelector<HTMLDivElement>('#app');
    if (!mount) throw new Error('Elemento #app não encontrado.');
    mount.appendChild(app.canvas);

    const { world, obstacles } = createWorld();
    app.stage.addChild(world);
    const { npc, mark: npcMark } = createElandra(world);
    const merchants = createVillageMerchants(world);
    const craftingStations = createCraftingStations(world);
    const gatheringSystem = createGatheringSystem(world, progress);

    const shrineHint = new Text({
      text: '✦ Santuário de Renascimento',
      style: { fill: 0xe6ffd8, fontSize: 10, fontWeight: 'bold', stroke: { color: 0x17321f, width: 4 } },
    });
    shrineHint.anchor.set(.5); shrineHint.position.set(970, 1332); shrineHint.alpha = .48; world.addChild(shrineHint);

    const player = new Container();
    player.addChild(new Graphics().ellipse(0, 5, 25, 10).fill({ color: 0, alpha: .25 }));
    const hero = await LpcCharacter.create(config, inventoryState.equipment);
    player.addChild(hero.view);
    const playerName = new Text({ text: config.name, style: { fill: 0xffffff, fontSize: 14, fontWeight: 'bold', stroke: { color: 0, width: 4 } } });
    playerName.anchor.set(.5); playerName.y = -94; player.addChild(playerName);
    let currentGmRole: GmRole = getGmRole(selected.accountKey);
    const gmTag = new Text({ text: '', style: { fill: 0x8ddfff, fontSize: 11, fontWeight: '900', stroke: { color: 0x061017, width: 4 } } });
    gmTag.anchor.set(.5); gmTag.y = -112; player.addChild(gmTag);
    const syncGmTag = (role: GmRole = getGmRole(selected.accountKey)) => {
      currentGmRole = role;
      gmTag.text = role === 'admin' ? '[ADMIN]' : role === 'gm' ? '[GM]' : '';
      gmTag.style.fill = role === 'admin' ? 0xffd36f : 0x8ddfff;
      gmTag.visible = role !== 'player' && settingsStore.settings.interface.showNames;
    };
    syncGmTag(currentGmRole);
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
    const gmFlags: GmRuntimeFlags = { godMode: false, noclip: false, speedMultiplier: 1 };

    const save = () => {
      progress.hp = isDead ? 0 : Math.max(1, Math.ceil(playerHp));
      progress.coins = coins;
      progress.map = 'Floresta Inicial';
      progress.position = { x: Math.round(player.x), y: Math.round(player.y) };
      progress.lastPlayedAt = Date.now();
      selected.progress = progress;
      persistSelectedCharacter(selected);
    };

    const syncNpcMarkers = () => {
      const elandraMarker = getNpcQuestMarker(progress, 'elandra');
      npcMark.text = elandraMarker.symbol;
      npcMark.style.fill = elandraMarker.color;
      for (const merchant of merchants) {
        const marker = getNpcQuestMarker(progress, merchant.id);
        merchant.questMark.text = marker.symbol;
        merchant.questMark.style.fill = marker.color;
      }
    };

    const refresh = () => { updateHud(hud, progress, playerHp, coins); syncNpcMarkers(); };
    const questJournal = createQuestJournal(progress, { onChanged: () => { refresh(); save(); } });
    const characterSheet = createCharacterSheet(config, progress);
    const refreshQuestUi = () => { refresh(); questJournal.refresh(); };
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
      onChanged: () => { syncCollectObjectives(progress); syncEquipmentVisuals(); refreshQuestUi(); save(); },
      notify: (message) => showDialog(hud, message),
    });

    const shop = createShop(progress, {
      getCoins: () => coins,
      setCoins: (value) => { coins = Math.max(0, Math.floor(value)); progress.coins = coins; },
      onChanged: () => { syncCollectObjectives(progress); inventory.refresh(); characterSheet.refresh(); refreshQuestUi(); save(); },
      notify: (message) => showDialog(hud, message),
    });

    const craftingUi = createCraftingUi(progress, {
      onChanged: () => { syncCollectObjectives(progress); inventory.refresh(); characterSheet.refresh(); refreshQuestUi(); save(); },
      notify: (message) => showDialog(hud, message),
      onCrafted: (recipe, amount) => {
        for (let i = 0; i < amount; i++) {
          const updates = registerQuestEvent(progress, { type: 'craft', recipeId: recipe.id, outputItemId: recipe.output.itemId });
          const ready = updates.find((update) => update.becameReady);
          if (ready) showDialog(hud, `${ready.quest.title}: objetivo de fabricação concluído.`);
        }
        refreshQuestUi(); save();
      },
    });

    const petUi = createPetUi(progress, {
      onChanged: () => save(),
      notify: (message) => showDialog(hud, message),
    });

    const mapSystem = createMapSystem(progress, {
      player,
      elandra: npc,
      merchants,
      monsters,
      onChanged: () => save(),
    });

    const gmPanel = createGmPanel({
      accountKey: selected.accountKey,
      characterName: config.name,
      progress,
      player,
      world,
      monsters,
      canvas: app.canvas,
      flags: gmFlags,
      refreshInventory: () => { inventory.refresh(); characterSheet.refresh(); },
      refreshHud: refresh,
      save,
      notify: (message) => showDialog(hud, message),
      onRoleChanged: (role) => syncGmTag(role),
    });

    const audioManager = createAudioManager(settingsStore);
    const applySettings = (settings: GameSettings) => {
      document.documentElement.dataset.hideMinimap = String(!settings.interface.showMinimap);
      document.documentElement.dataset.hideQuestTracker = String(!settings.interface.showQuestTracker);
      document.documentElement.dataset.hideDesktopShortcuts = String(!settings.interface.showDesktopShortcuts);
      document.documentElement.dataset.graphicsPreset = settings.graphics.preset;
      playerName.visible = settings.interface.showNames;
      gmTag.visible = settings.interface.showNames && currentGmRole !== 'player';
      for (const monster of monsters) {
        for (const child of monster.view.children) {
          if (child instanceof Text && child.text === monster.name) child.visible = settings.interface.showNames;
        }
      }
      app.ticker.maxFPS = settings.graphics.fpsLimit;
      audioManager.refresh();
    };

    const gameMenu = createGameMenu(settingsStore, {
      characterName: config.name,
      input,
      onSave: save,
      onSettingsChanged: applySettings,
      onCharacterSelect: () => window.location.reload(),
      onLogout: () => { localStorage.removeItem('ascension.session.v1'); window.location.reload(); },
      onExit: () => {},
    });
    settingsStore.onChange(applySettings);
    applySettings(settingsStore.settings);

    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      if (!input.matches(event, 'menu') && event.code !== 'Escape') return;
      if (gmPanel?.isOpen()) { event.preventDefault(); event.stopImmediatePropagation(); gmPanel.close(); return; }
      event.preventDefault(); event.stopImmediatePropagation();
      if (isDead) return;
      if (gameMenu.isOpen()) { gameMenu.close(); return; }
      inventory.close(); characterSheet.close(); shop.close(); questJournal.close(); craftingUi.close(); petUi.close(); mapSystem.close();
      keys.clear(); resetStick(); gameMenu.open();
    }, true);
    input.installLegacyBridge();

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
        keys.clear(); resetStick(); wasSafe = true;
        respawnScreen.hide(); refreshQuestUi(); characterSheet.refresh(); mapSystem.refresh();
        skillBar.refresh(skillController.snapshot()); save();
        showDialog(hud, `Você renasceu em ${village.name}. Esta é uma área segura.`);
      },
    });

    const uiOpen = () => isDead || respawnScreen.isOpen() || inventory.isOpen() || characterSheet.isOpen() || shop.isOpen() || questJournal.isOpen() || craftingUi.isOpen() || petUi.isOpen() || mapSystem.isOpen() || gameMenu.isOpen() || Boolean(gmPanel?.isOpen());
    hud.inventory.addEventListener('pointerdown', () => { if (isDead) return; gmPanel?.close(); shop.close(); craftingUi.close(); characterSheet.close(); questJournal.close(); petUi.close(); mapSystem.close(); inventory.toggle(); });
    hud.character.addEventListener('pointerdown', () => { if (isDead) return; gmPanel?.close(); shop.close(); craftingUi.close(); inventory.close(); questJournal.close(); petUi.close(); mapSystem.close(); characterSheet.toggle(); });
    hud.questJournal.addEventListener('pointerdown', () => { if (isDead) return; gmPanel?.close(); shop.close(); craftingUi.close(); inventory.close(); characterSheet.close(); petUi.close(); mapSystem.close(); questJournal.toggle(); });
    hud.pet.addEventListener('pointerdown', () => { if (isDead) return; gmPanel?.close(); shop.close(); craftingUi.close(); inventory.close(); characterSheet.close(); questJournal.close(); mapSystem.close(); petUi.toggle(); });
    hud.map.addEventListener('pointerdown', () => { if (isDead) return; gmPanel?.close(); shop.close(); craftingUi.close(); inventory.close(); characterSheet.close(); questJournal.close(); petUi.close(); keys.clear(); resetStick(); mapSystem.toggle(); });
    hud.menu.addEventListener('pointerdown', () => {
      if (isDead) return;
      gmPanel?.close();
      if (!gameMenu.isOpen()) { shop.close(); craftingUi.close(); inventory.close(); characterSheet.close(); questJournal.close(); petUi.close(); mapSystem.close(); keys.clear(); resetStick(); }
      gameMenu.toggle();
    });

    const enterDeathState = () => {
      if (respawnScreen.isOpen()) return;
      isDead = true; playerHp = 0; progress.hp = 0;
      deathPosition = { x: player.x, y: player.y }; player.alpha = .42;
      keys.clear(); resetStick(); inventory.close(); characterSheet.close(); shop.close(); questJournal.close(); craftingUi.close(); petUi.close(); mapSystem.close(); gameMenu.close(); gmPanel?.close();
      skillBar.refresh(skillController.snapshot(), true);
      const village = nearestVillage(deathPosition.x, deathPosition.y, progress.map || 'Floresta Inicial');
      if (village) respawnScreen.show(village);
      refreshQuestUi(); save();
    };

    const floating = (x: number, y: number, text: string, color: number) => {
      if (!settingsStore.settings.interface.showFloatingDamage) return;
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
      if (!settingsStore.settings.graphics.effects) return;
      const effect = new Graphics().circle(0, 0, radius).stroke({ width: 5, color, alpha: .8 });
      effect.position.set(player.x, player.y); world.addChild(effect);
      let remaining = durationMs;
      const tick = (ticker: Ticker) => {
        remaining -= ticker.deltaMS;
        const t = Math.max(0, remaining / durationMs); effect.alpha = t; effect.scale.set(1 + (1 - t) * .35);
        if (remaining <= 0) { app.ticker.remove(tick); world.removeChild(effect); effect.destroy(); }
      };
      app.ticker.add(tick);
    };

    const projectileLink = (target: Monster, color: number) => {
      if (!settingsStore.settings.graphics.effects) return;
      const effect = new Graphics().moveTo(player.x, player.y - 34).lineTo(target.view.x, target.view.y - 22).stroke({ width: 5, color, alpha: .85 });
      effect.circle(target.view.x, target.view.y - 22, 15).stroke({ width: 3, color, alpha: .75 }); world.addChild(effect);
      let remaining = 180;
      const tick = (ticker: Ticker) => {
        remaining -= ticker.deltaMS; effect.alpha = Math.max(0, remaining / 180);
        if (remaining <= 0) { app.ticker.remove(tick); world.removeChild(effect); effect.destroy(); }
      };
      app.ticker.add(tick);
    };

    const grantExp = (amount: number) => {
      progress.exp += amount;
      let leveled = false;
      while (progress.exp >= progress.expToNext && progress.level < classDef.progression.maxLevel) {
        progress.exp -= progress.expToNext;
        if (!levelUpCharacterProgress(progress, classDef)) break;
        playerHp = progress.maxHp;
        leveled = true;
      }
      if (progress.level >= classDef.progression.maxLevel) progress.exp = Math.min(progress.exp, Math.max(0, progress.expToNext - 1));
      if (leveled) showDialog(hud, `Nível ${progress.level}! A progressão de ${classDef.name} foi aplicada.`);
      characterSheet.refresh();
    };

    const announceQuestUpdates = (updates: ReturnType<typeof registerQuestEvent>) => {
      const ready = updates.find((update) => update.becameReady);
      if (ready) showDialog(hud, `${ready.quest.title}: objetivos concluídos! Volte para ${NPC_NAMES[ready.quest.endNpcId] ?? ready.quest.endNpcId}.`);
      else {
        const completed = updates.find((update) => update.objectiveCompleted);
        if (completed) showDialog(hud, `${completed.quest.title}: ${completed.objective.label} concluído.`);
      }
      if (updates.length) { refreshQuestUi(); mapSystem.refresh(); save(); }
    };

    const petSystem = createPetSystem(world, player, progress, selected.id, groundLoot, {
      onCollected: (itemId, quantity, x, y) => {
        const item = getItem(itemId);
        if (item) floating(x, y - 25, `🐾 +${quantity} ${item.icon}`, 0xb9efbf);
        announceQuestUpdates(syncCollectObjectives(progress));
        inventory.refresh(); refreshQuestUi(); characterSheet.refresh(); save();
      },
      onInventoryFull: () => showDialog(hud, 'Mascote: inventário cheio. O drop continuará no chão.'),
    });

    const syncWorldDepth = () => {
      if (!world.sortableChildren) return;
      for (const child of world.children) {
        if (child.zIndex <= -400_000 || child.zIndex >= 400_000) continue;
        child.zIndex = child.y;
      }
      world.sortChildren();
    };
    syncWorldDepth();

    const onKill = (monster: Monster) => {
      grantExp(monster.expReward); coins += monster.coinReward;
      spawnMonsterLoot(world, monster.kind, monster.view.x, monster.view.y, groundLoot, selected.id);
      floating(monster.view.x, monster.view.y - 45, `+${monster.expReward} EXP`, 0xaee8ff);
      announceQuestUpdates(registerQuestEvent(progress, { type: 'kill', monsterKind: monster.kind, monsterId: monster.id }));
      inventory.refresh(); refreshQuestUi(); save(); characterSheet.refresh(); mapSystem.refresh();
    };

    const facePoint = (x: number, y: number) => {
      const dx = x - player.x, dy = y - player.y;
      const facing: Facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
      hero.setFacing(facing);
    };
    const faceTarget = (target: Monster) => facePoint(target.view.x, target.view.y);
    const hitMonster = (monster: Monster, amount: number, color = 0xffc2b8) => {
      const damage = Math.max(1, Math.round(amount));
      const died = damageMonster(monster, damage); floating(monster.view.x, monster.view.y - 25, `-${damage}`, color);
      if (died) { killMonster(monster); onKill(monster); }
    };
    const nearbyMonsters = (radius: number) => monsters.filter((monster) => monster.alive && distance(player.x, player.y, monster.view.x, monster.view.y) <= radius);

    const dashToward = (target: Monster) => {
      const dx = target.view.x - player.x, dy = target.view.y - player.y, d = Math.max(1, Math.hypot(dx, dy));
      const travel = Math.max(0, d - 66), steps = Math.max(1, Math.ceil(travel / 12));
      let bestX = player.x, bestY = player.y;
      for (let i = 1; i <= steps; i++) {
        const step = Math.min(travel, i * 12);
        const x = Math.max(40, Math.min(WORLD_W - 40, player.x + dx / d * step));
        const y = Math.max(80, Math.min(WORLD_H - 40, player.y + dy / d * step));
        if ((!gmFlags.noclip && collides(obstacles, x, y)) || isInSafeZone(x, y)) break;
        bestX = x; bestY = y;
      }
      player.position.set(bestX, bestY);
    };

    const healPlayer = (amount: number) => {
      if (isDead || amount <= 0) return;
      playerHp = Math.min(progress.maxHp, playerHp + amount);
      progress.hp = playerHp;
      refresh();
    };

    useSkill = (skillId: SkillId) => {
      if (uiOpen() || hero.isAttacking) return;
      if (isInSafeZone(player.x, player.y)) { showDialog(hud, 'Área segura: habilidades de combate não podem ser usadas aqui.'); return; }
      const skill = getSkill(skillId); if (!skill) return;
      let target: Monster | null = null;
      let targets: Monster[] = [];
      const needsEnemy = skill.targeting === 'enemy' || skill.targeting === 'area-target' || skill.targeting === 'line' || skill.targeting === 'cone';
      if (needsEnemy) {
        target = findAttackTarget(monsters, player.x, player.y, skill.range ?? 120);
        if (!target) { showDialog(hud, `${skill.name}: nenhum alvo no alcance.`); return; }
      }
      if (skill.targeting === 'area-self') {
        targets = nearbyMonsters(skill.radius ?? 150);
        if (!targets.length && skill.effects.some((effect) => effect.type === 'damage' || effect.type === 'dot')) { showDialog(hud, `${skill.name}: nenhum inimigo por perto.`); return; }
      } else if (skill.targeting === 'area-target' && target) {
        const radius = skill.radius ?? 150;
        targets = monsters.filter((monster) => monster.alive && distance(target!.view.x, target!.view.y, monster.view.x, monster.view.y) <= radius);
      } else if (target) targets = [target];

      const check = skillController.canUse(skillId); if ('reason' in check && check.reason) { showDialog(hud, check.reason); return; }
      const activated = skillController.activate(skillId); if ('reason' in activated && activated.reason) { showDialog(hud, activated.reason); return; }
      if (target) faceTarget(target);
      if (!playClassAnimation(hero, skill.animation)) return;
      attackCooldown = Math.max(1, Math.round((skill.castTimeMs > 0 ? skill.castTimeMs / 16.67 : 24) / Math.max(.1, classRuntime.castSpeed)));
      const color = skill.effectColor ?? 0x9ddcff;
      if (target && (skill.projectileKey || skill.kind === 'projectile' || skill.kind === 'target')) projectileLink(target, color);
      executeSkillEffects({
        progress,
        skill,
        target,
        targets,
        hitMonster,
        healPlayer,
        dashToTarget: dashToward,
        addResource: skillController.addResource,
        showPulse: pulse,
        showFloating: (text, effectColor) => floating(player.x, player.y - 105, text, effectColor),
        notify: (message) => showDialog(hud, message),
      });
      skillBar.refresh(skillController.snapshot()); save();
    };

    const applyQuestInteraction = (result: ReturnType<typeof interactQuestNpc>, npcName: string) => {
      if (result.type === 'none') return false;
      if (result.type === 'accepted') showDialog(hud, `${npcName}: ${result.quest.dialog?.accepted ?? result.quest.summary}`);
      else if (result.type === 'progress') showDialog(hud, `${npcName}: ${result.quest.dialog?.progress ?? 'Continue os objetivos da missão.'}`);
      else if (result.type === 'updated') {
        showDialog(hud, result.becameReady ? `${result.quest.title}: pronta para entregar.` : `${result.quest.title}: objetivo atualizado.`);
      } else if (result.type === 'completed') {
        grantExp(result.quest.rewards.exp ?? 0); coins += result.quest.rewards.coins ?? 0;
        const items = grantQuestItemRewards(progress, result.quest);
        const extras = items.granted.length ? ` · ${items.granted.join(', ')}` : '';
        showDialog(hud, `Missão concluída: ${result.quest.title}! +${result.quest.rewards.exp ?? 0} EXP · +${result.quest.rewards.coins ?? 0} moedas${extras}`);
        if (items.missed.length) window.setTimeout(() => showDialog(hud, `Inventário sem espaço para: ${items.missed.join(', ')}.`), 900);
      }
      syncCollectObjectives(progress); inventory.refresh(); characterSheet.refresh(); refreshQuestUi(); mapSystem.refresh(); save(); return true;
    };

    const gatherNearby = () => {
      const closest = gatheringSystem.nearest(player.x, player.y, progress.map || 'Floresta Inicial', 0);
      if (!closest) return false;
      const result = gatheringSystem.gather(player.x, player.y, progress.map || 'Floresta Inicial');
      if (!result.ok) { showDialog(hud, result.reason ?? 'Não foi possível coletar.'); return true; }
      if (!result.node || !result.itemId) return true;
      facePoint(result.node.x, result.node.y);
      if (result.node.animation === 'emote') hero.emote(); else hero.attack();
      const item = getItem(result.itemId);
      floating(player.x, player.y - 82, `+${result.added ?? 0} ${item?.icon ?? ''}`, 0xbfe9a8);
      const suffix = result.lost ? ` ${result.lost} não coube no inventário.` : '';
      showDialog(hud, `${result.added ?? 0}x ${gatheringItemName(result.itemId)} coletado.${suffix}`);
      announceQuestUpdates(registerQuestEvent(progress, { type: 'gather', nodeId: result.node.id, itemId: result.itemId }));
      announceQuestUpdates(syncCollectObjectives(progress));
      inventory.refresh(); refreshQuestUi(); mapSystem.refresh(); save();
      return true;
    };

    const interact = () => {
      if (uiOpen() || hero.isAttacking) return;
      const map = progress.map || 'Floresta Inicial';

      const questTarget = nearestQuestInteractable(player.x, player.y, map);
      if (questTarget) {
        keys.clear(); resetStick();
        const updates = registerQuestEvent(progress, { type: 'interact', targetId: questTarget.id });
        announceQuestUpdates(updates);
        if (!updates.length) showDialog(hud, questTarget.ambientText);
        return;
      }

      const station = nearestCraftingStation(craftingStations, player.x, player.y, map, 0);
      if (station?.actionable) {
        keys.clear(); resetStick(); shop.close(); inventory.close(); characterSheet.close(); questJournal.close(); petUi.close(); mapSystem.close();
        craftingUi.open(station.station.definition.type);
        return;
      }

      let nearestId = 'elandra', nearestName = 'Elandra', nearestDistance = distance(player.x, player.y, npc.x, npc.y);
      let nearestMerchant: VillageMerchant | null = null;
      for (const merchant of merchants) {
        const d = distance(player.x, player.y, merchant.npc.x, merchant.npc.y);
        if (d < nearestDistance) { nearestDistance = d; nearestId = merchant.id; nearestName = merchant.name; nearestMerchant = merchant; }
      }
      if (nearestDistance < 120) {
        keys.clear(); resetStick();
        const questResult = interactQuestNpc(progress, nearestId);
        if (applyQuestInteraction(questResult, nearestName)) return;
        if (nearestMerchant) { shop.open(nearestMerchant.shopId); return; }
        showDialog(hud, 'Elandra: Continue explorando a floresta. Novas missões surgirão conforme você progride.');
        return;
      }

      if (gatherNearby()) return;
      const hint = gatheringSystem.hint(player.x, player.y, map);
      if (hint) showDialog(hud, hint.actionable ? hint.text : `Chegue mais perto de ${hint.text}.`);
    };

    const attack = () => {
      if (uiOpen() || attackCooldown > 0 || hero.isAttacking) return;
      if (isInSafeZone(player.x, player.y)) { showDialog(hud, 'Área segura: combates não são permitidos dentro da vila.'); return; }
      const target = findAttackTarget(monsters, player.x, player.y, classDef.basicAttack.range); if (!target) return;
      faceTarget(target);
      if (!playClassAnimation(hero, classDef.basicAttack.animation)) return;
      attackCooldown = Math.max(1, classDef.basicAttack.cooldownTicks / Math.max(.1, classRuntime.attackSpeed));
      const color = basicAttackColor(classDef);
      if (classUsesProjectile(classDef)) projectileLink(target, classDef.basicAttack.projectileColor ?? color);
      hitMonster(target, basicAttackDamage(progress, classDef, skillController.attackMultiplier()), color);
      skillController.onBasicAttack();
    };

    hud.attack.addEventListener('pointerdown', attack);
    hud.interact.addEventListener('pointerdown', interact);
    window.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      if (event.code === 'F10') return;
      if (isDead) { event.preventDefault(); return; }
      if (key === 'i') { gmPanel?.close(); characterSheet.close(); questJournal.close(); craftingUi.close(); petUi.close(); mapSystem.close(); if (shop.isOpen()) shop.close(); }
      if (key === 'c') { gmPanel?.close(); inventory.close(); questJournal.close(); craftingUi.close(); petUi.close(); mapSystem.close(); if (shop.isOpen()) shop.close(); }
      if (key === 'j') { gmPanel?.close(); inventory.close(); characterSheet.close(); craftingUi.close(); petUi.close(); mapSystem.close(); if (shop.isOpen()) shop.close(); }
      if (key === 'p') { gmPanel?.close(); inventory.close(); characterSheet.close(); questJournal.close(); craftingUi.close(); mapSystem.close(); if (shop.isOpen()) shop.close(); }
      if (key === 'm') { gmPanel?.close(); inventory.close(); characterSheet.close(); questJournal.close(); craftingUi.close(); petUi.close(); if (shop.isOpen()) shop.close(); }
      if (uiOpen() && event.key !== 'Escape' && key !== 'i' && key !== 'c' && key !== 'j' && key !== 'p' && key !== 'm') return;
      if (key === 'p') { event.preventDefault(); petUi.toggle(); return; }
      if (key === 'm') { event.preventDefault(); keys.clear(); resetStick(); mapSystem.toggle(); return; }
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
    hud.stick.addEventListener('pointerup', resetStick); hud.stick.addEventListener('pointercancel', resetStick);

    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
    window.addEventListener('pagehide', save);
    window.addEventListener('pagehide', () => gmPanel?.destroy(), { once: true });
    if (isDead) enterDeathState();

    app.ticker.add((ticker: Ticker) => {
      autosaveMs += ticker.deltaMS; if (autosaveMs >= 3000) { autosaveMs = 0; save(); }
      attackCooldown = Math.max(0, attackCooldown - ticker.deltaTime);
      skillController.tick(ticker.deltaMS, uiOpen()); skillUiMs += ticker.deltaMS;
      if (!isDead && !uiOpen() && classRuntime.hpRegen > 0 && playerHp < progress.maxHp) playerHp = Math.min(progress.maxHp, playerHp + classRuntime.hpRegen * ticker.deltaMS / 1000);
      if (skillUiMs >= 100) { skillUiMs = 0; skillBar.refresh(skillController.snapshot(), uiOpen()); refresh(); }

      const map = progress.map || 'Floresta Inicial';
      gatheringSystem.update(player.x, player.y, map, ticker.deltaMS);
      const nearbyStation = nearestCraftingStation(craftingStations, player.x, player.y, map);
      for (const station of craftingStations) station.marker.alpha = nearbyStation?.station === station ? .92 : .48;
      shrineHint.alpha = distance(player.x, player.y, 970, 1380) < 180 ? .88 : .48;

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
        const facing: Facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down'); hero.setFacing(facing);
        const speed = 4.4 * classRuntime.moveSpeed * gmFlags.speedMultiplier * ticker.deltaTime;
        const nx = Math.max(40, Math.min(WORLD_W - 40, player.x + dx * speed));
        const ny = Math.max(80, Math.min(WORLD_H - 40, player.y + dy * speed));
        if (gmFlags.noclip || !collides(obstacles, nx, player.y)) player.x = nx;
        if (gmFlags.noclip || !collides(obstacles, player.x, ny)) player.y = ny;
      }
      hero.update(moving, ticker.deltaTime);
      petSystem.update(ticker, !isDead && !uiOpen());
      mapSystem.update(ticker.deltaMS);

      if (!isDead) {
        const safeNow = isInSafeZone(player.x, player.y);
        if (safeNow !== wasSafe) { wasSafe = safeNow; showDialog(hud, safeNow ? '🛡 Você entrou em uma área segura.' : 'Você saiu da área segura. Monstros podem atacar novamente.'); }
      }

      if (!uiOpen()) {
        for (const zone of visitZonesAt(player.x, player.y, map)) announceQuestUpdates(registerQuestEvent(progress, { type: 'visit', zoneId: zone.id }));
        updateMonsters(monsters, ticker, player, progress.defense, (damage) => {
          if (isDead || gmFlags.godMode) return;
          playerHp = Math.max(0, playerHp - damage);
          skillController.onDamageTaken();
          floating(player.x, player.y - 90, `-${damage}`, 0xff8f8f);
          if (playerHp <= 0) { enterDeathState(); return; } refresh();
        });

        updateGroundLoot(groundLoot, ticker, player, progress, selected.id, (itemId, quantity) => {
          const item = getItem(itemId);
          if (item) { floating(player.x, player.y - 75, `+${quantity} ${item.icon}`, 0xffe7a0); showDialog(hud, `${quantity}x ${item.name} adicionado ao inventário.`); }
          announceQuestUpdates(syncCollectObjectives(progress)); inventory.refresh(); refreshQuestUi(); save(); characterSheet.refresh();
        }, () => showDialog(hud, 'Inventário cheio. O item continuará no chão por um tempo.'));
      }

      syncWorldDepth();

      world.x = Math.max(Math.min(0, app.screen.width - WORLD_W), Math.min(0, app.screen.width / 2 - player.x));
      world.y = Math.max(Math.min(0, app.screen.height - WORLD_H), Math.min(0, app.screen.height / 2 - player.y));
    });

    refreshQuestUi(); inventory.refresh(); characterSheet.refresh(); craftingUi.refresh(); petUi.refresh(); mapSystem.refresh(); skillBar.refresh(skillController.snapshot(), isDead); save();
    if (bootStatus) bootStatus.remove();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(error); setBootMessage(`Erro ao iniciar o jogo: ${message}`);
    if (bootStatus) { bootStatus.style.display = 'grid'; bootStatus.style.background = '#2b1115'; bootStatus.style.color = '#ffd7dc'; }
  }
}
