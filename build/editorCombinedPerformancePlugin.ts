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
      const layeredResult = layered.transform(code, id)
      if (layeredResult) code = layeredResult.code
      if (code === source) return null
      return { code, map: null }
    },
  }
}
