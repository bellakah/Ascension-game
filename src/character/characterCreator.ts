import './account.css';
import { DEFAULT_CHARACTER, type CharacterConfig } from './lpcCharacter';
import { showAppearanceCreator } from './appearanceCreator';
import { getClassDefinition, normalizeClassId, type ClassId, type ClassName } from '../classes/classCatalog';
import { showClassSelection } from '../classes/classSelection';

const LPC = 'https://raw.githubusercontent.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/master/spritesheets';
const ACCOUNTS_KEY = 'ascension.accounts.v1';
const SESSION_KEY = 'ascension.session.v1';
const MAX_CHARACTERS = 6;

export type QuestStatus = 'not_started' | 'active' | 'ready' | 'completed';
export type CharacterProgress = {
  classId: ClassId;
  className: ClassName;
  level: number;
  exp: number;
  expToNext: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  coins: number;
  map: string;
  position: { x: number; y: number };
  quests: Record<string, { status: QuestStatus; progress: number; target: number }>;
  inventory: Array<{ itemId: string; quantity: number }>;
  equipment: { weapon: string | null; armor: string | null; boots: string | null };
  lastPlayedAt: number;
};

export type SelectedCharacter = {
  accountKey: string;
  slotIndex: number;
  id: string;
  config: CharacterConfig;
  progress: CharacterProgress;
};

type CharacterRecord = {
  id: string;
  createdAt: number;
  config: CharacterConfig;
  progress: CharacterProgress;
};

type AccountRecord = {
  username: string;
  displayName: string;
  passwordHash: string;
  characters: Array<CharacterRecord | null>;
};

type AccountStore = Record<string, AccountRecord>;

export function createDefaultProgress(classId: ClassId = 'warrior'): CharacterProgress {
  const classDef = getClassDefinition(classId);
  return {
    classId: classDef.id,
    className: classDef.name,
    level: 1,
    exp: 0,
    expToNext: 100,
    hp: classDef.baseStats.maxHp,
    maxHp: classDef.baseStats.maxHp,
    attack: classDef.baseStats.attack,
    defense: classDef.baseStats.defense,
    coins: 0,
    map: 'Floresta Inicial',
    position: { x: 970, y: 1380 },
    quests: {
      'forest.wolf': { status: 'not_started', progress: 0, target: 1 },
    },
    inventory: [],
    equipment: { ...classDef.startingEquipment },
    lastPlayedAt: Date.now(),
  };
}

function normalizeProgress(value?: Partial<CharacterProgress>): CharacterProgress {
  const source = value ?? {};
  const classId = normalizeClassId((source as Partial<CharacterProgress>).classId ?? source.className);
  const classDef = getClassDefinition(classId);
  const base = createDefaultProgress(classId);
  const quests = { ...base.quests, ...(source.quests ?? {}) };
  for (const [id, quest] of Object.entries(quests)) {
    quests[id] = {
      status: quest?.status ?? 'not_started',
      progress: Math.max(0, Number(quest?.progress ?? 0)),
      target: Math.max(1, Number(quest?.target ?? 1)),
    };
  }
  return {
    ...base,
    ...source,
    classId: classDef.id,
    className: classDef.name,
    level: Math.max(1, Number(source.level ?? base.level)),
    exp: Math.max(0, Number(source.exp ?? base.exp)),
    expToNext: Math.max(1, Number(source.expToNext ?? base.expToNext)),
    hp: Math.max(0, Number(source.hp ?? base.hp)),
    maxHp: Math.max(1, Number(source.maxHp ?? base.maxHp)),
    attack: Math.max(1, Number(source.attack ?? base.attack)),
    defense: Math.max(0, Number(source.defense ?? base.defense)),
    coins: Math.max(0, Number(source.coins ?? base.coins)),
    map: source.map || base.map,
    position: { ...base.position, ...(source.position ?? {}) },
    quests,
    inventory: Array.isArray(source.inventory) ? source.inventory : [],
    equipment: { ...base.equipment, ...(source.equipment ?? {}) },
    lastPlayedAt: Number(source.lastPlayedAt ?? Date.now()),
  };
}

function loadAccounts(): AccountStore {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as AccountStore;
    let migrated = false;
    for (const account of Object.values(parsed)) {
      if (!Array.isArray(account.characters)) { account.characters = []; migrated = true; }
      account.characters = [...account.characters.slice(0, MAX_CHARACTERS)];
      while (account.characters.length < MAX_CHARACTERS) account.characters.push(null);
      account.characters = account.characters.map((record) => {
        if (!record) return null;
        const legacy = record as CharacterRecord & { progress?: CharacterProgress };
        if (!legacy.progress || !legacy.progress.classId) migrated = true;
        return {
          id: legacy.id,
          createdAt: legacy.createdAt || Date.now(),
          config: { ...DEFAULT_CHARACTER, ...legacy.config },
          progress: normalizeProgress(legacy.progress),
        };
      });
    }
    if (migrated) localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(parsed));
    return parsed;
  } catch {
    return {};
  }
}

function saveAccounts(store: AccountStore) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(store));
}

export function persistSelectedCharacter(character: SelectedCharacter) {
  const accounts = loadAccounts();
  const account = accounts[character.accountKey];
  if (!account) return false;
  let slotIndex = character.slotIndex;
  if (account.characters[slotIndex]?.id !== character.id) {
    slotIndex = account.characters.findIndex((record) => record?.id === character.id);
  }
  if (slotIndex < 0) return false;
  const record = account.characters[slotIndex];
  if (!record) return false;
  character.progress = normalizeProgress({ ...character.progress, lastPlayedAt: Date.now() });
  record.config = { ...character.config };
  record.progress = character.progress;
  saveAccounts(accounts);
  return true;
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

async function hashPassword(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function makeId() {
  if ('randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function addAvatarLayer(host: HTMLElement, path: string, z: number) {
  const layer = document.createElement('span');
  layer.className = 'slot-avatar-layer';
  layer.style.zIndex = String(z);
  layer.style.backgroundImage = `url(${LPC}/${path})`;
  host.appendChild(layer);
}

function eyeColorName(color: number) {
  const map = new Map<number, string>([
    [0x6d93b8, 'blue'], [0x5f8f63, 'green'], [0x8a653e, 'brown'], [0x5a4a73, 'purple'], [0x444444, 'gray'],
  ]);
  return map.get(color) ?? 'blue';
}

function createSlotAvatar(config: CharacterConfig) {
  const avatar = document.createElement('span');
  avatar.className = 'slot-avatar';
  addAvatarLayer(avatar, `body/bodies/${config.sex}/idle.png`, 1);
  addAvatarLayer(avatar, `head/heads/human/${config.sex}/idle.png`, 2);
  addAvatarLayer(avatar, `eyes/human/adult/${config.eyeStyle}/idle/${eyeColorName(config.eyeColor)}.png`, 3);
  addAvatarLayer(avatar, `hair/${config.hairStyle}/adult/idle.png`, 4);
  return avatar;
}

async function showAccountGate(): Promise<string> {
  const existingSession = localStorage.getItem(SESSION_KEY);
  const store = loadAccounts();
  if (existingSession && store[existingSession]) return existingSession;
  if (existingSession) localStorage.removeItem(SESSION_KEY);

  const boot = document.querySelector<HTMLElement>('#boot-status');
  if (boot) boot.style.display = 'none';

  return new Promise<string>((resolve) => {
    let mode: 'login' | 'register' = Object.keys(store).length ? 'login' : 'register';
    const root = document.createElement('div');
    root.id = 'account-gate';
    root.innerHTML = `
      <div class="account-shell">
        <div class="auth-card">
          <div class="auth-brand"><span class="creator-kicker">ASCENSION</span><h1>Conta do jogador</h1><p>Entre na sua conta ou crie uma para começar.</p></div>
          <div class="auth-tabs"><button id="tab-login" class="auth-tab" type="button">Entrar</button><button id="tab-register" class="auth-tab" type="button">Criar conta</button></div>
          <form class="auth-form" id="auth-form">
            <label>Usuário<input id="auth-user" maxlength="18" autocomplete="username" placeholder="Seu usuário" /></label>
            <label>Senha<input id="auth-password" type="password" maxlength="40" autocomplete="current-password" placeholder="Sua senha" /></label>
            <label id="confirm-wrap">Confirmar senha<input id="auth-confirm" type="password" maxlength="40" autocomplete="new-password" placeholder="Repita a senha" /></label>
            <button class="auth-submit" id="auth-submit" type="submit"></button>
            <div class="account-error" id="auth-error"></div>
          </form>
          <p class="account-note">Protótipo atual: a conta fica salva somente neste navegador. Quando adicionarmos servidor e banco de dados, ela passará a ser uma conta online real.</p>
        </div>
      </div>`;
    document.body.appendChild(root);

    const loginTab = root.querySelector<HTMLButtonElement>('#tab-login')!;
    const registerTab = root.querySelector<HTMLButtonElement>('#tab-register')!;
    const form = root.querySelector<HTMLFormElement>('#auth-form')!;
    const userInput = root.querySelector<HTMLInputElement>('#auth-user')!;
    const passInput = root.querySelector<HTMLInputElement>('#auth-password')!;
    const confirmInput = root.querySelector<HTMLInputElement>('#auth-confirm')!;
    const confirmWrap = root.querySelector<HTMLElement>('#confirm-wrap')!;
    const submit = root.querySelector<HTMLButtonElement>('#auth-submit')!;
    const errorBox = root.querySelector<HTMLDivElement>('#auth-error')!;

    const renderMode = () => {
      const registering = mode === 'register';
      loginTab.classList.toggle('active', !registering);
      registerTab.classList.toggle('active', registering);
      confirmWrap.style.display = registering ? 'grid' : 'none';
      submit.textContent = registering ? 'Criar conta' : 'Entrar';
      passInput.autocomplete = registering ? 'new-password' : 'current-password';
      errorBox.textContent = '';
    };

    loginTab.addEventListener('click', () => { mode = 'login'; renderMode(); });
    registerTab.addEventListener('click', () => { mode = 'register'; renderMode(); });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      errorBox.textContent = '';
      const displayName = userInput.value.trim();
      const username = normalizeUsername(displayName);
      const password = passInput.value;
      if (!/^[a-zA-Z0-9_]{3,18}$/.test(displayName)) { errorBox.textContent = 'Use 3 a 18 caracteres: letras, números ou _.'; return; }
      if (password.length < 4) { errorBox.textContent = 'A senha precisa ter pelo menos 4 caracteres.'; return; }

      const accounts = loadAccounts();
      submit.disabled = true;
      try {
        const passwordHash = await hashPassword(password);
        if (mode === 'register') {
          if (password !== confirmInput.value) { errorBox.textContent = 'As duas senhas não são iguais.'; return; }
          if (accounts[username]) { errorBox.textContent = 'Esse usuário já existe.'; return; }
          accounts[username] = { username, displayName, passwordHash, characters: Array.from({ length: MAX_CHARACTERS }, (): CharacterRecord | null => null) };
          saveAccounts(accounts);
        } else {
          const account = accounts[username];
          if (!account || account.passwordHash !== passwordHash) { errorBox.textContent = 'Usuário ou senha incorretos.'; return; }
        }
        localStorage.setItem(SESSION_KEY, username);
        root.remove();
        resolve(username);
      } finally { submit.disabled = false; }
    });
    renderMode();
  });
}

function confirmDeletion(characterName: string) {
  return new Promise<boolean>((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `<div class="confirm-card"><h2>Excluir personagem?</h2><p>Você está prestes a excluir <strong>${characterName}</strong>. Essa ação remove o personagem deste navegador e não poderá ser desfeita.</p><div class="confirm-actions"><button class="confirm-cancel" type="button">Cancelar</button><button class="confirm-delete" type="button">Excluir</button></div></div>`;
    document.body.appendChild(overlay);
    const finish = (value: boolean) => { overlay.remove(); resolve(value); };
    overlay.querySelector<HTMLButtonElement>('.confirm-cancel')!.addEventListener('click', () => finish(false));
    overlay.querySelector<HTMLButtonElement>('.confirm-delete')!.addEventListener('click', () => finish(true));
  });
}

async function showCharacterSelection(accountKey: string): Promise<SelectedCharacter | null> {
  const accounts = loadAccounts();
  const account = accounts[accountKey];
  if (!account) return null;

  return new Promise<SelectedCharacter | null>((resolve) => {
    const root = document.createElement('div');
    root.id = 'character-select';
    root.innerHTML = `<div class="select-shell"><header class="select-header"><div><span class="creator-kicker">ASCENSION</span><h1>Seus personagens</h1></div><div class="select-account"><span>Conta: <strong>${account.displayName}</strong></span><button class="logout-button" id="logout-account" type="button">Sair da conta</button></div></header><div class="character-grid" id="character-grid"></div><div class="selection-panel"><div class="selection-info" id="selection-info"></div><div class="selection-actions"><button class="action-delete" id="delete-character" type="button">Excluir</button><button class="action-create" id="create-character" type="button">Criar</button><button class="action-enter" id="enter-character" type="button">Entrar</button></div></div><div class="select-error" id="select-error"></div></div>`;
    document.body.appendChild(root);

    const grid = root.querySelector<HTMLDivElement>('#character-grid')!;
    const info = root.querySelector<HTMLDivElement>('#selection-info')!;
    const errorBox = root.querySelector<HTMLDivElement>('#select-error')!;
    const enterButton = root.querySelector<HTMLButtonElement>('#enter-character')!;
    const createButton = root.querySelector<HTMLButtonElement>('#create-character')!;
    const deleteButton = root.querySelector<HTMLButtonElement>('#delete-character')!;
    let selected = account.characters.findIndex(Boolean);
    if (selected < 0) selected = 0;

    const persistAccount = () => {
      const current = loadAccounts();
      current[accountKey] = account;
      saveAccounts(current);
    };

    const render = () => {
      grid.replaceChildren();
      errorBox.textContent = '';
      account.characters.forEach((record, index) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `character-slot${selected === index ? ' selected' : ''}${record ? '' : ' empty-slot'}`;
        const number = document.createElement('span');
        number.className = 'slot-number'; number.textContent = `Slot ${index + 1}`; card.appendChild(number);
        if (record) {
          card.appendChild(createSlotAvatar(record.config));
          const name = document.createElement('span'); name.className = 'slot-name'; name.textContent = record.config.name; card.appendChild(name);
          const meta = document.createElement('span'); meta.className = 'slot-meta'; meta.textContent = `Nv. ${record.progress.level} · ${record.progress.className} · ${record.progress.map}`; card.appendChild(meta);
        } else {
          const plus = document.createElement('span'); plus.className = 'empty-plus'; plus.textContent = '+'; card.appendChild(plus);
          const label = document.createElement('strong'); label.textContent = 'Slot vazio'; card.appendChild(label);
          const hint = document.createElement('span'); hint.className = 'slot-meta'; hint.textContent = 'Selecione para criar'; card.appendChild(hint);
        }
        card.addEventListener('click', () => { selected = index; render(); });
        grid.appendChild(card);
      });

      const current = account.characters[selected];
      if (current) {
        info.innerHTML = `<strong>${current.config.name} · Nível ${current.progress.level}</strong><span>${current.progress.className} · ${current.progress.map} · EXP ${current.progress.exp}/${current.progress.expToNext} · 🪙 ${current.progress.coins}</span>`;
      } else {
        info.innerHTML = `<strong>Slot ${selected + 1} vazio</strong><span>Crie um novo personagem neste espaço. Você pode ter até ${MAX_CHARACTERS} personagens.</span>`;
      }
      enterButton.disabled = !current;
      deleteButton.disabled = !current;
      createButton.disabled = Boolean(current);
    };

    root.querySelector<HTMLButtonElement>('#logout-account')!.addEventListener('click', () => { localStorage.removeItem(SESSION_KEY); root.remove(); resolve(null); });

    enterButton.addEventListener('click', () => {
      const current = account.characters[selected];
      if (!current) return;
      current.progress.lastPlayedAt = Date.now();
      persistAccount();
      root.remove();
      resolve({ accountKey, slotIndex: selected, id: current.id, config: { ...current.config }, progress: normalizeProgress(current.progress) });
    });

    createButton.addEventListener('click', async () => {
      if (account.characters[selected]) return;
      root.style.display = 'none';
      const classId = await showClassSelection();
      if (!classId) { root.style.display = 'block'; return; }
      const created = await showAppearanceCreator({ ...DEFAULT_CHARACTER, name: '' });
      root.style.display = 'block';
      if (!created) return;
      if (account.characters.some((item) => item?.config.name.toLowerCase() === created.name.toLowerCase())) { errorBox.textContent = 'Já existe um personagem com esse nome nesta conta.'; return; }
      account.characters[selected] = { id: makeId(), createdAt: Date.now(), config: created, progress: createDefaultProgress(classId) };
      persistAccount();
      render();
    });

    deleteButton.addEventListener('click', async () => {
      const current = account.characters[selected];
      if (!current) return;
      if (!await confirmDeletion(current.config.name)) return;
      account.characters[selected] = null;
      persistAccount();
      const nextExisting = account.characters.findIndex(Boolean);
      selected = nextExisting >= 0 ? nextExisting : selected;
      render();
    });

    render();
  });
}

export async function showCharacterCreator(): Promise<SelectedCharacter> {
  const boot = document.querySelector<HTMLElement>('#boot-status');
  if (boot) boot.style.display = 'none';
  while (true) {
    const accountKey = await showAccountGate();
    const character = await showCharacterSelection(accountKey);
    if (character) return character;
  }
}
