import { createDefaultRanks, GUILD_CONFIG, guildExpToNext, guildLeader, guildMemberCap } from './guildConfig';
import type { GuildActor, GuildApplication, GuildInvite, GuildPermission, GuildRankDefinition, GuildRecord, GuildRepository } from './guildTypes';

type GuildEconomy = {
  getCoins: () => number;
  setCoins: (value: number) => void;
};

export type GuildActionResult =
  | { ok: true; message: string; guild?: GuildRecord | null }
  | { ok: false; reason: string };

function makeId(prefix: string) {
  if ('randomUUID' in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeTag(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function addLog(guild: GuildRecord, type: GuildRecord['logs'][number]['type'], actorName: string, text: string, targetName?: string) {
  guild.logs.push({ id: makeId('log'), type, actorName, targetName, text, createdAt: Date.now() });
  if (guild.logs.length > GUILD_CONFIG.maxLogs) guild.logs.splice(0, guild.logs.length - GUILD_CONFIG.maxLogs);
}

function rankFor(guild: GuildRecord, rankId: string) {
  return guild.ranks.find((rank) => rank.id === rankId) ?? null;
}

function memberFor(guild: GuildRecord, characterId: string) {
  return guild.members.find((member) => member.characterId === characterId) ?? null;
}

function can(guild: GuildRecord, actor: GuildActor, permission: GuildPermission) {
  const member = memberFor(guild, actor.characterId);
  if (!member) return false;
  return Boolean(rankFor(guild, member.rankId)?.permissions.includes(permission));
}

function actorPower(guild: GuildRecord, actor: GuildActor) {
  const member = memberFor(guild, actor.characterId);
  return member ? (rankFor(guild, member.rankId)?.power ?? 0) : 0;
}

export function createGuildService(repository: GuildRepository, actor: GuildActor, economy: GuildEconomy) {
  const cleanupAfterJoin = async (characterId: string, joinedGuildId: string) => {
    const guilds = await repository.listGuilds();
    for (const guild of guilds) {
      let changed = false;
      const nextApplications = guild.applications.filter((entry) => entry.characterId !== characterId);
      const nextInvites = guild.invites.filter((entry) => entry.targetCharacterId !== characterId || guild.id === joinedGuildId);
      if (nextApplications.length !== guild.applications.length) { guild.applications = nextApplications; changed = true; }
      if (nextInvites.length !== guild.invites.length) { guild.invites = nextInvites; changed = true; }
      if (changed) await repository.saveGuild(guild);
    }
  };

  const getCurrentGuild = async () => repository.getGuildForCharacter(actor.characterId);

  const requireCurrentGuild = async () => {
    const guild = await getCurrentGuild();
    if (!guild) return { ok: false as const, reason: 'Você não pertence a uma guilda.' };
    const member = memberFor(guild, actor.characterId);
    if (!member) return { ok: false as const, reason: 'Seu vínculo com a guilda não foi encontrado.' };
    member.lastSeenAt = Date.now();
    return { ok: true as const, guild, member };
  };

  const save = async (guild: GuildRecord) => {
    await repository.saveGuild(guild);
    return guild;
  };

  const createGuild = async (rawName: string, rawTag: string, rawDescription: string): Promise<GuildActionResult> => {
    if (await getCurrentGuild()) return { ok: false, reason: 'Este personagem já pertence a uma guilda.' };
    const name = normalizeName(rawName);
    const tag = normalizeTag(rawTag);
    const description = rawDescription.trim().slice(0, GUILD_CONFIG.descriptionMax);
    if (name.length < GUILD_CONFIG.nameMin || name.length > GUILD_CONFIG.nameMax) return { ok: false, reason: `O nome precisa ter ${GUILD_CONFIG.nameMin} a ${GUILD_CONFIG.nameMax} caracteres.` };
    if (tag.length < GUILD_CONFIG.tagMin || tag.length > GUILD_CONFIG.tagMax) return { ok: false, reason: `A tag precisa ter ${GUILD_CONFIG.tagMin} a ${GUILD_CONFIG.tagMax} letras/números.` };
    const guilds = await repository.listGuilds();
    if (guilds.some((guild) => guild.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) return { ok: false, reason: 'Já existe uma guilda com esse nome.' };
    if (guilds.some((guild) => guild.tag.toLocaleLowerCase('pt-BR') === tag.toLocaleLowerCase('pt-BR'))) return { ok: false, reason: 'Essa tag já está em uso.' };
    if (economy.getCoins() < GUILD_CONFIG.creationCost) return { ok: false, reason: `São necessárias ${GUILD_CONFIG.creationCost} moedas para criar uma guilda.` };

    const now = Date.now();
    const guild: GuildRecord = {
      id: makeId('guild'), name, tag, description, motd: 'Bem-vindos à guilda!', createdAt: now,
      level: 1, exp: 0, visibility: 'public', ranks: createDefaultRanks(),
      members: [{ accountId: actor.accountId, characterId: actor.characterId, characterName: actor.characterName, rankId: 'leader', joinedAt: now, lastSeenAt: now }],
      applications: [], invites: [], logs: [], bank: { enabled: false, slots: 0, coins: 0 },
    };
    addLog(guild, 'created', actor.characterName, `${actor.characterName} fundou a guilda ${name}.`);
    await save(guild);
    economy.setCoins(Math.max(0, economy.getCoins() - GUILD_CONFIG.creationCost));
    await cleanupAfterJoin(actor.characterId, guild.id);
    return { ok: true, message: `Guilda ${name} criada com sucesso.`, guild };
  };

  const applyToGuild = async (guildId: string, message: string): Promise<GuildActionResult> => {
    if (await getCurrentGuild()) return { ok: false, reason: 'Você já pertence a uma guilda.' };
    const guild = await repository.getGuild(guildId);
    if (!guild || guild.visibility !== 'public') return { ok: false, reason: 'Essa guilda não está disponível para candidaturas.' };
    if (guild.members.length >= guildMemberCap(guild.level)) return { ok: false, reason: 'Essa guilda atingiu o limite de membros.' };
    const applications = await repository.getApplicationsByCharacter(actor.characterId);
    if (applications.some((entry) => entry.guildId === guildId)) return { ok: false, reason: 'Você já se candidatou a esta guilda.' };
    if (applications.length >= GUILD_CONFIG.applicationLimitPerCharacter) return { ok: false, reason: `Você pode manter no máximo ${GUILD_CONFIG.applicationLimitPerCharacter} candidaturas ativas.` };
    if (guild.applications.length >= GUILD_CONFIG.maxApplications) return { ok: false, reason: 'Esta guilda atingiu o limite de candidaturas pendentes.' };
    const application: GuildApplication = {
      id: makeId('application'), guildId: guild.id, accountId: actor.accountId, characterId: actor.characterId,
      characterName: actor.characterName, message: message.trim().slice(0, GUILD_CONFIG.applicationMessageMax), createdAt: Date.now(),
    };
    guild.applications.push(application);
    addLog(guild, 'application', actor.characterName, `${actor.characterName} enviou uma candidatura.`);
    await save(guild);
    return { ok: true, message: `Candidatura enviada para ${guild.name}.` };
  };

  const cancelApplication = async (guildId: string): Promise<GuildActionResult> => {
    const guild = await repository.getGuild(guildId);
    if (!guild) return { ok: false, reason: 'Guilda não encontrada.' };
    const before = guild.applications.length;
    guild.applications = guild.applications.filter((entry) => entry.characterId !== actor.characterId);
    if (guild.applications.length === before) return { ok: false, reason: 'Candidatura não encontrada.' };
    await save(guild);
    return { ok: true, message: 'Candidatura cancelada.' };
  };

  const reviewApplication = async (applicationId: string, accept: boolean): Promise<GuildActionResult> => {
    const current = await requireCurrentGuild();
    if (!current.ok) return current;
    const { guild } = current;
    if (!can(guild, actor, 'reviewApplications')) return { ok: false, reason: 'Seu cargo não pode revisar candidaturas.' };
    const application = guild.applications.find((entry) => entry.id === applicationId);
    if (!application) return { ok: false, reason: 'Candidatura não encontrada.' };
    if (!accept) {
      guild.applications = guild.applications.filter((entry) => entry.id !== applicationId);
      addLog(guild, 'application', actor.characterName, `${actor.characterName} recusou a candidatura de ${application.characterName}.`, application.characterName);
      await save(guild);
      return { ok: true, message: `Candidatura de ${application.characterName} recusada.` };
    }
    if (guild.members.length >= guildMemberCap(guild.level)) return { ok: false, reason: 'A guilda atingiu o limite de membros.' };
    if (await repository.getGuildForCharacter(application.characterId)) {
      guild.applications = guild.applications.filter((entry) => entry.id !== applicationId);
      await save(guild);
      return { ok: false, reason: 'Esse personagem já entrou em outra guilda.' };
    }
    const now = Date.now();
    guild.members.push({ accountId: application.accountId, characterId: application.characterId, characterName: application.characterName, rankId: 'member', joinedAt: now, lastSeenAt: now });
    guild.applications = guild.applications.filter((entry) => entry.id !== applicationId);
    addLog(guild, 'joined', actor.characterName, `${application.characterName} entrou na guilda por candidatura.`, application.characterName);
    await save(guild);
    await cleanupAfterJoin(application.characterId, guild.id);
    return { ok: true, message: `${application.characterName} agora é membro da guilda.` };
  };

  const inviteByName = async (targetName: string): Promise<GuildActionResult> => {
    const current = await requireCurrentGuild();
    if (!current.ok) return current;
    const { guild } = current;
    if (!can(guild, actor, 'invite')) return { ok: false, reason: 'Seu cargo não pode convidar membros.' };
    if (guild.members.length >= guildMemberCap(guild.level)) return { ok: false, reason: 'A guilda atingiu o limite de membros.' };
    const target = await repository.findCharacterByName(targetName);
    if (!target) return { ok: false, reason: 'Nenhum personagem foi encontrado com esse nome.' };
    if (target.characterId === actor.characterId) return { ok: false, reason: 'Você já está nesta guilda.' };
    if (await repository.getGuildForCharacter(target.characterId)) return { ok: false, reason: 'Esse personagem já pertence a uma guilda.' };
    if (guild.applications.some((entry) => entry.characterId === target.characterId)) return { ok: false, reason: 'Esse personagem já se candidatou. Revise-o na aba Candidaturas.' };
    if (guild.invites.some((entry) => entry.targetCharacterId === target.characterId && entry.expiresAt > Date.now())) return { ok: false, reason: 'Já existe um convite pendente para esse personagem.' };
    const now = Date.now();
    const invite: GuildInvite = {
      id: makeId('invite'), guildId: guild.id, guildName: guild.name, guildTag: guild.tag,
      inviterCharacterId: actor.characterId, inviterName: actor.characterName,
      targetCharacterId: target.characterId, targetName: target.characterName,
      createdAt: now, expiresAt: now + GUILD_CONFIG.inviteExpirationMs,
    };
    guild.invites.push(invite);
    addLog(guild, 'invite', actor.characterName, `${actor.characterName} convidou ${target.characterName}.`, target.characterName);
    await save(guild);
    return { ok: true, message: `Convite enviado para ${target.characterName}.` };
  };

  const respondInvite = async (inviteId: string, accept: boolean): Promise<GuildActionResult> => {
    if (accept && await getCurrentGuild()) return { ok: false, reason: 'Você já pertence a uma guilda.' };
    const incoming = await repository.getReceivedInvites(actor.characterId);
    const invite = incoming.find((entry) => entry.id === inviteId);
    if (!invite) return { ok: false, reason: 'Convite não encontrado ou expirado.' };
    const guild = await repository.getGuild(invite.guildId);
    if (!guild) return { ok: false, reason: 'A guilda deste convite não existe mais.' };
    guild.invites = guild.invites.filter((entry) => entry.id !== inviteId);
    if (!accept) {
      await save(guild);
      return { ok: true, message: `Convite de ${guild.name} recusado.` };
    }
    if (guild.members.length >= guildMemberCap(guild.level)) return { ok: false, reason: 'A guilda atingiu o limite de membros.' };
    const now = Date.now();
    guild.members.push({ accountId: actor.accountId, characterId: actor.characterId, characterName: actor.characterName, rankId: 'member', joinedAt: now, lastSeenAt: now });
    addLog(guild, 'joined', actor.characterName, `${actor.characterName} aceitou um convite e entrou na guilda.`, actor.characterName);
    await save(guild);
    await cleanupAfterJoin(actor.characterId, guild.id);
    return { ok: true, message: `Você entrou na guilda ${guild.name}.`, guild };
  };

  const updateMotd = async (motd: string): Promise<GuildActionResult> => {
    const current = await requireCurrentGuild();
    if (!current.ok) return current;
    if (!can(current.guild, actor, 'editMotd')) return { ok: false, reason: 'Seu cargo não pode editar o aviso.' };
    current.guild.motd = motd.trim().slice(0, GUILD_CONFIG.motdMax);
    addLog(current.guild, 'motd', actor.characterName, `${actor.characterName} atualizou a mensagem da guilda.`);
    await save(current.guild);
    return { ok: true, message: 'Mensagem da guilda atualizada.' };
  };

  const updateDescription = async (description: string): Promise<GuildActionResult> => {
    const current = await requireCurrentGuild();
    if (!current.ok) return current;
    if (!can(current.guild, actor, 'editDescription')) return { ok: false, reason: 'Seu cargo não pode editar a descrição.' };
    current.guild.description = description.trim().slice(0, GUILD_CONFIG.descriptionMax);
    addLog(current.guild, 'description', actor.characterName, `${actor.characterName} atualizou a descrição pública.`);
    await save(current.guild);
    return { ok: true, message: 'Descrição atualizada.' };
  };

  const setRankPermissions = async (rankId: string, permissions: GuildPermission[]): Promise<GuildActionResult> => {
    const current = await requireCurrentGuild();
    if (!current.ok) return current;
    const { guild } = current;
    if (!can(guild, actor, 'manageRanks')) return { ok: false, reason: 'Seu cargo não pode gerenciar cargos.' };
    if (rankId === 'leader') return { ok: false, reason: 'As permissões do Líder são protegidas.' };
    const rank = rankFor(guild, rankId);
    if (!rank) return { ok: false, reason: 'Cargo não encontrado.' };
    rank.permissions = [...new Set(permissions)];
    addLog(guild, 'rank', actor.characterName, `${actor.characterName} atualizou as permissões de ${rank.name}.`);
    await save(guild);
    return { ok: true, message: `Permissões de ${rank.name} atualizadas.` };
  };

  const changeMemberRank = async (targetCharacterId: string, direction: 'promote' | 'demote'): Promise<GuildActionResult> => {
    const current = await requireCurrentGuild();
    if (!current.ok) return current;
    const { guild } = current;
    if (!can(guild, actor, direction)) return { ok: false, reason: `Seu cargo não pode ${direction === 'promote' ? 'promover' : 'rebaixar'} membros.` };
    const target = memberFor(guild, targetCharacterId);
    if (!target) return { ok: false, reason: 'Membro não encontrado.' };
    if (target.characterId === actor.characterId) return { ok: false, reason: 'Você não pode alterar o próprio cargo dessa forma.' };
    const currentRank = rankFor(guild, target.rankId);
    if (!currentRank) return { ok: false, reason: 'Cargo atual inválido.' };
    if (currentRank.id === 'leader') return { ok: false, reason: 'Use Transferir liderança para alterar o Líder.' };
    const power = actorPower(guild, actor);
    if (currentRank.power >= power) return { ok: false, reason: 'Você só pode administrar cargos inferiores ao seu.' };
    const candidates = guild.ranks
      .filter((rank) => rank.id !== 'leader' && rank.power < power)
      .sort((a, b) => a.power - b.power);
    const next = direction === 'promote'
      ? candidates.find((rank) => rank.power > currentRank.power)
      : [...candidates].reverse().find((rank) => rank.power < currentRank.power);
    if (!next) return { ok: false, reason: direction === 'promote' ? 'Este membro já está no maior cargo que você pode conceder.' : 'Este membro já está no menor cargo.' };
    target.rankId = next.id;
    addLog(guild, direction === 'promote' ? 'promoted' : 'demoted', actor.characterName, `${target.characterName} agora é ${next.name}.`, target.characterName);
    await save(guild);
    return { ok: true, message: `${target.characterName} agora é ${next.name}.` };
  };

  const kick = async (targetCharacterId: string): Promise<GuildActionResult> => {
    const current = await requireCurrentGuild();
    if (!current.ok) return current;
    const { guild } = current;
    if (!can(guild, actor, 'kick')) return { ok: false, reason: 'Seu cargo não pode expulsar membros.' };
    const target = memberFor(guild, targetCharacterId);
    if (!target) return { ok: false, reason: 'Membro não encontrado.' };
    if (target.characterId === actor.characterId) return { ok: false, reason: 'Use Sair da guilda para remover seu próprio personagem.' };
    const targetPower = rankFor(guild, target.rankId)?.power ?? 0;
    if (targetPower >= actorPower(guild, actor)) return { ok: false, reason: 'Você só pode expulsar membros de cargo inferior.' };
    guild.members = guild.members.filter((member) => member.characterId !== targetCharacterId);
    addLog(guild, 'kicked', actor.characterName, `${target.characterName} foi expulso da guilda.`, target.characterName);
    await save(guild);
    return { ok: true, message: `${target.characterName} foi expulso.` };
  };

  const leave = async (): Promise<GuildActionResult> => {
    const current = await requireCurrentGuild();
    if (!current.ok) return current;
    const { guild, member } = current;
    if (member.rankId === 'leader') return { ok: false, reason: 'O Líder precisa transferir a liderança ou dissolver a guilda antes de sair.' };
    guild.members = guild.members.filter((entry) => entry.characterId !== actor.characterId);
    addLog(guild, 'left', actor.characterName, `${actor.characterName} saiu da guilda.`, actor.characterName);
    await save(guild);
    return { ok: true, message: `Você saiu de ${guild.name}.` };
  };

  const transferLeadership = async (targetCharacterId: string): Promise<GuildActionResult> => {
    const current = await requireCurrentGuild();
    if (!current.ok) return current;
    const { guild, member } = current;
    if (!can(guild, actor, 'transferLeadership') || member.rankId !== 'leader') return { ok: false, reason: 'Somente o Líder pode transferir a liderança.' };
    const target = memberFor(guild, targetCharacterId);
    if (!target || target.characterId === actor.characterId) return { ok: false, reason: 'Escolha outro membro da guilda.' };
    member.rankId = 'officer';
    target.rankId = 'leader';
    addLog(guild, 'leadership', actor.characterName, `${actor.characterName} transferiu a liderança para ${target.characterName}.`, target.characterName);
    await save(guild);
    return { ok: true, message: `${target.characterName} agora é o Líder da guilda.` };
  };

  const disband = async (): Promise<GuildActionResult> => {
    const current = await requireCurrentGuild();
    if (!current.ok) return current;
    if (!can(current.guild, actor, 'disband') || current.member.rankId !== 'leader') return { ok: false, reason: 'Somente o Líder pode dissolver a guilda.' };
    const name = current.guild.name;
    await repository.deleteGuild(current.guild.id);
    return { ok: true, message: `Guilda ${name} dissolvida.`, guild: null };
  };

  const grantExp = async (amount: number): Promise<GuildActionResult> => {
    const current = await requireCurrentGuild();
    if (!current.ok) return current;
    const guild = current.guild;
    guild.exp += Math.max(0, Math.floor(amount));
    while (guild.level < GUILD_CONFIG.maxLevel) {
      const needed = guildExpToNext(guild.level);
      if (!needed || guild.exp < needed) break;
      guild.exp -= needed;
      guild.level += 1;
    }
    await save(guild);
    return { ok: true, message: `Guilda recebeu ${Math.max(0, Math.floor(amount))} EXP.`, guild };
  };

  return {
    actor,
    getCurrentGuild,
    discover: (query = '') => repository.listGuilds(query),
    incomingInvites: () => repository.getReceivedInvites(actor.characterId),
    ownApplications: () => repository.getApplicationsByCharacter(actor.characterId),
    createGuild,
    applyToGuild,
    cancelApplication,
    reviewApplication,
    inviteByName,
    respondInvite,
    updateMotd,
    updateDescription,
    setRankPermissions,
    promote: (targetCharacterId: string) => changeMemberRank(targetCharacterId, 'promote'),
    demote: (targetCharacterId: string) => changeMemberRank(targetCharacterId, 'demote'),
    kick,
    leave,
    transferLeadership,
    disband,
    grantExp,
    memberCap: guildMemberCap,
    expToNext: guildExpToNext,
    leader: guildLeader,
    rankFor,
    memberFor,
    can: (guild: GuildRecord, permission: GuildPermission) => can(guild, actor, permission),
    actorPower: (guild: GuildRecord) => actorPower(guild, actor),
  };
}

export type GuildService = ReturnType<typeof createGuildService>;
