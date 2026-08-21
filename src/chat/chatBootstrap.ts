import { resolveGuildMembership } from '../guild/localGuildRepository';
import { createChatSystem, type ChatSystem } from './chatSystem';

const SESSION_KEY = 'ascension.session.v1';
const ACCOUNTS_KEY = 'ascension.accounts.v1';
const SETTINGS_KEY = 'ascension.settings.v1';

type StoredCharacter = {
  id: string;
  config?: { name?: string };
  progress?: { map?: string; lastPlayedAt?: number };
};

type StoredAccount = { characters?: Array<StoredCharacter | null> };
type StoredAccounts = Record<string, StoredAccount>;

type ResolvedIdentity = {
  accountId: string;
  characterId: string;
  characterName: string;
  map: string;
};

function readAccounts(): StoredAccounts {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? '{}') as StoredAccounts;
  } catch {
    return {};
  }
}

function resolveCurrentIdentity(): ResolvedIdentity | null {
  const accountId = localStorage.getItem(SESSION_KEY);
  if (!accountId) return null;
  const account = readAccounts()[accountId];
  const characters = (account?.characters ?? []).filter((entry): entry is StoredCharacter => Boolean(entry));
  if (!characters.length) return null;
  const character = [...characters].sort((a, b) => Number(b.progress?.lastPlayedAt ?? 0) - Number(a.progress?.lastPlayedAt ?? 0))[0];
  return {
    accountId,
    characterId: character.id,
    characterName: character.config?.name?.trim() || 'Jogador',
    map: character.progress?.map || 'Floresta Inicial',
  };
}

function currentMap(accountId: string, characterId: string) {
  const account = readAccounts()[accountId];
  const character = (account?.characters ?? []).find((entry) => entry?.id === characterId);
  return character?.progress?.map || 'Floresta Inicial';
}

function currentChatCode() {
  const accountId = localStorage.getItem(SESSION_KEY);
  if (!accountId) return 'Enter';
  try {
    const file = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as { profiles?: Record<string, { controls?: Record<string, string> }> };
    return file.profiles?.[accountId]?.controls?.chat || 'Enter';
  } catch {
    return 'Enter';
  }
}

function actualGameMenuOpen() {
  const menu = document.querySelector<HTMLElement>('#game-menu-overlay');
  if (!menu || menu.classList.contains('game-menu-hidden')) return false;
  // O proxy do próprio chat não conta como menu; o proxy da Guilda deve bloquear o Chat.
  return !menu.classList.contains('chat-pause-proxy');
}

/**
 * Registra o atalho antes do runtime para que uma tecla remapeada para Chat nunca vaze
 * para movimento/combate. A UI é anexada apenas depois que startGame termina o boot.
 */
export function prepareChatBootstrap() {
  let chat: ChatSystem | null = null;

  const onKeyDown = (event: KeyboardEvent) => {
    if (!chat || event.repeat || chat.isTyping() || actualGameMenuOpen()) return;
    if (event.code !== currentChatCode()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    chat.focusInput();
  };

  const onKeyUp = (event: KeyboardEvent) => {
    if (!chat || event.code !== 'Escape' || !(chat.isTyping() || chat.blocksGameplay())) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    chat.close();
  };

  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);

  const attach = () => {
    if (chat) return chat;
    const identity = resolveCurrentIdentity();
    if (!identity) return null;
    chat = createChatSystem({
      accountId: identity.accountId,
      characterId: identity.characterId,
      characterName: identity.characterName,
      getMap: () => currentMap(identity.accountId, identity.characterId),
      getGuild: () => {
        const membership = resolveGuildMembership(identity.characterId);
        return membership ? { id: membership.guild.id, name: membership.guild.name } : null;
      },
    });
    const button = document.querySelector<HTMLButtonElement>('#chat-button');
    button?.addEventListener('pointerdown', () => chat?.toggle());
    window.addEventListener('pagehide', () => chat?.destroy(), { once: true });
    return chat;
  };

  return { attach, get chat() { return chat; } };
}
