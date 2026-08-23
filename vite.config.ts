import { defineConfig } from 'vite'
import { editorCombinedPerformancePlugin } from './build/editorCombinedPerformancePlugin'
import { editorLightingPlugin } from './build/editorLightingPlugin'

export default defineConfig({
  base: '/Ascension-game/',
  plugins: [editorCombinedPerformancePlugin(), editorLightingPlugin()],
})