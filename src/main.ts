const params = new URLSearchParams(window.location.search);
const editor = params.get('editor');
const playtest = params.get('playtest');

if (playtest === 'map') {
  void Promise.all([
    import('./npc/npcStore'),
    import('./monsterEditor/monsterStore'),
    import('./gathering/collectibleStore'),
    import('./crafting/craftStationPalette'),
    import('./editor/map/mapPlaytest'),
  ]).then(([{ hydrateNpcDefinitionsIntoPalette }, { hydrateMonsterDefinitionsIntoPalette }, { ensureCollectibleMigration }, { hydrateCraftStationTypesIntoPalette }, { startMapPlaytest }]) => {
    hydrateNpcDefinitionsIntoPalette();
    hydrateMonsterDefinitionsIntoPalette();
    ensureCollectibleMigration();
    hydrateCraftStationTypesIntoPalette();
    return startMapPlaytest();
  });
} else if (editor === 'map') {
  void Promise.all([
    import('./editor/studioLegacyMigration'),
    import('./npc/npcStore'),
    import('./monsterEditor/monsterStore'),
    import('./gathering/collectibleStore'),
    import('./crafting/craftStationPalette'),
    import('./editor/map/mapEditorProApp'),
  ]).then(async ([{ ensureLegacyStudioDefinitions }, { hydrateNpcDefinitionsIntoPalette }, { hydrateMonsterDefinitionsIntoPalette }, { ensureCollectibleMigration }, { hydrateCraftStationTypesIntoPalette }, { startMapEditor }]) => {
    ensureLegacyStudioDefinitions();
    hydrateNpcDefinitionsIntoPalette();
    hydrateMonsterDefinitionsIntoPalette();
    ensureCollectibleMigration();
    hydrateCraftStationTypesIntoPalette();
    await startMapEditor();

    hydrateNpcDefinitionsIntoPalette();
    hydrateMonsterDefinitionsIntoPalette();
    ensureCollectibleMigration();
    hydrateCraftStationTypesIntoPalette();
    window.dispatchEvent(new Event('resize'));

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
    const { installSpawnGroupInspector } = await import('./editor/map/spawnGroupInspector');
    installSpawnGroupInspector();
    const { installMapMarkerStudioIntegration } = await import('./editor/map/mapMarkerStudio');
    installMapMarkerStudioIntegration();
  });
} else if (editor === 'actors') {
  void import('./editor/actorsEditorApp').then(({ startActorsEditor }) => startActorsEditor());
} else if (editor === 'items') {
  void import('./editor/itemsEditorApp').then(({ startItemsEditor }) => startItemsEditor());
} else if (editor === 'collectibles') {
  void import('./editor/collectiblesEditorApp').then(({ startCollectiblesEditor }) => startCollectiblesEditor());
} else if (editor === 'quests') {
  void import('./editor/questsEditorApp').then(({ startQuestsEditorApp }) => startQuestsEditorApp());
} else if (editor === 'events') {
  void import('./editor/eventsEditorApp').then(({ startEventsEditorApp }) => startEventsEditorApp());
} else if (editor === 'shops') {
  void import('./editor/shopsEditorApp').then(({ startShopsEditorApp }) => startShopsEditorApp());
} else if (editor === 'crafts') {
  void import('./editor/craftsEditorApp').then(({ startCraftsEditorApp }) => startCraftsEditorApp());
} else {
  void import('./gameBootstrap').then(({ startGameApp }) => startGameApp());
}
