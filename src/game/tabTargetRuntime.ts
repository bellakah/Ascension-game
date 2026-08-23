import { Graphics, type Application, type Container } from 'pixi.js';
import type { Monster } from './monsterSystem';
import { getSelectedMonsterId, setSelectedMonsterId } from './targetSelection';

type Options = {
  app: Application;
  world: Container;
  player: Container;
  monsters: Monster[];
  attack: () => void;
  uiOpen: () => boolean;
};

const isTyping = () => {
  const node = document.activeElement;
  return node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement || (node instanceof HTMLElement && node.isContentEditable);
};

const cssPx = (name: string, fallback: number) => {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
};

export function installTabTargetRuntime(options: Options) {
  const { app, world, player, monsters } = options;
  const marker = new Graphics();
  marker.eventMode = 'none';
  marker.visible = false;
  let markerBaseY = -72;
  let selected: Monster | null = null;
  let raf = 0;

  const panel = document.querySelector<HTMLElement>('#target-frame');
  const name = panel?.querySelector<HTMLElement>('#target-name') ?? null;
  const meta = panel?.querySelector<HTMLElement>('#target-meta') ?? null;
  const hpFill = panel?.querySelector<HTMLElement>('#target-hp-fill') ?? null;
  const hpText = panel?.querySelector<HTMLElement>('#target-hp-text') ?? null;

  const drawMarker = (monster: Monster | null) => {
    marker.clear();
    if (!monster) { marker.visible = false; return; }

    const scale = Math.max(.7, monster.definition?.appearance.scale ?? 1);
    markerBaseY = -72 * Math.max(1, Math.min(1.8, scale));

    marker.circle(0, -5, 7)
      .fill({ color: 0xd7a83f, alpha: .98 })
      .stroke({ width: 2, color: 0xffe49a, alpha: .98 });
    marker.moveTo(-4, 4)
      .lineTo(4, 4)
      .lineTo(0, 11)
      .closePath()
      .fill({ color: 0xd7a83f, alpha: .98 })
      .stroke({ width: 1.5, color: 0xffe49a, alpha: .92 });
    marker.circle(0, -5, 2).fill({ color: 0xfff3c2, alpha: .9 });
    marker.position.set(0, markerBaseY);
    marker.visible = true;
  };

  const syncPanel = () => {
    if (!panel) return;
    if (!selected || !selected.alive) {
      panel.classList.add('target-hidden');
      return;
    }
    panel.classList.remove('target-hidden');
    if (name) name.textContent = selected.name;
    if (meta) {
      const level = selected.definition?.level;
      const rank = selected.definition?.rank;
      meta.textContent = `${rank === 'boss' ? 'BOSS' : rank === 'elite' ? 'ELITE' : 'INIMIGO'}${level ? ` • Nv. ${level}` : ''}`;
    }
    const pct = Math.max(0, Math.min(100, selected.hp / Math.max(1, selected.maxHp) * 100));
    if (hpFill) hpFill.style.width = `${pct}%`;
    if (hpText) hpText.textContent = `${Math.max(0, Math.ceil(selected.hp))} / ${selected.maxHp}`;
  };

  const setTarget = (monster: Monster | null) => {
    if (selected === monster) { syncPanel(); return; }
    if (marker.parent) marker.parent.removeChild(marker);
    selected = monster && monster.alive ? monster : null;
    setSelectedMonsterId(selected?.id ?? null);
    if (selected) {
      drawMarker(selected);
      selected.view.addChild(marker);
    } else drawMarker(null);
    syncPanel();
  };

  const currentFromGlobal = () => {
    const id = getSelectedMonsterId();
    return id ? monsters.find((monster) => monster.id === id && monster.alive) ?? null : null;
  };

  const insideSafeViewport = (monster: Monster) => {
    const left = cssPx('--desktop-hud-left', 320);
    const right = cssPx('--desktop-hud-right', 250);
    const top = cssPx('--desktop-hud-top', 88);
    const bottom = cssPx('--desktop-hud-bottom', 120);
    const screenX = monster.view.x + world.x;
    const screenY = monster.view.y + world.y;
    return screenX >= left && screenX <= app.screen.width - right && screenY >= top && screenY <= app.screen.height - bottom;
  };

  const cycle = (reverse = false) => {
    const candidates = monsters
      .filter((monster) => monster.alive)
      .filter((monster) => Math.hypot(monster.view.x - player.x, monster.view.y - player.y) <= 900)
      .filter(insideSafeViewport)
      .sort((a, b) => Math.hypot(a.view.x - player.x, a.view.y - player.y) - Math.hypot(b.view.x - player.x, b.view.y - player.y));
    if (!candidates.length) { setTarget(null); return; }
    const current = selected ?? currentFromGlobal();
    const index = current ? candidates.findIndex((monster) => monster.id === current.id) : -1;
    const nextIndex = reverse
      ? (index <= 0 ? candidates.length - 1 : index - 1)
      : (index < 0 || index >= candidates.length - 1 ? 0 : index + 1);
    setTarget(candidates[nextIndex]);
  };

  const monsterAtPointer = (event: PointerEvent) => {
    const rect = app.canvas.getBoundingClientRect();
    const screenX = (event.clientX - rect.left) * (app.screen.width / Math.max(1, rect.width));
    const screenY = (event.clientY - rect.top) * (app.screen.height / Math.max(1, rect.height));
    const worldX = screenX - world.x;
    const worldY = screenY - world.y;
    let best: Monster | null = null;
    let bestDistance = Infinity;
    for (const monster of monsters) {
      if (!monster.alive) continue;
      const scale = Math.max(.8, monster.definition?.appearance.scale ?? 1);
      const pickRadius = 34 + 18 * Math.min(2, scale);
      const d = Math.hypot(monster.view.x - worldX, monster.view.y - worldY);
      if (d <= pickRadius && d < bestDistance) { best = monster; bestDistance = d; }
    }
    return best;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (document.documentElement.dataset.uiMode !== 'desktop' || event.code !== 'Tab' || options.uiOpen() || isTyping()) return;
    event.preventDefault();
    event.stopPropagation();
    cycle(event.shiftKey);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (document.documentElement.dataset.uiMode !== 'desktop' || event.button !== 0 || options.uiOpen() || isTyping()) return;
    const clicked = monsterAtPointer(event);
    if (clicked) setTarget(clicked);
    options.attack();
  };

  const onClearTarget = () => setTarget(null);

  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('ascension-clear-target', onClearTarget);
  app.canvas.addEventListener('pointerdown', onPointerDown);

  const tick = () => {
    if (selected && !selected.alive) setTarget(null);
    else if (selected) {
      syncPanel();
      const pulse = performance.now() / 180;
      marker.position.y = markerBaseY + Math.sin(pulse) * 3;
      const markerScale = 1 + Math.sin(pulse) * .035;
      marker.scale.set(markerScale);
      marker.alpha = .88 + (Math.sin(pulse) + 1) * .06;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    cycle,
    setTarget,
    clear: () => setTarget(null),
    dispose: () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('ascension-clear-target', onClearTarget);
      app.canvas.removeEventListener('pointerdown', onPointerDown);
      if (marker.parent) marker.parent.removeChild(marker);
      marker.destroy();
      setSelectedMonsterId(null);
    },
  };
}
