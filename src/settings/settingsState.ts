import { INPUT_ACTIONS, type InputActionId } from './settingsCatalog';

export type GraphicsPreset = 'low' | 'medium' | 'high' | 'ultra' | 'custom';
export type AudioChannel = 'music' | 'sfx' | 'ambient' | 'ui' | 'voice';

export type GameSettings = {
  version: 1;
  controls: Record<InputActionId, string>;
  graphics: {
    preset: GraphicsPreset;
    renderScale: number;
    antialias: boolean;
    fpsLimit: number;
    effects: boolean;
    particles: boolean;
    lighting: boolean;
    bloom: boolean;
  };
  audio: {
    master: number;
    music: number;
    sfx: number;
    ambient: number;
    ui: number;
    voice: number;
  };
  interface: {
    showMinimap: boolean;
    showQuestTracker: boolean;
    showDesktopShortcuts: boolean;
    showNames: boolean;
    showFloatingDamage: boolean;
  };
  gameplay: {
    tutorials: boolean;
    confirmRareDiscard: boolean;
    confirmRareSell: boolean;
  };
};

const STORAGE_KEY = 'ascension.settings.v1';
type SettingsFile = { profiles: Record<string, GameSettings> };

function defaultControls() {
  return Object.fromEntries(INPUT_ACTIONS.map((action) => [action.id, action.defaultCode])) as Record<InputActionId, string>;
}

export function createDefaultSettings(): GameSettings {
  return {
    version: 1,
    controls: defaultControls(),
    graphics: {
      preset: 'high', renderScale: 1, antialias: true, fpsLimit: 60,
      effects: true, particles: true, lighting: true, bloom: false,
    },
    audio: { master: 100, music: 75, sfx: 100, ambient: 65, ui: 85, voice: 100 },
    interface: {
      showMinimap: true, showQuestTracker: true, showDesktopShortcuts: true,
      showNames: true, showFloatingDamage: true,
    },
    gameplay: { tutorials: true, confirmRareDiscard: true, confirmRareSell: true },
  };
}

function numberBetween(value: unknown, min: number, max: number, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
}

function normalizeSettings(value?: Partial<GameSettings>): GameSettings {
  const base = createDefaultSettings();
  const source = value ?? {};
  const graphics = { ...base.graphics, ...(source.graphics ?? {}) };
  const audio = { ...base.audio, ...(source.audio ?? {}) };
  const ui = { ...base.interface, ...(source.interface ?? {}) };
  const gameplay = { ...base.gameplay, ...(source.gameplay ?? {}) };
  const controls = { ...base.controls, ...(source.controls ?? {}) };

  for (const action of INPUT_ACTIONS) {
    if (typeof controls[action.id] !== 'string' || !controls[action.id]) controls[action.id] = action.defaultCode;
  }

  const preset: GraphicsPreset = ['low', 'medium', 'high', 'ultra', 'custom'].includes(String(graphics.preset))
    ? graphics.preset as GraphicsPreset : 'high';
  const fps = [0, 30, 60, 120].includes(Number(graphics.fpsLimit)) ? Number(graphics.fpsLimit) : 60;

  return {
    version: 1,
    controls,
    graphics: {
      preset,
      renderScale: numberBetween(graphics.renderScale, .65, 1.25, 1),
      antialias: Boolean(graphics.antialias),
      fpsLimit: fps,
      effects: Boolean(graphics.effects),
      particles: Boolean(graphics.particles),
      lighting: Boolean(graphics.lighting),
      bloom: Boolean(graphics.bloom),
    },
    audio: {
      master: numberBetween(audio.master, 0, 100, 100),
      music: numberBetween(audio.music, 0, 100, 75),
      sfx: numberBetween(audio.sfx, 0, 100, 100),
      ambient: numberBetween(audio.ambient, 0, 100, 65),
      ui: numberBetween(audio.ui, 0, 100, 85),
      voice: numberBetween(audio.voice, 0, 100, 100),
    },
    interface: {
      showMinimap: Boolean(ui.showMinimap),
      showQuestTracker: Boolean(ui.showQuestTracker),
      showDesktopShortcuts: Boolean(ui.showDesktopShortcuts),
      showNames: Boolean(ui.showNames),
      showFloatingDamage: Boolean(ui.showFloatingDamage),
    },
    gameplay: {
      tutorials: Boolean(gameplay.tutorials),
      confirmRareDiscard: Boolean(gameplay.confirmRareDiscard),
      confirmRareSell: Boolean(gameplay.confirmRareSell),
    },
  };
}

function loadFile(): SettingsFile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { profiles: {} };
    const parsed = JSON.parse(raw) as SettingsFile;
    if (!parsed || typeof parsed !== 'object' || !parsed.profiles || typeof parsed.profiles !== 'object') return { profiles: {} };
    return parsed;
  } catch {
    return { profiles: {} };
  }
}

function persistProfile(accountKey: string, settings: GameSettings) {
  const file = loadFile();
  file.profiles[accountKey] = settings;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
}

export function applyGraphicsPreset(settings: GameSettings, preset: GraphicsPreset) {
  settings.graphics.preset = preset;
  if (preset === 'custom') return;
  if (preset === 'low') Object.assign(settings.graphics, { preset, renderScale: .65, antialias: false, fpsLimit: 60, effects: true, particles: false, lighting: false, bloom: false });
  if (preset === 'medium') Object.assign(settings.graphics, { preset, renderScale: .85, antialias: false, fpsLimit: 60, effects: true, particles: true, lighting: false, bloom: false });
  if (preset === 'high') Object.assign(settings.graphics, { preset, renderScale: 1, antialias: true, fpsLimit: 60, effects: true, particles: true, lighting: true, bloom: false });
  if (preset === 'ultra') Object.assign(settings.graphics, { preset, renderScale: 1.25, antialias: true, fpsLimit: 120, effects: true, particles: true, lighting: true, bloom: true });
}

export function createSettingsStore(accountKey: string) {
  const file = loadFile();
  let settings = normalizeSettings(file.profiles[accountKey]);
  persistProfile(accountKey, settings);
  const listeners = new Set<(next: GameSettings) => void>();

  const notify = () => {
    persistProfile(accountKey, settings);
    for (const listener of listeners) listener(settings);
  };

  return {
    get settings() { return settings; },
    update(mutator: (draft: GameSettings) => void) { mutator(settings); settings = normalizeSettings(settings); notify(); },
    resetAll() { settings = createDefaultSettings(); notify(); },
    resetControls() { settings.controls = defaultControls(); notify(); },
    onChange(listener: (next: GameSettings) => void) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;

export function graphicsBootstrap(settings: GameSettings) {
  const deviceScale = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  return {
    antialias: settings.graphics.antialias,
    resolution: Math.max(.65, Math.min(2.5, deviceScale * settings.graphics.renderScale)),
  };
}

export function effectiveChannelVolume(settings: GameSettings, channel: AudioChannel) {
  return (settings.audio.master / 100) * (settings.audio[channel] / 100);
}
