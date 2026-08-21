import type { ChatMessage, ChatSendRequest, ChatTransport, ChatTransportContext } from './chatTypes';

const HISTORY_PREFIX = 'ascension.chat.local.v1.';
const HISTORY_LIMIT = 80;

function makeId() {
  if ('randomUUID' in crypto) return crypto.randomUUID();
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function historyKey(accountId: string) {
  return `${HISTORY_PREFIX}${accountId}`;
}

function readHistory(accountId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(historyKey(accountId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    return Array.isArray(parsed) ? parsed.slice(-HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

function writeHistory(accountId: string, messages: ChatMessage[]) {
  try {
    localStorage.setItem(historyKey(accountId), JSON.stringify(messages.slice(-HISTORY_LIMIT)));
  } catch {
    // Histórico local é apenas uma conveniência do protótipo; falha de storage não bloqueia o chat.
  }
}

/**
 * Transporte temporário do protótipo. Ele ecoa as mensagens do próprio jogador e mantém
 * um pequeno histórico local. No multiplayer será substituído por um WebSocketTransport
 * com a mesma interface, sem alterar a UI do chat.
 */
export function createLocalChatTransport(): ChatTransport {
  let context: ChatTransportContext | null = null;
  const listeners = new Set<(message: ChatMessage) => void>();
  let history: ChatMessage[] = [];

  const emit = (message: ChatMessage) => {
    for (const listener of listeners) listener(message);
  };

  return {
    connect(nextContext) {
      context = { ...nextContext };
      history = readHistory(nextContext.accountId);
      for (const message of history) emit(message);
    },
    updateContext(nextContext) {
      context = { ...nextContext };
    },
    disconnect() {
      context = null;
    },
    send(request: ChatSendRequest) {
      if (!context) return;
      const message: ChatMessage = {
        id: makeId(),
        channel: request.channel,
        sender: { ...context },
        text: request.text,
        createdAt: Date.now(),
        recipientCharacterName: request.recipientCharacterName?.trim() || null,
        recipientCharacterId: null,
      };
      history.push(message);
      writeHistory(context.accountId, history);
      emit(message);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
