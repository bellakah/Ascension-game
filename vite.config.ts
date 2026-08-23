import { defineConfig } from 'vite'
import { editorCombinedPerformancePlugin } from './build/editorCombinedPerformancePlugin'
import { editorLightingPlugin } from './build/editorLightingPlugin'
import { editorAnimationPlugin } from './build/editorAnimationPlugin'

export default defineConfig({
  base: '/Ascension-game/',
  plugins: [editorCombinedPerformancePlugin(), editorLightingPlugin(), editorAnimationPlugin()],
})