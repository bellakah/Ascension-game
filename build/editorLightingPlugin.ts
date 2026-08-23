const replaceRequired = (code: string, search: string, replacement: string, label: string) => {
  if (!code.includes(search)) throw new Error(`[editor-lighting] Anchor not found: ${label}`)
  return code.replace(search, replacement)
}

const block = (lines: string[]) => lines.join('\n')

function transformCatalog(source: string) {
  return replaceRequired(
    source,
    "  { id: 'waypoint', palette: 'raw', label: 'Waypoint', icon: '⌖', color: '#e1cb72', description: 'Marcador genérico de posição.', defaultLayer: 'objects', objectKind: 'raw', source: 'ascension' },",
    block([
      "  { id: 'light_point', palette: 'raw', label: 'Ponto de Luz', icon: '☀', color: '#ffd56a', description: 'Luz independente configurável. Acende à noite por padrão.', defaultLayer: 'objects', objectKind: 'raw', folder: 'effects', tags: ['luz', 'iluminação', 'efeito', 'noite'], source: 'ascension' },",
      "  { id: 'waypoint', palette: 'raw', label: 'Waypoint', icon: '⌖', color: '#e1cb72', description: 'Marcador genérico de posição.', defaultLayer: 'objects', objectKind: 'raw', source: 'ascension' },",
    ]),
    'light point catalog entry',
  )
}

function transformConfigurator(source: string) {
  let code = source
  code = replaceRequired(
    code,
    '<div class="pro-two"><label>Alcance<input id="pro-light-radius" type="number" min="0.2" max="12" step="0.1"></label><label>Força<input id="pro-light-intensity" type="number" min="0.1" max="2" step="0.1"></label></div>\n              <p>Quando a luz estiver ligada, arraste o ponto amarelo no preview.</p>',
    '<div class="pro-two"><label>Alcance<input id="pro-light-radius" type="number" min="0.2" max="12" step="0.1"></label><label>Força<input id="pro-light-intensity" type="number" min="0.1" max="2" step="0.1"></label></div>\n              <div class="pro-two"><label>Cor<input id="pro-light-color" type="color"></label><label>Suavidade<input id="pro-light-softness" type="number" min="0.05" max="1" step="0.05"></label></div>\n              <label>Acender<select id="pro-light-activation"><option value="night">Somente à noite</option><option value="always">Sempre</option></select></label>\n              <p>Quando a luz estiver ligada, arraste o ponto amarelo no preview. Cor, alcance e suavidade serão usados no editor e no jogo.</p>',
    'object light controls',
  )
  code = replaceRequired(
    code,
    "    const lightIntensity = backdrop.querySelector<HTMLInputElement>('#pro-light-intensity')!;",
    block([
      "    const lightIntensity = backdrop.querySelector<HTMLInputElement>('#pro-light-intensity')!;",
      "    const lightColor = backdrop.querySelector<HTMLInputElement>('#pro-light-color')!;",
      "    const lightSoftness = backdrop.querySelector<HTMLInputElement>('#pro-light-softness')!;",
      "    const lightActivation = backdrop.querySelector<HTMLSelectElement>('#pro-light-activation')!;",
    ]),
    'object light selectors',
  )
  code = replaceRequired(
    code,
    "      lightIntensity.value = String(preset.light.intensity);",
    block([
      "      lightIntensity.value = String(preset.light.intensity);",
      "      lightColor.value = preset.light.color || '#ffd88a';",
      "      lightSoftness.value = String(preset.light.softness ?? .72);",
      "      lightActivation.value = preset.light.activation === 'always' ? 'always' : 'night';",
    ]),
    'object light sync',
  )
  code = replaceRequired(
    code,
    "        ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(lx, ly, Math.max(12, preset.light.radius * 20), 0, Math.PI * 2); ctx.stroke();\n        ctx.fillStyle = '#ffe48a'; ctx.beginPath(); ctx.arc(lx, ly, 7, 0, Math.PI * 2); ctx.fill();",
    "        ctx.strokeStyle = preset.light.color || '#ffd76a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(lx, ly, Math.max(12, preset.light.radius * 20), 0, Math.PI * 2); ctx.stroke();\n        ctx.fillStyle = preset.light.color || '#ffe48a'; ctx.beginPath(); ctx.arc(lx, ly, 7, 0, Math.PI * 2); ctx.fill();",
    'object light preview color',
  )
  code = replaceRequired(
    code,
    "    lightIntensity.oninput = () => { preset.light.intensity = clamp(Number(lightIntensity.value) || .7, .1, 2); };",
    block([
      "    lightIntensity.oninput = () => { preset.light.intensity = clamp(Number(lightIntensity.value) || .7, .1, 2); render(); };",
      "    lightColor.oninput = () => { preset.light.color = lightColor.value || '#ffd88a'; render(); };",
      "    lightSoftness.oninput = () => { preset.light.softness = clamp(Number(lightSoftness.value) || .72, .05, 1); render(); };",
      "    lightActivation.onchange = () => { preset.light.activation = lightActivation.value === 'always' ? 'always' : 'night'; render(); };",
    ]),
    'object light events',
  )
  return code
}

function transformObjectRenderer(source: string) {
  return replaceRequired(
    source,
    "  if (!preset.light.enabled || options.showLight === false) return;",
    "  if ((window as Window & { __ascensionLightingCompositeActive?: boolean }).__ascensionLightingCompositeActive || !preset.light.enabled || options.showLight === false) return;",
    'disable baked lights when composite layer is active',
  )
}

function transformPublishedRuntime(source: string) {
  return replaceRequired(
    source,
    "  'wolf', 'sludge',",
    "  'wolf', 'sludge', 'light_point',",
    'hide light point markers in published game',
  )
}

function transformGameRuntime(source: string) {
  let code = source
  code = replaceRequired(
    code,
    "import { createMapSystem } from '../map/mapSystem';",
    block([
      "import { createMapSystem } from '../map/mapSystem';",
      "import { getPreparedPublishedWorldRuntime } from '../map/publishedMapRuntime';",
      "import { createGameLightingOverlay } from '../lighting/worldLighting';",
    ]),
    'game lighting imports',
  )
  code = replaceRequired(
    code,
    "    const { world, obstacles } = createWorld();\n    app.stage.addChild(world);",
    block([
      "    const { world, obstacles } = createWorld();",
      "    app.stage.addChild(world);",
      "    const publishedLightingMap = getPreparedPublishedWorldRuntime()?.document ?? null;",
      "    const worldLighting = publishedLightingMap ? createGameLightingOverlay(publishedLightingMap) : null;",
    ]),
    'game lighting initialization',
  )
  code = replaceRequired(
    code,
    "      world.x = Math.max(Math.min(0, app.screen.width - WORLD_W), Math.min(0, app.screen.width / 2 - player.x));\n      world.y = Math.max(Math.min(0, app.screen.height - WORLD_H), Math.min(0, app.screen.height / 2 - player.y));",
    block([
      "      world.x = Math.max(Math.min(0, app.screen.width - WORLD_W), Math.min(0, app.screen.width / 2 - player.x));",
      "      world.y = Math.max(Math.min(0, app.screen.height - WORLD_H), Math.min(0, app.screen.height / 2 - player.y));",
      "      worldLighting?.update(world.x, world.y);",
    ]),
    'game lighting update',
  )
  return code
}

function transformProEditor(source: string) {
  let code = source
  code = replaceRequired(
    code,
    "import { loadPublishedMap, publishMap } from '../../map/publishedMapStore';",
    block([
      "import { loadPublishedMap, publishMap } from '../../map/publishedMapStore';",
      "import { LIGHT_POINT_ASSET_ID, activationFactor, collectMapLights, darknessForHour, getWorldLightingSettings, lightPointDefaults } from '../../lighting/worldLighting';",
    ]),
    'editor lighting imports',
  )
  code = replaceRequired(
    code,
    '<canvas id="mep-object-canvas" class="mep-render-layer mep-object-layer"></canvas><canvas id="mep-canvas" class="mep-render-layer mep-interaction-layer"></canvas>',
    '<canvas id="mep-object-canvas" class="mep-render-layer mep-object-layer"></canvas><canvas id="mep-lighting-canvas" class="mep-render-layer mep-lighting-layer"></canvas><canvas id="mep-canvas" class="mep-render-layer mep-interaction-layer"></canvas>',
    'lighting canvas',
  )
  code = replaceRequired(
    code,
    "  const objectLayerCtx = objectLayerCanvas.getContext('2d')!;",
    block([
      "  const objectLayerCtx = objectLayerCanvas.getContext('2d')!;",
      "  const lightingLayerCanvas = root.querySelector<HTMLCanvasElement>('#mep-lighting-canvas')!;",
      "  const lightingLayerCtx = lightingLayerCanvas.getContext('2d')!;",
    ]),
    'lighting canvas context',
  )
  code = replaceRequired(
    code,
    "  let perfDraggingMoved = false;",
    block([
      "  let perfDraggingMoved = false;",
      "  let lightingPreviewHour = 12;",
      "  let lightingCacheKey = '';",
      "  let lightingCachedLights = collectMapLights(mapDoc);",
      "  let lightingPresetRevision = 0;",
    ]),
    'lighting state',
  )

  const helpers = block([
    "  const lightingHex = (value: string) => {",
    "    const raw = String(value || '#ffd88a').replace('#', ''); const full = raw.length === 3 ? raw.split('').map((part) => part + part).join('') : raw; const numeric = Number.parseInt(full, 16);",
    "    return Number.isFinite(numeric) && full.length === 6 ? { r: (numeric >> 16) & 255, g: (numeric >> 8) & 255, b: numeric & 255 } : { r: 255, g: 216, b: 138 };",
    "  };",
    "  const lightingHourLabel = (hour: number) => { const h = Math.floor(hour) % 24, m = Math.round((hour - Math.floor(hour)) * 60) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };",
    "  const refreshLightingCache = () => {",
    "    const key = `${mapDoc.id}|${mapDoc.updatedAt}|${mapDoc.objects.length}|${lightingPresetRevision}`;",
    "    if (key !== lightingCacheKey) { lightingCacheKey = key; lightingCachedLights = collectMapLights(mapDoc); }",
    "    return lightingCachedLights;",
    "  };",
    "  const renderEditorLightingLayer = () => {",
    "    (window as Window & { __ascensionLightingPreviewHour?: number; __ascensionLightingCompositeActive?: boolean }).__ascensionLightingPreviewHour = lightingPreviewHour;",
    "    (window as Window & { __ascensionLightingPreviewHour?: number; __ascensionLightingCompositeActive?: boolean }).__ascensionLightingCompositeActive = true;",
    "    const rect = stage.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);",
    "    const width = Math.max(1, Math.floor(rect.width * dpr)), height = Math.max(1, Math.floor(rect.height * dpr));",
    "    if (lightingLayerCanvas.width !== width || lightingLayerCanvas.height !== height) { lightingLayerCanvas.width = width; lightingLayerCanvas.height = height; lightingLayerCanvas.style.width = `${rect.width}px`; lightingLayerCanvas.style.height = `${rect.height}px`; }",
    "    lightingLayerCtx.setTransform(dpr, 0, 0, dpr, 0, 0); lightingLayerCtx.clearRect(0, 0, rect.width, rect.height);",
    "    const settings = getWorldLightingSettings(mapDoc), darkness = darknessForHour(settings, lightingPreviewHour), lights = refreshLightingCache();",
    "    if (darkness <= .001 && !lights.some((light) => light.activation === 'always')) return;",
    "    lightingLayerCtx.fillStyle = `rgba(5,10,24,${darkness})`; lightingLayerCtx.fillRect(0, 0, rect.width, rect.height);",
    "    for (const light of lights) {",
    "      const factor = activationFactor(light.activation, lightingPreviewHour); if (factor <= .002) continue;",
    "      const x = (light.x - cameraX) * zoom, y = (light.y - cameraY) * zoom, radius = light.radius * zoom;",
    "      if (x + radius < 0 || y + radius < 0 || x - radius > rect.width || y - radius > rect.height) continue;",
    "      const strength = Math.max(0, Math.min(2, light.intensity * factor)), inner = Math.max(.02, Math.min(.9, 1 - light.softness));",
    "      lightingLayerCtx.save(); lightingLayerCtx.globalCompositeOperation = 'destination-out';",
    "      const cut = lightingLayerCtx.createRadialGradient(x, y, 0, x, y, radius); cut.addColorStop(0, `rgba(0,0,0,${Math.min(1, .92 * strength)})`); cut.addColorStop(inner, `rgba(0,0,0,${Math.min(1, .72 * strength)})`); cut.addColorStop(1, 'rgba(0,0,0,0)');",
    "      lightingLayerCtx.fillStyle = cut; lightingLayerCtx.fillRect(x - radius, y - radius, radius * 2, radius * 2); lightingLayerCtx.restore();",
    "      const color = lightingHex(light.color); lightingLayerCtx.save(); lightingLayerCtx.globalCompositeOperation = 'screen';",
    "      const glow = lightingLayerCtx.createRadialGradient(x, y, 0, x, y, radius); glow.addColorStop(0, `rgba(${color.r},${color.g},${color.b},${Math.min(.6, .3 * strength)})`); glow.addColorStop(inner, `rgba(${color.r},${color.g},${color.b},${Math.min(.3, .12 * strength)})`); glow.addColorStop(1, `rgba(${color.r},${color.g},${color.b},0)`);",
    "      lightingLayerCtx.fillStyle = glow; lightingLayerCtx.fillRect(x - radius, y - radius, radius * 2, radius * 2); lightingLayerCtx.restore();",
    "    }",
    "  };",
    "  window.addEventListener('ascension-asset-preset-change', () => { lightingPresetRevision++; lightingCacheKey = ''; renderEditorLightingLayer(); });",
    "",
  ])
  code = replaceRequired(code, "  const selectionSet = () => {", `${helpers}  const selectionSet = () => {`, 'lighting helpers')
  code = replaceRequired(code, "  const renderMinimap = () => {", "  const renderMinimap = () => {\n    renderEditorLightingLayer();", 'lighting layer render hook')

  code = replaceRequired(
    code,
    "        <button data-rail=\"assets\" data-tip=\"Biblioteca\">▦</button>\n        <button class=\"bottom\" data-rail=\"layers\" data-tip=\"Camadas\">☷</button>",
    "        <button data-rail=\"assets\" data-tip=\"Biblioteca\">▦</button>\n        <button data-rail=\"lighting\" data-tip=\"Iluminação\">☀</button>\n        <button class=\"bottom\" data-rail=\"layers\" data-tip=\"Camadas\">☷</button>",
    'lighting rail button',
  )
  code = code.replace("id === 'minimap' ? minimapVisible : id === 'pan' ? tool === 'pan' : false", "id === 'minimap' ? minimapVisible : id === 'lighting' ? entry.id === LIGHT_POINT_ASSET_ID && tool === 'brush' : id === 'pan' ? tool === 'pan' : false")
  code = replaceRequired(
    code,
    "    if (action === 'pan') { tool = 'pan'; closePanel(); }",
    block([
      "    if (action === 'lighting') { entry = getPaletteEntry(LIGHT_POINT_ASSET_ID); tool = 'brush'; layer = 'objects'; selection = []; lightingPreviewHour = 22; lightingCacheKey = ''; closePanel(); setRightMode(null); }",
      "    if (action === 'pan') { tool = 'pan'; closePanel(); }",
    ]),
    'lighting rail action',
  )

  const lightingContext = block([
    "    if (entry.id === LIGHT_POINT_ASSET_ID && tool === 'brush') {",
    "      const lightingSettings = getWorldLightingSettings(mapDoc);",
    "      contextBar.innerHTML = `<strong>ILUMINAÇÃO</strong><div class=\"group\"><button id=\"mep-light-day\">☀ Dia</button><button id=\"mep-light-night\">☾ Noite</button><label>Prévia<input id=\"mep-light-hour\" type=\"range\" min=\"0\" max=\"23.75\" step=\"0.25\" value=\"${lightingPreviewHour}\"></label><span id=\"mep-light-hour-label\" class=\"mep-lighting-readout\">${lightingHourLabel(lightingPreviewHour)}</span></div><div class=\"group\"><label><input id=\"mep-cycle-enabled\" type=\"checkbox\" ${lightingSettings.enabled ? 'checked' : ''}> Ciclo</label><label>Dia real/min <input id=\"mep-day-length\" type=\"number\" min=\"2\" max=\"1440\" step=\"1\" value=\"${lightingSettings.dayLengthMinutes}\" style=\"width:62px\"></label><label>Noite <input id=\"mep-night-darkness\" type=\"range\" min=\"0\" max=\"90\" value=\"${Math.round(lightingSettings.nightDarkness * 100)}\"></label></div><div class=\"group\"><span style=\"font-size:9px;color:#91afbd\">Clique no mapa para criar um ponto de luz.</span></div><div class=\"mep-spacer\"></div>`;",
    "      const hourInput = contextBar.querySelector<HTMLInputElement>('#mep-light-hour')!, hourLabel = contextBar.querySelector<HTMLElement>('#mep-light-hour-label')!;",
    "      const setPreviewHour = (value: number) => { lightingPreviewHour = ((value % 24) + 24) % 24; hourInput.value = String(lightingPreviewHour); hourLabel.textContent = lightingHourLabel(lightingPreviewHour); renderEditorLightingLayer(); };",
    "      hourInput.oninput = () => setPreviewHour(Number(hourInput.value));",
    "      contextBar.querySelector<HTMLButtonElement>('#mep-light-day')!.onclick = () => setPreviewHour(12); contextBar.querySelector<HTMLButtonElement>('#mep-light-night')!.onclick = () => setPreviewHour(22);",
    "      const saveCycle = (next: Partial<ReturnType<typeof getWorldLightingSettings>>) => { beginMutation('Configurar ciclo de dia e noite'); const current = getWorldLightingSettings(mapDoc); mapDoc.metadata.dayNight = { ...current, ...next }; lightingCacheKey = ''; finishMutation(); renderEditorLightingLayer(); };",
    "      contextBar.querySelector<HTMLInputElement>('#mep-cycle-enabled')!.onchange = (event) => saveCycle({ enabled: (event.currentTarget as HTMLInputElement).checked });",
    "      contextBar.querySelector<HTMLInputElement>('#mep-day-length')!.onchange = (event) => saveCycle({ dayLengthMinutes: Math.max(2, Math.min(1440, Number((event.currentTarget as HTMLInputElement).value) || 30)) });",
    "      contextBar.querySelector<HTMLInputElement>('#mep-night-darkness')!.onchange = (event) => saveCycle({ nightDarkness: Math.max(0, Math.min(.9, Number((event.currentTarget as HTMLInputElement).value) / 100)) });",
    "      return;",
    "    }",
  ])
  code = replaceRequired(code, "    if (tool === 'select') contextBar.innerHTML", `${lightingContext}\n    if (tool === 'select') contextBar.innerHTML`, 'lighting context controls')

  const lightInspector = block([
    "  const renderLightPointInspector = (object: MapObject) => {",
    "    const value = lightPointDefaults(object);",
    "    inspectorBody.innerHTML = `<div class=\"mep-inspector-hero\"><div style=\"width:68px;height:68px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle,${value.color} 0%,${value.color}55 18%,transparent 72%);font-size:28px\">☀</div><div><strong>Ponto de Luz</strong><span>Iluminação independente</span></div></div><div class=\"mep-form-grid\"><label>X<input id=\"mep-light-x\" type=\"number\" step=\"0.1\" value=\"${object.x.toFixed(1)}\"></label><label>Y<input id=\"mep-light-y\" type=\"number\" step=\"0.1\" value=\"${object.y.toFixed(1)}\"></label><label>Cor<input id=\"mep-light-color\" class=\"mep-light-color\" type=\"color\" value=\"${esc(value.color)}\"></label><label>Alcance<input id=\"mep-light-radius\" type=\"number\" min=\"0.2\" max=\"24\" step=\"0.1\" value=\"${value.radius}\"></label><label>Força<input id=\"mep-light-strength\" type=\"number\" min=\"0.05\" max=\"2\" step=\"0.05\" value=\"${value.intensity}\"></label><label>Suavidade<input id=\"mep-light-softness\" type=\"number\" min=\"0.05\" max=\"1\" step=\"0.05\" value=\"${value.softness}\"></label></div><label class=\"mep-field\" style=\"margin-top:8px\">Acender<select id=\"mep-light-activation\"><option value=\"night\" ${value.activation === 'night' ? 'selected' : ''}>Somente à noite</option><option value=\"always\" ${value.activation === 'always' ? 'selected' : ''}>Sempre</option></select></label><div class=\"mep-action-row\"><button id=\"mep-light-delete\" class=\"danger\">Excluir ponto</button></div>`;",
    "    const live = (selector: string, apply: (node: HTMLInputElement | HTMLSelectElement) => void) => { const node = inspectorBody.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!; node.onfocus = () => beginMutation('Editar ponto de luz'); node.oninput = () => { apply(node); lightingCacheKey = ''; scheduleEditorRender(); renderEditorLightingLayer(); }; node.onchange = () => { apply(node); lightingCacheKey = ''; if (actionOpen) finishMutation(); }; };",
    "    live('#mep-light-x', (node) => { object.x = Number(node.value) || 0; }); live('#mep-light-y', (node) => { object.y = Number(node.value) || 0; });",
    "    live('#mep-light-color', (node) => { object.properties = { ...(object.properties ?? {}), lightColor: node.value || '#ffd88a' }; });",
    "    live('#mep-light-radius', (node) => { object.properties = { ...(object.properties ?? {}), lightRadius: Math.max(.2, Math.min(24, Number(node.value) || 4.5)) }; });",
    "    live('#mep-light-strength', (node) => { object.properties = { ...(object.properties ?? {}), lightIntensity: Math.max(.05, Math.min(2, Number(node.value) || .85)) }; });",
    "    live('#mep-light-softness', (node) => { object.properties = { ...(object.properties ?? {}), lightSoftness: Math.max(.05, Math.min(1, Number(node.value) || .75)) }; });",
    "    live('#mep-light-activation', (node) => { object.properties = { ...(object.properties ?? {}), lightActivation: node.value === 'always' ? 'always' : 'night' }; });",
    "    inspectorBody.querySelector<HTMLButtonElement>('#mep-light-delete')!.onclick = () => deleteSelection();",
    "  };",
    "",
  ])
  code = replaceRequired(code, "  const renderObjectInspector = (object: MapObject) => {", `${lightInspector}  const renderObjectInspector = (object: MapObject) => {\n    if (object.assetId === LIGHT_POINT_ASSET_ID) { renderLightPointInspector(object); return; }`, 'light point inspector')

  return code
}

export function editorLightingPlugin() {
  return {
    name: 'ascension-editor-day-night-lighting',
    enforce: 'pre' as const,
    transform(source: string, id: string) {
      const clean = id.split('?')[0].replace(/\\/g, '/')
      if (clean.endsWith('/src/editor/map/mapEditorCatalog.ts')) return { code: transformCatalog(source), map: null }
      if (clean.endsWith('/src/editor/map/mapAssetConfigurator.ts')) return { code: transformConfigurator(source), map: null }
      if (clean.endsWith('/src/editor/map/mapObjectRenderer.ts')) return { code: transformObjectRenderer(source), map: null }
      if (clean.endsWith('/src/editor/map/mapEditorProApp.ts')) return { code: transformProEditor(source), map: null }
      if (clean.endsWith('/src/map/publishedMapRuntime.ts')) return { code: transformPublishedRuntime(source), map: null }
      if (clean.endsWith('/src/game/runtime.ts')) return { code: transformGameRuntime(source), map: null }
      return null
    },
  }
}
