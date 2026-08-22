import { defineConfig } from 'vite'
import { editorCombinedPerformancePlugin } from './build/editorCombinedPerformancePlugin'

export default defineConfig({
  base: '/Ascension-game/',
  plugins: [editorCombinedPerformancePlugin()],
})