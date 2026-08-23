import './chat.css';
import { PRIMARY_CHAT_CHANNELS, getChatChannel } from './chatCatalog';
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
  party: 450,
  trade: 1500,
  guild: 450,
  private: 350,
  system: 0,
};

const emptyCounter = (): Record<ChatChannelId, number> => ({
  general: 0,
  global: 0,
  party: 0,
  trade: 0,
  guild: 0,
  private: 0,
  system: 0,
});

function systemMessage(text: string, channel: ChatChannelId = 'system'): ChatMessage {
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
  if (command === '/grupo' || command === '/party') return { channel: 'party' as const, recipient: '', text: parts.join(' ') };
  if (command === '/comercio' || command === '/trade') return { channel: 'trade' as const, recipient: '', text: parts.join(' ') };
  if (command === '/guild' || command === '/guilda') return { channel: 'guild' as const, recipient: '', text: parts.join(' ') };
  if (command === '/p' || command === '/w' || command === '/pm') {
    const recipient = parts.shift() ?? '';
    return { channel: 'private' as const, recipient, text: parts.join(' ') };
  }
  return { channel: currentChannel, recipient: currentRecipient, text };
}

export function createChatSystem(options: ChatSystemOptions) {
  const transport = options.transport ?? createLocalChatTransport();
  const messages: ChatMessage[] = [];
  const unread = emptyCounter();
  const lastSent = emptyCounter();
  let activeChannel: ChatChannelId = 'global';
  let statusTimer = 0;

  const root = document.createElement('section');
  root.id = 'chat-shell';
  root.className = 'chat-collapsed';
  root.innerHTML = `
    <header class="chat-header">
      <div class="chat-heading"><span>ASCENSION</span><strong>Comunicação</strong><small id="chat-mode">Canal social</small></div>
      <div class="chat-header-actions"><button id="chat-minimize" type="button" title="Recolher chat" aria-label="Recolher chat">−</button></div>
    </header>
    <nav class="chat-tabs" id="chat-tabs" aria-label="Canais do chat"></nav>
    <div class="chat-private-target chat-private-hidden" id="chat-private-target"><span>Para</span><input id="chat-recipient" maxlength="20" placeholder="Nome do personagem" autocomplete="off" /></div>
    <div class="chat-messages" id="chat-messages" aria-live="polite"></div>
    <div class="chat-status" id="chat-status"></div>
    <form class="chat-composer" id="chat-form">
      <input id="chat-input" maxlength="240" autocomplete="off" placeholder="Digite uma mensagem..." aria-label="Mensagem" />
      <button id="chat-send" type="submit" title="Enviar mensagem">Enviar</button>
    </form>
    <footer class="chat-footer"><span><kbd>Enter</kbd> conversar</span><span>/p Nome · /grupo · /global</span></footer>`;
  document.body.appendChild(root);

  const tabs = root.querySelector<HTMLElement>('#chat-tabs')!;
  const messageList = root.querySelector<HTMLElement>('#chat-messages')!;
  const form = root.querySelector<HTMLFormElement>('#chat-form')!;
  const input = root.querySelector<HTMLInputElement>('#chat-input')!;
  const submit = root.querySelector<HTMLButtonElement>('#chat-send')!;
  const recipient = root.querySelector<HTMLInputElement>('#chat-recipient')!;
  const recipientWrap = root.querySelector<HTMLElement>('#chat-private-target')!;
  const status = root.querySelector<HTMLElement>('#chat-status')!;
  const minimize = root.querySelector<HTMLButtonElement>('#chat-minimize')!;

  const isMobileMode = () => document.documentElement.dataset.uiMode?.startsWith('mobile') ?? false;
  const isOpen = () => !root.classList.contains('chat-collapsed');
  const isTyping = () => document.activeElement === input || document.activeElement === recipient;
  const blocksGameplay = () => isTyping() || (isMobileMode() && isOpen());

  // Usa o menu de pausa já existente como sinal invisível para o runtime interromper movimento/combate
  // enquanto o jogador digita. Quando o runtime multiplayer for modularizado, isso vira um InputContext.
  const setPauseProxy = (enabled: boolean) => {
    const menu = document.querySelector<HTMLElement>('#game-menu-overlay');
    if (!menu) return;
    if (enabled) {
      if (menu.classList.contains('game-menu-hidden')) {
        menu.classList.remove('game-menu-hidden');
        menu.classList.add('chat-pause-proxy');
      }
      return;
    }
    if (menu.classList.contains('chat-pause-proxy')) {
      menu.classList.remove('chat-pause-proxy');
      menu.classList.add('game-menu-hidden');
    }
  };
  const syncPauseProxy = () => setPauseProxy(blocksGameplay());

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

  const syncComposerState = () => {
    const channel = getChatChannel(activeChannel);
    const readOnly = Boolean(channel.readOnly);
    input.disabled = readOnly;
    submit.disabled = readOnly;
    input.placeholder = readOnly ? 'Canal de sistema — somente leitura' : 'Digite uma mensagem...';
    root.classList.toggle('chat-readonly', readOnly);
  };

  const renderMessages = () => {
    messageList.replaceChildren();
    const guild = options.getGuild?.() ?? null;
    if (activeChannel === 'guild' && !guild) {
      const empty = document.createElement('div');
      empty.className = 'chat-empty';
      empty.innerHTML = '<span>♢</span><strong>Você ainda não pertence a uma guilda.</strong><small>Quando entrar em uma guilda, este canal será liberado automaticamente.</small>';
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
    syncComposerState();
    requestAnimationFrame(() => { messageList.scrollTop = messageList.scrollHeight; });
  };

  const renderTabs = () => {
    tabs.replaceChildren();
    const activeDefinition = getChatChannel(activeChannel);
    const channels = activeDefinition.primaryTab ? PRIMARY_CHAT_CHANNELS : [...PRIMARY_CHAT_CHANNELS, activeDefinition];
    for (const channel of channels) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `chat-tab${activeChannel === channel.id ? ' active' : ''}`;
      button.dataset.channel = channel.id;
      button.title = channel.description;
      const icon = document.createElement('i');
      icon.textContent = channel.icon;
      icon.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.textContent = channel.shortLabel;
      button.append(icon, label);
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
    if (channel.readOnly) {
      setStatus('Este canal é reservado para mensagens do sistema.', 'warn');
      renderTabs(); renderMessages();
      return;
    }
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

  const announceState = () => window.dispatchEvent(new CustomEvent('ascension-hud-state'));
  const open = () => {
    root.classList.remove('chat-collapsed');
    minimize.textContent = '−';
    minimize.setAttribute('aria-label', 'Recolher chat');
    unread[activeChannel] = 0;
    renderTabs(); renderMessages(); syncPauseProxy(); announceState();
  };
  const close = () => {
    root.classList.add('chat-collapsed');
    minimize.textContent = '+';
    minimize.setAttribute('aria-label', 'Expandir chat');
    input.blur(); recipient.blur(); setPauseProxy(false); announceState();
  };
  const toggle = () => isOpen() ? close() : open();
  const focusInput = () => { open(); if (!input.disabled) { input.focus(); input.select(); } syncPauseProxy(); };

  minimize.onclick = toggle;
  root.addEventListener('pointerdown', (event) => event.stopPropagation());
  root.addEventListener('focusin', () => syncPauseProxy());
  root.addEventListener('focusout', () => window.setTimeout(syncPauseProxy, 0));

  const unsubscribe = transport.subscribe(receive);
  void transport.connect(context());
  receive(systemMessage('Comunicação pronta. Avisos importantes do jogo aparecerão neste canal.'));
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
    destroy() { setPauseProxy(false); unsubscribe(); void transport.disconnect(); root.remove(); },
  };
}

export type ChatSystem = ReturnType<typeof createChatSystem>;
