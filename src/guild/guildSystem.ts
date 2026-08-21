import './guild.css';
import { GUILD_CONFIG, GUILD_PERMISSIONS, guildExpToNext, guildLeader, guildMemberCap } from './guildConfig';
import { createLocalGuildRepository } from './localGuildRepository';
import { createGuildService, type GuildActionResult } from './guildService';
import type { GuildPermission, GuildRankDefinition, GuildRecord, GuildRepository } from './guildTypes';

type GuildSystemOptions = {
  accountId: string;
  characterId: string;
  characterName: string;
  getCoins: () => number;
  setCoins: (value: number) => void;
  onChanged: () => void;
  notify: (message: string) => void;
  repository?: GuildRepository;
};

type MemberTab = 'overview' | 'members' | 'applications' | 'invites' | 'ranks' | 'history';
type GuestTab = 'discover' | 'applications' | 'invites' | 'create';

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char] ?? char);
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function relativeTime(timestamp: number) {
  const delta = Math.max(0, Date.now() - timestamp);
  if (delta < 60_000) return 'agora';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} min`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} h`;
  return `${Math.floor(delta / 86_400_000)} d`;
}

function rankOf(guild: GuildRecord, rankId: string) {
  return guild.ranks.find((rank) => rank.id === rankId) ?? guild.ranks[guild.ranks.length - 1];
}

export function createGuildSystem(options: GuildSystemOptions) {
  const repository = options.repository ?? createLocalGuildRepository();
  const service = createGuildService(repository, {
    accountId: options.accountId,
    characterId: options.characterId,
    characterName: options.characterName,
  }, { getCoins: options.getCoins, setCoins: options.setCoins });

  const root = document.createElement('div');
  root.id = 'guild-overlay';
  root.className = 'guild-hidden';
  document.body.appendChild(root);

  let memberTab: MemberTab = 'overview';
  let guestTab: GuestTab = 'discover';
  let search = '';
  let busy = false;
  let renderVersion = 0;
  let notice = '';

  const isOpen = () => !root.classList.contains('guild-hidden');
  const close = () => root.classList.add('guild-hidden');
  const open = () => { root.classList.remove('guild-hidden'); void render(); };
  const toggle = () => isOpen() ? close() : open();

  const resultMessage = (result: GuildActionResult) => 'reason' in result ? result.reason : result.message;
  const run = async (action: () => Promise<GuildActionResult>) => {
    if (busy) return;
    busy = true;
    try {
      const result = await action();
      notice = resultMessage(result);
      options.notify(notice);
      if (!('reason' in result)) options.onChanged();
    } catch (error) {
      notice = error instanceof Error ? error.message : 'Não foi possível concluir esta ação.';
      options.notify(notice);
    } finally {
      busy = false;
      await render();
    }
  };

  const shell = (title: string, subtitle: string, nav: string, body: string) => `
    <section class="guild-shell">
      <header class="guild-header"><div><span>ASCENSION • GUILDAS</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p></div><button id="guild-close" type="button" aria-label="Fechar">×</button></header>
      <div class="guild-layout"><nav class="guild-nav">${nav}</nav><main class="guild-content"><div class="guild-notice">${escapeHtml(notice)}</div>${body}</main></div>
    </section>`;

  const bindClose = () => root.querySelector<HTMLButtonElement>('#guild-close')?.addEventListener('click', close);

  const guestNavigation = () => [
    ['discover', '⌕', 'Descobrir'], ['applications', '📨', 'Candidaturas'], ['invites', '✉', 'Convites'], ['create', '＋', 'Criar Guilda'],
  ].map(([id, icon, label]) => `<button data-guest-tab="${id}" class="${guestTab === id ? 'active' : ''}"><span>${icon}</span>${label}</button>`).join('');

  const memberNavigation = (guild: GuildRecord) => [
    ['overview', '🛡', 'Visão Geral'], ['members', '👥', 'Membros'], ['applications', '📨', `Candidaturas${guild.applications.length ? ` (${guild.applications.length})` : ''}`],
    ['invites', '✉', 'Convites'], ['ranks', '♜', 'Cargos'], ['history', '☷', 'Histórico'],
  ].map(([id, icon, label]) => `<button data-member-tab="${id}" class="${memberTab === id ? 'active' : ''}"><span>${icon}</span>${label}</button>`).join('');

  const renderDiscovery = async () => {
    const guilds = (await service.discover(search)).filter((guild) => guild.visibility === 'public');
    return `<section class="guild-page-head"><div><h3>Descoberta de Guildas</h3><p>Encontre uma comunidade e envie sua candidatura.</p></div><div class="guild-search"><input id="guild-search" value="${escapeHtml(search)}" maxlength="24" placeholder="Nome ou TAG"><button id="guild-search-btn">Buscar</button></div></section>
      <div class="guild-card-grid">${guilds.length ? guilds.map((guild) => {
        const leader = guildLeader(guild);
        const cap = guildMemberCap(guild.level);
        return `<article class="guild-discovery-card"><div class="guild-emblem">${escapeHtml(guild.tag.slice(0, 3))}</div><div class="guild-card-main"><header><div><strong>${escapeHtml(guild.name)}</strong><span>[${escapeHtml(guild.tag)}] • Nv. ${guild.level}</span></div><b>${guild.members.length}/${cap}</b></header><p>${escapeHtml(guild.description || 'Esta guilda ainda não adicionou uma descrição.')}</p><footer><span>Líder: <strong>${escapeHtml(leader?.characterName ?? '—')}</strong></span><span>Criada ${formatDate(guild.createdAt)}</span></footer></div><button class="guild-apply" data-apply="${guild.id}" ${guild.members.length >= cap ? 'disabled' : ''}>${guild.members.length >= cap ? 'Lotada' : 'Candidatar-se'}</button></article>`;
      }).join('') : '<div class="guild-empty"><span>⌕</span><strong>Nenhuma guilda encontrada</strong><p>Crie a primeira guilda ou tente outra busca.</p></div>'}</div>`;
  };

  const renderGuestApplications = async () => {
    const applications = await service.ownApplications();
    const guilds = await service.discover();
    const guildById = new Map(guilds.map((guild) => [guild.id, guild]));
    return `<section class="guild-page-head"><div><h3>Minhas candidaturas</h3><p>Você pode manter até ${GUILD_CONFIG.applicationLimitPerCharacter} pedidos ativos.</p></div></section><div class="guild-list">${applications.length ? applications.map((application) => {
      const guild = guildById.get(application.guildId);
      return `<article class="guild-list-row"><div><strong>${escapeHtml(guild?.name ?? 'Guilda indisponível')}</strong><span>[${escapeHtml(guild?.tag ?? '???')}] • enviada ${relativeTime(application.createdAt)}</span><small>${escapeHtml(application.message || 'Sem mensagem de apresentação.')}</small></div><button data-cancel-application="${application.guildId}">Cancelar</button></article>`;
    }).join('') : '<div class="guild-empty"><span>📨</span><strong>Nenhuma candidatura ativa</strong><p>Use Descobrir para encontrar guildas abertas.</p></div>'}</div>`;
  };

  const renderGuestInvites = async () => {
    const invites = await service.incomingInvites();
    return `<section class="guild-page-head"><div><h3>Convites recebidos</h3><p>Convites expiram automaticamente após alguns dias.</p></div></section><div class="guild-list">${invites.length ? invites.map((invite) => `<article class="guild-list-row invite"><div><strong>${escapeHtml(invite.guildName)} <span>[${escapeHtml(invite.guildTag)}]</span></strong><small>${escapeHtml(invite.inviterName)} convidou você • ${relativeTime(invite.createdAt)}</small></div><div class="guild-row-actions"><button class="positive" data-invite-accept="${invite.id}">Aceitar</button><button data-invite-decline="${invite.id}">Recusar</button></div></article>`).join('') : '<div class="guild-empty"><span>✉</span><strong>Nenhum convite pendente</strong><p>Convites enviados por líderes e oficiais aparecem aqui.</p></div>'}</div>`;
  };

  const renderCreate = () => `<section class="guild-page-head"><div><h3>Criar Guilda</h3><p>Fundar uma guilda custa <strong>${GUILD_CONFIG.creationCost} moedas</strong>. Você possui ${options.getCoins()}.</p></div></section>
    <form class="guild-create-form" id="guild-create-form"><label>Nome da guilda<input id="guild-create-name" maxlength="${GUILD_CONFIG.nameMax}" placeholder="Ex.: Guardiões da Aurora" required></label><label>TAG<input id="guild-create-tag" maxlength="${GUILD_CONFIG.tagMax}" placeholder="AUR" required></label><label class="wide">Descrição<textarea id="guild-create-description" maxlength="${GUILD_CONFIG.descriptionMax}" placeholder="Conte aos jogadores que tipo de guilda você está criando."></textarea></label><div class="guild-create-summary"><span>👥 ${guildMemberCap(1)} membros no Nv. 1</span><span>🛡 Você será o Líder</span><span>🪙 ${GUILD_CONFIG.creationCost} moedas</span></div><button class="guild-primary wide" type="submit">Fundar Guilda</button></form>`;

  const bindGuest = () => {
    root.querySelectorAll<HTMLButtonElement>('[data-guest-tab]').forEach((button) => button.onclick = () => { guestTab = button.dataset.guestTab as GuestTab; void render(); });
    const searchInput = root.querySelector<HTMLInputElement>('#guild-search');
    const doSearch = () => { search = searchInput?.value.trim() ?? ''; void render(); };
    root.querySelector<HTMLButtonElement>('#guild-search-btn')?.addEventListener('click', doSearch);
    searchInput?.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); doSearch(); } });
    root.querySelectorAll<HTMLButtonElement>('[data-apply]').forEach((button) => button.onclick = () => {
      const message = window.prompt('Mensagem de apresentação (opcional):', '') ?? '';
      void run(() => service.applyToGuild(button.dataset.apply!, message));
    });
    root.querySelectorAll<HTMLButtonElement>('[data-cancel-application]').forEach((button) => button.onclick = () => void run(() => service.cancelApplication(button.dataset.cancelApplication!)));
    root.querySelectorAll<HTMLButtonElement>('[data-invite-accept]').forEach((button) => button.onclick = () => void run(() => service.respondInvite(button.dataset.inviteAccept!, true)));
    root.querySelectorAll<HTMLButtonElement>('[data-invite-decline]').forEach((button) => button.onclick = () => void run(() => service.respondInvite(button.dataset.inviteDecline!, false)));
    root.querySelector<HTMLFormElement>('#guild-create-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = root.querySelector<HTMLInputElement>('#guild-create-name')!.value;
      const tag = root.querySelector<HTMLInputElement>('#guild-create-tag')!.value;
      const description = root.querySelector<HTMLTextAreaElement>('#guild-create-description')!.value;
      void run(() => service.createGuild(name, tag, description));
    });
  };

  const renderOverview = (guild: GuildRecord) => {
    const leader = guildLeader(guild);
    const needed = guildExpToNext(guild.level);
    const percentage = needed ? Math.min(100, guild.exp / needed * 100) : 100;
    const canMotd = service.can(guild, 'editMotd');
    const canDescription = service.can(guild, 'editDescription');
    const actor = guild.members.find((member) => member.characterId === options.characterId);
    return `<div class="guild-hero"><div class="guild-big-emblem">${escapeHtml(guild.tag.slice(0, 3))}</div><div><span>[${escapeHtml(guild.tag)}]</span><h3>${escapeHtml(guild.name)}</h3><p>Líder: ${escapeHtml(leader?.characterName ?? '—')} • criada em ${formatDate(guild.createdAt)}</p></div><div class="guild-level"><strong>Nv. ${guild.level}</strong><span>${guild.members.length}/${guildMemberCap(guild.level)} membros</span></div></div>
      <div class="guild-overview-grid"><section class="guild-panel"><header><strong>Mensagem do Dia</strong>${canMotd ? '<span>Editável pelo seu cargo</span>' : ''}</header><textarea id="guild-motd" maxlength="${GUILD_CONFIG.motdMax}" ${canMotd ? '' : 'readonly'}>${escapeHtml(guild.motd)}</textarea>${canMotd ? '<button id="guild-save-motd">Salvar aviso</button>' : ''}</section><section class="guild-panel"><header><strong>Descrição pública</strong>${canDescription ? '<span>Aparece na descoberta</span>' : ''}</header><textarea id="guild-description" maxlength="${GUILD_CONFIG.descriptionMax}" ${canDescription ? '' : 'readonly'}>${escapeHtml(guild.description)}</textarea>${canDescription ? '<button id="guild-save-description">Salvar descrição</button>' : ''}</section><section class="guild-panel guild-exp-panel"><header><strong>Progresso da Guilda</strong><span>${guild.level >= GUILD_CONFIG.maxLevel ? 'Nível máximo' : `${guild.exp}/${needed} EXP`}</span></header><div class="guild-exp-bar"><div style="width:${percentage}%"></div></div><p>O sistema já está preparado para EXP de missões, bosses, eventos, doações e PvP.</p></section><section class="guild-panel guild-future"><header><strong>Expansões preparadas</strong></header><div><span>🏦 Banco da Guilda</span><span>⚔ Guerras</span><span>📜 Missões</span><span>✨ Buffs</span><span>🏰 Territórios</span><span>📅 Eventos</span></div></section></div>
      <div class="guild-danger-zone"><div><strong>Seu cargo: ${escapeHtml(rankOf(guild, actor?.rankId ?? '').name)}</strong><span>As ações administrativas são validadas por cargo e permissão.</span></div>${actor?.rankId === 'leader' ? '<button class="danger" id="guild-disband">Dissolver Guilda</button>' : '<button id="guild-leave">Sair da Guilda</button>'}</div>`;
  };

  const renderMembers = (guild: GuildRecord) => {
    const actorPower = service.actorPower(guild);
    const sorted = [...guild.members].sort((a, b) => (rankOf(guild, b.rankId)?.power ?? 0) - (rankOf(guild, a.rankId)?.power ?? 0) || a.characterName.localeCompare(b.characterName));
    return `<section class="guild-page-head"><div><h3>Membros</h3><p>${guild.members.length} de ${guildMemberCap(guild.level)} vagas ocupadas.</p></div></section><div class="guild-member-list">${sorted.map((member) => {
      const rank = rankOf(guild, member.rankId);
      const isSelf = member.characterId === options.characterId;
      const lower = rank.power < actorPower;
      const canPromote = !isSelf && lower && service.can(guild, 'promote') && member.rankId !== 'leader';
      const canDemote = !isSelf && lower && service.can(guild, 'demote') && member.rankId !== 'leader';
      const canKick = !isSelf && lower && service.can(guild, 'kick');
      const canTransfer = !isSelf && service.can(guild, 'transferLeadership') && guild.members.find((entry) => entry.characterId === options.characterId)?.rankId === 'leader';
      return `<article class="guild-member-row ${isSelf ? 'self' : ''}"><div class="guild-member-avatar">${escapeHtml(member.characterName.slice(0, 1).toUpperCase())}</div><div class="guild-member-info"><strong>${escapeHtml(member.characterName)}${isSelf ? ' <em>você</em>' : ''}</strong><span>${escapeHtml(rank.name)} • ${isSelf ? 'Online agora' : `última atividade ${relativeTime(member.lastSeenAt)}`}</span></div><div class="guild-member-actions">${canPromote ? `<button data-promote="${member.characterId}">Promover</button>` : ''}${canDemote ? `<button data-demote="${member.characterId}">Rebaixar</button>` : ''}${canTransfer ? `<button class="leadership" data-transfer="${member.characterId}">Liderança</button>` : ''}${canKick ? `<button class="danger" data-kick="${member.characterId}">Expulsar</button>` : ''}</div></article>`;
    }).join('')}</div>`;
  };

  const renderApplications = (guild: GuildRecord) => {
    const allowed = service.can(guild, 'reviewApplications');
    return `<section class="guild-page-head"><div><h3>Candidaturas</h3><p>${allowed ? 'Revise jogadores que querem entrar.' : 'Seu cargo pode visualizar, mas não revisar candidaturas.'}</p></div><span class="guild-count">${guild.applications.length}</span></section><div class="guild-list">${guild.applications.length ? [...guild.applications].sort((a,b) => b.createdAt-a.createdAt).map((application) => `<article class="guild-list-row"><div><strong>${escapeHtml(application.characterName)}</strong><span>Enviada ${relativeTime(application.createdAt)}</span><small>${escapeHtml(application.message || 'Sem mensagem de apresentação.')}</small></div>${allowed ? `<div class="guild-row-actions"><button class="positive" data-app-accept="${application.id}">Aceitar</button><button data-app-decline="${application.id}">Recusar</button></div>` : ''}</article>`).join('') : '<div class="guild-empty"><span>📨</span><strong>Nenhuma candidatura pendente</strong><p>Sua guilda aparece na Descoberta para jogadores sem guilda.</p></div>'}</div>`;
  };

  const renderInvites = (guild: GuildRecord) => {
    const allowed = service.can(guild, 'invite');
    const activeInvites = guild.invites.filter((invite) => invite.expiresAt > Date.now());
    return `<section class="guild-page-head"><div><h3>Convites</h3><p>Convites são diferentes de candidaturas e expiram automaticamente.</p></div></section>${allowed ? '<form class="guild-invite-form" id="guild-invite-form"><input id="guild-invite-name" maxlength="20" placeholder="Nome exato do personagem"><button class="guild-primary">Enviar convite</button></form>' : '<p class="guild-readonly-note">Seu cargo não possui permissão para convidar.</p>'}<div class="guild-list">${activeInvites.length ? activeInvites.map((invite) => `<article class="guild-list-row"><div><strong>${escapeHtml(invite.targetName)}</strong><span>Convidado por ${escapeHtml(invite.inviterName)}</span><small>Expira em ${relativeTime(invite.expiresAt - (Date.now() - invite.expiresAt))}</small></div><span class="guild-pending">Pendente</span></article>`).join('') : '<div class="guild-empty compact"><span>✉</span><strong>Nenhum convite pendente</strong></div>'}</div>`;
  };

  const renderRanks = (guild: GuildRecord) => {
    const canManage = service.can(guild, 'manageRanks');
    return `<section class="guild-page-head"><div><h3>Cargos e Permissões</h3><p>Permissões independentes deixam o sistema preparado para novos cargos no Editor.</p></div></section><div class="guild-ranks">${[...guild.ranks].sort((a,b) => b.power-a.power).map((rank) => `<article class="guild-rank-card"><header><div><strong>${escapeHtml(rank.name)}</strong><span>Poder ${rank.power}</span></div>${rank.id === 'leader' ? '<b>Protegido</b>' : ''}</header><div class="guild-permission-grid">${GUILD_PERMISSIONS.map((permission) => `<label class="${permission.future ? 'future' : ''}"><input type="checkbox" data-rank="${rank.id}" data-permission="${permission.id}" ${rank.permissions.includes(permission.id) ? 'checked' : ''} ${!canManage || rank.id === 'leader' ? 'disabled' : ''}><span><strong>${escapeHtml(permission.label)}</strong><small>${escapeHtml(permission.description)}${permission.future ? ' • futuro' : ''}</small></span></label>`).join('')}</div>${canManage && rank.id !== 'leader' ? `<button data-save-rank="${rank.id}">Salvar permissões de ${escapeHtml(rank.name)}</button>` : ''}</article>`).join('')}</div>`;
  };

  const renderHistory = (guild: GuildRecord) => `<section class="guild-page-head"><div><h3>Histórico da Guilda</h3><p>Registro local das principais ações administrativas.</p></div></section><div class="guild-history">${guild.logs.length ? [...guild.logs].reverse().map((entry) => `<article><span>${new Date(entry.createdAt).toLocaleString('pt-BR')}</span><p>${escapeHtml(entry.text)}</p></article>`).join('') : '<div class="guild-empty"><span>☷</span><strong>Nenhum evento registrado</strong></div>'}</div>`;

  const bindMember = (guild: GuildRecord) => {
    root.querySelectorAll<HTMLButtonElement>('[data-member-tab]').forEach((button) => button.onclick = () => { memberTab = button.dataset.memberTab as MemberTab; void render(); });
    root.querySelector<HTMLButtonElement>('#guild-save-motd')?.addEventListener('click', () => void run(() => service.updateMotd(root.querySelector<HTMLTextAreaElement>('#guild-motd')!.value)));
    root.querySelector<HTMLButtonElement>('#guild-save-description')?.addEventListener('click', () => void run(() => service.updateDescription(root.querySelector<HTMLTextAreaElement>('#guild-description')!.value)));
    root.querySelector<HTMLButtonElement>('#guild-leave')?.addEventListener('click', () => { if (window.confirm('Sair desta guilda?')) void run(() => service.leave()); });
    root.querySelector<HTMLButtonElement>('#guild-disband')?.addEventListener('click', () => { if (window.confirm(`Dissolver ${guild.name}? Essa ação remove a guilda de todos os membros.`)) void run(() => service.disband()); });
    root.querySelectorAll<HTMLButtonElement>('[data-promote]').forEach((button) => button.onclick = () => void run(() => service.promote(button.dataset.promote!)));
    root.querySelectorAll<HTMLButtonElement>('[data-demote]').forEach((button) => button.onclick = () => void run(() => service.demote(button.dataset.demote!)));
    root.querySelectorAll<HTMLButtonElement>('[data-kick]').forEach((button) => button.onclick = () => { if (window.confirm('Expulsar este membro?')) void run(() => service.kick(button.dataset.kick!)); });
    root.querySelectorAll<HTMLButtonElement>('[data-transfer]').forEach((button) => button.onclick = () => { if (window.confirm('Transferir a liderança para este membro? Você se tornará Oficial.')) void run(() => service.transferLeadership(button.dataset.transfer!)); });
    root.querySelectorAll<HTMLButtonElement>('[data-app-accept]').forEach((button) => button.onclick = () => void run(() => service.reviewApplication(button.dataset.appAccept!, true)));
    root.querySelectorAll<HTMLButtonElement>('[data-app-decline]').forEach((button) => button.onclick = () => void run(() => service.reviewApplication(button.dataset.appDecline!, false)));
    root.querySelector<HTMLFormElement>('#guild-invite-form')?.addEventListener('submit', (event) => { event.preventDefault(); const value = root.querySelector<HTMLInputElement>('#guild-invite-name')!.value; void run(() => service.inviteByName(value)); });
    root.querySelectorAll<HTMLButtonElement>('[data-save-rank]').forEach((button) => button.onclick = () => {
      const rankId = button.dataset.saveRank!;
      const permissions = Array.from(root.querySelectorAll<HTMLInputElement>(`input[data-rank="${rankId}"][data-permission]:checked`)).map((input) => input.dataset.permission as GuildPermission);
      void run(() => service.setRankPermissions(rankId, permissions));
    });
  };

  const render = async () => {
    const version = ++renderVersion;
    const guild = await service.getCurrentGuild();
    if (version !== renderVersion) return;
    if (!guild) {
      let body = '';
      if (guestTab === 'discover') body = await renderDiscovery();
      else if (guestTab === 'applications') body = await renderGuestApplications();
      else if (guestTab === 'invites') body = await renderGuestInvites();
      else body = renderCreate();
      if (version !== renderVersion) return;
      root.innerHTML = shell('Guildas', 'Você ainda não pertence a uma guilda.', guestNavigation(), body);
      bindClose(); bindGuest();
      return;
    }

    const actorMember = guild.members.find((member) => member.characterId === options.characterId);
    if (actorMember) actorMember.lastSeenAt = Date.now();
    let body = '';
    if (memberTab === 'overview') body = renderOverview(guild);
    else if (memberTab === 'members') body = renderMembers(guild);
    else if (memberTab === 'applications') body = renderApplications(guild);
    else if (memberTab === 'invites') body = renderInvites(guild);
    else if (memberTab === 'ranks') body = renderRanks(guild);
    else body = renderHistory(guild);
    root.innerHTML = shell(`${guild.name} [${guild.tag}]`, `Guilda Nv. ${guild.level} • ${guild.members.length}/${guildMemberCap(guild.level)} membros`, memberNavigation(guild), body);
    bindClose(); bindMember(guild);
  };

  root.addEventListener('pointerdown', (event) => { if (event.target === root) close(); });
  window.addEventListener('storage', (event) => { if (event.key === 'ascension.guilds.v1' && isOpen()) void render(); });

  return { open, close, toggle, isOpen, refresh: () => render(), service };
}

export type GuildSystem = ReturnType<typeof createGuildSystem>;
