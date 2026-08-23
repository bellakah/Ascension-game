const params = new URLSearchParams(window.location.search);
const editor = params.get('editor');
const playtest = params.get('playtest');

if (playtest === 'map') {
  void Promise.all([
    import('./npc/npcStore'),
    import('./editor/map/mapPlaytest'),
  ]).then(([{ hydrateNpcDefinitionsIntoPalette }, { startMapPlaytest }]) => {
    hydrateNpcDefinitionsIntoPalette();
    return startMapPlaytest();
  });
} else if (editor === 'map') {
  void Promise.all([
    import('./npc/npcStore'),
    import('./editor/map/mapEditorProApp'),
  ]).then(async ([{ hydrateNpcDefinitionsIntoPalette }, { startMapEditor }]) => {
    hydrateNpcDefinitionsIntoPalette();
    await startMapEditor();
    const { installMapEditorInteractionPerf } = await import('./editor/map/mapEditorInteractionPerf');
    installMapEditorInteractionPerf();
    const { installMapEditorVisualPolish } = await import('./editor/map/mapEditorVisualPolish');
    installMapEditorVisualPolish();
    const { installNpcEditorIntegration } = await import('./npc/npcEditorIntegration');
    installNpcEditorIntegration();
  });
} else {
  void import('./gameBootstrap').then(({ startGameApp }) => startGameApp());
}
