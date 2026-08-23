import type { CharacterProgress } from '../character/characterCreator';
import { getQuestState, getTrackedQuest, NPC_NAMES, questObjectiveProgress } from '../quests/questEngine';

type HudIdentity = {
  name?: string;
  className?: string;
  classIcon?: string;
};

const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

export type Hud = ReturnType<typeof createHud>;

export function createHud(progress: CharacterProgress, identity: HudIdentity = {}) {
  const playerName = escapeHtml(identity.name || 'Aventureiro');
  const className = escapeHtml(identity.className || 'Aventureiro');
  const classIcon = escapeHtml(identity.classIcon || '✦');
  const mapName = escapeHtml(progress.map || 'Mundo');

  const root = document.createElement('div');
  root.id = 'hud';
  root.innerHTML = `
    <div class="topbar">
      <div class="player-portrait" aria-hidden="true"><span>${classIcon}</span></div>
      <div class="brand"><b class="player-hud-name">${playerName}</b><span><i>${className}</i> • ${mapName}</span></div>
      <div class="player-progression"><strong id="level-text"></strong><span id="exp-text"></span></div>
      <div class="hp-shell"><div id="hp-fill"></div><span id="hp-text"></span></div>
      <div class="coins">🪙 <span id="coins"></span></div>
    </div>
    <div id="target-frame" class="target-frame target-hidden" aria-live="polite">
      <div class="target-head"><strong id="target-name">Alvo</strong><span id="target-meta">INIMIGO</span></div>
      <div class="target-hp"><div id="target-hp-fill"></div><span id="target-hp-text"></span></div>
    </div>
    <button id="quest-toggle" type="button" aria-label="Mostrar missão" aria-expanded="false" title="Missão rastreada">📜<span>Missão</span></button>
    <div id="quest-box"><strong id="quest-title">Missão</strong><div id="quest-text"></div></div>
    <aside id="party-panel" class="party-panel party-hidden" aria-label="Grupo">
      <div class="party-title"><span>Grupo</span><small>Party</small></div>
      <div id="party-members"></div>
    </aside>
    <div id="dialog-box" class="hidden"></div>
    <div id="stick"><div id="knob"></div></div>
    <div class="utility-dock">
      <button id="inventory-button" data-label="Inventário" title="Inventário" aria-label="Inventário">▣</button>
      <button id="character-button" data-label="Personagem" title="Personagem" aria-label="Personagem">♙</button>
      <button id="guild-button" data-label="Guilda" title="Guilda" aria-label="Guilda">♜</button>
      <button id="quest-journal-button" data-label="Missões" title="Diário de Missões" aria-label="Diário de Missões">▤</button>
      <button id="map-button" data-label="Mapa" title="Mapa Mundial" aria-label="Mapa Mundial">⌖</button>
      <button id="pet-button" data-label="Mascote" title="Mascote" aria-label="Mascote">♞</button>
      <button id="chat-button" data-label="Chat" title="Chat" aria-label="Chat">✉</button>
      <button id="menu-button" data-label="Config." title="Menu do Jogo" aria-label="Menu do Jogo">⚙</button>
    </div>
    <div class="action-dock">
      <button id="interact-btn" aria-label="Interagir">💬</button>
      <button id="attack-btn" aria-label="Atacar">⚔</button>
    </div>
    <div class="desktop-shortcuts" aria-hidden="true">
      <span><kbd>WASD</kbd>Mover</span><span><kbd>Mouse 1</kbd>Atacar</span><span><kbd>Tab</kbd>Selecionar alvo</span><span><kbd>E</kbd>Interagir</span><span><kbd>Enter</kbd>Chat</span><span><kbd>G</kbd>Guilda</span><span><kbd>M</kbd>Mapa</span><span><kbd>J</kbd>Missões</span><span><kbd>P</kbd>Mascote</span><span><kbd>I</kbd>Inventário</span><span><kbd>C</kbd>Personagem</span><span><kbd>ESC</kbd>Menu</span>
    </div>
    <div id="desktop-exp-rail"><div id="desktop-exp-fill"></div><span id="desktop-exp-text"></span></div>`;
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
    desktopExpFill: root.querySelector<HTMLElement>('#desktop-exp-fill')!,
    desktopExpText: root.querySelector<HTMLElement>('#desktop-exp-text')!,
    questTitle: root.querySelector<HTMLElement>('#quest-title')!,
    questText: root.querySelector<HTMLDivElement>('#quest-text')!,
    questToggle,
    menu: root.querySelector<HTMLButtonElement>('#menu-button')!,
    chat: root.querySelector<HTMLButtonElement>('#chat-button')!,
    guild: root.querySelector<HTMLButtonElement>('#guild-button')!,
    map: root.querySelector<HTMLButtonElement>('#map-button')!,
    questJournal: root.querySelector<HTMLButtonElement>('#quest-journal-button')!,
    pet: root.querySelector<HTMLButtonElement>('#pet-button')!,
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
  const expPct = Math.max(0, Math.min(100, progress.exp / Math.max(1, progress.expToNext) * 100));
  hud.desktopExpFill.style.width = `${expPct}%`;
  hud.desktopExpText.textContent = `EXP ${progress.exp} / ${progress.expToNext} (${Math.round(expPct)}%)`;

  const quest = getTrackedQuest(progress);
  if (!quest) {
    hud.questTitle.textContent = 'Missões Ativas';
    hud.questText.textContent = 'Nenhuma missão rastreada. Abra o Diário para ver missões disponíveis.';
    hud.questToggle.classList.remove('quest-ready');
    return;
  }
  const state = getQuestState(progress, quest.id)!;
  hud.questToggle.classList.toggle('quest-ready', state.status === 'ready');
  hud.questTitle.textContent = quest.title;
  if (state.status === 'ready') {
    hud.questText.textContent = `Objetivos concluídos. Volte para ${NPC_NAMES[quest.endNpcId] ?? quest.endNpcId}.`;
    return;
  }
  const pending = quest.objectives.find((objective) => !questObjectiveProgress(progress, quest, objective).done);
  if (!pending) {
    hud.questText.textContent = 'Objetivos concluídos.';
    return;
  }
  const value = questObjectiveProgress(progress, quest, pending);
  hud.questText.textContent = `${pending.label} — ${value.current}/${value.target}`;
}

export function showDialog(hud: Hud, text: string) {
  hud.dialog.textContent = text;
  hud.dialog.classList.remove('hidden');
  window.setTimeout(() => hud.dialog.classList.add('hidden'), 3200);
}
