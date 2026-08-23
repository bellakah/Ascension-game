import type { Plugin } from 'vite';

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
  return next;
}

function patchRuntime(code: string) {
  let next = code;
  if (!next.includes("from './tabTargetRuntime'")) {
    next = next.replace(
      "import { createHud, showDialog, updateHud } from './hud';",
      "import { createHud, showDialog, updateHud } from './hud';\nimport { installTabTargetRuntime } from './tabTargetRuntime';\nimport { getSafeCameraPosition } from './desktopViewport';",
    );
  }

  next = next.replace("      if (event.code === 'Space') attack();", "      if (event.code === 'Space') event.preventDefault();");

  if (!next.includes('installTabTargetRuntime({ app, world, player, monsters, attack, uiOpen })')) {
    next = next.replace(
      "    hud.attack.addEventListener('pointerdown', attack);",
      "    hud.attack.addEventListener('pointerdown', attack);\n    installTabTargetRuntime({ app, world, player, monsters, attack, uiOpen });",
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
