type Point = { x: number; y: number };

export function installMapEditorInteractionPerf() {
  const canvas = document.querySelector<HTMLCanvasElement>('#mep-canvas');
  const minimap = document.querySelector<HTMLCanvasElement>('#mep-minimap-canvas');
  if (!canvas || !minimap) return;

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
        originalClick.call(minimap, new MouseEvent('click', {
          cancelable: true,
          clientX: point.x,
          clientY: point.y,
          button: 0,
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
