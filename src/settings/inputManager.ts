import { INPUT_ACTIONS, type InputActionId } from './settingsCatalog';
import type { SettingsStore } from './settingsState';

const FRIENDLY_CODES: Record<string, string> = {
  Space: 'Espaço', Escape: 'Esc', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  ShiftLeft: 'Shift E', ShiftRight: 'Shift D', ControlLeft: 'Ctrl E', ControlRight: 'Ctrl D',
  AltLeft: 'Alt E', AltRight: 'Alt D',
};

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

  return { codeFor, matches, isDown, rebind, display: (action: InputActionId) => formatKeyCode(codeFor(action)) };
}

export type InputManager = ReturnType<typeof createInputManager>;
