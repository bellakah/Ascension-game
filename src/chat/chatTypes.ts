export type ChatChannelId = 'general' | 'global' | 'party' | 'trade' | 'guild' | 'private' | 'system';

export type ChatSender = {
  accountId: string;
  characterId: string;
  characterName: string;
  map: string;
  guildId?: string | null;
  guildName?: string | null;
};

export type ChatMessage = {
  id: string;
  channel: ChatChannelId;
  sender: ChatSender;
  text: string;
  createdAt: number;
  recipientCharacterName?: string | null;
  recipientCharacterId?: string | null;
  system?: boolean;
};

export type ChatSendRequest = {
  channel: ChatChannelId;
  text: string;
  recipientCharacterName?: string | null;
};

export type ChatTransportContext = ChatSender;

export interface ChatTransport {
  connect(context: ChatTransportContext): void | Promise<void>;
  updateContext(context: ChatTransportContext): void;
  disconnect(): void | Promise<void>;
  send(request: ChatSendRequest): void | Promise<void>;
  subscribe(listener: (message: ChatMessage) => void): () => void;
}
