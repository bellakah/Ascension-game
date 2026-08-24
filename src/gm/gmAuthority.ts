export type GmRole = 'player' | 'gm' | 'admin';
export type GmPermission =
  | 'gm.panel'
  | 'gm.items'
  | 'gm.monsters'
  | 'gm.teleport'
  | 'gm.debug'
  | 'gm.audit'
  | 'gm.roles';

export type GmAccountSummary = {
  accountKey: string;
  displayName: string;
  role: GmRole;
};

const ROLE_STORAGE_KEY = 'ascension.gm.roles.v1';
const ACCOUNT_STORAGE_KEY = 'ascension.accounts.v1';

const ROLE_PERMISSIONS: Record<GmRole, ReadonlySet<GmPermission>> = {
  player: new Set(),
  gm: new Set(['gm.panel', 'gm.items', 'gm.monsters', 'gm.teleport', 'gm.debug', 'gm.audit']),
  admin: new Set(['gm.panel', 'gm.items', 'gm.monsters', 'gm.teleport', 'gm.debug', 'gm.audit', 'gm.roles']),
};

type RoleFile = { version: 1; roles: Record<string, GmRole>; updatedAt: number };
type LocalAccount = { displayName?: string };

function normalizeRole(value: unknown): GmRole {
  return value === 'admin' || value === 'gm' ? value : 'player';
}

function loadAccounts(): Record<string, LocalAccount> {
  try {
    const parsed = JSON.parse(localStorage.getItem(ACCOUNT_STORAGE_KEY) ?? '{}') as Record<string, LocalAccount>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function loadRoles(): RoleFile {
  try {
    const parsed = JSON.parse(localStorage.getItem(ROLE_STORAGE_KEY) ?? '') as Partial<RoleFile>;
    const roles: Record<string, GmRole> = {};
    if (parsed.roles && typeof parsed.roles === 'object') {
      for (const [key, value] of Object.entries(parsed.roles)) roles[key] = normalizeRole(value);
    }
    return { version: 1, roles, updatedAt: Number(parsed.updatedAt ?? 0) };
  } catch {
    return { version: 1, roles: {}, updatedAt: 0 };
  }
}

function saveRoles(file: RoleFile) {
  file.updatedAt = Date.now();
  localStorage.setItem(ROLE_STORAGE_KEY, JSON.stringify(file));
  window.dispatchEvent(new CustomEvent('ascension-gm-roles-change'));
}

/**
 * Autoridade local do protótipo atual.
 * Quando existir servidor online, este módulo vira um adapter para a resposta
 * autenticada do servidor sem alterar o menu/consumidores de permissões.
 */
export function ensureGmAuthorityBootstrap() {
  const accounts = loadAccounts();
  const keys = Object.keys(accounts);
  if (!keys.length) return;
  const file = loadRoles();
  if (Object.values(file.roles).includes('admin')) return;
  file.roles[keys[0]] = 'admin';
  saveRoles(file);
}

export function getGmRole(accountKey: string): GmRole {
  ensureGmAuthorityBootstrap();
  return normalizeRole(loadRoles().roles[accountKey]);
}

export function hasGmPermission(accountKey: string, permission: GmPermission) {
  return ROLE_PERMISSIONS[getGmRole(accountKey)].has(permission);
}

export function listGmAccounts(): GmAccountSummary[] {
  ensureGmAuthorityBootstrap();
  const accounts = loadAccounts();
  const roles = loadRoles().roles;
  return Object.entries(accounts).map(([accountKey, account]) => ({
    accountKey,
    displayName: account.displayName?.trim() || accountKey,
    role: normalizeRole(roles[accountKey]),
  }));
}

export function setGmRole(actorAccountKey: string, targetAccountKey: string, role: GmRole) {
  if (!hasGmPermission(actorAccountKey, 'gm.roles')) return false;
  const accounts = loadAccounts();
  if (!accounts[targetAccountKey]) return false;
  const file = loadRoles();
  file.roles[targetAccountKey] = normalizeRole(role);
  saveRoles(file);
  return true;
}

export function gmRoleLabel(role: GmRole) {
  return role === 'admin' ? 'ADMIN' : role === 'gm' ? 'GM' : 'JOGADOR';
}
