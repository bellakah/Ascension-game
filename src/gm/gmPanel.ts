import './gmPanel.css';
import type { Container } from 'pixi.js';
import type { CharacterProgress } from '../character/characterCreator';
import { addItem } from '../items/itemCatalog';
import { findItemStudioRecord, listItemStudioRecords } from '../items/itemStudioStore';
import { listMonsterDefinitions } from '../monsterEditor/monsterStore';
import { killMonster, resetGmMonster, spawnGmMonster, type Monster } from '../game/monsterSystem';
import { WORLD_H, WORLD_W } from '../game/world';
import { getGmRole, gmRoleLabel, hasGmPermission, listGmAccounts, setGmRole, type GmRole } from './gmAuthority';
import { listGmAudit, writeGmAudit } from './gmAudit';

export type GmRuntimeFlags = {
  godMode: boolean;
  noclip: boolean;
  speedMultiplier: number;
};

export type GmPanelOptions = {
  accountKey: string;
  characterName: string;
  progress: CharacterProgress;
  player: Container;
  world: Container;
  monsters: Monster[];
  canvas: HTMLCanvasElement;
  flags: GmRuntimeFlags;
  refreshInventory: () => void;
  refreshHud: () => void;
  save: () => void;
  notify: (message: string) => void;
  onRoleChanged?: (role: GmRole) => void;
};

type TabId = 'items' | 'monsters' | 'teleport' | 'debug' | 'roles' | 'logs';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function createGmPanel(options: GmPanelOptions) {
  let role = getGmRole(options.accountKey);
  if (role === 'player') return null;
  let open = false;
  let activeTab: TabId = 'items';
  let returnPoint: { x: number; y: number } | null = null;
  let clickTeleport = false;

  const launcher = document.createElement('button');
  launcher.id = 'gm-launcher';
  launcher.className = 'gm-launcher';
  launcher.type = 'button';
  launcher.textContent = role === 'admin' ? 'ADMIN' : 'GM';
  launcher.title = 'Abrir painel administrativo';

  const overlay = document.createElement('section');
  overlay.id = 'gm-panel';
  overlay.className = 'gm-panel hidden';
  overlay.innerHTML = `<div class="gm-shell"><header class="gm-head"><div class="gm-brand"><strong>ASCENSION CONTROL</strong><span>Ferramentas administrativas do jogo</span></div><span class="gm-role-pill" id="gm-role-pill"></span><button class="gm-close" id="gm-close" type="button">×</button></header><div class="gm-body"><nav class="gm-nav" id="gm-nav"></nav><main class="gm-content" id="gm-content"></main></div></div>`;
  document.body.append(launcher, overlay);

  const nav = overlay.querySelector<HTMLElement>('#gm-nav')!;
  const content = overlay.querySelector<HTMLElement>('#gm-content')!;
  const rolePill = overlay.querySelector<HTMLElement>('#gm-role-pill')!;

  const audit = (action: string, detail: string) => writeGmAudit(options.accountKey, options.characterName, action, detail);
  const status = (message: string) => {
    const node = content.querySelector<HTMLElement>('#gm-status');
    if (node) node.textContent = message;
    options.notify(message);
  };
  const nearestMonster = () => options.monsters
    .filter((monster) => monster.alive)
    .sort((a, b) => Math.hypot(a.view.x - options.player.x, a.view.y - options.player.y) - Math.hypot(b.view.x - options.player.x, b.view.y - options.player.y))[0] ?? null;

  const teleportTo = (x: number, y: number, source: string) => {
    if (!hasGmPermission(options.accountKey, 'gm.teleport')) return;
    returnPoint = { x: options.player.x, y: options.player.y };
    const nextX = clamp(Math.round(x), 20, WORLD_W - 20);
    const nextY = clamp(Math.round(y), 40, WORLD_H - 20);
    options.player.position.set(nextX, nextY);
    options.progress.position = { x: nextX, y: nextY };
    options.save();
    audit('teleport.self', `${source} -> ${nextX}, ${nextY}`);
    status(`Teleportado para X ${nextX}, Y ${nextY}.`);
  };

  const renderNav = () => {
    role = getGmRole(options.accountKey);
    rolePill.textContent = gmRoleLabel(role);
    launcher.textContent = role === 'admin' ? 'ADMIN' : 'GM';
    const tabs: Array<[TabId, string, boolean]> = [
      ['items', 'Itens', hasGmPermission(options.accountKey, 'gm.items')],
      ['monsters', 'Monstros', hasGmPermission(options.accountKey, 'gm.monsters')],
      ['teleport', 'Teleporte', hasGmPermission(options.accountKey, 'gm.teleport')],
      ['debug', 'Debug / Mundo', hasGmPermission(options.accountKey, 'gm.debug')],
      ['roles', 'Cargos', hasGmPermission(options.accountKey, 'gm.roles')],
      ['logs', 'Logs', hasGmPermission(options.accountKey, 'gm.audit')],
    ];
    const allowed = tabs.filter(([, , visible]) => visible);
    if (!allowed.some(([id]) => id === activeTab)) activeTab = allowed[0]?.[0] ?? 'logs';
    nav.innerHTML = allowed.map(([id, label]) => `<button type="button" data-gm-tab="${id}" class="${activeTab === id ? 'active' : ''}">${label}</button>`).join('');
    nav.querySelectorAll<HTMLButtonElement>('[data-gm-tab]').forEach((button) => button.onclick = () => { activeTab = button.dataset.gmTab as TabId; render(); });
  };

  const renderItems = () => {
    const items = listItemStudioRecords();
    content.innerHTML = `<section class="gm-section"><h3>Spawn de itens</h3><p class="gm-note">Pesquise pelo Item ID, nome ou chave interna. O item é criado no inventário do personagem GM atual.</p><div class="gm-card"><datalist id="gm-item-list">${items.map((item) => `<option value="#${item.numericId} · ${esc(item.name)}">${esc(item.key)}</option>`).join('')}</datalist><div class="gm-grid"><label class="gm-field">Item<input id="gm-item-query" list="gm-item-list" placeholder="#15 ou nome do item"></label><label class="gm-field">Quantidade<input id="gm-item-qty" type="number" min="1" max="9999" value="1"></label></div><div class="gm-actions"><button class="gm-primary" id="gm-give-item" type="button">Criar no inventário</button></div><div class="gm-status" id="gm-status"></div></div></section>`;
    content.querySelector<HTMLButtonElement>('#gm-give-item')!.onclick = () => {
      const query = content.querySelector<HTMLInputElement>('#gm-item-query')!.value;
      const quantity = clamp(Math.floor(Number(content.querySelector<HTMLInputElement>('#gm-item-qty')!.value) || 1), 1, 9999);
      const item = findItemStudioRecord(query);
      if (!item) { status('Item não encontrado. Pesquise por #ID ou nome.'); return; }
      const result = addItem(options.progress, item.key, quantity);
      options.refreshInventory(); options.refreshHud(); options.save();
      audit('item.spawn', `#${item.numericId} ${item.name} x${result.added}`);
      status(result.remaining > 0 ? `${result.added} adicionados; faltou espaço para ${result.remaining}.` : `${result.added}x ${item.name} criado(s).`);
    };
  };

  const resolveMonsterSource = (query: string) => {
    const raw = query.trim();
    if (!raw) return null;
    if (/^lobo/i.test(raw) || raw === 'legacy:wolf') return { id: 'legacy:wolf', name: 'Lobo Sombrio' };
    if (/^lodo/i.test(raw) || raw === 'legacy:sludge') return { id: 'legacy:sludge', name: 'Lodo Tóxico' };
    const lower = raw.toLocaleLowerCase('pt-BR');
    const definitions = listMonsterDefinitions();
    const exact = definitions.find((monster) => monster.id === raw || monster.name.toLocaleLowerCase('pt-BR') === lower);
    if (exact) return { id: exact.id, name: exact.name };
    const partial = definitions.find((monster) => `${monster.name} ${monster.id}`.toLocaleLowerCase('pt-BR').includes(lower));
    return partial ? { id: partial.id, name: partial.name } : null;
  };

  const renderMonsters = () => {
    const definitions = listMonsterDefinitions();
    content.innerHTML = `<section class="gm-section"><h3>Controle de monstros</h3><p class="gm-note">Spawne definições do Monster Studio ou controle o monstro vivo mais próximo do GM.</p><div class="gm-card"><datalist id="gm-monster-list"><option value="Lobo Sombrio">legacy:wolf</option><option value="Lodo Tóxico">legacy:sludge</option>${definitions.map((monster) => `<option value="${esc(monster.name)}">${esc(monster.id)}</option>`).join('')}</datalist><div class="gm-grid"><label class="gm-field">Monstro<input id="gm-monster-query" list="gm-monster-list" placeholder="Nome ou ID"></label><label class="gm-field">Quantidade<input id="gm-monster-qty" type="number" min="1" max="20" value="1"></label></div><div class="gm-actions"><button class="gm-primary" id="gm-spawn-monster" type="button">Spawnar na minha posição</button></div></div><div class="gm-card"><strong style="font-size:10px;color:#dce9ee">Monstro mais próximo</strong><div class="gm-actions"><button id="gm-pull-monster" type="button">Puxar até mim</button><button id="gm-go-monster" type="button">Ir até monstro</button><button id="gm-reset-monster" type="button">Resetar</button><button class="gm-danger" id="gm-kill-monster" type="button">Matar</button></div><div class="gm-status" id="gm-status"></div></div></section>`;
    content.querySelector<HTMLButtonElement>('#gm-spawn-monster')!.onclick = async () => {
      const source = resolveMonsterSource(content.querySelector<HTMLInputElement>('#gm-monster-query')!.value);
      if (!source) { status('Monstro não encontrado.'); return; }
      const count = clamp(Math.floor(Number(content.querySelector<HTMLInputElement>('#gm-monster-qty')!.value) || 1), 1, 20);
      let spawned = 0;
      for (let index = 0; index < count; index++) {
        const angle = count === 1 ? 0 : index / count * Math.PI * 2;
        const radius = count === 1 ? 38 : 58 + (index % 3) * 18;
        const monster = await spawnGmMonster(options.world, options.monsters, source.id, options.player.x + Math.cos(angle) * radius, options.player.y + Math.sin(angle) * radius);
        if (monster) spawned += 1;
      }
      audit('monster.spawn', `${source.name} x${spawned}`);
      status(`${spawned}x ${source.name} spawnado(s).`);
    };
    content.querySelector<HTMLButtonElement>('#gm-pull-monster')!.onclick = () => {
      const monster = nearestMonster(); if (!monster) { status('Nenhum monstro vivo encontrado.'); return; }
      monster.view.position.set(options.player.x + 48, options.player.y); monster.spawnX = monster.view.x; monster.spawnY = monster.view.y;
      audit('monster.pull', `${monster.name} (${monster.id})`); status(`${monster.name} puxado até o GM.`);
    };
    content.querySelector<HTMLButtonElement>('#gm-go-monster')!.onclick = () => {
      const monster = nearestMonster(); if (!monster) { status('Nenhum monstro vivo encontrado.'); return; }
      teleportTo(monster.view.x - 54, monster.view.y, `monstro ${monster.name}`);
    };
    content.querySelector<HTMLButtonElement>('#gm-kill-monster')!.onclick = () => {
      const monster = nearestMonster(); if (!monster) { status('Nenhum monstro vivo encontrado.'); return; }
      killMonster(monster); audit('monster.kill', `${monster.name} (${monster.id})`); status(`${monster.name} eliminado.`);
    };
    content.querySelector<HTMLButtonElement>('#gm-reset-monster')!.onclick = () => {
      const monster = options.monsters.sort((a, b) => Math.hypot(a.view.x - options.player.x, a.view.y - options.player.y) - Math.hypot(b.view.x - options.player.x, b.view.y - options.player.y))[0];
      if (!monster) { status('Nenhum monstro encontrado.'); return; }
      resetGmMonster(monster); audit('monster.reset', `${monster.name} (${monster.id})`); status(`${monster.name} resetado.`);
    };
  };

  const renderTeleport = () => {
    content.innerHTML = `<section class="gm-section"><h3>Teleporte GM</h3><p class="gm-note">Teleporte por coordenadas ou ative o modo clique para escolher um ponto visível diretamente no cenário.</p><div class="gm-card"><div class="gm-grid"><label class="gm-field">X<input id="gm-tp-x" type="number" value="${Math.round(options.player.x)}"></label><label class="gm-field">Y<input id="gm-tp-y" type="number" value="${Math.round(options.player.y)}"></label></div><div class="gm-actions"><button class="gm-primary" id="gm-teleport" type="button">Teleportar</button><button id="gm-teleport-back" type="button">Voltar à posição anterior</button><button id="gm-click-teleport" type="button">${clickTeleport ? '✓ ' : ''}Teleportar clicando no mapa</button></div><div class="gm-status" id="gm-status">Posição atual: ${Math.round(options.player.x)}, ${Math.round(options.player.y)}</div></div></section>`;
    content.querySelector<HTMLButtonElement>('#gm-teleport')!.onclick = () => teleportTo(Number(content.querySelector<HTMLInputElement>('#gm-tp-x')!.value), Number(content.querySelector<HTMLInputElement>('#gm-tp-y')!.value), 'coordenadas');
    content.querySelector<HTMLButtonElement>('#gm-teleport-back')!.onclick = () => {
      if (!returnPoint) { status('Nenhuma posição anterior registrada.'); return; }
      const target = returnPoint; returnPoint = { x: options.player.x, y: options.player.y }; teleportTo(target.x, target.y, 'retorno');
    };
    content.querySelector<HTMLButtonElement>('#gm-click-teleport')!.onclick = () => {
      clickTeleport = !clickTeleport; options.canvas.classList.toggle('gm-click-active', clickTeleport); renderTeleport();
      if (clickTeleport) status('Modo clique ativo. Feche o painel e clique no cenário.');
    };
  };

  const renderDebug = () => {
    content.innerHTML = `<section class="gm-section"><h3>Debug / Mundo</h3><p class="gm-note">Ferramentas temporárias para testes. Elas não alteram os atributos permanentes do personagem.</p><div class="gm-card"><div class="gm-toggle-row"><div><strong>God Mode</strong><span>Ignora dano recebido.</span></div><button id="gm-god" type="button">${options.flags.godMode ? 'ATIVO' : 'DESATIVADO'}</button></div><div class="gm-toggle-row"><div><strong>Noclip</strong><span>Permite atravessar colisões do mapa.</span></div><button id="gm-noclip" type="button">${options.flags.noclip ? 'ATIVO' : 'DESATIVADO'}</button></div><div class="gm-toggle-row"><div><strong>Velocidade GM</strong><span>Multiplicador apenas durante esta sessão.</span></div><select id="gm-speed"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></div><div class="gm-status" id="gm-status"></div></div></section>`;
    const speed = content.querySelector<HTMLSelectElement>('#gm-speed')!; speed.value = String(options.flags.speedMultiplier);
    speed.onchange = () => { options.flags.speedMultiplier = clamp(Number(speed.value) || 1, 1, 4); audit('debug.speed', `${options.flags.speedMultiplier}x`); status(`Velocidade GM: ${options.flags.speedMultiplier}×.`); };
    content.querySelector<HTMLButtonElement>('#gm-god')!.onclick = () => { options.flags.godMode = !options.flags.godMode; audit('debug.god', String(options.flags.godMode)); renderDebug(); };
    content.querySelector<HTMLButtonElement>('#gm-noclip')!.onclick = () => { options.flags.noclip = !options.flags.noclip; audit('debug.noclip', String(options.flags.noclip)); renderDebug(); };
  };

  const renderRoles = () => {
    const accounts = listGmAccounts();
    content.innerHTML = `<section class="gm-section"><h3>Cargos administrativos</h3><p class="gm-note">No protótipo local, cargos ficam separados das contas para a futura troca por autoridade do servidor. ADMIN pode conceder/remover GM.</p><div class="gm-card">${accounts.map((account) => `<div class="gm-account-row"><div><strong>${esc(account.displayName)}</strong><small>${esc(account.accountKey)}</small></div><select data-role-account="${esc(account.accountKey)}"><option value="player" ${account.role === 'player' ? 'selected' : ''}>Jogador</option><option value="gm" ${account.role === 'gm' ? 'selected' : ''}>GM</option><option value="admin" ${account.role === 'admin' ? 'selected' : ''}>ADMIN</option></select></div>`).join('')}</div><div class="gm-status" id="gm-status"></div></section>`;
    content.querySelectorAll<HTMLSelectElement>('[data-role-account]').forEach((select) => select.onchange = () => {
      const target = select.dataset.roleAccount!; const nextRole = select.value as GmRole;
      if (!setGmRole(options.accountKey, target, nextRole)) { status('Não foi possível alterar este cargo.'); renderRoles(); return; }
      audit('role.change', `${target} -> ${nextRole}`);
      if (target === options.accountKey) { role = getGmRole(options.accountKey); options.onRoleChanged?.(role); if (role === 'player') { close(); launcher.remove(); overlay.remove(); return; } }
      render();
    });
  };

  const renderLogs = () => {
    const entries = listGmAudit(120);
    content.innerHTML = `<section class="gm-section"><h3>Log administrativo</h3><p class="gm-note">Últimas ações GM registradas neste ambiente.</p><div class="gm-card">${entries.length ? entries.map((entry) => `<div class="gm-log"><time>${new Date(entry.at).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</time><b>${esc(entry.actorCharacter)}</b><span>${esc(entry.action)}</span><span>${esc(entry.detail)}</span></div>`).join('') : '<p class="gm-note">Nenhuma ação registrada.</p>'}</div></section>`;
  };

  const render = () => {
    renderNav();
    if (activeTab === 'items') renderItems();
    else if (activeTab === 'monsters') renderMonsters();
    else if (activeTab === 'teleport') renderTeleport();
    else if (activeTab === 'debug') renderDebug();
    else if (activeTab === 'roles') renderRoles();
    else renderLogs();
  };

  const openPanel = () => { if (getGmRole(options.accountKey) === 'player') return; open = true; overlay.classList.remove('hidden'); render(); };
  const close = () => { open = false; overlay.classList.add('hidden'); };
  const toggle = () => open ? close() : openPanel();

  launcher.onclick = toggle;
  overlay.querySelector<HTMLButtonElement>('#gm-close')!.onclick = close;
  overlay.addEventListener('pointerdown', (event) => { if (event.target === overlay) close(); });
  window.addEventListener('keydown', (event) => { if (event.code === 'F10' && !event.repeat) { event.preventDefault(); toggle(); } else if (event.code === 'Escape' && open) close(); }, true);
  const onCanvasPointer = (event: PointerEvent) => {
    if (!clickTeleport || !hasGmPermission(options.accountKey, 'gm.teleport')) return;
    event.preventDefault(); event.stopImmediatePropagation(); clickTeleport = false; options.canvas.classList.remove('gm-click-active');
    const rect = options.canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left, screenY = event.clientY - rect.top;
    const scaleX = options.world.scale.x || 1, scaleY = options.world.scale.y || 1;
    teleportTo((screenX - options.world.x) / scaleX, (screenY - options.world.y) / scaleY, 'clique no cenário');
  };
  options.canvas.addEventListener('pointerdown', onCanvasPointer, true);
  const onRolesChanged = () => {
    const nextRole = getGmRole(options.accountKey); role = nextRole; options.onRoleChanged?.(nextRole);
    if (nextRole === 'player') { close(); launcher.style.display = 'none'; }
    else { launcher.style.display = ''; renderNav(); if (open) render(); }
  };
  window.addEventListener('ascension-gm-roles-change', onRolesChanged);
  window.addEventListener('ascension-gm-audit-change', () => { if (open && activeTab === 'logs') renderLogs(); });

  renderNav();
  return {
    open: openPanel,
    close,
    toggle,
    isOpen: () => open,
    destroy: () => { options.canvas.removeEventListener('pointerdown', onCanvasPointer, true); window.removeEventListener('ascension-gm-roles-change', onRolesChanged); launcher.remove(); overlay.remove(); },
  };
}
