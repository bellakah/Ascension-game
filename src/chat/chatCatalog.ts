import type { ChatChannelId } from './chatTypes';

export type ChatChannelDefinition = {
  id: ChatChannelId;
  label: string;
  shortLabel: string;
  icon: string;
  description: string;
  color: string;
  scope: 'map' | 'server' | 'trade' | 'guild' | 'direct';
  requiresGuild?: boolean;
  requiresRecipient?: boolean;
  futureServerRule: string;
};

// O servidor multiplayer e o futuro Editor de Chat poderão consumir este mesmo catálogo.
export const CHAT_CHANNELS: ChatChannelDefinition[] = [
  {
    id: 'general', label: 'Geral', shortLabel: 'Geral', icon: '◉', color: '#dce9dc', scope: 'map',
    description: 'Conversa com jogadores próximos ou no mesmo mapa.',
    futureServerRule: 'O servidor distribuirá por proximidade/mapa e validará distância.',
  },
  {
    id: 'global', label: 'Global', shortLabel: 'Global', icon: '🌐', color: '#8dd1ff', scope: 'server',
    description: 'Conversa com todo o servidor.',
    futureServerRule: 'O servidor fará broadcast global com cooldown e permissões.',
  },
  {
    id: 'trade', label: 'Comércio', shortLabel: 'Comércio', icon: '🪙', color: '#ffd77b', scope: 'trade',
    description: 'Canal reservado para compra, venda e procura de itens.',
    futureServerRule: 'O servidor aplicará cooldown maior, filtros e regras de comércio.',
  },
  {
    id: 'guild', label: 'Guild', shortLabel: 'Guild', icon: '🛡', color: '#a8a0ff', scope: 'guild', requiresGuild: true,
    description: 'Canal privado para membros da mesma guilda.',
    futureServerRule: 'O servidor resolverá guildId e entregará somente aos membros conectados.',
  },
  {
    id: 'private', label: 'Privado', shortLabel: 'Privado', icon: '✉', color: '#ff9fcf', scope: 'direct', requiresRecipient: true,
    description: 'Mensagem direta para outro personagem.',
    futureServerRule: 'O servidor resolverá o personagem alvo, privacidade, bloqueios e presença.',
  },
];

export function getChatChannel(id: ChatChannelId) {
  return CHAT_CHANNELS.find((channel) => channel.id === id) ?? CHAT_CHANNELS[0];
}
