import { defineConfig } from 'vite'
import { editorCombinedPerformancePlugin } from './build/editorCombinedPerformancePlugin'
import { editorLightingPlugin } from './build/editorLightingPlugin'
import { editorAnimationPlugin } from './build/editorAnimationPlugin'
import { npcIdleAppearancePlugin } from './build/npcIdleAppearancePlugin'
import { gameDesktopCombatPlugin } from './build/gameDesktopCombatPlugin'

export default defineConfig({
  base: '/Ascension-game/',
  plugins: [editorCombinedPerformancePlugin(), editorLightingPlugin(), editorAnimationPlugin(), npcIdleAppearancePlugin(), gameDesktopCombatPlugin()],
})