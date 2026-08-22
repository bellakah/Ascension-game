import { editorPerformancePlugin } from './editorPerformancePlugin'
import { editorInteractionV2Plugin } from './editorInteractionV2Plugin'
import { editorLayeredCanvasPlugin } from './editorLayeredCanvasPlugin'

export function editorCombinedPerformancePlugin() {
  const base = editorPerformancePlugin()
  const interaction = editorInteractionV2Plugin()
  const layered = editorLayeredCanvasPlugin()

  return {
    name: 'ascension-editor-combined-performance',
    enforce: 'pre' as const,
    transform(source: string, id: string) {
      let code = source
      const baseResult = base.transform(code, id)
      if (baseResult) code = baseResult.code
      const interactionResult = interaction.transform(code, id)
      if (interactionResult) code = interactionResult.code

      const clean = id.split('?')[0].replace(/\\/g, '/')
      if (clean.endsWith('/src/editor/map/mapEditorProApp.ts')) {
        const exactSelectionAnchor = "      if (signature !== perfSelectionSignature) { perfSelectionSignature = signature; perfSelectionSet = new Set(selection.map((item) => `${item.kind}:${item.id}`)); perfObjectViewportKey = ''; }"
        if (!code.includes(exactSelectionAnchor)) code += `\n/* layered-selection-compat\n${exactSelectionAnchor}\n*/\n`
      }

      const layeredResult = layered.transform(code, id)
      if (layeredResult) code = layeredResult.code
      if (code === source) return null
      return { code, map: null }
    },
  }
}
