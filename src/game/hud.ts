import type { CharacterProgress } from '../character/characterCreator';
import { currentQuest } from './quests';

export type Hud = ReturnType<typeof createHud>;

export function createHud(progress: CharacterProgress) {
  const root = document.createElement('div');
  root.id = 'hud';
  root.innerHTML = `
    <div class="topbar">
      <div class="brand">ASCENSION <span>• ${progress.map}</span></div>
      <div class="player-progression"><strong id="level-text"></strong><span id="exp-text"></span></div>
      <div class="hp-shell"><div id="hp-fill"></div><span id="hp-text"></span></div>
      <div class="coins">🪙 <span id="coins"></span></div>
    </div>
    <button id="quest-toggle" type="button" aria-label="Mostrar missão" aria-expanded="false" title="Missão">📜<span>Missão</span></button>
    <div id="quest-box"><strong id="quest-title">Missão</strong><div id="quest-text"></div></div>
    <div id="dialog-box" class="hidden"></div>
    <div id="stick"><div id="knob"></div></div>
    <div class="utility-dock">
      <button id="character-button" title="Personagem" aria-label="Personagem">👤</button>
      <button id="inventory-button" title="Inventário" aria-label="Inventário">🎒</button>
    </div>
    <div class="action-dock">
      <button id="interact-btn" aria-label="Interagir">💬</button>
      <button id="attack-btn" aria-label="Atacar">⚔</button>
    </div>
    <div class="desktop-shortcuts" aria-hidden="true">
      <span><kbd>WASD</kbd>Mover</span><span><kbd>Espaço</kbd>Atacar</span><span><kbd>E</kbd>Interagir</span><span><kbd>I</kbd>Inventário</span><span><kbd>C</kbd>Personagem</span>
    </div>`;
  document.body.appendChild(root);

  const questToggle = root.querySelector<HTMLButtonElement>('#quest-toggle')!;
  questToggle.addEventListener('pointerdown', () => {
    const open = root.classList.toggle('quest-open');
    questToggle.setAttribute('aria-expanded', String(open));
    questToggle.setAttribute('aria-label', open ? 'Ocultar missão' : 'Mostrar missão');
  });

  return {
    root,
    hpFill: root.querySelector<HTMLDivElement>('#hp-fill')!,
    hpText: root.querySelector<HTMLSpanElement>('#hp-text')!,
    coinText: root.querySelector<HTMLSpanElement>('#coins')!,
    levelText: root.querySelector<HTMLElement>('#level-text')!,
    expText: root.querySelector<HTMLElement>('#exp-text')!,
    questTitle: root.querySelector<HTMLElement>('#quest-title')!,
    questText: root.querySelector<HTMLDivElement>('#quest-text')!,
    questToggle,
    dialog: root.querySelector<HTMLDivElement>('#dialog-box')!,
    stick: root.querySelector<HTMLDivElement>('#stick')!,
    knob: root.querySelector<HTMLDivElement>('#knob')!,
    character: root.querySelector<HTMLButtonElement>('#character-button')!,
    inventory: root.querySelector<HTMLButtonElement>('#inventory-button')!,
    attack: root.querySelector<HTMLButtonElement>('#attack-btn')!,
    interact: root.querySelector<HTMLButtonElement>('#interact-btn')!,
  };
}

export function updateHud(hud: Hud, progress: CharacterProgress, playerHp: number, coins: number) {
  hud.hpFill.style.width = `${Math.max(0, Math.min(100, playerHp / progress.maxHp * 100))}%`;
  hud.hpText.textContent = `HP ${Math.max(0, Math.ceil(playerHp))}/${progress.maxHp}`;
  hud.coinText.textContent = String(coins);
  hud.levelText.textContent = `Nv. ${progress.level}`;
  hud.expText.textContent = `EXP ${progress.exp}/${progress.expToNext}`;
  const quest = currentQuest(progress);
  if (!quest) {
    hud.questTitle.textContent = 'Missões';
    hud.questText.textContent = 'Todas as missões de teste foram concluídas.';
    hud.questToggle.classList.remove('quest-ready');
    return;
  }
  const state = progress.quests[quest.id];
  hud.questToggle.classList.toggle('quest-ready', state.status === 'ready');
  hud.questTitle.textContent = quest.title;
  if (state.status === 'not_started') hud.questText.textContent = `Fale com Elandra — ${quest.objective}.`;
  else if (state.status === 'ready') hud.questText.textContent = `Objetivo concluído (${state.progress}/${state.target}). Volte para Elandra.`;
  else hud.questText.textContent = `${quest.objective} — ${state.progress}/${state.target}`;
}

export function showDialog(hud: Hud, text: string) {
  hud.dialog.textContent = text;
  hud.dialog.classList.remove('hidden');
  window.setTimeout(() => hud.dialog.classList.add('hidden'), 3200);
}
