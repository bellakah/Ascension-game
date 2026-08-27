type Point = { x: number; y: number };

type PointerSnapshot = {
  clientX: number;
  clientY: number;
  button: number;
  buttons: number;
  pointerId: number;
  pointerType: string;
  isPrimary: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
};

function snapshot(event: PointerEvent): PointerSnapshot {
  return {
    clientX: event.clientX,
    clientY: event.clientY,
    button: event.button,
    buttons: event.buttons,
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    isPrimary: event.isPrimary,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
  };
}

function asPointerEvent(value: PointerSnapshot) {
  return new PointerEvent('pointermove', {
    bubbles: false,
    cancelable: true,
    clientX: value.clientX,
    clientY: value.clientY,
    button: value.button,
    buttons: value.buttons,
    pointerId: value.pointerId,
    pointerType: value.pointerType,
    isPrimary: value.isPrimary,
    ctrlKey: value.ctrlKey,
    shiftKey: value.shiftKey,
    altKey: value.altKey,
    metaKey: value.metaKey,
  });
}

function interpolate(a: PointerSnapshot, b: PointerSnapshot, t: number): PointerSnapshot {
  return {
    ...b,
    clientX: a.clientX + (b.clientX - a.clientX) * t,
    clientY: a.clientY + (b.clientY - a.clientY) * t,
  };
}

function isContinuousPaintGesture(event: PointerEvent) {
  if ((event.buttons & 1) === 0) return false;
  const label = document.querySelector<HTMLElement>('#mep-tool-status')?.textContent?.toLowerCase() ?? '';
  return /pincel|apagar|colis[aã]o|brush|eraser|random/.test(label);
}

export function installMapEditorInteractionPerf() {
  const canvas = document.querySelector<HTMLCanvasElement>('#mep-canvas');
  const minimap = document.querySelector<HTMLCanvasElement>('#mep-minimap-canvas');
  if (!canvas || !minimap) return;

  const style = document.createElement('style');
  style.textContent = `
    .mep-card { content-visibility: auto; contain-intrinsic-size: 92px 116px; }
    .mep-load-more { grid-column: 1 / -1; min-height: 36px; border: 1px solid #294457; border-radius: 7px; background: #0d1a24; color: #b9d6e7; cursor: pointer; }
    .mep-load-more:hover { background: #132735; color: #fff; }
  `;
  document.head.appendChild(style);

  const originalPointerMove = canvas.onpointermove;
  if (originalPointerMove) {
    let moveFrame = 0;
    let pending: PointerSnapshot | null = null;
    let lastDispatched: PointerSnapshot | null = null;
    let pendingPaint = false;

    const flush = () => {
      moveFrame = 0;
      const next = pending;
      const paint = pendingPaint;
      pending = null;
      pendingPaint = false;
      if (!next) return;

      // Hover/pan continua limitado a um evento por frame. Durante um stroke,
      // porém, preservamos o caminho entre o último ponto processado e o atual.
      // Há um limite de quatro amostras por frame para impedir que um movimento
      // muito rápido provoque uma tempestade de renders completos.
      if (paint && lastDispatched) {
        const dx = next.clientX - lastDispatched.clientX;
        const dy = next.clientY - lastDispatched.clientY;
        const distance = Math.hypot(dx, dy);
        const segments = Math.max(1, Math.min(4, Math.ceil(distance / 12)));
        for (let index = 1; index <= segments; index++) {
          const value = interpolate(lastDispatched, next, index / segments);
          originalPointerMove.call(canvas, asPointerEvent(value));
        }
      } else {
        originalPointerMove.call(canvas, asPointerEvent(next));
      }
      lastDispatched = next;
    };

    canvas.onpointermove = (event) => {
      pending = snapshot(event);
      pendingPaint ||= isContinuousPaintGesture(event);
      if (moveFrame) return;
      moveFrame = requestAnimationFrame(flush);
    };

    const resetStroke = () => { lastDispatched = null; pendingPaint = false; };
    canvas.addEventListener('pointerdown', (event) => { lastDispatched = snapshot(event); }, { capture: true });
    canvas.addEventListener('pointerup', resetStroke, { capture: true });
    canvas.addEventListener('pointercancel', resetStroke, { capture: true });
  }

  const originalWheel = canvas.onwheel;
  if (originalWheel) {
    let frame = 0;
    let accumulatedDelta = 0;
    let lastPoint: Point = { x: 0, y: 0 };

    canvas.onwheel = (event) => {
      event.preventDefault();
      accumulatedDelta += event.deltaY;
      lastPoint = { x: event.clientX, y: event.clientY };
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const delta = accumulatedDelta;
        accumulatedDelta = 0;
        const nextEvent = new WheelEvent('wheel', {
          cancelable: true,
          clientX: lastPoint.x,
          clientY: lastPoint.y,
          deltaY: delta < 0 ? -1 : 1,
          deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        });
        originalWheel.call(canvas, nextEvent);
      });
    };
  }

  const originalClick = minimap.onclick;
  if (originalClick) {
    let dragging = false;
    let frame = 0;
    let pending: Point | null = null;

    const moveTo = (clientX: number, clientY: number) => {
      pending = { x: clientX, y: clientY };
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const point = pending;
        pending = null;
        if (!point) return;
        originalClick.call(minimap, new PointerEvent('click', {
          cancelable: true,
          clientX: point.x,
          clientY: point.y,
          button: 0,
          pointerType: 'mouse',
          isPrimary: true,
        }));
      });
    };

    minimap.style.touchAction = 'none';
    minimap.style.cursor = 'grab';
    minimap.onclick = null;

    minimap.onpointerdown = (event) => {
      if (event.button !== 0) return;
      dragging = true;
      minimap.style.cursor = 'grabbing';
      minimap.setPointerCapture(event.pointerId);
      moveTo(event.clientX, event.clientY);
    };
    minimap.onpointermove = (event) => {
      if (!dragging) return;
      moveTo(event.clientX, event.clientY);
    };
    const finish = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      minimap.style.cursor = 'grab';
      moveTo(event.clientX, event.clientY);
      if (minimap.hasPointerCapture(event.pointerId)) minimap.releasePointerCapture(event.pointerId);
    };
    minimap.onpointerup = finish;
    minimap.onpointercancel = finish;
    minimap.onclick = (event) => moveTo(event.clientX, event.clientY);
  }
}
