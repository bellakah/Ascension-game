import type { GuildPermission, GuildRankDefinition, GuildRecord } from './guildTypes';

export const GUILD_PERMISSIONS: Array<{ id: GuildPermission; label: string; description: string; future?: boolean }> = [
  { id: 'invite', label: 'Convidar', description: 'Convida personagens para a guilda.' },
  { id: 'reviewApplications', label: 'Revisar candidaturas', description: 'Aceita ou recusa pedidos de entrada.' },
  { id: 'kick', label: 'Expulsar', description: 'Remove membros de cargo inferior.' },
  { id: 'promote', label: 'Promover', description: 'Promove membros para cargos inferiores ao próprio.' },
  { id: 'demote', label: 'Rebaixar', description: 'Rebaixa membros de cargo inferior ao próprio.' },
  { id: 'editMotd', label: 'Editar aviso', description: 'Altera a mensagem do dia.' },
  { id: 'editDescription', label: 'Editar descrição', description: 'Altera a descrição pública da guilda.' },
  { id: 'manageRanks', label: 'Gerenciar cargos', description: 'Configura permissões dos cargos.' },
  { id: 'manageBank', label: 'Gerenciar banco', description: 'Preparado para o Banco da Guilda.', future: true },
  { id: 'manageEvents', label: 'Gerenciar eventos', description: 'Preparado para eventos e agenda da guilda.', future: true },
  { id: 'startWar', label: 'Declarar guerra', description: 'Preparado para guerras e diplomacia.', future: true },
  { id: 'transferLeadership', label: 'Transferir liderança', description: 'Entrega a liderança para outro membro.' },
  { id: 'disband', label: 'Dissolver guilda', description: 'Exclui permanentemente a guilda.' },
];

const ALL_PERMISSIONS = GUILD_PERMISSIONS.map((entry) => entry.id);

export const DEFAULT_GUILD_RANKS: GuildRankDefinition[] = [
  { id: 'leader', name: 'Líder', power: 100, permissions: [...ALL_PERMISSIONS] },
  { id: 'officer', name: 'Oficial', power: 50, permissions: ['invite', 'reviewApplications', 'kick', 'promote', 'demote', 'editMotd'] },
  { id: 'member', name: 'Membro', power: 10, permissions: [] },
];

export const GUILD_CONFIG = {
  version: 1,
  creationCost: 25,
  maxLevel: 20,
  applicationLimitPerCharacter: 5,
  inviteExpirationMs: 7 * 24 * 60 * 60 * 1000,
  maxApplications: 50,
  maxLogs: 120,
  nameMin: 3,
  nameMax: 24,
  tagMin: 2,
  tagMax: 5,
  descriptionMax: 240,
  motdMax: 160,
  applicationMessageMax: 140,
  memberCaps: [20, 22, 24, 26, 28, 30, 33, 36, 39, 42, 45, 48, 52, 56, 60, 65, 70, 75, 80, 90],
  expToNext: [1000, 1600, 2400, 3400, 4600, 6000, 7600, 9400, 11400, 13600, 16000, 18600, 21400, 24400, 27600, 31000, 34600, 38400, 42400],
} as const;

export function guildMemberCap(level: number) {
  const index = Math.max(0, Math.min(GUILD_CONFIG.memberCaps.length - 1, Math.floor(level) - 1));
  return GUILD_CONFIG.memberCaps[index];
}

export function guildExpToNext(level: number) {
  if (level >= GUILD_CONFIG.maxLevel) return 0;
  const index = Math.max(0, Math.min(GUILD_CONFIG.expToNext.length - 1, Math.floor(level) - 1));
  return GUILD_CONFIG.expToNext[index];
}

export function guildLeader(guild: GuildRecord) {
  return guild.members.find((member) => member.rankId === 'leader') ?? guild.members[0] ?? null;
}

export function createDefaultRanks() {
  return DEFAULT_GUILD_RANKS.map((rank) => ({ ...rank, permissions: [...rank.permissions] }));
}
