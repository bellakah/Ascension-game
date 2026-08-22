const lines = (values: string[]) => values.join('\n');

function replaceRequired(code: string, search: string, replacement: string, label: string) {
  if (!code.includes(search)) throw new Error(`[editor-performance] Anchor not found: ${label}`);
  return code.replace(search, replacement);
}

function optimizeMapEditor(source: string) {
  let code = source;

  code = replaceRequired(
    code,
    "const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;",
    "const clone = <T>(value: T): T => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;",
    'structured clone',
  );

  code = replaceRequired(
    code,
    "  const previewPublisher = createMapPreviewPublisher();",
    lines([
      "  const previewPublisher = createMapPreviewPublisher();",
      "",
      "  // Performance indexes: keep large maps responsive without changing map data.",
      "  const PERF_BUCKET_SIZE = 8;",
      "  const PERF_ASSET_BATCH = 72;",
      "  let perfSpatialDirty = true;",
      "  let perfObjectSource: MapObject[] | null = null;",
      "  let perfObjectLength = -1;",
      "  let perfObjectById = new Map<string, MapObject>();",
      "  let perfObjectBuckets = new Map<string, MapObject[]>();",
      "  let perfAssetIndexLength = -1;",
      "  let perfAssetById = new Map<string, MapPaletteEntry>();",
      "  let perfAssetSearch = new Map<string, string>();",
      "  let assetBatchLimit = PERF_ASSET_BATCH;",
      "  let minimapBase: HTMLCanvasElement | null = null;",
      "  let minimapBaseKey = '';",
      "  let scheduledRenderFrame = 0;",
      "",
      "  const fastAssetById = (id?: string | null) => {",
      "    if (!id) return undefined;",
      "    if (perfAssetIndexLength !== MAP_PALETTE_ENTRIES.length) {",
      "      perfAssetIndexLength = MAP_PALETTE_ENTRIES.length;",
      "      perfAssetById = new Map(MAP_PALETTE_ENTRIES.map((value) => [value.id, value]));",
      "      perfAssetSearch = new Map(MAP_PALETTE_ENTRIES.map((value) => [value.id, `${value.label} ${value.description} ${(value.tags ?? []).join(' ')}`.toLocaleLowerCase('pt-BR')]));",
      "    }",
      "    return perfAssetById.get(id);",
      "  };",
      "",
      "  const fastAssetSearchText = (value: MapPaletteEntry) => { fastAssetById(value.id); return perfAssetSearch.get(value.id) ?? ''; };",
      "  const perfBucketKey = (x: number, y: number) => `${x}:${y}`;",
      "  const invalidatePerfIndexes = () => { perfSpatialDirty = true; minimapBaseKey = ''; };",
      "  const scheduleEditorRender = () => {",
      "    if (scheduledRenderFrame) return;",
      "    scheduledRenderFrame = requestAnimationFrame(() => { scheduledRenderFrame = 0; render(); });",
      "  };",
      "",
      "  const rebuildObjectIndex = () => {",
      "    if (!perfSpatialDirty && perfObjectSource === mapDoc.objects && perfObjectLength === mapDoc.objects.length) return;",
      "    perfSpatialDirty = false; perfObjectSource = mapDoc.objects; perfObjectLength = mapDoc.objects.length;",
      "    perfObjectById = new Map(); perfObjectBuckets = new Map();",
      "    for (const object of mapDoc.objects) {",
      "      perfObjectById.set(object.id, object);",
      "      const bounds = objectVisualBounds(getPaletteEntry(object.assetId), object);",
      "      const minX = Math.floor(bounds.x / PERF_BUCKET_SIZE), minY = Math.floor(bounds.y / PERF_BUCKET_SIZE);",
      "      const maxX = Math.floor((bounds.x + Math.max(.01, bounds.width)) / PERF_BUCKET_SIZE), maxY = Math.floor((bounds.y + Math.max(.01, bounds.height)) / PERF_BUCKET_SIZE);",
      "      for (let by = minY; by <= maxY; by++) for (let bx = minX; bx <= maxX; bx++) {",
      "        const key = perfBucketKey(bx, by), bucket = perfObjectBuckets.get(key);",
      "        if (bucket) bucket.push(object); else perfObjectBuckets.set(key, [object]);",
      "      }",
      "    }",
      "  };",
      "",
      "  const objectCandidatesInBox = (box: { x: number; y: number; width: number; height: number }) => {",
      "    rebuildObjectIndex();",
      "    const values = new Map<string, MapObject>();",
      "    const minX = Math.floor(box.x / PERF_BUCKET_SIZE), minY = Math.floor(box.y / PERF_BUCKET_SIZE);",
      "    const maxX = Math.floor((box.x + box.width) / PERF_BUCKET_SIZE), maxY = Math.floor((box.y + box.height) / PERF_BUCKET_SIZE);",
      "    for (let by = minY; by <= maxY; by++) for (let bx = minX; bx <= maxX; bx++) {",
      "      for (const object of perfObjectBuckets.get(perfBucketKey(bx, by)) ?? []) values.set(object.id, object);",
      "    }",
      "    return [...values.values()];",
      "  };",
      "",
      "  const visibleObjectsForViewport = () => {",
      "    const margin = 4;",
      "    const box = {",
      "      x: cameraX / mapDoc.tileSize - margin, y: cameraY / mapDoc.tileSize - margin,",
      "      width: canvas.clientWidth / zoom / mapDoc.tileSize + margin * 2,",
      "      height: canvas.clientHeight / zoom / mapDoc.tileSize + margin * 2,",
      "    };",
      "    const values = new Map(objectCandidatesInBox(box).map((object) => [object.id, object]));",
      "    rebuildObjectIndex();",
      "    for (const item of selection) if (item.kind === 'object') { const object = perfObjectById.get(item.id); if (object) values.set(object.id, object); }",
      "    return [...values.values()];",
      "  };",
    ]),
    'performance helpers',
  );

  code = replaceRequired(
    code,
    lines([
      "  const finishMutation = () => {",
      "    if (actionOpen) {",
      "      mapDoc.updatedAt = Date.now();",
      "      markDirty(); schedulePreview();",
      "    }",
      "    actionOpen = false; lastPaintKey = '';",
      "    refreshChrome(); renderInspector(); render();",
      "  };",
    ]),
    lines([
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
    'mutation invalidation',
  );

  code = code.replace("if (undoStack.length > 120) undoStack.shift();", "if (undoStack.length > 80) undoStack.shift();");

  code = replaceRequired(
    code,
    "    mapDoc = clone(snapshot.document); selection = []; markDirty(); schedulePreview(); refreshAll();",
    "    mapDoc = clone(snapshot.document); selection = []; invalidatePerfIndexes(); markDirty(); schedulePreview(); refreshAll();",
    'undo index invalidation',
  );

  code = replaceRequired(
    code,
    lines([
      "  const selectionHas = (kind: SelectionItem['kind'], id: string) => selection.some((item) => item.kind === kind && item.id === id);",
      "  const selectedObjects = () => mapDoc.objects.filter((object) => selectionHas('object', object.id));",
      "  const selectedZones = () => mapDoc.zones.filter((zone) => selectionHas('zone', zone.id));",
      "  const objectRect = (object: MapObject) => objectVisualBounds(getPaletteEntry(object.assetId), object);",
      "  const objectAt = (x: number, y: number) => [...mapDoc.objects].reverse().find((object) => {",
      "    const rect = objectRect(object); return x >= rect.x && y >= rect.y && x <= rect.x + rect.width && y <= rect.y + rect.height;",
      "  }) ?? null;",
      "  const zoneAt = (x: number, y: number) => [...mapDoc.zones].reverse().find((zone) => x >= zone.x && y >= zone.y && x < zone.x + zone.width && y < zone.y + zone.height) ?? null;",
    ]),
    lines([
      "  const selectionHas = (kind: SelectionItem['kind'], id: string) => selection.some((item) => item.kind === kind && item.id === id);",
      "  const objectRect = (object: MapObject) => objectVisualBounds(getPaletteEntry(object.assetId), object);",
      "  const selectedObjects = () => {",
      "    rebuildObjectIndex(); const values: MapObject[] = [];",
      "    for (const item of selection) if (item.kind === 'object') { const object = perfObjectById.get(item.id); if (object) values.push(object); }",
      "    return values;",
      "  };",
      "  const selectedZones = () => {",
      "    if (!selection.some((item) => item.kind === 'zone')) return [];",
      "    const ids = new Set(selection.filter((item) => item.kind === 'zone').map((item) => item.id));",
      "    return mapDoc.zones.filter((zone) => ids.has(zone.id));",
      "  };",
      "  const objectAt = (x: number, y: number) => objectCandidatesInBox({ x: x - .05, y: y - .05, width: .1, height: .1 })",
      "    .sort((a, b) => a.y - b.y).reverse().find((object) => {",
      "      const rect = objectRect(object); return x >= rect.x && y >= rect.y && x <= rect.x + rect.width && y <= rect.y + rect.height;",
      "    }) ?? null;",
      "  const zoneAt = (x: number, y: number) => [...mapDoc.zones].reverse().find((zone) => x >= zone.x && y >= zone.y && x < zone.x + zone.width && y < zone.y + zone.height) ?? null;",
    ]),
    'indexed selection',
  );

  code = replaceRequired(
    code,
    lines([
      "    if (visible.objects) for (const object of [...mapDoc.objects].sort((a, b) => a.y - b.y)) {",
      "      const asset = getPaletteEntry(object.assetId);",
      "      drawConfiguredObject(ctx, asset, {",
      "        object, x: ((object.x + .5) * mapDoc.tileSize - cameraX) * zoom, y: ((object.y + 1) * mapDoc.tileSize - cameraY) * zoom,",
      "        tilePixels: tilePx, scale: object.scale ?? 1, selected: selectionHas('object', object.id), showHitbox: collisionVisible || layer === 'collision', showLight: true, onReady: () => render(), now,",
      "      });",
      "    }",
    ]),
    lines([
      "    if (visible.objects) for (const object of visibleObjectsForViewport().sort((a, b) => a.y - b.y)) {",
      "      const asset = getPaletteEntry(object.assetId);",
      "      drawConfiguredObject(ctx, asset, {",
      "        object, x: ((object.x + .5) * mapDoc.tileSize - cameraX) * zoom, y: ((object.y + 1) * mapDoc.tileSize - cameraY) * zoom,",
      "        tilePixels: tilePx, scale: object.scale ?? 1, selected: selectionHas('object', object.id), showHitbox: collisionVisible || layer === 'collision', showLight: true, onReady: scheduleEditorRender, now,",
      "      });",
      "    }",
    ]),
    'visible object rendering',
  );

  code = replaceRequired(
    code,
    "      mapDoc.collision.forEach((key) => { const point = parseTileKey(key); ctx.fillRect((point.x * mapDoc.tileSize - cameraX) * zoom, (point.y * mapDoc.tileSize - cameraY) * zoom, tilePx, tilePx); });",
    "      mapDoc.collision.forEach((key) => { const point = parseTileKey(key); if (point.x < startX || point.x > endX || point.y < startY || point.y > endY) return; ctx.fillRect((point.x * mapDoc.tileSize - cameraX) * zoom, (point.y * mapDoc.tileSize - cameraY) * zoom, tilePx, tilePx); });",
    'visible collision rendering',
  );

  code = replaceRequired(
    code,
    "      markDirty(); schedulePreview(); renderInspector(); render(); return;",
    "      markDirty(); render(); return;",
    'lightweight object dragging',
  );

  code = replaceRequired(
    code,
    "      mapDoc.objects.forEach((object) => { if (visible.objects && intersects(objectRect(object), box)) hits.push({ kind: 'object', id: object.id }); });",
    "      if (visible.objects) objectCandidatesInBox(box).forEach((object) => { if (intersects(objectRect(object), box)) hits.push({ kind: 'object', id: object.id }); });",
    'marquee spatial query',
  );

  code = replaceRequired(
    code,
    lines([
      "  const renderMinimap = () => {",
      "    if (!minimapVisible || editorMode !== 'map') return;",
      "    const rect = minimapShell.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);",
      "    minimap.width = Math.max(1, Math.floor(rect.width * dpr)); minimap.height = Math.max(1, Math.floor(rect.height * dpr));",
      "    minimap.style.width = `${rect.width}px`; minimap.style.height = `${rect.height}px`;",
      "    minimapCtx.setTransform(dpr, 0, 0, dpr, 0, 0); minimapCtx.clearRect(0, 0, rect.width, rect.height);",
      "    const sx = rect.width / mapDoc.width, sy = rect.height / mapDoc.height;",
      "    minimapCtx.fillStyle = mapDoc.metadata.background || '#456f42'; minimapCtx.fillRect(0, 0, rect.width, rect.height);",
      "    for (const [key, tile] of Object.entries(mapDoc.tiles)) {",
      "      const point = parseTileKey(key), terrain = getPaletteEntry(tile.ground ?? 'grass'); minimapCtx.fillStyle = terrain.color;",
      "      minimapCtx.fillRect(point.x * sx, point.y * sy, Math.ceil(sx), Math.ceil(sy));",
      "    }",
      "    minimapCtx.fillStyle = '#e9f7ff'; mapDoc.objects.forEach((object) => minimapCtx.fillRect(object.x * sx - 1, object.y * sy - 1, 3, 3));",
      "    const view = viewSize(); minimapCtx.strokeStyle = '#72d5ff'; minimapCtx.lineWidth = 1.5;",
      "    minimapCtx.strokeRect(cameraX / mapDoc.tileSize * sx, cameraY / mapDoc.tileSize * sy, view.width / zoom / mapDoc.tileSize * sx, view.height / zoom / mapDoc.tileSize * sy);",
      "  };",
    ]),
    lines([
      "  const renderMinimap = () => {",
      "    if (!minimapVisible || editorMode !== 'map') return;",
      "    const rect = minimapShell.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);",
      "    minimap.width = Math.max(1, Math.floor(rect.width * dpr)); minimap.height = Math.max(1, Math.floor(rect.height * dpr));",
      "    minimap.style.width = `${rect.width}px`; minimap.style.height = `${rect.height}px`;",
      "    minimapCtx.setTransform(dpr, 0, 0, dpr, 0, 0); minimapCtx.clearRect(0, 0, rect.width, rect.height);",
      "    const sx = rect.width / mapDoc.width, sy = rect.height / mapDoc.height;",
      "    const baseKey = `${mapDoc.id}:${mapDoc.updatedAt}:${mapDoc.width}x${mapDoc.height}:${mapDoc.objects.length}:${Math.round(rect.width)}x${Math.round(rect.height)}`;",
      "    if (!minimapBase || minimapBaseKey !== baseKey) {",
      "      minimapBaseKey = baseKey; minimapBase = document.createElement('canvas');",
      "      minimapBase.width = Math.max(1, Math.round(rect.width)); minimapBase.height = Math.max(1, Math.round(rect.height));",
      "      const base = minimapBase.getContext('2d')!;",
      "      base.fillStyle = mapDoc.metadata.background || '#456f42'; base.fillRect(0, 0, rect.width, rect.height);",
      "      for (const [key, tile] of Object.entries(mapDoc.tiles)) {",
      "        const point = parseTileKey(key), terrain = getPaletteEntry(tile.ground ?? 'grass'); base.fillStyle = terrain.color;",
      "        base.fillRect(point.x * sx, point.y * sy, Math.ceil(sx), Math.ceil(sy));",
      "      }",
      "      base.fillStyle = '#e9f7ff'; mapDoc.objects.forEach((object) => base.fillRect(object.x * sx - 1, object.y * sy - 1, 3, 3));",
      "    }",
      "    minimapCtx.drawImage(minimapBase, 0, 0, rect.width, rect.height);",
      "    const view = viewSize(); minimapCtx.strokeStyle = '#72d5ff'; minimapCtx.lineWidth = 1.5;",
      "    minimapCtx.strokeRect(cameraX / mapDoc.tileSize * sx, cameraY / mapDoc.tileSize * sy, view.width / zoom / mapDoc.tileSize * sx, view.height / zoom / mapDoc.tileSize * sy);",
      "  };",
    ]),
    'cached minimap',
  );

  code = replaceRequired(
    code,
    "    return !query || `${value.label} ${value.description} ${(value.tags ?? []).join(' ')}`.toLocaleLowerCase('pt-BR').includes(query);",
    "    return !query || fastAssetSearchText(value).includes(query);",
    'asset search cache',
  );

  code = code.replaceAll(
    "MAP_PALETTE_ENTRIES.find((asset) => asset.id === canvasNode.dataset.asset)",
    "fastAssetById(canvasNode.dataset.asset)",
  );

  code = replaceRequired(
    code,
    "    const values = MAP_PALETTE_ENTRIES.filter(assetVisibleForPanel);",
    "    const allValues = MAP_PALETTE_ENTRIES.filter(assetVisibleForPanel);\n    const values = allValues.slice(0, assetBatchLimit);",
    'asset batching',
  );

  code = replaceRequired(
    code,
    "    assetGrid.querySelectorAll<HTMLElement>('[data-card]').forEach((card) => {",
    lines([
      "    if (allValues.length > values.length) {",
      "      const more = document.createElement('button'); more.id = 'mep-load-more'; more.className = 'mep-load-more';",
      "      more.textContent = `Carregar mais (${allValues.length - values.length})`;",
      "      more.onclick = () => { const top = assetGrid.scrollTop; assetBatchLimit = Math.min(allValues.length, assetBatchLimit + PERF_ASSET_BATCH); renderAssets(); requestAnimationFrame(() => { assetGrid.scrollTop = top; }); };",
      "      assetGrid.appendChild(more);",
      "    }",
      "    let assetScrollFrame = 0;",
      "    assetGrid.onscroll = () => {",
      "      if (assetScrollFrame || assetBatchLimit >= allValues.length || assetGrid.scrollTop + assetGrid.clientHeight < assetGrid.scrollHeight - 180) return;",
      "      assetScrollFrame = requestAnimationFrame(() => { assetScrollFrame = 0; const more = assetGrid.querySelector<HTMLButtonElement>('#mep-load-more'); more?.click(); });",
      "    };",
      "    assetGrid.querySelectorAll<HTMLElement>('[data-card]').forEach((card) => {",
    ]),
    'asset incremental loading',
  );

  code = replaceRequired(
    code,
    "filter.querySelectorAll<HTMLButtonElement>('[data-category]').forEach((button) => button.onclick = () => { category = button.dataset.category as AssetCategory['id']; renderFilters(); renderAssets(); });",
    "filter.querySelectorAll<HTMLButtonElement>('[data-category]').forEach((button) => button.onclick = () => { category = button.dataset.category as AssetCategory['id']; assetBatchLimit = PERF_ASSET_BATCH; renderFilters(); renderAssets(); });",
    'asset batch reset on category',
  );

  code = replaceRequired(
    code,
    "    panelMode = mode; localStorage.setItem(UI_PANEL_KEY, mode); panel.classList.remove('hidden');",
    "    panelMode = mode; assetBatchLimit = PERF_ASSET_BATCH; localStorage.setItem(UI_PANEL_KEY, mode); panel.classList.remove('hidden');",
    'asset batch reset on panel',
  );

  code = replaceRequired(
    code,
    "  searchInput.oninput = () => { assetSearch = searchInput.value; renderAssets(); };",
    "  let assetSearchDebounce = 0; searchInput.oninput = () => { clearTimeout(assetSearchDebounce); assetSearchDebounce = window.setTimeout(() => { assetSearch = searchInput.value; assetBatchLimit = PERF_ASSET_BATCH; renderAssets(); }, 120); };",
    'debounced asset search',
  );

  code = replaceRequired(
    code,
    "    const queue = [{ x, y }], seen = new Set<string>();\n    while (queue.length) {\n      const point = queue.shift()!; if (!validTile(point.x, point.y)) continue;",
    "    const queue = [{ x, y }], seen = new Set<string>(); let queueIndex = 0;\n    while (queueIndex < queue.length) {\n      const point = queue[queueIndex++]; if (!validTile(point.x, point.y)) continue;",
    'linear flood fill queue',
  );

  code = replaceRequired(
    code,
    "  preloadMapAssets(MAP_PALETTE_ENTRIES, render);",
    "  preloadMapAssets(MAP_PALETTE_ENTRIES.filter((value) => value.palette === 'terrain').slice(0, 16), scheduleEditorRender);",
    'lazy asset preload',
  );

  code = replaceRequired(
    code,
    lines([
      "  const animationLoop = (time: number) => {",
      "    if (MAP_PALETTE_ENTRIES.some((value) => value.sprite?.animation?.frames.length)) render(time);",
      "    if (time - thumbnailTimer > 120) { renderAssetCanvases(); thumbnailTimer = time; }",
      "    requestAnimationFrame(animationLoop);",
      "  };",
    ]),
    lines([
      "  let lastMapAnimationFrame = 0;",
      "  const animationLoop = (time: number) => {",
      "    if (!document.hidden && time - lastMapAnimationFrame > 120 && MAP_PALETTE_ENTRIES.some((value) => value.sprite?.animation?.frames.length)) { render(time); lastMapAnimationFrame = time; }",
      "    if (!document.hidden && !panel.classList.contains('hidden') && time - thumbnailTimer > 280) { renderAssetCanvases(); thumbnailTimer = time; }",
      "    requestAnimationFrame(animationLoop);",
      "  };",
    ]),
    'throttled animation loop',
  );

  return code;
}

function optimizeObjectRenderer(source: string) {
  let code = source;

  code = replaceRequired(
    code,
    "export type DrawConfiguredObjectOptions = DrawObjectOptions & {\n  object: MapObject;\n  showHitbox?: boolean;\n  showLight?: boolean;\n};",
    "export type DrawConfiguredObjectOptions = DrawObjectOptions & {\n  object: MapObject;\n  showHitbox?: boolean;\n  showLight?: boolean;\n};\n\nconst lightTextureCache = new Map<string, HTMLCanvasElement>();",
    'light cache declaration',
  );

  const oldLight = lines([
    "  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);",
    "  gradient.addColorStop(0, `rgba(255,224,145,${Math.min(.5, .36 * preset.light.intensity)})`);",
    "  gradient.addColorStop(.45, `rgba(255,195,94,${Math.min(.25, .16 * preset.light.intensity)})`);",
    "  gradient.addColorStop(1, 'rgba(255,190,80,0)');",
    "  ctx.save();",
    "  ctx.globalCompositeOperation = 'screen';",
    "  ctx.fillStyle = gradient;",
    "  ctx.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);",
    "  ctx.restore();",
  ]);
  const newLight = lines([
    "  const roundedRadius = Math.max(8, Math.round(radius / 4) * 4);",
    "  const intensity = Math.round(preset.light.intensity * 20) / 20;",
    "  const cacheKey = `${roundedRadius}:${intensity}`;",
    "  let glow = lightTextureCache.get(cacheKey);",
    "  if (!glow) {",
    "    glow = document.createElement('canvas'); glow.width = roundedRadius * 2; glow.height = roundedRadius * 2;",
    "    const glowCtx = glow.getContext('2d')!, c = roundedRadius;",
    "    const gradient = glowCtx.createRadialGradient(c, c, 0, c, c, roundedRadius);",
    "    gradient.addColorStop(0, `rgba(255,224,145,${Math.min(.5, .36 * intensity)})`);",
    "    gradient.addColorStop(.45, `rgba(255,195,94,${Math.min(.25, .16 * intensity)})`);",
    "    gradient.addColorStop(1, 'rgba(255,190,80,0)');",
    "    glowCtx.fillStyle = gradient; glowCtx.fillRect(0, 0, glow.width, glow.height); lightTextureCache.set(cacheKey, glow);",
    "  }",
    "  ctx.save(); ctx.globalCompositeOperation = 'screen';",
    "  ctx.drawImage(glow, centerX - radius, centerY - radius, radius * 2, radius * 2);",
    "  ctx.restore();",
  ]);
  code = replaceRequired(code, oldLight, newLight, 'cached object lights');

  code = replaceRequired(
    code,
    lines([
      "export function drawConfiguredObject(ctx: CanvasRenderingContext2D, entry: MapPaletteEntry, options: DrawConfiguredObjectOptions) {",
      "  drawShadow(ctx, entry, options);",
      "  const stretched = drawStretchImage(ctx, entry, options);",
      "  if (!stretched) drawObjectAsset(ctx, entry, options);",
      "  drawLight(ctx, entry, options);",
      "  drawHitbox(ctx, entry, options);",
      "}",
    ]),
    lines([
      "export function drawConfiguredObject(ctx: CanvasRenderingContext2D, entry: MapPaletteEntry, options: DrawConfiguredObjectOptions) {",
      "  const bounds = objectVisualBounds(entry, options.object);",
      "  const width = Math.max(1, bounds.width * options.tilePixels), height = Math.max(1, bounds.height * options.tilePixels);",
      "  const left = options.x - width * (entry.sprite?.anchorX ?? .5), top = options.y - height * (entry.sprite?.anchorY ?? 1);",
      "  const lightMargin = getAssetPreset(entry).light.enabled ? Math.max(0, getAssetPreset(entry).light.radius * options.tilePixels) : 24;",
      "  const canvasWidth = ctx.canvas.width / Math.max(1, devicePixelRatio || 1), canvasHeight = ctx.canvas.height / Math.max(1, devicePixelRatio || 1);",
      "  if (left + width + lightMargin < 0 || top + height + lightMargin < 0 || left - lightMargin > canvasWidth || top - lightMargin > canvasHeight) return;",
      "  drawShadow(ctx, entry, options);",
      "  const stretched = drawStretchImage(ctx, entry, options);",
      "  if (!stretched) drawObjectAsset(ctx, entry, options);",
      "  drawLight(ctx, entry, options);",
      "  drawHitbox(ctx, entry, options);",
      "}",
    ]),
    'offscreen object culling',
  );

  return code;
}

export function editorPerformancePlugin() {
  return {
    name: 'ascension-editor-performance',
    enforce: 'pre' as const,
    transform(source: string, id: string) {
      const clean = id.split('?')[0].replace(/\\/g, '/');
      if (clean.endsWith('/src/editor/map/mapEditorProApp.ts')) return { code: optimizeMapEditor(source), map: null };
      if (clean.endsWith('/src/editor/map/mapObjectRenderer.ts')) return { code: optimizeObjectRenderer(source), map: null };
      return null;
    },
  };
}
