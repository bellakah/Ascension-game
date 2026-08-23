import type { CharacterProgress } from '../character/characterCreator';
import { getQuestState, getTrackedQuest, NPC_NAMES, questObjectiveProgress } from '../quests/questEngine';

type HudIdentity = {
  name?: string;
  className?: string;
  classIcon?: string;
};

export type HudResource = {
  current: number;
  max: number;
  label: string;
};

type UtilityIcon = 'inventory' | 'character' | 'guild' | 'quests' | 'map' | 'pet' | 'chat' | 'settings';

const UTILITY_ICON_PATHS: Record<UtilityIcon, string> = {
  inventory: '<rect x="3.5" y="6" width="17" height="14.5" rx="2"/><path d="M8 6V4.5h8V6M8 10h8M8 14h8M8 18h5"/>',
  character: '<circle cx="12" cy="7" r="3.4"/><path d="M5.5 20c.8-4.3 3-6.4 6.5-6.4s5.7 2.1 6.5 6.4M8.5 14.8 7 19M15.5 14.8 17 19"/>',
  guild: '<path d="M12 3.2 19 6v5.2c0 4.4-2.6 7.6-7 9.8-4.4-2.2-7-5.4-7-9.8V6l7-2.8Z"/><path d="m9 11 2 2 4-4"/>',
  quests: '<path d="M6 3.5h9l3 3V20H6z"/><path d="M15 3.5V7h3M9 11h6M9 14h6M9 17h4"/>',
  map: '<path d="m4 5 5-2 6 2 5-2v16l-5 2-6-2-5 2z"/><path d="M9 3v16M15 5v16"/>',
  pet: '<circle cx="8" cy="8" r="2"/><circle cx="16" cy="8" r="2"/><circle cx="5.5" cy="12.5" r="1.7"/><circle cx="18.5" cy="12.5" r="1.7"/><path d="M8.2 18.5c0-3 1.6-5 3.8-5s3.8 2 3.8 5c-1.1 1.3-2.4 2-3.8 2s-2.7-.7-3.8-2Z"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  settings: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6"/>',
};

const utilityIcon = (name: UtilityIcon) => `<span class="utility-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${UTILITY_ICON_PATHS[name]}</svg></span>`;

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
      <div class="player-portrait" aria-label="Retrato do personagem">
        <img id="player-portrait-image" alt="" hidden>
        <span id="player-portrait-fallback">${classIcon}</span>
      </div>
      <div class="brand">
        <b class="player-hud-name">${playerName}</b>
        <span><i>${className}</i><em>${mapName}</em></span>
      </div>
      <div class="player-meta-row">
        <div class="player-progression"><strong id="level-text"></strong><span id="exp-text"></span></div>
        <div class="coins" title="Moedas">● <span id="coins"></span></div>
      </div>
      <div class="player-vitals">
        <div class="hp-shell"><div id="hp-fill"></div><span id="hp-text"></span></div>
        <div class="resource-shell"><div id="resource-fill"></div><span id="resource-text"></span></div>
      </div>
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
    <div class="utility-dock" aria-label="Menu de atalhos">
      <span class="utility-dock-caption">ATALHOS</span>
      <button id="inventory-button" data-label="Inventário" data-key="I" title="Inventário (I)" aria-label="Inventário">${utilityIcon('inventory')}<span class="utility-label">Inventário</span><kbd>I</kbd></button>
      <button id="character-button" data-label="Personagem" data-key="C" title="Personagem (C)" aria-label="Personagem">${utilityIcon('character')}<span class="utility-label">Personagem</span><kbd>C</kbd></button>
      <button id="quest-journal-button" data-label="Missões" data-key="J" title="Diário de Missões (J)" aria-label="Diário de Missões">${utilityIcon('quests')}<span class="utility-label">Missões</span><kbd>J</kbd></button>
      <button id="map-button" data-label="Mapa" data-key="M" title="Mapa Mundial (M)" aria-label="Mapa Mundial">${utilityIcon('map')}<span class="utility-label">Mapa</span><kbd>M</kbd></button>
      <button id="pet-button" data-label="Mascote" data-key="P" title="Mascote (P)" aria-label="Mascote">${utilityIcon('pet')}<span class="utility-label">Mascote</span><kbd>P</kbd></button>
      <button id="guild-button" data-label="Guilda" data-key="G" title="Guilda (G)" aria-label="Guilda">${utilityIcon('guild')}<span class="utility-label">Guilda</span><kbd>G</kbd></button>
      <button id="chat-button" data-label="Chat" data-key="Enter" title="Chat (Enter)" aria-label="Chat">${utilityIcon('chat')}<span class="utility-label">Chat</span><kbd>↵</kbd></button>
      <button id="menu-button" data-label="Config." data-key="" title="Configurações" aria-label="Configurações">${utilityIcon('settings')}<span class="utility-label">Config.</span><kbd>•</kbd></button>
    </div>
    <div class="action-dock">
      <button id="interact-btn" aria-label="Interagir">💬</button>
      <button id="attack-btn" aria-label="Atacar">⚔</button>
    </div>
    <div class="desktop-shortcuts" aria-hidden="true">
      <span><kbd>WASD</kbd>Mover</span><span><kbd>Mouse 1</kbd>Atacar</span><span><kbd>Tab</kbd>Selecionar alvo</span><span><kbd>E</kbd>Interagir</span><span><kbd>Enter</kbd>Chat</span><span><kbd>G</kbd>Guilda</span><span><kbd>M</kbd>Mapa</span><span><kbd>J</kbd>Missões</span><span><kbd>P</kbd>Mascote</span><span><kbd>I</kbd>Inventário</span><span><kbd>C</kbd>Personagem</span><span><kbd>ESC</kbd>Fechar / limpar alvo</span>
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
    portraitImage: root.querySelector<HTMLImageElement>('#player-portrait-image')!,
    portraitFallback: root.querySelector<HTMLElement>('#player-portrait-fallback')!,
    hpFill: root.querySelector<HTMLDivElement>('#hp-fill')!,
    hpText: root.querySelector<HTMLSpanElement>('#hp-text')!,
    resourceFill: root.querySelector<HTMLDivElement>('#resource-fill')!,
    resourceText: root.querySelector<HTMLSpanElement>('#resource-text')!,
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

export function setHudPortrait(hud: Hud, src: string) {
  if (!src) return;
  hud.portraitImage.src = src;
  hud.portraitImage.hidden = false;
  hud.portraitFallback.hidden = true;
  hud.root.classList.add('has-character-portrait');
}

export function updateHudResource(hud: Hud, resource?: HudResource) {
  const resourceCurrent = Math.max(0, Number(resource?.current ?? 0));
  const resourceMax = Math.max(1, Number(resource?.max ?? 1));
  hud.resourceFill.style.width = `${Math.max(0, Math.min(100, resourceCurrent / resourceMax * 100))}%`;
  hud.resourceText.textContent = `${resource?.label || 'Recurso'} ${Math.ceil(resourceCurrent)}/${Math.ceil(resourceMax)}`;
}

export function updateHud(hud: Hud, progress: CharacterProgress, playerHp: number, coins: number, resource?: HudResource) {
  hud.hpFill.style.width = `${Math.max(0, Math.min(100, playerHp / progress.maxHp * 100))}%`;
  hud.hpText.textContent = `HP ${Math.max(0, Math.ceil(playerHp))}/${progress.maxHp}`;
  updateHudResource(hud, resource);
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
