import { defineConfig } from 'vite'
import { editorPerformancePlugin } from './build/editorPerformancePlugin'

export default defineConfig({
  base: '/Ascension-game/',
  plugins: [editorPerformancePlugin()],
})