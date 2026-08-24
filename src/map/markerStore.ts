import type { MarkerCategory, MarkerConfig, MarkerSource, MarkerStyle } from './markerTypes';

const STORAGE_KEY = 'ascension.map-markers.v2';
const EVENT_NAME = 'ascension:marker-styles-changed';

const svgPlayer = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="currentColor" d="M16 2 28 28 16 22 4 28Z"/><path fill="rgba(255,255,255,.5)" d="M16 6 23 23 16 19Z"/></svg>`;

const style = (
  source: MarkerSource,
  color: string,
  size = 22,
  labelMode: MarkerStyle['labelMode'] = 'selected',
  extra: Partial<MarkerStyle> = {},
): MarkerStyle => ({
  source,
  size,
  color,
  opacity: 1,
  background: false,
  backgroundColor: '#071a20',
  borderColor: 'rgba(223,190,103,.72)',
  borderWidth: 1,
  shadow: true,
  glow: false,
  labelMode,
  labelSize: 12,
  ...extra,
});

export const MARKER_CATEGORY_LABELS: Record<MarkerCategory, string> = {
  player: 'Jogador',
  npc: 'NPC',
  shop: 'Loja',
  bank: 'Banco',
  crafting: 'Crafting',
  monster: 'Monstro',
  boss: 'Boss',
  resource: 'Recurso',
  landmark: 'Ponto de interesse',
  respawn: 'Renascimento',
  portal: 'Portal',
  questAvailable: 'Missão disponível',
  questReady: 'Missão para entregar',
  routeTarget: 'Destino da rota',
};

export const MARKER_CATEGORIES = Object.keys(MARKER_CATEGORY_LABELS) as MarkerCategory[];

export const DEFAULT_MARKER_CONFIG: MarkerConfig = {
  version: 2,
  styles: {
    player: style({ kind: 'svg', value: svgPlayer, fallback: '▲' }, '#f2d27d', 25, 'never', { glow: true, shadow: true }),
    npc: style({ kind: 'symbol', value: '◆' }, '#a7d4c9', 18, 'hover'),
    shop: style({ kind: 'symbol', value: '◇' }, '#8fc7df', 18, 'hover'),
    bank: style({ kind: 'symbol', value: '▥' }, '#8fc7df', 18, 'hover'),
    crafting: style({ kind: 'symbol', value: '⚒' }, '#d7b66b', 19, 'hover'),
    monster: style({ kind: 'symbol', value: '◆' }, '#d86b72', 16, 'hover'),
    boss: style({ kind: 'symbol', value: '✦' }, '#f0b45d', 21, 'always', { glow: true }),
    resource: style({ kind: 'symbol', value: '✦' }, '#8bc693', 15, 'hover'),
    landmark: style({ kind: 'symbol', value: '⌖' }, '#9db4b1', 16, 'selected'),
    respawn: style({ kind: 'symbol', value: '✦' }, '#d9d38d', 18, 'selected'),
    portal: style({ kind: 'symbol', value: '⇄' }, '#8db8dc', 18, 'hover'),
    questAvailable: style({ kind: 'symbol', value: '!' }, '#2c2109', 13, 'never', {
      background: true,
      backgroundColor: '#e0b952',
      borderColor: '#fff1ad',
      borderWidth: 1,
      shadow: true,
      glow: true,
    }),
    questReady: style({ kind: 'symbol', value: '?' }, '#102814', 13, 'never', {
      background: true,
      backgroundColor: '#9fca77',
      borderColor: '#def6bf',
      borderWidth: 1,
      shadow: true,
      glow: true,
    }),
    routeTarget: style({ kind: 'symbol', value: '✦' }, '#f8e0a0', 20, 'never', { glow: true }),
  },
  overrides: {},
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function normalizeStyle(value: Partial<MarkerStyle> | undefined, fallback: MarkerStyle): MarkerStyle {
  const source = value?.source && typeof value.source.value === 'string' ? value.source : fallback.source;
  return {
    ...fallback,
    ...value,
    source: { ...fallback.source, ...source },
    size: Math.max(8, Math.min(64, Number(value?.size ?? fallback.size))),
    labelSize: Math.max(8, Math.min(24, Number(value?.labelSize ?? fallback.labelSize))),
    opacity: Math.max(.15, Math.min(1, Number(value?.opacity ?? fallback.opacity))),
    borderWidth: Math.max(0, Math.min(5, Number(value?.borderWidth ?? fallback.borderWidth))),
  };
}

export function loadMarkerConfig(): MarkerConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(DEFAULT_MARKER_CONFIG);
    const parsed = JSON.parse(raw) as Partial<MarkerConfig>;
    const config = clone(DEFAULT_MARKER_CONFIG);
    for (const category of MARKER_CATEGORIES) {
      config.styles[category] = normalizeStyle(parsed.styles?.[category], DEFAULT_MARKER_CONFIG.styles[category]);
    }
    if (parsed.overrides && typeof parsed.overrides === 'object') config.overrides = parsed.overrides;
    return config;
  } catch {
    return clone(DEFAULT_MARKER_CONFIG);
  }
}

export function saveMarkerConfig(config: MarkerConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function resetMarkerConfig() {
  const config = clone(DEFAULT_MARKER_CONFIG);
  saveMarkerConfig(config);
  return config;
}

export function markerStyle(category: MarkerCategory, markerId?: string | null): MarkerStyle {
  const config = loadMarkerConfig();
  const base = config.styles[category] ?? DEFAULT_MARKER_CONFIG.styles[category];
  const override = markerId ? config.overrides[markerId] : undefined;
  return normalizeStyle(override, base);
}

export function markerStylesChangedEvent() {
  return EVENT_NAME;
}

export function setMarkerOverride(markerId: string, value: Partial<MarkerStyle> | null) {
  const config = loadMarkerConfig();
  if (!value) delete config.overrides[markerId];
  else config.overrides[markerId] = value;
  saveMarkerConfig(config);
}

export function svgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function ensureFontAwesome() {
  const id = 'ascension-font-awesome-marker-css';
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css';
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
}
