function required(code: string, search: string, replacement: string, label: string) {
  if (!code.includes(search)) throw new Error(`[editor-interaction-v2] Anchor not found: ${label}`);
  return code.replace(search, replacement);
}

const block = (lines: string[]) => lines.join('\n');

function optimizeEditor(source: string) {
  let code = source;

  code = required(code, "  const PERF_ASSET_BATCH = 72;", "  const PERF_ASSET_BATCH = 36;", 'smaller asset batch');

  code = required(
    code,
    "  let scheduledRenderFrame = 0;",
    block([
      "  let scheduledRenderFrame = 0;",
      "  let perfTerrainViewport: HTMLCanvasElement | null = null;",
      "  let perfTerrainViewportKey = '';",
      "  let perfTerrainRevision = 0;",
      "  let perfObjectViewport: HTMLCanvasElement | null = null;",
      "  let perfObjectViewportKey = '';",
      "  let perfObjectRevision = 0;",
      "  let perfSelectionSignature = '';",
      "  let perfSelectionSet = new Set<string>();",
      "  let perfPublishedCache: ReturnType<typeof loadPublishedMap> | null = null;",
      "  let perfDeferredHistory: null | { kind: 'move'; label: string } | { kind: 'place'; label: string; objectLength: number } = null;",
      "  let perfSpatialIdle = 0;",
    ]),
    'deep performance state',
  );

  code = required(
    code,
    "  const invalidatePerfIndexes = () => { perfSpatialDirty = true; minimapBaseKey = ''; };",
    block([
      "  const invalidateTerrainViewport = () => { perfTerrainRevision++; perfTerrainViewportKey = ''; };",
      "  const invalidateObjectViewport = () => { perfObjectRevision++; perfObjectViewportKey = ''; };",
      "  const scheduleSpatialIndex = () => {",
      "    if (perfSpatialIdle) return;",
      "    const run = () => { perfSpatialIdle = 0; rebuildObjectIndex(); };",
      "    const ric = (window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number }).requestIdleCallback;",
      "    perfSpatialIdle = ric ? ric(run, { timeout: 220 }) : window.setTimeout(run, 32);",
      "  };",
      "  const invalidatePerfIndexes = () => { perfSpatialDirty = true; minimapBaseKey = ''; invalidateObjectViewport(); scheduleSpatialIndex(); };",
      "  const selectionSet = () => {",
      "    const signature = selection.map((item) => `${item.kind}:${item.id}`).join('|');",
      "    if (signature !== perfSelectionSignature) { perfSelectionSignature = signature; perfSelectionSet = new Set(selection.map((item) => `${item.kind}:${item.id}`)); perfObjectViewportKey = ''; }",
      "    return perfSelectionSet;",
      "  };",
    ]),
    'cache invalidation helpers',
  );

  code = required(code, "  const selectionHas = (kind: SelectionItem['kind'], id: string) => selection.some((item) => item.kind === kind && item.id === id);", "  const selectionHas = (kind: SelectionItem['kind'], id: string) => selectionSet().has(`${kind}:${id}`);", 'fast selection membership');

  code = required(
    code,
    block([
      "  const beginMutation = (label: string) => {",
      "    if (actionOpen) return;",
      "    undoStack.push({ document: clone(mapDoc), label });",
      "    if (undoStack.length > 80) undoStack.shift();",
      "    redoStack.length = 0;",
      "    actionOpen = true;",
      "  };",
    ]),
    block([
      "  const beginMutation = (label: string) => {",
      "    if (actionOpen) return;",
      "    if (label === 'Mover grupo' || label === 'Mover item') { perfDeferredHistory = { kind: 'move', label }; redoStack.length = 0; actionOpen = true; return; }",
      "    if (label === 'Colocar objetos') { perfDeferredHistory = { kind: 'place', label, objectLength: mapDoc.objects.length }; redoStack.length = 0; actionOpen = true; return; }",
      "    undoStack.push({ document: clone(mapDoc), label });",
      "    if (undoStack.length > 80) undoStack.shift();",
      "    redoStack.length = 0;",
      "    actionOpen = true;",
      "  };",
    ]),
    'deferred object history',
  );

  code = required(
    code,
    block([
      "  const finishMutation = () => {",
      "    if (actionOpen) {",
      "      mapDoc.updatedAt = Date.now();",
      "      invalidatePerfIndexes();",
      "      markDirty(); schedulePreview();",
      "    }",
      "    actionOpen = false; lastPaintKey = '';",
      "    refreshChrome(); renderInspector(); render();",
      "  };",
    ]),
    block([
      "  const finishMutation = () => {",
      "    if (actionOpen && perfDeferredHistory?.kind === 'move') {",
      "      let changed = false;",
      "      for (const object of selectedObjects()) { const origin = moveOrigins.get(`object:${object.id}`); if (origin && (origin.x !== object.x || origin.y !== object.y)) { changed = true; break; } }",
      "      if (!changed) for (const zone of selectedZones()) { const origin = moveOrigins.get(`zone:${zone.id}`); if (origin && (origin.x !== zone.x || origin.y !== zone.y)) { changed = true; break; } }",
      "      if (changed) {",
      "        const before = clone(mapDoc);",
      "        for (const object of before.objects) { const origin = moveOrigins.get(`object:${object.id}`); if (origin) { object.x = origin.x; object.y = origin.y; } }",
      "        for (const zone of before.zones) { const origin = moveOrigins.get(`zone:${zone.id}`); if (origin) { zone.x = origin.x; zone.y = origin.y; } }",
      "        undoStack.push({ document: before, label: perfDeferredHistory.label }); if (undoStack.length > 80) undoStack.shift();",
      "      } else actionOpen = false;",
      "    } else if (actionOpen && perfDeferredHistory?.kind === 'place') {",
      "      if (mapDoc.objects.length > perfDeferredHistory.objectLength) { const before = clone(mapDoc); before.objects = before.objects.slice(0, perfDeferredHistory.objectLength); undoStack.push({ document: before, label: perfDeferredHistory.label }); if (undoStack.length > 80) undoStack.shift(); }",
      "      else actionOpen = false;",
      "    }",
      "    perfDeferredHistory = null;",
      "    if (actionOpen) {",
      "      mapDoc.updatedAt = Date.now();",
      "      invalidatePerfIndexes();",
      "      markDirty(); schedulePreview();",
      "    }",
      "    actionOpen = false; lastPaintKey = '';",
      "    refreshChrome(); renderInspector(); scheduleEditorRender();",
      "  };",
    ]),
    'deferred history commit',
  );

  code = required(
    code,
    "    clampCamera(); renderContext(); refreshChrome(); render();",
    block([
      "    clampCamera();",
      "    const zoomNode = contextBar.querySelector<HTMLInputElement>('#mep-zoom'); if (zoomNode && document.activeElement !== zoomNode) zoomNode.value = String(Math.round(zoom * 100));",
      "    scheduleEditorRender();",
    ]),
    'lightweight zoom',
  );

  code = required(
    code,
    "    selection = [];\n    renderAssets(); renderContext(); refreshChrome(); renderInspector(); render();",
    block([
      "    selection = [];",
      "    assetGrid.querySelectorAll<HTMLElement>('.mep-card.active').forEach((node) => node.classList.remove('active'));",
      "    const activeCard = assetGrid.querySelector<HTMLElement>(`[data-card=\"${CSS.escape(next.id)}\"]`); if (activeCard) activeCard.classList.add('active');",
      "    preloadMapAssets([next], scheduleEditorRender);",
      "    renderContext(); refreshChrome(); renderInspector(); scheduleEditorRender();",
    ]),
    'lightweight asset choice',
  );

  code = required(
    code,
    "    const asset = getPaletteEntry(object.assetId), preset = getAssetPreset(asset), stretch = preset.stretch.enabled;\n    const portal = object.kind === 'portal';\n    const mapOptions = listMapDocuments().map((document) => `<option value=\"${esc(document.id)}\" ${String(object.properties?.targetMapId ?? '') === document.id ? 'selected' : ''}>${esc(document.name)}</option>`).join('');",
    "    const asset = getPaletteEntry(object.assetId), preset = getAssetPreset(asset), stretch = preset.stretch.enabled;\n    const portal = object.kind === 'portal';\n    const mapOptions = portal ? listMapDocuments().map((document) => `<option value=\"${esc(document.id)}\" ${String(object.properties?.targetMapId ?? '') === document.id ? 'selected' : ''}>${esc(document.name)}</option>`).join('') : '';",
    'lazy portal map options',
  );

  code = required(code, "    if (selected.kind === 'object') { const object = mapDoc.objects.find((value) => value.id === selected.id); if (object) renderObjectInspector(object); else selection = []; }", "    if (selected.kind === 'object') { rebuildObjectIndex(); const object = perfObjectById.get(selected.id); if (object) renderObjectInspector(object); else selection = []; }", 'indexed inspector object lookup');

  code = required(code, "    const published = loadPublishedMap();", "    const published = perfPublishedCache ?? (perfPublishedCache = loadPublishedMap());", 'cached published state');
  code = required(code, "publishMap(mapDoc); refreshChrome(); showToast('Mapa publicado no jogo.');", "publishMap(mapDoc); perfPublishedCache = loadPublishedMap(); refreshChrome(); showToast('Mapa publicado no jogo.');", 'refresh published cache');

  code = required(
    code,
    "    beginMutation(tool === 'eraser' ? 'Apagar' : tool === 'collision' ? 'Pintar colisão' : tool === 'random' ? 'Pincel aleatório' : 'Pintar mapa');",
    "    beginMutation(entry.objectKind && tool !== 'eraser' ? 'Colocar objetos' : tool === 'eraser' ? 'Apagar' : tool === 'collision' ? 'Pintar colisão' : tool === 'random' ? 'Pincel aleatório' : 'Pintar mapa');",
    'object placement history label',
  );

  code = required(
    code,
    "    renderInspector(); refreshChrome(); render();\n  };\n\n  const applyShape = () => {",
    block([
      "    if (entry.palette === 'terrain' || layer === 'ground' || layer === 'detail') invalidateTerrainViewport();",
      "    if (initial && entry.objectKind) { renderInspector(); refreshChrome(); }",
      "    scheduleEditorRender();",
      "  };",
      "",
      "  const applyShape = () => {",
    ]),
    'lightweight paint loop',
  );

  code = required(code, "      markDirty(); render(); return;", "      scheduleEditorRender(); return;", 'drag without autosave work');

  const oldTerrain = block([
    "    if (visible.ground) for (let y = startY; y <= endY; y++) for (let x = startX; x <= endX; x++) {",
    "      const sx = (x * mapDoc.tileSize - cameraX) * zoom, sy = (y * mapDoc.tileSize - cameraY) * zoom;",
    "      drawBlendedTerrainTile(ctx, mapDoc, { x, y, screenX: sx, screenY: sy, tilePixels: tilePx, layer: 'ground', onReady: () => render(), now });",
    "      if (visible.detail && mapDoc.tiles[tileKey(x, y)]?.detail) drawBlendedTerrainTile(ctx, mapDoc, { x, y, screenX: sx, screenY: sy, tilePixels: tilePx, layer: 'detail', alpha: .88, onReady: () => render(), now });",
    "    }",
  ]);
  const newTerrain = block([
    "    const terrainKey = `${mapDoc.id}|${perfTerrainRevision}|${visible.ground ? 1 : 0}${visible.detail ? 1 : 0}|${Math.round(cameraX * 4)}:${Math.round(cameraY * 4)}|${Math.round(zoom * 1000)}|${Math.round(rect.width)}x${Math.round(rect.height)}`;",
    "    if (!perfTerrainViewport || perfTerrainViewportKey !== terrainKey || perfTerrainViewport.width !== width || perfTerrainViewport.height !== height) {",
    "      if (!perfTerrainViewport) perfTerrainViewport = document.createElement('canvas');",
    "      perfTerrainViewport.width = width; perfTerrainViewport.height = height;",
    "      const terrainCtx = perfTerrainViewport.getContext('2d')!; terrainCtx.setTransform(dpr, 0, 0, dpr, 0, 0); terrainCtx.clearRect(0, 0, rect.width, rect.height);",
    "      if (visible.ground) for (let y = startY; y <= endY; y++) for (let x = startX; x <= endX; x++) {",
    "        const sx = (x * mapDoc.tileSize - cameraX) * zoom, sy = (y * mapDoc.tileSize - cameraY) * zoom;",
    "        drawBlendedTerrainTile(terrainCtx, mapDoc, { x, y, screenX: sx, screenY: sy, tilePixels: tilePx, layer: 'ground', onReady: () => { perfTerrainViewportKey = ''; scheduleEditorRender(); }, now });",
    "        if (visible.detail && mapDoc.tiles[tileKey(x, y)]?.detail) drawBlendedTerrainTile(terrainCtx, mapDoc, { x, y, screenX: sx, screenY: sy, tilePixels: tilePx, layer: 'detail', alpha: .88, onReady: () => { perfTerrainViewportKey = ''; scheduleEditorRender(); }, now });",
    "      }",
    "      perfTerrainViewportKey = terrainKey;",
    "    }",
    "    if (perfTerrainViewport) ctx.drawImage(perfTerrainViewport, 0, 0, width, height, 0, 0, rect.width, rect.height);",
  ]);
  code = required(code, oldTerrain, newTerrain, 'viewport terrain cache');

  const oldObjects = block([
    "    if (visible.objects) for (const object of visibleObjectsForViewport().sort((a, b) => a.y - b.y)) {",
    "      const asset = getPaletteEntry(object.assetId);",
    "      drawConfiguredObject(ctx, asset, {",
    "        object, x: ((object.x + .5) * mapDoc.tileSize - cameraX) * zoom, y: ((object.y + 1) * mapDoc.tileSize - cameraY) * zoom,",
    "        tilePixels: tilePx, scale: object.scale ?? 1, selected: selectionHas('object', object.id), showHitbox: collisionVisible || layer === 'collision', showLight: true, onReady: scheduleEditorRender, now,",
    "      });",
    "    }",
  ]);
  const newObjects = block([
    "    if (visible.objects) {",
    "      const objectValues = visibleObjectsForViewport().sort((a, b) => a.y - b.y);",
    "      const selectedIds = selectionSet();",
    "      const staticValues = objectValues.filter((object) => !selectedIds.has(`object:${object.id}`) && !getPaletteEntry(object.assetId).sprite?.animation?.frames.length);",
    "      const dynamicValues = objectValues.filter((object) => selectedIds.has(`object:${object.id}`) || Boolean(getPaletteEntry(object.assetId).sprite?.animation?.frames.length));",
    "      const objectKey = `${mapDoc.id}|${perfObjectRevision}|${perfSelectionSignature}|${collisionVisible ? 1 : 0}|${layer}|${Math.round(cameraX * 4)}:${Math.round(cameraY * 4)}|${Math.round(zoom * 1000)}|${Math.round(rect.width)}x${Math.round(rect.height)}`;",
    "      if (!perfObjectViewport || perfObjectViewportKey !== objectKey || perfObjectViewport.width !== width || perfObjectViewport.height !== height) {",
    "        if (!perfObjectViewport) perfObjectViewport = document.createElement('canvas'); perfObjectViewport.width = width; perfObjectViewport.height = height;",
    "        const objectCtx = perfObjectViewport.getContext('2d')!; objectCtx.setTransform(dpr, 0, 0, dpr, 0, 0); objectCtx.clearRect(0, 0, rect.width, rect.height);",
    "        for (const object of staticValues) { const asset = getPaletteEntry(object.assetId); drawConfiguredObject(objectCtx, asset, { object, x: ((object.x + .5) * mapDoc.tileSize - cameraX) * zoom, y: ((object.y + 1) * mapDoc.tileSize - cameraY) * zoom, tilePixels: tilePx, scale: object.scale ?? 1, selected: false, showHitbox: collisionVisible || layer === 'collision', showLight: true, onReady: () => { perfObjectViewportKey = ''; scheduleEditorRender(); }, now }); }",
    "        perfObjectViewportKey = objectKey;",
    "      }",
    "      if (perfObjectViewport) ctx.drawImage(perfObjectViewport, 0, 0, width, height, 0, 0, rect.width, rect.height);",
    "      for (const object of dynamicValues) { const asset = getPaletteEntry(object.assetId); drawConfiguredObject(ctx, asset, { object, x: ((object.x + .5) * mapDoc.tileSize - cameraX) * zoom, y: ((object.y + 1) * mapDoc.tileSize - cameraY) * zoom, tilePixels: tilePx, scale: object.scale ?? 1, selected: selectionHas('object', object.id), showHitbox: collisionVisible || layer === 'collision', showLight: true, onReady: scheduleEditorRender, now }); }",
    "    }",
  ]);
  code = required(code, oldObjects, newObjects, 'static object viewport cache');

  code = required(
    code,
    "    assetGrid.querySelectorAll<HTMLCanvasElement>('canvas[data-asset]').forEach((canvasNode) => {\n      const value = fastAssetById(canvasNode.dataset.asset); if (value) drawAssetThumbnail(canvasNode, value, now);\n    });",
    block([
      "    const gridRect = assetGrid.getBoundingClientRect();",
      "    assetGrid.querySelectorAll<HTMLCanvasElement>('canvas[data-asset]').forEach((canvasNode) => {",
      "      const rect = canvasNode.getBoundingClientRect(); if (rect.bottom < gridRect.top - 100 || rect.top > gridRect.bottom + 100) return;",
      "      const value = fastAssetById(canvasNode.dataset.asset); if (value) drawAssetThumbnail(canvasNode, value, now);",
      "    });",
    ]),
    'visible thumbnail rendering',
  );

  code = required(code, "  window.addEventListener('ascension-asset-preset-change', () => render());", "  window.addEventListener('ascension-asset-preset-change', () => { invalidateObjectViewport(); scheduleEditorRender(); });", 'asset preset cache invalidation');
  code = required(code, "  refreshAll(); requestAnimationFrame(animationLoop);", "  refreshAll(); scheduleSpatialIndex(); requestAnimationFrame(animationLoop);", 'idle spatial warmup');

  return code;
}

export function editorInteractionV2Plugin() {
  return {
    name: 'ascension-editor-interaction-v2',
    enforce: 'pre' as const,
    transform(source: string, id: string) {
      const clean = id.split('?')[0].replace(/\\/g, '/');
      if (clean.endsWith('/src/editor/map/mapEditorProApp.ts')) return { code: optimizeEditor(source), map: null };
      return null;
    },
  };
}
