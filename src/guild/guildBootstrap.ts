import { createGuildSystem, type GuildSystem } from './guildSystem';

const SESSION_KEY = 'ascension.session.v1';
const ACCOUNTS_KEY = 'ascension.accounts.v1';
const SETTINGS_KEY = 'ascension.settings.v1';

type StoredCharacter = {
  id: string;
  config?: { name?: string };
  progress?: { coins?: number; lastPlayedAt?: number };
};

type StoredAccount = { characters?: Array<StoredCharacter | null> };
type StoredAccounts = Record<string, StoredAccount>;

type Identity = { accountId: string; characterId: string; characterName: string };

type AttachOptions = { beforeOpen?: () => void };

function readAccounts(): StoredAccounts {
  try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? '{}') as StoredAccounts; }
  catch { return {}; }
}

function writeAccounts(accounts: StoredAccounts) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function resolveIdentity(): Identity | null {
  const accountId = localStorage.getItem(SESSION_KEY);
  if (!accountId) return null;
  const account = readAccounts()[accountId];
  const characters = (account?.characters ?? []).filter((entry): entry is StoredCharacter => Boolean(entry));
  if (!characters.length) return null;
  const character = [...characters].sort((a, b) => Number(b.progress?.lastPlayedAt ?? 0) - Number(a.progress?.lastPlayedAt ?? 0))[0];
  return { accountId, characterId: character.id, characterName: character.config?.name?.trim() || 'Jogador' };
}

function currentGuildCode() {
  const accountId = localStorage.getItem(SESSION_KEY);
  if (!accountId) return 'KeyG';
  try {
    const file = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as { profiles?: Record<string, { controls?: Record<string, string> }> };
    return file.profiles?.[accountId]?.controls?.guild || 'KeyG';
  } catch { return 'KeyG'; }
}

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || (target instanceof HTMLElement && target.isContentEditable);
}

function actualGameMenuOpen() {
  const menu = document.querySelector<HTMLElement>('#game-menu-overlay');
  if (!menu || menu.classList.contains('game-menu-hidden')) return false;
  return !menu.classList.contains('chat-pause-proxy') && !menu.classList.contains('guild-pause-proxy');
}

function setPauseProxy(enabled: boolean) {
  const menu = document.querySelector<HTMLElement>('#game-menu-overlay');
  if (!menu) return;
  if (enabled) {
    if (menu.classList.contains('game-menu-hidden')) {
      menu.classList.remove('game-menu-hidden');
      menu.classList.add('guild-pause-proxy');
    }
    return;
  }
  if (menu.classList.contains('guild-pause-proxy')) {
    menu.classList.remove('guild-pause-proxy');
    menu.classList.add('game-menu-hidden');
  }
}

function notifyHud(message: string) {
  const dialog = document.querySelector<HTMLElement>('#dialog-box');
  if (!dialog) return;
  dialog.textContent = message;
  dialog.classList.remove('hidden');
  window.setTimeout(() => dialog.classList.add('hidden'), 3200);
}

function readCoins(identity: Identity) {
  const account = readAccounts()[identity.accountId];
  const character = (account?.characters ?? []).find((entry) => entry?.id === identity.characterId);
  return Math.max(0, Number(character?.progress?.coins) || 0);
}

function writeCoins(identity: Identity, value: number) {
  const accounts = readAccounts();
  const account = accounts[identity.accountId];
  const character = (account?.characters ?? []).find((entry) => entry?.id === identity.characterId);
  if (!character) return;
  character.progress = { ...(character.progress ?? {}), coins: Math.max(0, Math.floor(value)) };
  writeAccounts(accounts);
}

/**
 * Contexto independente do runtime. Quando o multiplayer entrar, o GuildSystem poderá
 * receber ServerGuildRepository e o mesmo bootstrap continuará responsável só pela UI/input.
 */
export function prepareGuildBootstrap() {
  let guild: GuildSystem | null = null;
  let beforeOpen: (() => void) | undefined;
  let observer: MutationObserver | null = null;

  const openOrToggle = () => {
    if (!guild) return;
    if (!guild.isOpen()) beforeOpen?.();
    guild.toggle();
    setPauseProxy(guild.isOpen());
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!guild || event.repeat || isEditableTarget(event.target)) return;
    if (event.code === 'Escape' && guild.isOpen()) {
      event.preventDefault(); event.stopImmediatePropagation();
      guild.close(); setPauseProxy(false); return;
    }
    if (event.code !== currentGuildCode() || actualGameMenuOpen()) return;
    event.preventDefault(); event.stopImmediatePropagation();
    openOrToggle();
  };

  window.addEventListener('keydown', onKeyDown, true);

  const attach = (options: AttachOptions = {}) => {
    if (guild) return guild;
    beforeOpen = options.beforeOpen;
    const identity = resolveIdentity();
    if (!identity) return null;
    guild = createGuildSystem({
      accountId: identity.accountId,
      characterId: identity.characterId,
      characterName: identity.characterName,
      getCoins: () => readCoins(identity),
      setCoins: (value) => writeCoins(identity, value),
      onChanged: () => {},
      notify: notifyHud,
    });
    document.querySelector<HTMLButtonElement>('#guild-button')?.addEventListener('pointerdown', openOrToggle);
    const overlay = document.querySelector<HTMLElement>('#guild-overlay');
    if (overlay) {
      observer = new MutationObserver(() => setPauseProxy(guild?.isOpen() ?? false));
      observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
    }
    window.addEventListener('pagehide', () => { observer?.disconnect(); setPauseProxy(false); }, { once: true });
    return guild;
  };

  return { attach, get guild() { return guild; } };
}
