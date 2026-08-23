import { editorPerformancePlugin } from './editorPerformancePlugin'
import { editorInteractionV2Plugin } from './editorInteractionV2Plugin'
import { editorLayeredCanvasPlugin } from './editorLayeredCanvasPlugin'
import { cleanViteId, hasAny } from './editorDevTransformGuard'

export function editorCombinedPerformancePlugin() {
  const base = editorPerformancePlugin()
  const interaction = editorInteractionV2Plugin()
  const layered = editorLayeredCanvasPlugin()

  return {
    name: 'ascension-editor-combined-performance',
    enforce: 'pre' as const,
    transform(source: string, id: string) {
      const clean = cleanViteId(id)
      const isEditor = clean.endsWith('/src/editor/map/mapEditorProApp.ts')
      const isObjectRenderer = clean.endsWith('/src/editor/map/mapObjectRenderer.ts')
      let code = source

      const baseAlreadyApplied = isEditor
        ? hasAny(code, ['Performance indexes: keep large maps responsive without changing map data.', 'const PERF_BUCKET_SIZE = 8;'])
        : isObjectRenderer
          ? hasAny(code, ['const lightTextureCache = new Map<string, HTMLCanvasElement>();'])
          : false

      if (!baseAlreadyApplied) {
        const baseResult = base.transform(code, id)
        if (baseResult) code = baseResult.code
      }

      const interactionAlreadyApplied = isEditor && hasAny(code, ['let perfSelectionSet = new Set<string>();', 'let perfDeferredHistory:'])
      if (!interactionAlreadyApplied) {
        const interactionResult = interaction.transform(code, id)
        if (interactionResult) code = interactionResult.code
      }

      if (isEditor) {
        const layeredAlreadyApplied = hasAny(code, ['id="mep-terrain-canvas"', "let layeredTerrainAppliedKey = '';"])
        if (!layeredAlreadyApplied) {
          const exactSelectionAnchor = "      if (signature !== perfSelectionSignature) { perfSelectionSignature = signature; perfSelectionSet = new Set(selection.map((item) => `${item.kind}:${item.id}`)); perfObjectViewportKey = ''; }"
          if (!code.includes(exactSelectionAnchor)) code += `\n/* layered-selection-compat\n${exactSelectionAnchor}\n*/\n`
          const layeredResult = layered.transform(code, id)
          if (layeredResult) code = layeredResult.code
        }
      } else {
        const layeredResult = layered.transform(code, id)
        if (layeredResult) code = layeredResult.code
      }

      if (code === source) return null
      return { code, map: null }
    },
  }
}
