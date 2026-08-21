import './gameMenu.css';
import { INPUT_ACTIONS, SETTINGS_CATALOG, SETTINGS_CATEGORIES, type InputActionId, type SettingsCategoryId } from './settingsCatalog';
import { formatKeyCode, inputActionLabel, type InputManager } from './inputManager';
import { applyGraphicsPreset, createDefaultSettings, type GameSettings, type GraphicsPreset, type SettingsStore } from './settingsState';

type GameMenuCallbacks = {
  characterName: string;
  input: InputManager;
  onSave: () => void;
  onSettingsChanged: (settings: GameSettings) => void;
  onCharacterSelect: () => void;
  onLogout: () => void;
  onExit: () => void;
};

function getPath(settings: GameSettings, path: string): string | number | boolean {
  const [section, key] = path.split('.');
  const source = settings as unknown as Record<string, Record<string, string | number | boolean>>;
  return source[section]?.[key];
}

function setPath(settings: GameSettings, path: string, value: string | number | boolean) {
  const [section, key] = path.split('.');
  const source = settings as unknown as Record<string, Record<string, string | number | boolean>>;
  if (source[section]) source[section][key] = value;
}

function optionValue(raw: string, current: string | number | boolean) {
  return typeof current === 'number' ? Number(raw) : raw;
}

export function createGameMenu(store: SettingsStore, callbacks: GameMenuCallbacks) {
  const root = document.createElement('div');
  root.id = 'game-menu-overlay';
  root.className = 'game-menu-hidden';
  document.body.appendChild(root);

  let screen: 'main' | 'settings' | 'exit' = 'main';
  let category: SettingsCategoryId = 'controls';
  let waitingAction: InputActionId | null = null;
  let notice = '';

  const setNotice = (message: string) => {
    notice = message;
    const node = root.querySelector<HTMLElement>('#settings-notice');
    if (node) node.textContent = message;
  };

  const close = () => {
    waitingAction = null;
    root.classList.add('game-menu-hidden');
    screen = 'main';
  };

  const renderMain = () => {
    root.innerHTML = `<section class="pause-shell">
      <div class="pause-brand"><span>ASCENSION</span><h1>Menu do Jogo</h1><p>${callbacks.characterName}</p></div>
      <div class="pause-actions">
        <button class="pause-primary" data-menu-action="resume"><span>▶</span><div><strong>Continuar</strong><small>Voltar para o jogo</small></div></button>
        <button data-menu-action="settings"><span>⚙</span><div><strong>Configurações</strong><small>Controles, gráficos, áudio e interface</small></div></button>
        <button data-menu-action="characters"><span>👤</span><div><strong>Seleção de Personagem</strong><small>Salvar e voltar para seus personagens</small></div></button>
        <button data-menu-action="logout"><span>⇥</span><div><strong>Sair da Conta</strong><small>Salvar e voltar para a tela de login</small></div></button>
        <button class="pause-danger" data-menu-action="exit"><span>⏻</span><div><strong>Sair do Jogo</strong><small>Salvar e encerrar esta sessão</small></div></button>
      </div>
      <footer><kbd>ESC</kbd> continuar <span>•</span> seu progresso é salvo antes de trocar de tela</footer>
    </section>`;

    root.querySelector<HTMLButtonElement>('[data-menu-action="resume"]')!.onclick = close;
    root.querySelector<HTMLButtonElement>('[data-menu-action="settings"]')!.onclick = () => { screen = 'settings'; category = 'controls'; render(); };
    root.querySelector<HTMLButtonElement>('[data-menu-action="characters"]')!.onclick = () => {
      if (!window.confirm('Salvar e voltar para a seleção de personagem?')) return;
      callbacks.onSave(); callbacks.onCharacterSelect();
    };
    root.querySelector<HTMLButtonElement>('[data-menu-action="logout"]')!.onclick = () => {
      if (!window.confirm('Salvar o personagem e sair desta conta?')) return;
      callbacks.onSave(); callbacks.onLogout();
    };
    root.querySelector<HTMLButtonElement>('[data-menu-action="exit"]')!.onclick = () => {
      callbacks.onSave(); callbacks.onExit(); screen = 'exit'; render();
    };
  };

  const renderControls = (host: HTMLElement) => {
    const groups = ['Movimento', 'Combate', 'Interfaces'] as const;
    host.innerHTML = groups.map((group) => `<section class="settings-group"><header><h3>${group}</h3><span>${group === 'Movimento' ? 'Movimentação do personagem' : group === 'Combate' ? 'Ações e habilidades' : 'Janelas e menus'}</span></header><div class="keybind-list">${INPUT_ACTIONS.filter((action) => action.group === group).map((action) => `
      <div class="keybind-row" data-action="${action.id}"><div><strong>${action.label}</strong><small>${action.description}</small></div><button class="keybind-button${waitingAction === action.id ? ' waiting' : ''}" data-bind="${action.id}">${waitingAction === action.id ? 'Pressione uma tecla…' : formatKeyCode(store.settings.controls[action.id])}</button></div>`).join('')}</div></section>`).join('') + `<button class="settings-reset" id="reset-controls">Restaurar teclas padrão</button>`;

    host.querySelectorAll<HTMLButtonElement>('[data-bind]').forEach((button) => {
      button.onclick = () => { waitingAction = button.dataset.bind as InputActionId; renderSettingsPage(); };
    });
    host.querySelector<HTMLButtonElement>('#reset-controls')!.onclick = () => {
      store.resetControls(); callbacks.onSettingsChanged(store.settings); waitingAction = null; setNotice('Controles restaurados para o padrão.'); renderSettingsPage();
    };
  };

  const renderDescriptor = (descriptor: typeof SETTINGS_CATALOG[number]) => {
    const current = getPath(store.settings, descriptor.id);
    const badges = `${descriptor.restartRequired ? '<span class="setting-badge restart">ao reentrar</span>' : ''}${descriptor.future ? '<span class="setting-badge future">preparado</span>' : ''}`;
    let control = '';
    if (descriptor.type === 'toggle') {
      control = `<label class="setting-switch"><input type="checkbox" data-setting="${descriptor.id}" ${current ? 'checked' : ''}><span></span></label>`;
    } else if (descriptor.type === 'slider') {
      control = `<div class="setting-slider"><input type="range" data-setting="${descriptor.id}" min="${descriptor.min ?? 0}" max="${descriptor.max ?? 100}" step="${descriptor.step ?? 1}" value="${current}"><b class="setting-value">${current}%</b></div>`;
    } else {
      control = `<select data-setting="${descriptor.id}">${(descriptor.options ?? []).map((option) => `<option value="${option.value}" ${String(current) === String(option.value) ? 'selected' : ''}>${option.label}</option>`).join('')}</select>`;
    }
    return `<div class="setting-row"><div class="setting-copy"><div><strong>${descriptor.label}</strong>${badges}</div><small>${descriptor.description}</small></div><div class="setting-control">${control}</div></div>`;
  };

  const renderSettingsPage = () => {
    const page = root.querySelector<HTMLElement>('#settings-page');
    if (!page) return;
    if (category === 'controls') {
      renderControls(page);
      return;
    }
    const descriptors = SETTINGS_CATALOG.filter((item) => item.category === category);
    page.innerHTML = `<section class="settings-group"><header><h3>${SETTINGS_CATEGORIES.find((item) => item.id === category)?.label ?? 'Configurações'}</h3><span>${SETTINGS_CATEGORIES.find((item) => item.id === category)?.description ?? ''}</span></header><div class="setting-list">${descriptors.map(renderDescriptor).join('')}</div></section>${category === 'graphics' ? '<p class="settings-help">Escala de renderização e antialiasing são aplicados completamente ao entrar novamente no personagem. FPS e opções de HUD respondem imediatamente.</p>' : ''}`;

    page.querySelectorAll<HTMLInputElement>('input[data-setting]').forEach((input) => {
      if (input.type === 'checkbox') {
        input.onchange = () => {
          store.update((settings) => { setPath(settings, input.dataset.setting!, input.checked); if (input.dataset.setting!.startsWith('graphics.')) settings.graphics.preset = 'custom'; });
          callbacks.onSettingsChanged(store.settings); setNotice('Configuração salva.');
        };
      } else {
        input.oninput = () => {
          const current = getPath(store.settings, input.dataset.setting!);
          const value = optionValue(input.value, current);
          store.update((settings) => setPath(settings, input.dataset.setting!, value));
          const label = input.parentElement?.querySelector<HTMLElement>('.setting-value'); if (label) label.textContent = `${value}%`;
          callbacks.onSettingsChanged(store.settings);
        };
      }
    });

    page.querySelectorAll<HTMLSelectElement>('select[data-setting]').forEach((select) => {
      select.onchange = () => {
        const path = select.dataset.setting!;
        const current = getPath(store.settings, path);
        const value = optionValue(select.value, current);
        store.update((settings) => {
          if (path === 'graphics.preset') applyGraphicsPreset(settings, value as GraphicsPreset);
          else { setPath(settings, path, value); if (path.startsWith('graphics.')) settings.graphics.preset = 'custom'; }
        });
        callbacks.onSettingsChanged(store.settings);
        setNotice(path === 'graphics.renderScale' || path === 'graphics.antialias' ? 'Salvo. Esta opção será aplicada completamente ao reentrar no personagem.' : 'Configuração salva.');
        if (path === 'graphics.preset') renderSettingsPage();
      };
    });
  };

  const renderSettings = () => {
    root.innerHTML = `<section class="settings-shell">
      <header class="settings-header"><div><span>ASCENSION • CONFIGURAÇÕES</span><h2>Configurações do Jogo</h2></div><div><button id="settings-reset-all" title="Restaurar tudo">↺ Padrão</button><button id="settings-close">×</button></div></header>
      <div class="settings-layout">
        <nav class="settings-nav">${SETTINGS_CATEGORIES.map((item) => `<button data-category="${item.id}" class="${category === item.id ? 'active' : ''}"><span>${item.icon}</span><div><strong>${item.label}</strong><small>${item.description}</small></div></button>`).join('')}</nav>
        <main class="settings-content"><div id="settings-notice" class="settings-notice">${notice}</div><div id="settings-page"></div></main>
      </div>
      <footer class="settings-footer"><button id="settings-back">← Voltar ao menu</button><span>As configurações são salvas para esta conta neste dispositivo.</span></footer>
    </section>`;
    root.querySelectorAll<HTMLButtonElement>('[data-category]').forEach((button) => button.onclick = () => { category = button.dataset.category as SettingsCategoryId; waitingAction = null; renderSettings(); });
    root.querySelector<HTMLButtonElement>('#settings-close')!.onclick = close;
    root.querySelector<HTMLButtonElement>('#settings-back')!.onclick = () => { waitingAction = null; screen = 'main'; render(); };
    root.querySelector<HTMLButtonElement>('#settings-reset-all')!.onclick = () => {
      if (!window.confirm('Restaurar todas as configurações para o padrão?')) return;
      const defaults = createDefaultSettings();
      store.resetAll(); callbacks.onSettingsChanged(defaults); waitingAction = null; notice = 'Todas as configurações foram restauradas.'; renderSettings();
    };
    renderSettingsPage();
  };

  const renderExit = () => {
    root.innerHTML = `<section class="pause-shell exit-shell"><div class="pause-brand"><span>ASCENSION</span><h1>Sessão encerrada</h1><p>Seu personagem foi salvo.</p></div><div class="exit-message"><span>✓</span><strong>Você já pode fechar esta aba.</strong><small>Navegadores não permitem que uma página feche livremente uma aba aberta pelo jogador. Em uma versão PWA/desktop, este botão poderá encerrar o aplicativo diretamente.</small></div><button class="pause-primary" id="exit-return">Voltar ao jogo</button></section>`;
    root.querySelector<HTMLButtonElement>('#exit-return')!.onclick = () => { screen = 'main'; close(); };
  };

  const render = () => {
    if (screen === 'main') renderMain();
    else if (screen === 'settings') renderSettings();
    else renderExit();
  };

  const open = () => { screen = 'main'; waitingAction = null; root.classList.remove('game-menu-hidden'); render(); };
  const toggle = () => root.classList.contains('game-menu-hidden') ? open() : close();

  window.addEventListener('keydown', (event) => {
    if (!waitingAction || root.classList.contains('game-menu-hidden')) return;
    if (['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(event.code)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const action = waitingAction; waitingAction = null;
    const result = callbacks.input.rebind(action, event.code);
    callbacks.onSettingsChanged(store.settings);
    notice = result.swappedWith ? `${inputActionLabel(action)} trocou a tecla com ${inputActionLabel(result.swappedWith)}.` : `${inputActionLabel(action)} agora usa ${formatKeyCode(event.code)}.`;
    renderSettings();
  }, true);

  root.addEventListener('pointerdown', (event) => { if (event.target === root && screen === 'main') close(); });

  return { open, close, toggle, isOpen: () => !root.classList.contains('game-menu-hidden'), refresh: render };
}

export type GameMenu = ReturnType<typeof createGameMenu>;
