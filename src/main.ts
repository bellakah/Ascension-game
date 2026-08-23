const params = new URLSearchParams(window.location.search);
const editor = params.get('editor');
const playtest = params.get('playtest');

if (playtest === 'map') {
  void Promise.all([
    import('./npc/npcStore'),
    import('./monsterEditor/monsterStore'),
    import('./editor/map/mapPlaytest'),
  ]).then(([{ hydrateNpcDefinitionsIntoPalette }, { hydrateMonsterDefinitionsIntoPalette }, { startMapPlaytest }]) => {
    hydrateNpcDefinitionsIntoPalette();
    hydrateMonsterDefinitionsIntoPalette();
    return startMapPlaytest();
  });
} else if (editor === 'map') {
  void Promise.all([
    import('./editor/studioLegacyMigration'),
    import('./npc/npcStore'),
    import('./monsterEditor/monsterStore'),
    import('./editor/map/mapEditorProApp'),
  ]).then(async ([{ ensureLegacyStudioDefinitions }, { hydrateNpcDefinitionsIntoPalette }, { hydrateMonsterDefinitionsIntoPalette }, { startMapEditor }]) => {
    ensureLegacyStudioDefinitions();
    hydrateNpcDefinitionsIntoPalette();
    hydrateMonsterDefinitionsIntoPalette();
    await startMapEditor();
    const { installMapEditorInteractionPerf } = await import('./editor/map/mapEditorInteractionPerf');
    installMapEditorInteractionPerf();
    const { installMapEditorVisualPolish } = await import('./editor/map/mapEditorVisualPolish');
    installMapEditorVisualPolish();
    const { installNpcEditorIntegration } = await import('./npc/npcEditorIntegration');
    installNpcEditorIntegration();
    const { installMonsterEditorIntegration } = await import('./monsterEditor/monsterEditorIntegration');
    installMonsterEditorIntegration();
    const { installStudioAppearanceUx } = await import('./editor/studioAppearanceUx');
    installStudioAppearanceUx();
    const { installStudioAnimationStateTabsIntegration } = await import('./editor/studioAnimationStateTabsIntegration');
    installStudioAnimationStateTabsIntegration();
  });
} else {
  void import('./gameBootstrap').then(({ startGameApp }) => startGameApp());
}
