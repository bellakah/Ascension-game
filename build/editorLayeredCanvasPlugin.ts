function required(code: string, search: string, replacement: string, label: string) {
  if (!code.includes(search)) throw new Error(`[editor-layered-canvas] Anchor not found: ${label}`);
  return code.replace(search, replacement);
}

const block = (lines: string[]) => lines.join('\n');

function optimizeEditor(source: string) {
  let code = source;

  code = required(
    code,
    '<div class="mep-stage" id="mep-stage"><canvas id="mep-canvas"></canvas>',
    '<div class="mep-stage" id="mep-stage"><canvas id="mep-terrain-canvas" class="mep-render-layer mep-terrain-layer"></canvas><canvas id="mep-object-canvas" class="mep-render-layer mep-object-layer"></canvas><canvas id="mep-canvas" class="mep-render-layer mep-interaction-layer"></canvas>',
    'layered stage canvases',
  );

  code = required(
    code,
    block([
      "  const canvas = root.querySelector<HTMLCanvasElement>('#mep-canvas')!;",
      "  const ctx = canvas.getContext('2d')!;",
    ]),
    block([
      "  const terrainLayerCanvas = root.querySelector<HTMLCanvasElement>('#mep-terrain-canvas')!;",
      "  const terrainLayerCtx = terrainLayerCanvas.getContext('2d')!;",
      "  const objectLayerCanvas = root.querySelector<HTMLCanvasElement>('#mep-object-canvas')!;",
      "  const objectLayerCtx = objectLayerCanvas.getContext('2d')!;",
      "  const canvas = root.querySelector<HTMLCanvasElement>('#mep-canvas')!;",
      "  const ctx = canvas.getContext('2d')!;",
    ]),
    'layer canvas contexts',
  );

  code = required(
    code,
    "  let perfSpatialIdle = 0;",
    block([
      "  let perfSpatialIdle = 0;",
      "  let layeredTerrainAppliedKey = '';",
      "  let layeredObjectAppliedKey = '';",
      "  let terrainLayerBase = { cameraX: 0, cameraY: 0, zoom: .7 };",
      "  let objectLayerBase = { cameraX: 0, cameraY: 0, zoom: .7 };",
      "  let layeredViewTimer = 0;",
      "  let perfDraggingMoved = false;",
    ]),
    'layered performance state',
  );

  code = required(
    code,
    "      if (signature !== perfSelectionSignature) { perfSelectionSignature = signature; perfSelectionSet = new Set(selection.map((item) => `${item.kind}:${item.id}`)); perfObjectViewportKey = ''; }",
    "      if (signature !== perfSelectionSignature) { perfSelectionSignature = signature; perfSelectionSet = new Set(selection.map((item) => `${item.kind}:${item.id}`)); }",
    'selection without static object invalidation',
  );

  code = required(
    code,
    "  const selectionSet = () => {",
    block([
      "  const syncRenderLayer = (node: HTMLCanvasElement, context: CanvasRenderingContext2D, width: number, height: number, cssWidth: number, cssHeight: number, dpr: number) => {",
      "    if (node.width !== width || node.height !== height) { node.width = width; node.height = height; node.style.width = `${cssWidth}px`; node.style.height = `${cssHeight}px`; }",
      "    context.setTransform(dpr, 0, 0, dpr, 0, 0);",
      "  };",
      "",
      "  const applyFastTransform = (node: HTMLCanvasElement, base: { cameraX: number; cameraY: number; zoom: number }) => {",
      "    const scale = zoom / Math.max(.0001, base.zoom);",
      "    const tx = (base.cameraX - cameraX) * zoom;",
      "    const ty = (base.cameraY - cameraY) * zoom;",
      "    node.style.transformOrigin = '0 0';",
      "    node.style.transform = `translate3d(${tx}px,${ty}px,0) scale(${scale})`;",
      "  };",
      "",
      "  const fastViewportUpdate = () => {",
      "    applyFastTransform(terrainLayerCanvas, terrainLayerBase);",
      "    applyFastTransform(objectLayerCanvas, objectLayerBase);",
      "    const rect = stage.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);",
      "    const width = Math.max(1, Math.floor(rect.width * dpr)), height = Math.max(1, Math.floor(rect.height * dpr));",
      "    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`; }",
      "    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, rect.width, rect.height);",
      "    renderMinimap();",
      "  };",
      "",
      "  const queueViewportCommit = (delay = 72) => {",
      "    clearTimeout(layeredViewTimer);",
      "    layeredViewTimer = window.setTimeout(() => { layeredViewTimer = 0; scheduleEditorRender(); }, delay);",
      "  };",
      "",
      "  const copyTerrainLayer = (source: HTMLCanvasElement, width: number, height: number, cssWidth: number, cssHeight: number, dpr: number, key: string) => {",
      "    syncRenderLayer(terrainLayerCanvas, terrainLayerCtx, width, height, cssWidth, cssHeight, dpr);",
      "    terrainLayerCtx.clearRect(0, 0, cssWidth, cssHeight);",
      "    terrainLayerCtx.drawImage(source, 0, 0, width, height, 0, 0, cssWidth, cssHeight);",
      "    terrainLayerCanvas.style.transform = 'none'; layeredTerrainAppliedKey = key; terrainLayerBase = { cameraX, cameraY, zoom };",
      "  };",
      "",
      "  const copyObjectLayer = (source: HTMLCanvasElement, width: number, height: number, cssWidth: number, cssHeight: number, dpr: number, key: string) => {",
      "    syncRenderLayer(objectLayerCanvas, objectLayerCtx, width, height, cssWidth, cssHeight, dpr);",
      "    objectLayerCtx.clearRect(0, 0, cssWidth, cssHeight);",
      "    objectLayerCtx.drawImage(source, 0, 0, width, height, 0, 0, cssWidth, cssHeight);",
      "    objectLayerCanvas.style.transform = 'none'; layeredObjectAppliedKey = key; objectLayerBase = { cameraX, cameraY, zoom };",
      "  };",
      "",
      "  const selectionSet = () => {",
    ]),
    'layer helpers',
  );

  code = required(
    code,
    block([
      "    clampCamera();",
      "    const zoomNode = contextBar.querySelector<HTMLInputElement>('#mep-zoom'); if (zoomNode && document.activeElement !== zoomNode) zoomNode.value = String(Math.round(zoom * 100));",
      "    scheduleEditorRender();",
    ]),
    block([
      "    clampCamera();",
      "    const zoomNode = contextBar.querySelector<HTMLInputElement>('#mep-zoom'); if (zoomNode && document.activeElement !== zoomNode) zoomNode.value = String(Math.round(zoom * 100));",
      "    fastViewportUpdate(); queueViewportCommit(82);",
    ]),
    'deferred zoom rebuild',
  );

  code = required(
    code,
    "    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`; }",
    block([
      "    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`; }",
      "    syncRenderLayer(terrainLayerCanvas, terrainLayerCtx, width, height, rect.width, rect.height, dpr);",
      "    syncRenderLayer(objectLayerCanvas, objectLayerCtx, width, height, rect.width, rect.height, dpr);",
    ]),
    'sync physical layer sizes',
  );

  code = required(
    code,
    "    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, rect.width, rect.height); ctx.fillStyle = '#050a0f'; ctx.fillRect(0, 0, rect.width, rect.height);",
    "    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, rect.width, rect.height);",
    'transparent interaction canvas',
  );

  code = required(
    code,
    "    if (perfTerrainViewport) ctx.drawImage(perfTerrainViewport, 0, 0, width, height, 0, 0, rect.width, rect.height);",
    "    if (perfTerrainViewport && layeredTerrainAppliedKey !== perfTerrainViewportKey) copyTerrainLayer(perfTerrainViewport, width, height, rect.width, rect.height, dpr, perfTerrainViewportKey);",
    'terrain into dedicated canvas',
  );

  code = required(
    code,
    block([
      "      const selectedIds = selectionSet();",
      "      const staticValues = objectValues.filter((object) => !selectedIds.has(`object:${object.id}`) && !getPaletteEntry(object.assetId).sprite?.animation?.frames.length);",
      "      const dynamicValues = objectValues.filter((object) => selectedIds.has(`object:${object.id}`) || Boolean(getPaletteEntry(object.assetId).sprite?.animation?.frames.length));",
      "      const objectKey = `${mapDoc.id}|${perfObjectRevision}|${perfSelectionSignature}|${collisionVisible ? 1 : 0}|${layer}|${Math.round(cameraX * 4)}:${Math.round(cameraY * 4)}|${Math.round(zoom * 1000)}|${Math.round(rect.width)}x${Math.round(rect.height)}`;",
    ]),
    block([
      "      const selectedIds = selectionSet();",
      "      const moveActive = dragMode === 'move' && perfDraggingMoved;",
      "      const placeActive = actionOpen && perfDeferredHistory?.kind === 'place';",
      "      const overlayIds = (moveActive || placeActive) ? selectedIds : new Set<string>();",
      "      const staticValues = objectValues.filter((object) => !overlayIds.has(`object:${object.id}`) && !getPaletteEntry(object.assetId).sprite?.animation?.frames.length);",
      "      const dynamicValues = objectValues.filter((object) => overlayIds.has(`object:${object.id}`) || Boolean(getPaletteEntry(object.assetId).sprite?.animation?.frames.length));",
      "      const interactionKey = moveActive ? `move:${perfSelectionSignature}` : '';",
      "      const objectKey = `${mapDoc.id}|${perfObjectRevision}|${interactionKey}|${collisionVisible ? 1 : 0}|${layer}|${Math.round(cameraX * 4)}:${Math.round(cameraY * 4)}|${Math.round(zoom * 1000)}|${Math.round(rect.width)}x${Math.round(rect.height)}`;",
    ]),
    'selection-independent static objects',
  );

  code = required(
    code,
    "      if (perfObjectViewport) ctx.drawImage(perfObjectViewport, 0, 0, width, height, 0, 0, rect.width, rect.height);",
    "      if (perfObjectViewport && layeredObjectAppliedKey !== perfObjectViewportKey) copyObjectLayer(perfObjectViewport, width, height, rect.width, rect.height, dpr, perfObjectViewportKey);",
    'objects into dedicated canvas',
  );

  code = required(
    code,
    "      for (const object of dynamicValues) { const asset = getPaletteEntry(object.assetId); drawConfiguredObject(ctx, asset, { object, x: ((object.x + .5) * mapDoc.tileSize - cameraX) * zoom, y: ((object.y + 1) * mapDoc.tileSize - cameraY) * zoom, tilePixels: tilePx, scale: object.scale ?? 1, selected: selectionHas('object', object.id), showHitbox: collisionVisible || layer === 'collision', showLight: true, onReady: scheduleEditorRender, now }); }",
    block([
      "      for (const object of dynamicValues) { const asset = getPaletteEntry(object.assetId); drawConfiguredObject(ctx, asset, { object, x: ((object.x + .5) * mapDoc.tileSize - cameraX) * zoom, y: ((object.y + 1) * mapDoc.tileSize - cameraY) * zoom, tilePixels: tilePx, scale: object.scale ?? 1, selected: selectionHas('object', object.id), showHitbox: collisionVisible || layer === 'collision', showLight: true, onReady: scheduleEditorRender, now }); }",
      "      if (!moveActive && !placeActive) {",
      "        ctx.save(); ctx.strokeStyle = '#e9fbff'; ctx.lineWidth = 2; ctx.setLineDash([5, 3]);",
      "        for (const item of selection) if (item.kind === 'object') {",
      "          rebuildObjectIndex(); const object = perfObjectById.get(item.id); if (!object) continue;",
      "          const asset = getPaletteEntry(object.assetId); if (asset.sprite?.animation?.frames.length) continue;",
      "          const bounds = objectRect(object); const sx = (bounds.x * mapDoc.tileSize - cameraX) * zoom, sy = (bounds.y * mapDoc.tileSize - cameraY) * zoom;",
      "          ctx.strokeRect(sx - 3, sy - 3, bounds.width * tilePx + 6, bounds.height * tilePx + 6);",
      "        }",
      "        ctx.restore();",
      "      }",
    ]),
    'selection outline overlay',
  );

  code = required(
    code,
    "          dragMode = 'move'; dragStartMap = snapPoint(mapPoint); moveOrigins = new Map();",
    "          dragMode = 'move'; perfDraggingMoved = false; dragStartMap = snapPoint(mapPoint); moveOrigins = new Map();",
    'defer moving-object extraction',
  );

  code = required(
    code,
    "    if (dragMode === 'move') {\n      const current = snapPoint(mapPoint), dx = current.x - dragStartMap.x, dy = current.y - dragStartMap.y;",
    block([
      "    if (dragMode === 'move') {",
      "      if (!perfDraggingMoved) { perfDraggingMoved = true; perfObjectViewportKey = ''; layeredObjectAppliedKey = ''; }",
      "      const current = snapPoint(mapPoint), dx = current.x - dragStartMap.x, dy = current.y - dragStartMap.y;",
    ]),
    'extract moving objects on first motion',
  );

  code = required(
    code,
    "    if (dragMode === 'pan') { cameraX = pointerStart.cameraX - (event.clientX - pointerStart.x) / zoom; cameraY = pointerStart.cameraY - (event.clientY - pointerStart.y) / zoom; clampCamera(); render(); return; }",
    "    if (dragMode === 'pan') { cameraX = pointerStart.cameraX - (event.clientX - pointerStart.x) / zoom; cameraY = pointerStart.cameraY - (event.clientY - pointerStart.y) / zoom; clampCamera(); fastViewportUpdate(); queueViewportCommit(64); return; }",
    'fast panning',
  );

  code = required(
    code,
    "    else if (dragMode === 'paint' || dragMode === 'move') finishMutation();\n    dragMode = 'none';",
    block([
      "    else if (dragMode === 'paint' || dragMode === 'move') { if (dragMode === 'move') perfDraggingMoved = false; finishMutation(); }",
      "    else if (dragMode === 'pan') queueViewportCommit(0);",
      "    dragMode = 'none';",
    ]),
    'settle interaction layers',
  );

  code = required(
    code,
    "  const observer = new ResizeObserver(() => { if (!initialized) { initialized = true; requestAnimationFrame(fitMap); } else render(); }); observer.observe(stage);",
    "  const observer = new ResizeObserver(() => { layeredTerrainAppliedKey = ''; layeredObjectAppliedKey = ''; if (!initialized) { initialized = true; requestAnimationFrame(fitMap); } else scheduleEditorRender(); }); observer.observe(stage);",
    'layer-aware resize',
  );

  return code;
}

export function editorLayeredCanvasPlugin() {
  return {
    name: 'ascension-editor-layered-canvas',
    enforce: 'pre' as const,
    transform(source: string, id: string) {
      const clean = id.split('?')[0].replace(/\\/g, '/');
      if (clean.endsWith('/src/editor/map/mapEditorProApp.ts')) return { code: optimizeEditor(source), map: null };
      return null;
    },
  };
}
