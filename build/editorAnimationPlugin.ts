const replaceRequired = (code: string, search: string, replacement: string, label: string) => {
  if (!code.includes(search)) throw new Error(`[editor-animation] Anchor not found: ${label}`)
  return code.replace(search, replacement)
}

const block = (lines: string[]) => lines.join('\n')

function transformAssetRenderer(source: string) {
  let code = source
  code = replaceRequired(
    code,
    "import type { MapPaletteEntry, MapSpriteRect } from './mapEditorTypes';",
    block([
      "import type { MapPaletteEntry, MapSpriteRect } from './mapEditorTypes';",
      "import { activeAnimationFrame } from './mapAnimationRuntime';",
    ]),
    'animation runtime import',
  )

  const oldActive = block([
    "function activeSourceRect(entry: MapPaletteEntry, now = performance.now()): MapSpriteRect | null {",
    "  const sprite = entry.sprite;",
    "  if (!sprite) return null;",
    "  const animation = sprite.animation;",
    "  if (!animation?.frames.length) return sprite.sourceRect ?? null;",
    "",
    "  const frames = animation.frames;",
    "  const defaultDuration = 1000 / Math.max(1, animation.fps || 1);",
    "  const durations = frames.map((frame) => Math.max(16, frame.durationMs ?? defaultDuration));",
    "  const total = durations.reduce((sum, value) => sum + value, 0);",
    "  let cursor = animation.loop ? now % total : Math.min(now, Math.max(0, total - 1));",
    "  for (let index = 0; index < frames.length; index++) {",
    "    if (cursor < durations[index]) return frames[index];",
    "    cursor -= durations[index];",
    "  }",
    "  return frames[frames.length - 1];",
    "}",
  ])
  code = replaceRequired(
    code,
    oldActive,
    block([
      "function activeSourceRect(entry: MapPaletteEntry, now = performance.now(), animationSeed = ''): MapSpriteRect | null {",
      "  const sprite = entry.sprite;",
      "  if (!sprite) return null;",
      "  const animation = sprite.animation;",
      "  if (!animation?.frames.length) return sprite.sourceRect ?? null;",
      "  return activeAnimationFrame(animation, now, animationSeed) ?? sprite.sourceRect ?? null;",
      "}",
    ]),
    'advanced frame selection',
  )
  code = replaceRequired(code, "  now?: number,\n) {\n  const rect = activeSourceRect(entry, now);", "  now?: number,\n  animationSeed = '',\n) {\n  const rect = activeSourceRect(entry, now, animationSeed);", 'sprite animation seed')
  code = replaceRequired(code, "  now?: number;\n};", "  now?: number;\n  animationSeed?: string;\n};", 'object animation seed option')
  code = replaceRequired(code, "    drawSpriteImage(ctx, image, entry, left, top, width, height, options.now);", "    drawSpriteImage(ctx, image, entry, left, top, width, height, options.now, options.animationSeed);", 'object seeded animation')
  return code
}

function transformObjectRenderer(source: string) {
  return replaceRequired(
    source,
    "  if (!stretched) drawObjectAsset(ctx, entry, options);",
    "  if (!stretched) drawObjectAsset(ctx, entry, { ...options, animationSeed: options.object.id });",
    'stable animation phase per object',
  )
}

function transformProEditor(source: string) {
  let code = source
  code = replaceRequired(
    code,
    "import { openMapAssetStudio } from './mapAssetStudio';",
    block([
      "import { openMapAssetStudio } from './mapAssetStudio';",
      "import { openMapAnimationStudio } from './mapAnimationStudio';",
    ]),
    'animation studio import',
  )
  code = replaceRequired(
    code,
    "function openFilePicker(accept: string, onFile: (file: File) => void) {\n  const input = document.createElement('input'); input.type = 'file'; input.accept = accept;\n  input.onchange = () => { const file = input.files?.[0]; if (file) onFile(file); };\n  input.click();\n}",
    block([
      "function openFilePicker(accept: string, onFile: (file: File) => void) {",
      "  const input = document.createElement('input'); input.type = 'file'; input.accept = accept;",
      "  input.onchange = () => { const file = input.files?.[0]; if (file) onFile(file); };",
      "  input.click();",
      "}",
      "",
      "function openFilesPicker(accept: string, onFiles: (files: File[]) => void) {",
      "  const input = document.createElement('input'); input.type = 'file'; input.accept = accept; input.multiple = true;",
      "  input.onchange = () => { const files = [...(input.files ?? [])]; if (files.length) onFiles(files); };",
      "  input.click();",
      "}",
    ]),
    'multi frame file picker',
  )
  code = replaceRequired(code, "  let thumbnailTimer = 0;", "  let thumbnailTimer = 0;\n  let animationsPaused = false;", 'animation pause state')
  code = replaceRequired(
    code,
    '<button id="mep-import-asset">Importar imagem / spritesheet</button><button id="mep-open-game">Abrir jogo</button>',
    '<button id="mep-import-asset">Importar imagem / spritesheet</button><button id="mep-import-animation">▶ Importar animação / frames</button><button id="mep-toggle-animations">❚❚ Pausar animações</button><button id="mep-open-game">Abrir jogo</button>',
    'animation menu items',
  )
  code = replaceRequired(
    code,
    '<button id="mep-import-auto"><strong>Detectar objetos</strong><span>O editor procura árvores, pedras, móveis e outros elementos separados e cria os objetos de uma vez.</span></button>',
    '<button id="mep-import-auto"><strong>Detectar objetos</strong><span>O editor procura árvores, pedras, móveis e outros elementos separados e cria os objetos de uma vez.</span></button><button id="mep-import-animation-one"><strong>Animation Studio</strong><span>Escolha frames livremente, ajuste timeline, FPS, duração, ping-pong e sincronização.</span></button>',
    'animation import choice',
  )
  code = replaceRequired(
    code,
    "    modal.querySelector<HTMLButtonElement>('#mep-import-auto')!.onclick = () => { modal.remove(); void openAutoObjectSlicer(file, onCreated).catch((error) => showToast(error instanceof Error ? error.message : 'Falha ao detectar objetos.')); };",
    block([
      "    modal.querySelector<HTMLButtonElement>('#mep-import-auto')!.onclick = () => { modal.remove(); void openAutoObjectSlicer(file, onCreated).catch((error) => showToast(error instanceof Error ? error.message : 'Falha ao detectar objetos.')); };",
      "    modal.querySelector<HTMLButtonElement>('#mep-import-animation-one')!.onclick = () => { modal.remove(); void openMapAnimationStudio([file], onCreated).catch((error) => showToast(error instanceof Error ? error.message : 'Falha ao abrir Animation Studio.')); };",
    ]),
    'single sheet animation handler',
  )
  code = replaceRequired(
    code,
    "  root.querySelector<HTMLButtonElement>('#mep-import-asset')!.onclick = () => openFilePicker('image/png,image/webp,image/jpeg', openImportChoice);",
    block([
      "  root.querySelector<HTMLButtonElement>('#mep-import-asset')!.onclick = () => openFilePicker('image/png,image/webp,image/jpeg', openImportChoice);",
      "  root.querySelector<HTMLButtonElement>('#mep-import-animation')!.onclick = () => openFilesPicker('image/png,image/webp,image/jpeg', (files) => {",
      "    void openMapAnimationStudio(files, (entries) => { void hydrateAssetLibraryV2().then(() => { renderAssets(); preloadMapAssets(entries, scheduleEditorRender); if (entries[0]) chooseEntry(entries[0]); showToast(`${entries.length} animação criada.`); }); }).catch((error) => showToast(error instanceof Error ? error.message : 'Falha ao importar animação.'));",
      "  });",
      "  root.querySelector<HTMLButtonElement>('#mep-toggle-animations')!.onclick = (event) => { animationsPaused = !animationsPaused; (event.currentTarget as HTMLButtonElement).textContent = animationsPaused ? '▶ Retomar animações' : '❚❚ Pausar animações'; if (!animationsPaused) scheduleEditorRender(); };",
    ]),
    'animation menu handlers',
  )

  const oldLoop = block([
    "  let lastMapAnimationFrame = 0;",
    "  const animationLoop = (time: number) => {",
    "    if (!document.hidden && time - lastMapAnimationFrame > 120 && MAP_PALETTE_ENTRIES.some((value) => value.sprite?.animation?.frames.length)) { render(time); lastMapAnimationFrame = time; }",
    "    if (!document.hidden && !panel.classList.contains('hidden') && time - thumbnailTimer > 280) { renderAssetCanvases(); thumbnailTimer = time; }",
    "    requestAnimationFrame(animationLoop);",
    "  };",
  ])
  if (code.includes(oldLoop)) {
    code = code.replace(oldLoop, block([
      "  let lastMapAnimationFrame = 0;",
      "  const animationLoop = (time: number) => {",
      "    const mapUsesAnimation = !animationsPaused && (mapDoc.objects.some((object) => Boolean(getPaletteEntry(object.assetId).sprite?.animation?.frames.length)) || Object.values(mapDoc.tiles).some((tile) => Boolean(getPaletteEntry(tile.ground ?? 'grass').sprite?.animation?.frames.length || (tile.detail && getPaletteEntry(tile.detail).sprite?.animation?.frames.length))));",
      "    if (!document.hidden && mapUsesAnimation && time - lastMapAnimationFrame > 80) { render(time); lastMapAnimationFrame = time; }",
      "    if (!document.hidden && !panel.classList.contains('hidden') && time - thumbnailTimer > 280) { renderAssetCanvases(); thumbnailTimer = time; }",
      "    requestAnimationFrame(animationLoop);",
      "  };",
    ]))
  }
  return code
}

function transformPublishedRuntime(source: string) {
  let code = source
  code = replaceRequired(
    code,
    "import { parseTileKey, tileKey } from '../editor/map/mapEditorTypes';",
    block([
      "import { parseTileKey, tileKey } from '../editor/map/mapEditorTypes';",
      "import { animationFrameDuration, animationFrameIndex } from '../editor/map/mapAnimationRuntime';",
    ]),
    'published animation helpers import',
  )
  code = replaceRequired(
    code,
    "const FUNCTIONAL_ASSETS = new Set([",
    block([
      "const stableHash = (value: string) => { let hash = 2166136261; for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); } return hash >>> 0; };",
      "",
      "const FUNCTIONAL_ASSETS = new Set([",
    ]),
    'published stable hash',
  )

  const oldAnimation = block([
    "  const animation = spriteDef.animation;",
    "  if (animation?.frames.length) {",
    "    const textures = animation.frames.map((frame: MapAnimationFrame) => frameCanvas(entry, frame)).filter((canvas): canvas is HTMLCanvasElement => Boolean(canvas)).map((canvas) => Texture.from(canvas));",
    "    if (textures.length) {",
    "      const animated = new AnimatedSprite(textures);",
    "      animated.anchor.set(spriteDef.anchorX ?? .5, spriteDef.anchorY ?? 1);",
    "      animated.position.set((object.x + .5) * tileSize, (object.y + 1) * tileSize);",
    "      animated.width = tileSize * (spriteDef.widthTiles ?? 1) * (object.scale ?? 1);",
    "      animated.height = tileSize * (spriteDef.heightTiles ?? 1) * (object.scale ?? 1);",
    "      animated.animationSpeed = Math.max(.01, animation.fps / 60);",
    "      animated.loop = animation.loop;",
    "      animated.rotation = (object.rotation ?? 0) * Math.PI / 180;",
    "      animated.play();",
    "      return animated;",
    "    }",
    "  }",
  ])
  const newAnimation = block([
    "  const animation = spriteDef.animation;",
    "  if (animation?.frames.length) {",
    "    const baseTextures = animation.frames.map((frame: MapAnimationFrame) => frameCanvas(entry, frame)).filter((canvas): canvas is HTMLCanvasElement => Boolean(canvas)).map((canvas) => Texture.from(canvas));",
    "    if (baseTextures.length) {",
    "      const mode = animation.playback ?? (animation.loop ? 'loop' : 'once');",
    "      let order = Array.from({ length: baseTextures.length }, (_, index) => index);",
    "      if (mode === 'pingpong' && order.length > 2) order = [...order, ...order.slice(1, -1).reverse()];",
    "      if (mode === 'random' && order.length > 1) { const seed = stableHash(object.id); order = Array.from({ length: Math.max(8, baseTextures.length * 3) }, (_, index) => stableHash(`${seed}:${index}`) % baseTextures.length); }",
    "      const timedFrames = order.map((index) => ({ texture: baseTextures[index], time: animationFrameDuration(animation, animation.frames[index]) }));",
    "      const animated = new AnimatedSprite(timedFrames as any);",
    "      animated.anchor.set(spriteDef.anchorX ?? .5, spriteDef.anchorY ?? 1);",
    "      animated.position.set((object.x + .5) * tileSize, (object.y + 1) * tileSize);",
    "      animated.width = tileSize * (spriteDef.widthTiles ?? 1) * (object.scale ?? 1);",
    "      animated.height = tileSize * (spriteDef.heightTiles ?? 1) * (object.scale ?? 1);",
    "      animated.animationSpeed = 1; animated.loop = mode !== 'once';",
    "      animated.rotation = (object.rotation ?? 0) * Math.PI / 180;",
    "      const start = (animation.sync ?? 'global') === 'random' ? stableHash(object.id) % Math.max(1, timedFrames.length) : 0;",
    "      animated.gotoAndPlay(start);",
    "      return animated;",
    "    }",
    "  }",
  ])
  code = replaceRequired(code, oldAnimation, newAnimation, 'published object playback modes')

  const overlayHelper = block([
    "function addAnimatedTerrainOverlay(view: Container, map: AscensionMapDocument) {",
    "  const animatedIds = new Set(MAP_PALETTE_ENTRIES.filter((entry) => entry.palette === 'terrain' && entry.sprite?.animation?.frames.length).map((entry) => entry.id));",
    "  if (!animatedIds.size) return;",
    "  const dynamic = new Set<string>();",
    "  for (const [key, tile] of Object.entries(map.tiles)) {",
    "    if (!animatedIds.has(tile.ground ?? 'grass') && !(tile.detail && animatedIds.has(tile.detail))) continue;",
    "    const point = parseTileKey(key); for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const x = point.x + ox, y = point.y + oy; if (x >= 0 && y >= 0 && x < map.width && y < map.height) dynamic.add(tileKey(x, y)); }",
    "  }",
    "  if (!dynamic.size) return;",
    "  const chunkPixels = 1024, tileSize = map.tileSize;",
    "  const groups = new Map<string, Array<{ x: number; y: number }>>();",
    "  for (const key of dynamic) { const point = parseTileKey(key), cx = Math.floor((point.x * tileSize) / chunkPixels) * chunkPixels, cy = Math.floor((point.y * tileSize) / chunkPixels) * chunkPixels, groupKey = `${cx},${cy}`; const list = groups.get(groupKey) ?? []; list.push(point); groups.set(groupKey, list); }",
    "  const renderers: Array<(now: number) => void> = [];",
    "  for (const [groupKey, cells] of groups) {",
    "    const [cx, cy] = groupKey.split(',').map(Number), cw = Math.min(chunkPixels, map.width * tileSize - cx), ch = Math.min(chunkPixels, map.height * tileSize - cy);",
    "    const canvas = document.createElement('canvas'); canvas.width = cw; canvas.height = ch; const ctx = canvas.getContext('2d'); if (!ctx) continue;",
    "    const sprite = Sprite.from(canvas); sprite.position.set(cx, cy); sprite.zIndex = -999_999; view.addChild(sprite);",
    "    renderers.push((now) => { ctx.clearRect(0, 0, cw, ch); for (const point of cells) { const tile = map.tiles[tileKey(point.x, point.y)] ?? { ground: 'grass' }, px = point.x * tileSize - cx, py = point.y * tileSize - cy; drawBlendedTerrainTile(ctx, map, { x: point.x, y: point.y, screenX: px, screenY: py, tilePixels: tileSize, layer: 'ground', now }); if (tile.detail) drawBlendedTerrainTile(ctx, map, { x: point.x, y: point.y, screenX: px, screenY: py, tilePixels: tileSize, layer: 'detail', alpha: .78, now }); } sprite.texture.source.update(); });",
    "  }",
    "  const usedAnimations = [...animatedIds].map((id) => getPaletteEntry(id).sprite?.animation).filter((value): value is NonNullable<MapPaletteEntry['sprite']>['animation'] => Boolean(value));",
    "  let previous = '';",
    "  const tick = (now: number) => {",
    "    if ((view as Container & { destroyed?: boolean }).destroyed) return;",
    "    const signature = usedAnimations.map((animation, index) => animation ? `${index}:${animationFrameIndex(animation, now, `terrain-${index}`)}` : '').join('|');",
    "    if (signature !== previous) { previous = signature; for (const render of renderers) render(now); }",
    "    requestAnimationFrame(tick);",
    "  };",
    "  requestAnimationFrame(tick);",
    "}",
    "",
  ])
  code = replaceRequired(code, "function buildObstacles(map: AscensionMapDocument) {", `${overlayHelper}function buildObstacles(map: AscensionMapDocument) {`, 'animated terrain overlay helper')
  code = replaceRequired(code, "  addTerrainChunks(view, map);", "  addTerrainChunks(view, map);\n  addAnimatedTerrainOverlay(view, map);", 'animated terrain overlay hook')
  return code
}

export function editorAnimationPlugin() {
  return {
    name: 'ascension-editor-animation-studio',
    enforce: 'pre' as const,
    transform(source: string, id: string) {
      const clean = id.split('?')[0].replace(/\\/g, '/')
      if (clean.endsWith('/src/editor/map/mapAssetRenderer.ts')) return { code: transformAssetRenderer(source), map: null }
      if (clean.endsWith('/src/editor/map/mapObjectRenderer.ts')) return { code: transformObjectRenderer(source), map: null }
      if (clean.endsWith('/src/editor/map/mapEditorProApp.ts')) return { code: transformProEditor(source), map: null }
      if (clean.endsWith('/src/map/publishedMapRuntime.ts')) return { code: transformPublishedRuntime(source), map: null }
      return null
    },
  }
}
