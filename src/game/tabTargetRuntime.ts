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
  const ring = new Graphics();
  ring.eventMode = 'none';
  ring.visible = false;
  let selected: Monster | null = null;
  let raf = 0;

  const panel = document.querySelector<HTMLElement>('#target-frame');
  const name = panel?.querySelector<HTMLElement>('#target-name') ?? null;
  const meta = panel?.querySelector<HTMLElement>('#target-meta') ?? null;
  const hpFill = panel?.querySelector<HTMLElement>('#target-hp-fill') ?? null;
  const hpText = panel?.querySelector<HTMLElement>('#target-hp-text') ?? null;

  const drawRing = (monster: Monster | null) => {
    ring.clear();
    if (!monster) { ring.visible = false; return; }
    const scale = Math.max(.7, monster.definition?.appearance.scale ?? 1);
    const radiusX = 28 * Math.min(1.7, scale);
    const radiusY = 11 * Math.min(1.45, scale);
    ring.ellipse(0, 7, radiusX, radiusY).fill({ color: 0xc89736, alpha: .12 }).stroke({ width: 3, color: 0xf4c75a, alpha: .96 });
    ring.visible = true;
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
    if (ring.parent) ring.parent.removeChild(ring);
    selected = monster && monster.alive ? monster : null;
    setSelectedMonsterId(selected?.id ?? null);
    if (selected) {
      drawRing(selected);
      selected.view.addChildAt(ring, 0);
    } else drawRing(null);
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

  window.addEventListener('keydown', onKeyDown, true);
  app.canvas.addEventListener('pointerdown', onPointerDown);

  const tick = () => {
    if (selected && !selected.alive) setTarget(null);
    else if (selected) syncPanel();
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
      app.canvas.removeEventListener('pointerdown', onPointerDown);
      if (ring.parent) ring.parent.removeChild(ring);
      ring.destroy();
      setSelectedMonsterId(null);
    },
  };
}
