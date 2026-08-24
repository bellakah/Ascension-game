import { Application, Container, Ticker } from 'pixi.js';
import { getSafeCameraPosition } from './desktopViewport';
import { WORLD_H, WORLD_W } from './world';

const STORAGE_KEY = 'ascension.camera.zoom.v1';
const MIN_ZOOM = 0.72;
const MAX_ZOOM = 1.28;
const DEFAULT_ZOOM = 1;
const SMOOTH_TIME_MS = 105;

type InitLike = (...args: unknown[]) => Promise<unknown>;
type ApplicationPrototypeWithInit = { init: InitLike };

function clampZoom(value: number) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
}

function readZoom() {
  try {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 ? clampZoom(stored) : DEFAULT_ZOOM;
  } catch {
    return DEFAULT_ZOOM;
  }
}

function saveZoom(value: number) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(Number(value.toFixed(4))));
  } catch {
    // Preferência visual: falha de storage nunca deve impedir o jogo de iniciar.
  }
}

function playerPoint() {
  const text = document.querySelector<HTMLElement>('#minimap-coords')?.textContent ?? '';
  const match = text.match(/(-?\d+)\s*,\s*(-?\d+)/);
  if (!match) return null;
  return { x: Number(match[1]), y: Number(match[2]) };
}

function normalizedWheelPixels(event: WheelEvent, pageHeight: number) {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * Math.max(320, pageHeight);
  return event.deltaY;
}

/**
 * Captura a Application criada pelo runtime sem acoplar o controlador de câmera
 * ao restante da lógica de combate/movimento. Deve ser preparado antes de
 * startGame() e anexado depois que o jogo terminar de montar o HUD.
 */
export function prepareCameraZoom() {
  let capturedApp: Application | null = null;
  let attached = false;
  let restored = false;

  const prototype = Application.prototype as unknown as ApplicationPrototypeWithInit;
  const originalInit = prototype.init;

  const restoreInit = () => {
    if (restored) return;
    restored = true;
    prototype.init = originalInit;
  };

  prototype.init = async function captureApplication(this: Application, ...args: unknown[]) {
    try {
      const result = await originalInit.apply(this, args);
      capturedApp = this;
      return result;
    } finally {
      restoreInit();
    }
  };

  const attach = () => {
    if (attached) return;
    attached = true;
    restoreInit();

    const app = capturedApp;
    if (!app) return;
    const world = app.stage.children[0];
    if (!(world instanceof Container)) return;

    const canvas = app.canvas;
    if (!(canvas instanceof HTMLCanvasElement)) return;

    let currentZoom = readZoom();
    let targetZoom = currentZoom;
    world.scale.set(currentZoom);
    document.documentElement.dataset.cameraZoom = String(Math.round(currentZoom * 100));

    const onWheel = (event: WheelEvent) => {
      // Ctrl/Meta + roda continua reservado ao zoom de acessibilidade do navegador.
      if (event.ctrlKey || event.metaKey) return;
      const delta = normalizedWheelPixels(event, app.screen.height);
      if (!Number.isFinite(delta) || Math.abs(delta) < 0.01) return;

      event.preventDefault();
      const steps = Math.max(0.45, Math.min(2.25, Math.abs(delta) / 100));
      const factor = Math.pow(1.09, steps);
      targetZoom = clampZoom(delta < 0 ? targetZoom * factor : targetZoom / factor);
      saveZoom(targetZoom);
    };

    const tick = (ticker: Ticker) => {
      const blend = 1 - Math.exp(-Math.max(0, ticker.deltaMS) / SMOOTH_TIME_MS);
      currentZoom += (targetZoom - currentZoom) * blend;
      if (Math.abs(targetZoom - currentZoom) < 0.0005) currentZoom = targetZoom;

      world.scale.set(currentZoom);
      document.documentElement.dataset.cameraZoom = String(Math.round(currentZoom * 100));

      const point = playerPoint();
      if (!point) return;
      const camera = getSafeCameraPosition(
        app.screen.width,
        app.screen.height,
        point.x,
        point.y,
        WORLD_W,
        WORLD_H,
        currentZoom,
      );
      world.position.set(camera.x, camera.y);
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    app.ticker.add(tick);

    window.addEventListener('pagehide', () => {
      canvas.removeEventListener('wheel', onWheel);
      app.ticker.remove(tick);
    }, { once: true });
  };

  return { attach };
}
