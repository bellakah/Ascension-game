import { INPUT_ACTIONS, type InputActionId } from './settingsCatalog';
import type { SettingsStore } from './settingsState';

const FRIENDLY_CODES: Record<string, string> = {
  Space: 'Espaço', Escape: 'Esc', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  ShiftLeft: 'Shift E', ShiftRight: 'Shift D', ControlLeft: 'Ctrl E', ControlRight: 'Ctrl D',
  AltLeft: 'Alt E', AltRight: 'Alt D',
};

const LEGACY_KEY: Record<InputActionId, string> = {
  moveUp: 'w', moveDown: 's', moveLeft: 'a', moveRight: 'd',
  basicAttack: ' ', interact: 'e', skill1: '1', skill2: '2', skill3: '3', skill4: '4',
  inventory: 'i', character: 'c', quests: 'j', pet: 'p', map: 'm', chat: 'Enter', menu: 'Escape',
};

const DIRECT_ACTIONS = new Set<InputActionId>(['menu', 'chat']);

export function formatKeyCode(code: string) {
  if (FRIENDLY_CODES[code]) return FRIENDLY_CODES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function inputActionLabel(id: InputActionId) {
  return INPUT_ACTIONS.find((action) => action.id === id)?.label ?? id;
}

export function createInputManager(store: SettingsStore) {
  const codeFor = (action: InputActionId) => store.settings.controls[action];
  const matches = (event: KeyboardEvent, action: InputActionId) => event.code === codeFor(action);
  const isDown = (pressedCodes: Set<string>, action: InputActionId) => pressedCodes.has(codeFor(action));

  const rebind = (action: InputActionId, nextCode: string) => {
    if (!nextCode) return { swappedWith: null as InputActionId | null };
    const previousCode = codeFor(action);
    let swappedWith: InputActionId | null = null;
    for (const candidate of INPUT_ACTIONS) {
      if (candidate.id !== action && store.settings.controls[candidate.id] === nextCode) {
        swappedWith = candidate.id;
        break;
      }
    }
    store.update((settings) => {
      if (swappedWith) settings.controls[swappedWith] = previousCode;
      settings.controls[action] = nextCode;
    });
    return { swappedWith };
  };

  const installLegacyBridge = () => {
    const syntheticEvents = new WeakSet<KeyboardEvent>();
    const defaultCodes = new Set(INPUT_ACTIONS.filter((action) => !DIRECT_ACTIONS.has(action.id)).map((action) => action.defaultCode));

    const forward = (event: KeyboardEvent) => {
      if (syntheticEvents.has(event)) return;
      const action = INPUT_ACTIONS.find((candidate) => !DIRECT_ACTIONS.has(candidate.id) && codeFor(candidate.id) === event.code);
      const shouldBlockLegacy = defaultCodes.has(event.code);
      if (!action && !shouldBlockLegacy) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      if (!action) return;

      const forwarded = new KeyboardEvent(event.type, {
        key: LEGACY_KEY[action.id],
        code: action.defaultCode,
        bubbles: false,
        cancelable: true,
        repeat: event.repeat,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
      });
      syntheticEvents.add(forwarded);
      window.dispatchEvent(forwarded);
    };

    window.addEventListener('keydown', forward, true);
    window.addEventListener('keyup', forward, true);
    return () => {
      window.removeEventListener('keydown', forward, true);
      window.removeEventListener('keyup', forward, true);
    };
  };

  return { codeFor, matches, isDown, rebind, installLegacyBridge, display: (action: InputActionId) => formatKeyCode(codeFor(action)) };
}

export type InputManager = ReturnType<typeof createInputManager>;
