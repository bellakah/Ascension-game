import { createDefaultRanks, GUILD_CONFIG } from './guildConfig';
import type { GuildApplication, GuildCharacterDirectoryEntry, GuildInvite, GuildRecord, GuildRepository } from './guildTypes';

const GUILDS_KEY = 'ascension.guilds.v1';
const ACCOUNTS_KEY = 'ascension.accounts.v1';

type GuildFile = { version: 1; guilds: GuildRecord[] };
type StoredCharacter = { id: string; config?: { name?: string }; progress?: { level?: number; className?: string; lastPlayedAt?: number } };
type StoredAccount = { username?: string; characters?: Array<StoredCharacter | null> };
type StoredAccounts = Record<string, StoredAccount>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeGuild(value: GuildRecord): GuildRecord {
  const now = Date.now();
  const ranks = Array.isArray(value.ranks) && value.ranks.length ? value.ranks : createDefaultRanks();
  return {
    ...value,
    description: String(value.description ?? '').slice(0, GUILD_CONFIG.descriptionMax),
    motd: String(value.motd ?? '').slice(0, GUILD_CONFIG.motdMax),
    level: Math.max(1, Math.min(GUILD_CONFIG.maxLevel, Number(value.level) || 1)),
    exp: Math.max(0, Number(value.exp) || 0),
    visibility: value.visibility === 'private' ? 'private' : 'public',
    ranks: ranks.map((rank) => ({ ...rank, permissions: Array.isArray(rank.permissions) ? [...rank.permissions] : [] })),
    members: Array.isArray(value.members) ? value.members : [],
    applications: Array.isArray(value.applications) ? value.applications : [],
    invites: (Array.isArray(value.invites) ? value.invites : []).filter((invite) => Number(invite.expiresAt) > now),
    logs: Array.isArray(value.logs) ? value.logs.slice(-GUILD_CONFIG.maxLogs) : [],
    bank: value.bank ?? { enabled: false, slots: 0, coins: 0 },
  };
}

function loadGuildFile(): GuildFile {
  try {
    const parsed = JSON.parse(localStorage.getItem(GUILDS_KEY) ?? '') as Partial<GuildFile>;
    const guilds = Array.isArray(parsed?.guilds) ? parsed.guilds.map((guild) => normalizeGuild(guild)) : [];
    return { version: 1, guilds };
  } catch {
    return { version: 1, guilds: [] };
  }
}

function saveGuildFile(file: GuildFile) {
  localStorage.setItem(GUILDS_KEY, JSON.stringify({ version: 1, guilds: file.guilds.map(normalizeGuild) }));
}

function loadAccounts(): StoredAccounts {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? '{}') as StoredAccounts;
  } catch {
    return {};
  }
}

function allCharacters(): GuildCharacterDirectoryEntry[] {
  const result: GuildCharacterDirectoryEntry[] = [];
  for (const [accountId, account] of Object.entries(loadAccounts())) {
    for (const character of account.characters ?? []) {
      if (!character?.id || !character.config?.name) continue;
      result.push({
        accountId,
        characterId: character.id,
        characterName: character.config.name,
        level: Math.max(1, Number(character.progress?.level) || 1),
        className: character.progress?.className || 'Aventureiro',
        lastPlayedAt: Number(character.progress?.lastPlayedAt) || 0,
      });
    }
  }
  return result;
}

export function resolveGuildMembership(characterId: string) {
  const guild = loadGuildFile().guilds.find((entry) => entry.members.some((member) => member.characterId === characterId));
  if (!guild) return null;
  const member = guild.members.find((entry) => entry.characterId === characterId) ?? null;
  return { guild: clone(guild), member: member ? clone(member) : null };
}

export function createLocalGuildRepository(): GuildRepository {
  return {
    async getGuild(guildId) {
      const guild = loadGuildFile().guilds.find((entry) => entry.id === guildId);
      return guild ? clone(guild) : null;
    },
    async getGuildForCharacter(characterId) {
      const guild = loadGuildFile().guilds.find((entry) => entry.members.some((member) => member.characterId === characterId));
      return guild ? clone(guild) : null;
    },
    async listGuilds(query = '') {
      const needle = query.trim().toLocaleLowerCase('pt-BR');
      return loadGuildFile().guilds
        .filter((guild) => !needle || guild.name.toLocaleLowerCase('pt-BR').includes(needle) || guild.tag.toLocaleLowerCase('pt-BR').includes(needle))
        .sort((a, b) => b.level - a.level || b.members.length - a.members.length || a.name.localeCompare(b.name))
        .map(clone);
    },
    async saveGuild(guild) {
      const file = loadGuildFile();
      const normalized = normalizeGuild(clone(guild));
      const index = file.guilds.findIndex((entry) => entry.id === normalized.id);
      if (index >= 0) file.guilds[index] = normalized;
      else file.guilds.push(normalized);
      saveGuildFile(file);
    },
    async deleteGuild(guildId) {
      const file = loadGuildFile();
      file.guilds = file.guilds.filter((entry) => entry.id !== guildId);
      saveGuildFile(file);
    },
    async findCharacterByName(name) {
      const needle = name.trim().toLocaleLowerCase('pt-BR');
      const character = allCharacters().find((entry) => entry.characterName.toLocaleLowerCase('pt-BR') === needle);
      return character ? clone(character) : null;
    },
    async getReceivedInvites(characterId) {
      const now = Date.now();
      const invites: GuildInvite[] = [];
      for (const guild of loadGuildFile().guilds) {
        invites.push(...guild.invites.filter((invite) => invite.targetCharacterId === characterId && invite.expiresAt > now));
      }
      return invites.sort((a, b) => b.createdAt - a.createdAt).map(clone);
    },
    async getApplicationsByCharacter(characterId) {
      const applications: GuildApplication[] = [];
      for (const guild of loadGuildFile().guilds) applications.push(...guild.applications.filter((application) => application.characterId === characterId));
      return applications.sort((a, b) => b.createdAt - a.createdAt).map(clone);
    },
  };
}
