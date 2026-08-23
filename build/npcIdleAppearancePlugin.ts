function cleanId(id: string) {
  return id.split('?')[0].replace(/\\/g, '/')
}

function patchNpcStudio(source: string) {
  let code = source

  // The animation importer must target the state currently selected in the NPC preview.
  code = code.replace(
    "draft.appearance.walk[previewDirection] = created.id;",
    "draft.appearance[previewState][previewDirection] = created.id;",
  )

  // Make it explicit in the UI that the importer writes to the preview state/direction.
  code = code.replace(
    "＋ Importar aparência animada</button>",
    "＋ Importar animação para o estado/direção do preview</button>",
  )

  // Highlight which appearance slot is currently being previewed/configured.
  code = code.replace(
    "<div class=\"npc-direction-slot\"><strong>${state === 'idle' ? 'Parado' : 'Andando'} • ${NPC_DIRECTIONS.find((value) => value.id === direction)?.short}</strong>",
    "<div class=\"npc-direction-slot ${state === previewState && direction === previewDirection ? 'active' : ''}\"><strong>${state === 'idle' ? 'Parado' : 'Andando'} • ${NPC_DIRECTIONS.find((value) => value.id === direction)?.short}</strong>",
  )

  // If a directional slot was just mirroring the old fallback, keep it inherited
  // instead of pinning the old asset after the fallback changes.
  code = code.replace(
    "form.querySelector<HTMLSelectElement>('#npc-fallback')!.onchange = (event) => { draft!.appearance.fallbackAssetId = (event.currentTarget as HTMLSelectElement).value; renderPreview(); };",
    "form.querySelector<HTMLSelectElement>('#npc-fallback')!.onchange = (event) => { const previous = draft!.appearance.fallbackAssetId; const next = (event.currentTarget as HTMLSelectElement).value; for (const state of ['idle', 'walk'] as const) for (const direction of NPC_DIRECTIONS) if (draft!.appearance[state][direction.id] === previous) delete draft!.appearance[state][direction.id]; draft!.appearance.fallbackAssetId = next; renderForm(); renderPreview(); };",
  )

  // State/direction changes also refresh the appearance form so the active slot is obvious.
  code = code.replace(
    "overlay.querySelector<HTMLSelectElement>('#npc-preview-state')!.onchange = (event) => { previewState = (event.currentTarget as HTMLSelectElement).value as NpcAnimationState; renderPreview(); };",
    "overlay.querySelector<HTMLSelectElement>('#npc-preview-state')!.onchange = (event) => { previewState = (event.currentTarget as HTMLSelectElement).value as NpcAnimationState; if (tab === 'appearance') renderForm(); renderPreview(); };",
  )
  code = code.replace(
    "overlay.querySelector<HTMLSelectElement>('#npc-preview-direction')!.onchange = (event) => { previewDirection = (event.currentTarget as HTMLSelectElement).value as NpcDirection; renderPreview(); };",
    "overlay.querySelector<HTMLSelectElement>('#npc-preview-direction')!.onchange = (event) => { previewDirection = (event.currentTarget as HTMLSelectElement).value as NpcDirection; if (tab === 'appearance') renderForm(); renderPreview(); };",
  )

  return code
}

function patchNpcStore(source: string) {
  let code = source
  // New NPCs inherit their base appearance until a state/direction is explicitly configured.
  code = code.replace(
    "      idle: { south: appearance },\n      walk: { south: appearance },",
    "      idle: {},\n      walk: {},",
  )
  return code
}

export function npcIdleAppearancePlugin() {
  return {
    name: 'ascension-npc-idle-appearance-fix',
    enforce: 'pre' as const,
    transform(source: string, id: string) {
      const clean = cleanId(id)
      if (clean.endsWith('/src/npc/npcStudio.ts')) {
        const code = patchNpcStudio(source)
        return code === source ? null : { code, map: null }
      }
      if (clean.endsWith('/src/npc/npcStore.ts')) {
        const code = patchNpcStore(source)
        return code === source ? null : { code, map: null }
      }
      return null
    },
  }
}
