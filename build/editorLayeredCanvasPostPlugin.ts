import { editorLayeredCanvasPlugin } from './editorLayeredCanvasPlugin'

export function editorLayeredCanvasPostPlugin() {
  const plugin = editorLayeredCanvasPlugin()
  return {
    ...plugin,
    name: 'ascension-editor-layered-canvas-post',
    enforce: 'post' as const,
  }
}
