export type GmAuditEntry = {
  id: string;
  at: number;
  actorAccountKey: string;
  actorCharacter: string;
  action: string;
  detail: string;
};

const STORAGE_KEY = 'ascension.gm.audit.v1';
const MAX_ENTRIES = 250;

function load(): GmAuditEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as GmAuditEntry[];
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry.action === 'string') : [];
  } catch {
    return [];
  }
}

export function writeGmAudit(actorAccountKey: string, actorCharacter: string, action: string, detail: string) {
  const entries = load();
  entries.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
    actorAccountKey,
    actorCharacter,
    action,
    detail,
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  window.dispatchEvent(new CustomEvent('ascension-gm-audit-change'));
}

export function listGmAudit(limit = 100) {
  return load().slice(0, Math.max(1, limit));
}
