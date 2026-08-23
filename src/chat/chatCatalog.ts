import type { ChatChannelId } from './chatTypes';

export type ChatChannelDefinition = {
  id: ChatChannelId;
  label: string;
  shortLabel: string;
  icon: string;
  description: string;
  color: string;
  scope: 'map' | 'server' | 'party' | 'trade' | 'guild' | 'direct' | 'system';
  primaryTab?: boolean;
  readOnly?: boolean;
  requiresGuild?: boolean;
  requiresRecipient?: boolean;
  futureServerRule: string;
};

// O servidor multiplayer e o futuro Editor de Chat poderão consumir este mesmo catálogo.
export const CHAT_CHANNELS: ChatChannelDefinition[] = [
  {
    id: 'global', label: 'Global', shortLabel: 'Global', icon: '◎', color: '#8dc9df', scope: 'server', primaryTab: true,
    description: 'Conversa com jogadores conectados em todo o servidor.',
    futureServerRule: 'O servidor fará broadcast global com cooldown, moderação e permissões.',
  },
  {
    id: 'party', label: 'Grupo', shortLabel: 'Grupo', icon: '◇', color: '#8fd0b1', scope: 'party', primaryTab: true,
    description: 'Canal reservado ao seu grupo. A aba permanece disponível mesmo quando o painel de party está oculto.',
    futureServerRule: 'O servidor resolverá partyId e entregará somente aos membros atuais do grupo.',
  },
  {
    id: 'guild', label: 'Guilda', shortLabel: 'Guilda', icon: '♢', color: '#b8a8e8', scope: 'guild', primaryTab: true, requiresGuild: true,
    description: 'Canal privado para membros da mesma guilda.',
    futureServerRule: 'O servidor resolverá guildId e entregará somente aos membros conectados.',
  },
  {
    id: 'system', label: 'Sistema', shortLabel: 'Sistema', icon: '•', color: '#d6b96c', scope: 'system', primaryTab: true, readOnly: true,
    description: 'Avisos, mensagens de sistema e informações importantes do jogo.',
    futureServerRule: 'Apenas serviços autorizados do servidor poderão publicar neste canal.',
  },
  {
    id: 'general', label: 'Geral', shortLabel: 'Geral', icon: '○', color: '#c8d5d2', scope: 'map',
    description: 'Conversa com jogadores próximos ou no mesmo mapa.',
    futureServerRule: 'O servidor distribuirá por proximidade/mapa e validará distância.',
  },
  {
    id: 'trade', label: 'Comércio', shortLabel: 'Comércio', icon: '◇', color: '#d9bc72', scope: 'trade',
    description: 'Canal reservado para compra, venda e procura de itens.',
    futureServerRule: 'O servidor aplicará cooldown maior, filtros e regras de comércio.',
  },
  {
    id: 'private', label: 'Privado', shortLabel: 'Privado', icon: '✉', color: '#d89bbd', scope: 'direct', requiresRecipient: true,
    description: 'Mensagem direta para outro personagem.',
    futureServerRule: 'O servidor resolverá o personagem alvo, privacidade, bloqueios e presença.',
  },
];

export const PRIMARY_CHAT_CHANNELS = CHAT_CHANNELS.filter((channel) => channel.primaryTab);

export function getChatChannel(id: ChatChannelId) {
  return CHAT_CHANNELS.find((channel) => channel.id === id) ?? CHAT_CHANNELS[0];
}
