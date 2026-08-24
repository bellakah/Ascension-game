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
    // O Map Editor só hidrata os catálogos necessários para desenhar/colocar NPCs e
    // monstros. Os Studios pesados agora vivem em entrypoints separados.
    ensureLegacyStudioDefinitions();
    hydrateNpcDefinitionsIntoPalette();
    hydrateMonsterDefinitionsIntoPalette();
    await startMapEditor();

    const { installMapEditorInteractionPerf } = await import('./editor/map/mapEditorInteractionPerf');
    installMapEditorInteractionPerf();
    const { installMapEditorVisualPolish } = await import('./editor/map/mapEditorVisualPolish');
    installMapEditorVisualPolish();
    const { installMapEditorFloatingMenus } = await import('./editor/map/mapEditorFloatingMenus');
    installMapEditorFloatingMenus();
    const { installCharacterAnimationAssetIsolation } = await import('./editor/characterAnimationAssetIsolation');
    installCharacterAnimationAssetIsolation();
    const { installMapEditorCatalogNav } = await import('./editor/map/mapEditorCatalogNav');
    installMapEditorCatalogNav();
    const { installMapMarkerStudioIntegration } = await import('./editor/map/mapMarkerStudio');
    installMapMarkerStudioIntegration();
  });
} else if (editor === 'actors') {
  void import('./editor/actorsEditorApp').then(({ startActorsEditor }) => startActorsEditor());
} else if (editor === 'items') {
  void import('./editor/itemsEditorApp').then(({ startItemsEditor }) => startItemsEditor());
} else {
  void import('./gameBootstrap').then(({ startGameApp }) => startGameApp());
}
