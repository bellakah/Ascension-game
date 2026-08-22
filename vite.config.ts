import { defineConfig } from 'vite'
import { editorPerformancePlugin } from './build/editorPerformancePlugin'
import { editorInteractionV2Plugin } from './build/editorInteractionV2Plugin'
import { editorLayeredCanvasPlugin } from './build/editorLayeredCanvasPlugin'

export default defineConfig({
  base: '/Ascension-game/',
  plugins: [editorPerformancePlugin(), editorInteractionV2Plugin(), editorLayeredCanvasPlugin()],
})