import { editorLayeredCanvasPlugin } from './editorLayeredCanvasPlugin'

export function editorLayeredCanvasPostPlugin() {
  const { enforce: _enforce, ...plugin } = editorLayeredCanvasPlugin()
  return {
    ...plugin,
    name: 'ascension-editor-layered-canvas-normal',
  }
}
