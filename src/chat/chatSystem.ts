import './chat.css';
import { CHAT_CHANNELS, getChatChannel } from './chatCatalog';
import { createLocalChatTransport } from './localChatTransport';
import type { ChatChannelId, ChatMessage, ChatTransport, ChatTransportContext } from './chatTypes';

type ChatSystemOptions = {
  accountId: string;
  characterId: string;
  characterName: string;
  getMap: () => string;
  getGuild?: () => { id: string; name: string } | null;
  transport?: ChatTransport;
};

const MEMORY_LIMIT = 200;
const CHANNEL_COOLDOWN: Record<ChatChannelId, number> = {
  general: 450,
  global: 900,
  trade: 1500,
  guild: 450,
  private: 350,
};

function systemMessage(text: string, channel: ChatChannelId = 'general'): ChatMessage {
  return {
    id: `system-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    channel,
    sender: { accountId: 'system', characterId: 'system', characterName: 'Sistema', map: '' },
    text,
    createdAt: Date.now(),
    system: true,
  };
}

function timeLabel(timestamp: number) {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function normalizeCommand(raw: string, currentChannel: ChatChannelId, currentRecipient: string) {
  const text = raw.trim();
  if (!text.startsWith('/')) return { channel: currentChannel, recipient: currentRecipient, text };
  const parts = text.split(/\s+/);
  const command = parts.shift()?.toLowerCase() ?? '';
  if (command === '/geral') return { channel: 'general' as const, recipient: '', text: parts.join(' ') };
  if (command === '/global') return { channel: 'global' as const, recipient: '', text: parts.join(' ') };
  if (command === '/comercio' || command === '/trade') return { channel: 'trade' as const, recipient: '', text: parts.join(' ') };
  if (command === '/guild') return { channel: 'guild' as const, recipient: '', text: parts.join(' ') };
  if (command === '/p' || command === '/w' || command === '/pm') {
    const recipient = parts.shift() ?? '';
    return { channel: 'private' as const, recipient, text: parts.join(' ') };
  }
  return { channel: currentChannel, recipient: currentRecipient, text };
}

export function createChatSystem(options: ChatSystemOptions) {
  const transport = options.transport ?? createLocalChatTransport();
  const messages: ChatMessage[] = [];
  const unread: Record<ChatChannelId, number> = { general: 0, global: 0, trade: 0, guild: 0, private: 0 };
  const lastSent: Record<ChatChannelId, number> = { general: 0, global: 0, trade: 0, guild: 0, private: 0 };
  let activeChannel: ChatChannelId = 'general';
  let statusTimer = 0;

  const root = document.createElement('section');
  root.id = 'chat-shell';
  root.className = 'chat-collapsed';
  root.innerHTML = `
    <header class="chat-header">
      <div><span>ASCENSION</span><strong>Chat</strong><small id="chat-mode">● Protótipo local</small></div>
      <div class="chat-header-actions"><button id="chat-minimize" type="button" title="Minimizar chat">−</button></div>
    </header>
    <nav class="chat-tabs" id="chat-tabs"></nav>
    <div class="chat-private-target chat-private-hidden" id="chat-private-target"><span>Para</span><input id="chat-recipient" maxlength="20" placeholder="Nome do personagem" autocomplete="off" /></div>
    <div class="chat-messages" id="chat-messages" aria-live="polite"></div>
    <div class="chat-status" id="chat-status"></div>
    <form class="chat-composer" id="chat-form">
      <input id="chat-input" maxlength="240" autocomplete="off" placeholder="Digite uma mensagem..." />
      <button type="submit" title="Enviar">➤</button>
    </form>
    <footer class="chat-footer"><span><kbd>Enter</kbd> conversar</span><span>/p Nome mensagem</span></footer>`;
  document.body.appendChild(root);

  const tabs = root.querySelector<HTMLElement>('#chat-tabs')!;
  const messageList = root.querySelector<HTMLElement>('#chat-messages')!;
  const form = root.querySelector<HTMLFormElement>('#chat-form')!;
  const input = root.querySelector<HTMLInputElement>('#chat-input')!;
  const recipient = root.querySelector<HTMLInputElement>('#chat-recipient')!;
  const recipientWrap = root.querySelector<HTMLElement>('#chat-private-target')!;
  const status = root.querySelector<HTMLElement>('#chat-status')!;
  const minimize = root.querySelector<HTMLButtonElement>('#chat-minimize')!;

  const isMobileMode = () => document.documentElement.dataset.uiMode?.startsWith('mobile') ?? false;
  const isOpen = () => !root.classList.contains('chat-collapsed');
  const isTyping = () => document.activeElement === input || document.activeElement === recipient;
  const blocksGameplay = () => isTyping() || (isMobileMode() && isOpen());

  const context = (): ChatTransportContext => {
    const guild = options.getGuild?.() ?? null;
    return {
      accountId: options.accountId,
      characterId: options.characterId,
      characterName: options.characterName,
      map: options.getMap(),
      guildId: guild?.id ?? null,
      guildName: guild?.name ?? null,
    };
  };

  const setStatus = (text: string, tone: 'normal' | 'warn' = 'normal') => {
    status.textContent = text;
    status.dataset.tone = tone;
    window.clearTimeout(statusTimer);
    if (text) statusTimer = window.setTimeout(() => { status.textContent = ''; }, 3200);
  };

  const appendMessageNode = (message: ChatMessage) => {
    const channel = getChatChannel(message.channel);
    const row = document.createElement('div');
    row.className = `chat-message${message.system ? ' system' : ''}`;
    row.dataset.channel = message.channel;

    const meta = document.createElement('div');
    meta.className = 'chat-message-meta';
    const time = document.createElement('span');
    time.className = 'chat-time';
    time.textContent = timeLabel(message.createdAt);
    const badge = document.createElement('span');
    badge.className = 'chat-channel-badge';
    badge.style.color = channel.color;
    badge.textContent = channel.label;
    const sender = document.createElement('button');
    sender.type = 'button';
    sender.className = 'chat-sender';
    sender.textContent = message.system ? 'Sistema' : message.sender.characterName;
    if (!message.system && message.sender.characterId !== options.characterId) {
      sender.title = `Mensagem privada para ${message.sender.characterName}`;
      sender.onclick = () => {
        activeChannel = 'private';
        recipient.value = message.sender.characterName;
        unread.private = 0;
        renderTabs(); renderMessages(); open(); focusInput();
      };
    } else sender.disabled = true;
    meta.append(time, badge, sender);

    if (message.channel === 'private' && message.recipientCharacterName) {
      const to = document.createElement('span');
      to.className = 'chat-to';
      to.textContent = `→ ${message.recipientCharacterName}`;
      meta.appendChild(to);
    }

    const body = document.createElement('div');
    body.className = 'chat-message-body';
    body.textContent = message.text;
    row.append(meta, body);
    messageList.appendChild(row);
  };

  const visibleMessages = () => messages.filter((message) => message.channel === activeChannel);

  const renderMessages = () => {
    messageList.replaceChildren();
    const guild = options.getGuild?.() ?? null;
    if (activeChannel === 'guild' && !guild) {
      const empty = document.createElement('div');
      empty.className = 'chat-empty';
      empty.innerHTML = '<span>🛡</span><strong>Você ainda não pertence a uma guilda.</strong><small>Quando o sistema de guildas entrar, este canal será liberado automaticamente.</small>';
      messageList.appendChild(empty);
    } else {
      const entries = visibleMessages();
      if (!entries.length) {
        const channel = getChatChannel(activeChannel);
        const empty = document.createElement('div');
        empty.className = 'chat-empty';
        empty.innerHTML = `<span>${channel.icon}</span><strong>${channel.label}</strong><small>${channel.description}</small>`;
        messageList.appendChild(empty);
      } else {
        for (const message of entries) appendMessageNode(message);
      }
    }
    recipientWrap.classList.toggle('chat-private-hidden', activeChannel !== 'private');
    requestAnimationFrame(() => { messageList.scrollTop = messageList.scrollHeight; });
  };

  const renderTabs = () => {
    tabs.replaceChildren();
    for (const channel of CHAT_CHANNELS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `chat-tab${activeChannel === channel.id ? ' active' : ''}`;
      button.dataset.channel = channel.id;
      button.title = channel.description;
      const label = document.createElement('span');
      label.textContent = `${channel.icon} ${channel.shortLabel}`;
      button.appendChild(label);
      if (unread[channel.id] > 0) {
        const count = document.createElement('b');
        count.textContent = unread[channel.id] > 9 ? '9+' : String(unread[channel.id]);
        button.appendChild(count);
      }
      button.onclick = () => {
        activeChannel = channel.id;
        unread[channel.id] = 0;
        renderTabs(); renderMessages();
      };
      tabs.appendChild(button);
    }
  };

  const receive = (message: ChatMessage) => {
    if (messages.some((entry) => entry.id === message.id)) return;
    messages.push(message);
    if (messages.length > MEMORY_LIMIT) messages.splice(0, messages.length - MEMORY_LIMIT);
    if (message.channel !== activeChannel || !isOpen()) unread[message.channel] += 1;
    renderTabs();
    if (message.channel === activeChannel) renderMessages();
  };

  const send = async (raw: string) => {
    const parsed = normalizeCommand(raw, activeChannel, recipient.value.trim());
    if (!parsed.text) {
      if (raw.trim().startsWith('/')) setStatus('Comando sem mensagem. Ex.: /p Nome Olá!', 'warn');
      return;
    }
    activeChannel = parsed.channel;
    if (parsed.channel === 'private' && parsed.recipient) recipient.value = parsed.recipient;
    const channel = getChatChannel(parsed.channel);
    const guild = options.getGuild?.() ?? null;
    if (channel.requiresGuild && !guild) {
      setStatus('Você precisa pertencer a uma guilda para falar neste canal.', 'warn');
      renderTabs(); renderMessages();
      return;
    }
    const target = parsed.channel === 'private' ? (parsed.recipient || recipient.value.trim()) : '';
    if (channel.requiresRecipient && !target) {
      setStatus('Informe o nome do personagem para enviar uma mensagem privada.', 'warn');
      renderTabs(); renderMessages(); recipient.focus();
      return;
    }
    const now = Date.now();
    const remaining = CHANNEL_COOLDOWN[parsed.channel] - (now - lastSent[parsed.channel]);
    if (remaining > 0) {
      setStatus(`Aguarde ${Math.max(1, Math.ceil(remaining / 100) / 10)}s antes de enviar outra mensagem.`, 'warn');
      return;
    }
    lastSent[parsed.channel] = now;
    transport.updateContext(context());
    await transport.send({ channel: parsed.channel, text: parsed.text.slice(0, 240), recipientCharacterName: target || null });
    input.value = '';
    unread[parsed.channel] = 0;
    renderTabs(); renderMessages();
  };

  form.addEventListener('submit', (event) => { event.preventDefault(); void send(input.value); });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); input.blur(); if (isMobileMode()) close(); }
  });
  recipient.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); input.focus(); }
    if (event.key === 'Escape') { event.preventDefault(); recipient.blur(); }
  });

  const open = () => { root.classList.remove('chat-collapsed'); minimize.textContent = '−'; unread[activeChannel] = 0; renderTabs(); renderMessages(); };
  const close = () => { root.classList.add('chat-collapsed'); minimize.textContent = '+'; input.blur(); recipient.blur(); };
  const toggle = () => isOpen() ? close() : open();
  const focusInput = () => { open(); input.focus(); input.select(); };

  minimize.onclick = toggle;
  root.addEventListener('pointerdown', (event) => event.stopPropagation());

  const unsubscribe = transport.subscribe(receive);
  void transport.connect(context());
  receive(systemMessage('Chat iniciado em modo local. A interface já usa um transporte substituível por WebSocket quando o multiplayer entrar.'));
  renderTabs(); renderMessages();

  // No desktop o chat começa visível; no mobile fica apenas o botão do HUD.
  requestAnimationFrame(() => { if (!isMobileMode()) open(); });

  return {
    open,
    close,
    toggle,
    focusInput,
    isOpen,
    isTyping,
    blocksGameplay,
    setChannel(channel: ChatChannelId) { activeChannel = channel; unread[channel] = 0; open(); renderTabs(); renderMessages(); },
    updateContext() { transport.updateContext(context()); },
    destroy() { unsubscribe(); void transport.disconnect(); root.remove(); },
  };
}

export type ChatSystem = ReturnType<typeof createChatSystem>;
