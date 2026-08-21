export type GuildPermission =
  | 'invite'
  | 'reviewApplications'
  | 'kick'
  | 'promote'
  | 'demote'
  | 'editMotd'
  | 'editDescription'
  | 'manageRanks'
  | 'manageBank'
  | 'manageEvents'
  | 'startWar'
  | 'transferLeadership'
  | 'disband';

export type GuildRankDefinition = {
  id: string;
  name: string;
  power: number;
  permissions: GuildPermission[];
};

export type GuildMember = {
  accountId: string;
  characterId: string;
  characterName: string;
  rankId: string;
  joinedAt: number;
  lastSeenAt: number;
};

export type GuildApplication = {
  id: string;
  guildId: string;
  accountId: string;
  characterId: string;
  characterName: string;
  message: string;
  createdAt: number;
};

export type GuildInvite = {
  id: string;
  guildId: string;
  guildName: string;
  guildTag: string;
  inviterCharacterId: string;
  inviterName: string;
  targetCharacterId: string;
  targetName: string;
  createdAt: number;
  expiresAt: number;
};

export type GuildLogType =
  | 'created' | 'joined' | 'left' | 'kicked' | 'promoted' | 'demoted'
  | 'leadership' | 'motd' | 'description' | 'application' | 'invite' | 'rank';

export type GuildLogEntry = {
  id: string;
  type: GuildLogType;
  actorName: string;
  targetName?: string;
  text: string;
  createdAt: number;
};

export type GuildRecord = {
  id: string;
  name: string;
  tag: string;
  description: string;
  motd: string;
  createdAt: number;
  level: number;
  exp: number;
  visibility: 'public' | 'private';
  ranks: GuildRankDefinition[];
  members: GuildMember[];
  applications: GuildApplication[];
  invites: GuildInvite[];
  logs: GuildLogEntry[];
  bank: {
    enabled: boolean;
    slots: number;
    coins: number;
  };
};

export type GuildActor = {
  accountId: string;
  characterId: string;
  characterName: string;
};

export type GuildCharacterDirectoryEntry = GuildActor & {
  level: number;
  className: string;
  lastPlayedAt: number;
};

export type GuildDirectoryEntry = {
  id: string;
  name: string;
  tag: string;
  description: string;
  motd: string;
  level: number;
  exp: number;
  memberCount: number;
  memberCap: number;
  leaderName: string;
  createdAt: number;
  visibility: 'public' | 'private';
};

export interface GuildRepository {
  getGuild(guildId: string): Promise<GuildRecord | null>;
  getGuildForCharacter(characterId: string): Promise<GuildRecord | null>;
  listGuilds(query?: string): Promise<GuildRecord[]>;
  saveGuild(guild: GuildRecord): Promise<void>;
  deleteGuild(guildId: string): Promise<void>;
  findCharacterByName(name: string): Promise<GuildCharacterDirectoryEntry | null>;
  getReceivedInvites(characterId: string): Promise<GuildInvite[]>;
  getApplicationsByCharacter(characterId: string): Promise<GuildApplication[]>;
}
