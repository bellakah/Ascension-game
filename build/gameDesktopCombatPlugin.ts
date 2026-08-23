import type { Plugin } from 'vite';

function patchMonsterHealthBars(code: string) {
  let next = code;
  if (next.includes("label = 'monster-health-bar'")) return next;

  next = next.replace(
    "  const hpFill = new Graphics().roundRect(-30, -38, 60, 5, 2).fill(0xdb5b52);\n  view.addChild(new Graphics().ellipse(0, 19, 23, 9).fill({ color: 0, alpha: .22 }), new Graphics().ellipse(0, -3, 30, 20).fill(0x71433f).stroke({ width: 3, color: 0xc66a58 }), new Graphics().circle(-14, -15, 10).fill(0x71433f), new Graphics().circle(-18, -17, 3).fill(0xffe06b), name, new Graphics().roundRect(-31, -39, 62, 7, 3).fill(0x301718), hpFill);",
    "  const hpBack = new Graphics().roundRect(-23, -40, 46, 5, 2).fill(0x301718); hpBack.label = 'monster-health-bar';\n  const hpFill = new Graphics().roundRect(0, 0, 44, 3, 1.5).fill(0xdb5b52); hpFill.position.set(-22, -39); hpFill.label = 'monster-health-bar';\n  view.addChild(new Graphics().ellipse(0, 19, 23, 9).fill({ color: 0, alpha: .22 }), new Graphics().ellipse(0, -3, 30, 20).fill(0x71433f).stroke({ width: 3, color: 0xc66a58 }), new Graphics().circle(-14, -15, 10).fill(0x71433f), new Graphics().circle(-18, -17, 3).fill(0xffe06b), name, hpBack, hpFill);",
  );

  next = next.replace(
    "  const hpFill = new Graphics().roundRect(-30, -42, 60, 5, 2).fill(0x80d65f);\n  view.addChild(new Graphics().roundRect(-31, -43, 62, 7, 3).fill(0x172514), hpFill);",
    "  const hpBack = new Graphics().roundRect(-23, -44, 46, 5, 2).fill(0x172514); hpBack.label = 'monster-health-bar';\n  const hpFill = new Graphics().roundRect(0, 0, 44, 3, 1.5).fill(0x80d65f); hpFill.position.set(-22, -43); hpFill.label = 'monster-health-bar';\n  view.addChild(hpBack, hpFill);",
  );

  next = next.replace(
    "  const hpBack = new Graphics().roundRect(-31 * scale, -46 * scale, 62 * scale, 7 * scale, 3).fill(0x351617); hpBack.zIndex = 4; view.addChild(hpBack);\n  const hpFill = new Graphics().roundRect(-30 * scale, -45 * scale, 60 * scale, 5 * scale, 2).fill(definition.rank === 'boss' ? 0xe28a3d : definition.rank === 'elite' ? 0xdd5f65 : 0xc94d54); hpFill.zIndex = 5; view.addChild(hpFill);",
    "  const hpBarY = -46 * scale;\n  const hpBack = new Graphics().roundRect(-23, hpBarY, 46, 5, 2).fill(0x351617); hpBack.zIndex = 4; hpBack.label = 'monster-health-bar'; view.addChild(hpBack);\n  const hpFill = new Graphics().roundRect(0, 0, 44, 3, 1.5).fill(definition.rank === 'boss' ? 0xe28a3d : definition.rank === 'elite' ? 0xdd5f65 : 0xc94d54); hpFill.position.set(-22, hpBarY + 1); hpFill.zIndex = 5; hpFill.label = 'monster-health-bar'; view.addChild(hpFill);",
  );

  return next;
}

function patchMonsterSystem(code: string) {
  let next = code;
  if (!next.includes("from './targetSelection'")) {
    next = next.replace(
      "import { distance, isInSafeZone } from './world';",
      "import { distance, isInSafeZone } from './world';\nimport { getSelectedMonsterId } from './targetSelection';",
    );
  }

  const oldTarget = `export function findAttackTarget(monsters: Monster[], x: number, y: number, range = 110) {\n  let target: Monster | null = null, best = Infinity;\n  for (const monster of monsters) { if (!monster.alive) continue; const d = distance(x, y, monster.view.x, monster.view.y); if (d <= range && d < best) { best = d; target = monster; } }\n  return target;\n}`;
  const newTarget = `export function findAttackTarget(monsters: Monster[], x: number, y: number, range = 110) {\n  const selectedId = getSelectedMonsterId();\n  if (selectedId) {\n    const selected = monsters.find((monster) => monster.id === selectedId && monster.alive) ?? null;\n    if (!selected) return null;\n    return distance(x, y, selected.view.x, selected.view.y) <= range ? selected : null;\n  }\n  let target: Monster | null = null, best = Infinity;\n  for (const monster of monsters) { if (!monster.alive) continue; const d = distance(x, y, monster.view.x, monster.view.y); if (d <= range && d < best) { best = d; target = monster; } }\n  return target;\n}`;
  if (!next.includes('const selectedId = getSelectedMonsterId();') && next.includes(oldTarget)) next = next.replace(oldTarget, newTarget);
  return patchMonsterHealthBars(next);
}

function patchRuntime(code: string) {
  let next = code;
  if (!next.includes("from './tabTargetRuntime'")) {
    next = next.replace(
      "import { createHud, showDialog, updateHud } from './hud';",
      "import { createHud, setHudPortrait, showDialog, updateHud, updateHudResource } from './hud';\nimport { installTabTargetRuntime } from './tabTargetRuntime';\nimport { getSafeCameraPosition } from './desktopViewport';",
    );
  }

  next = next.replace("      if (event.code === 'Space') attack();", "      if (event.code === 'Space') event.preventDefault();");

  if (!next.includes("createHud(progress, { name: config.name, className: classDef.name, classIcon: classDef.icon })")) {
    next = next.replace(
      "    const hud = createHud(progress);",
      "    const hud = createHud(progress, { name: config.name, className: classDef.name, classIcon: classDef.icon });",
    );
  }

  if (!next.includes('renderer.extract.base64({ target: hero.view')) {
    next = next.replace(
      "    const hud = createHud(progress, { name: config.name, className: classDef.name, classIcon: classDef.icon });",
      "    const hud = createHud(progress, { name: config.name, className: classDef.name, classIcon: classDef.icon });\n    void app.renderer.extract.base64({ target: hero.view, format: 'png', resolution: 2, clearColor: '#00000000' })\n      .then((portrait) => setHudPortrait(hud, portrait))\n      .catch((error) => console.warn('[HUD] Não foi possível gerar o retrato do personagem.', error));",
    );
  }

  if (!next.includes("playerHpOverhead.label = 'player-health-bar'")) {
    next = next.replace(
      "    playerName.anchor.set(.5); playerName.y = -94; player.addChild(playerName);",
      "    playerName.anchor.set(.5); playerName.y = -94; player.addChild(playerName);\n    const playerHpBack = new Graphics().roundRect(-23, -84, 46, 5, 2).fill(0x261416); playerHpBack.label = 'player-health-bar';\n    const playerHpOverhead = new Graphics().roundRect(0, 0, 44, 3, 1.5).fill(0xc44343); playerHpOverhead.position.set(-22, -83); playerHpOverhead.label = 'player-health-bar';\n    playerHpBack.visible = false; playerHpOverhead.visible = false; player.addChild(playerHpBack, playerHpOverhead);",
    );
  }

  if (!next.includes('playerHpOverhead.scale.x = Math.max(0, Math.min(1, playerHp / Math.max(1, progress.maxHp)))')) {
    next = next.replace(
      "    const refresh = () => { updateHud(hud, progress, playerHp, coins); syncNpcMarkers(); };",
      "    const refresh = () => { const resource = skillController.snapshot(); updateHud(hud, progress, playerHp, coins, { current: resource.energy, max: resource.maxEnergy, label: resource.resourceLabel }); playerHpOverhead.scale.x = Math.max(0, Math.min(1, playerHp / Math.max(1, progress.maxHp))); syncNpcMarkers(); };",
    );
  }

  if (!next.includes('settings.interface.showMonsterHealthBars')) {
    next = next.replace(
      "      playerName.visible = settings.interface.showNames;\n      for (const monster of monsters) {",
      "      playerName.visible = settings.interface.showNames;\n      playerHpBack.visible = settings.interface.showPlayerHealthBar;\n      playerHpOverhead.visible = settings.interface.showPlayerHealthBar;\n      document.documentElement.dataset.hidePlayerHealthBar = String(!settings.interface.showPlayerHealthBar);\n      document.documentElement.dataset.hideMonsterHealthBars = String(!settings.interface.showMonsterHealthBars);\n      for (const monster of monsters) {\n        for (const child of monster.view.children) if (child.label === 'monster-health-bar') child.visible = settings.interface.showMonsterHealthBars;",
    );
  }

  const oldEscape = `    window.addEventListener('keydown', (event) => {\n      if (event.repeat) return;\n      if (!input.matches(event, 'menu') && event.code !== 'Escape') return;\n      event.preventDefault(); event.stopImmediatePropagation();\n      if (isDead) return;\n      if (gameMenu.isOpen()) { gameMenu.close(); return; }\n      inventory.close(); characterSheet.close(); shop.close(); questJournal.close(); craftingUi.close(); petUi.close(); mapSystem.close();\n      keys.clear(); resetStick(); gameMenu.open();\n    }, true);`;
  const newEscape = `    window.addEventListener('keydown', (event) => {\n      if (event.repeat || event.code !== 'Escape' || isDead) return;\n      const externalUiOpen = Boolean(document.querySelector('#chat-shell:not(.chat-collapsed), #guild-overlay:not(.guild-hidden)'));\n      if (externalUiOpen) return;\n      event.preventDefault(); event.stopImmediatePropagation();\n      keys.clear(); resetStick();\n      if (gameMenu.isOpen()) { gameMenu.close(); return; }\n      if (mapSystem.isOpen()) { mapSystem.close(); return; }\n      if (petUi.isOpen()) { petUi.close(); return; }\n      if (craftingUi.isOpen()) { craftingUi.close(); return; }\n      if (questJournal.isOpen()) { questJournal.close(); return; }\n      if (shop.isOpen()) { shop.close(); return; }\n      if (characterSheet.isOpen()) { characterSheet.close(); return; }\n      if (inventory.isOpen()) { inventory.close(); return; }\n      window.dispatchEvent(new CustomEvent('ascension-clear-target'));\n    }, true);`;
  if (!next.includes("new CustomEvent('ascension-clear-target')") && next.includes(oldEscape)) next = next.replace(oldEscape, newEscape);

  if (!next.includes('installTabTargetRuntime({ app, world, player, monsters, attack, uiOpen })')) {
    next = next.replace(
      "    hud.attack.addEventListener('pointerdown', attack);",
      "    hud.attack.addEventListener('pointerdown', attack);\n    installTabTargetRuntime({ app, world, player, monsters, attack, uiOpen });",
    );
  }

  if (!next.includes('updateHudResource(hud, { current: resource.energy')) {
    next = next.replace(
      "      if (skillUiMs >= 100) { skillUiMs = 0; skillBar.refresh(skillController.snapshot(), uiOpen()); }",
      "      if (skillUiMs >= 100) { skillUiMs = 0; const resource = skillController.snapshot(); skillBar.refresh(resource, uiOpen()); updateHudResource(hud, { current: resource.energy, max: resource.maxEnergy, label: resource.resourceLabel }); }",
    );
  }

  const oldCamera = `      world.x = Math.max(Math.min(0, app.screen.width - WORLD_W), Math.min(0, app.screen.width / 2 - player.x));\n      world.y = Math.max(Math.min(0, app.screen.height - WORLD_H), Math.min(0, app.screen.height / 2 - player.y));`;
  const newCamera = `      const safeCamera = getSafeCameraPosition(app.screen.width, app.screen.height, player.x, player.y, WORLD_W, WORLD_H);\n      world.x = safeCamera.x;\n      world.y = safeCamera.y;`;
  if (!next.includes('const safeCamera = getSafeCameraPosition(') && next.includes(oldCamera)) next = next.replace(oldCamera, newCamera);
  return next;
}

function patchSettingsState(code: string) {
  const anchor = "  const controls = { ...base.controls, ...(source.controls ?? {}) };";
  if (code.includes("controls.basicAttack === 'Space'")) return code;
  if (!code.includes(anchor)) return code;
  return code.replace(anchor, `${anchor}\n  if (controls.basicAttack === 'Space') controls.basicAttack = 'Mouse0';`);
}

export function gameDesktopCombatPlugin(): Plugin {
  return {
    name: 'ascension-game-desktop-combat',
    enforce: 'pre',
    transform(code, id) {
      const clean = id.replace(/\\/g, '/').split('?')[0];
      if (clean.endsWith('/src/game/monsterSystem.ts')) return { code: patchMonsterSystem(code), map: null };
      if (clean.endsWith('/src/game/runtime.ts')) return { code: patchRuntime(code), map: null };
      if (clean.endsWith('/src/settings/settingsState.ts')) return { code: patchSettingsState(code), map: null };
      return null;
    },
  };
}
