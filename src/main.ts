const params = new URLSearchParams(window.location.search);
const editor = params.get('editor');
const playtest = params.get('playtest');

if (playtest === 'map') {
  void import('./editor/map/mapPlaytest').then(({ startMapPlaytest }) => startMapPlaytest());
} else if (editor === 'map-classic') {
  void import('./editor/map/mapEditor').then(({ startMapEditor }) => startMapEditor());
} else if (editor === 'map') {
  void import('./editor/map/mapEditorV2').then(async ({ startMapEditorV2 }) => {
    await startMapEditorV2();
    const [{ installMapEditorPublishUi }, { installMapEditorAssetDeleteUi }, { installMapEditorAssetPreviewUi }] = await Promise.all([
      import('./editor/map/mapEditorPublishUi'),
      import('./editor/map/mapEditorAssetDeleteUi'),
      import('./editor/map/mapEditorAssetPreviewUi'),
    ]);
    installMapEditorPublishUi();
    installMapEditorAssetDeleteUi();
    installMapEditorAssetPreviewUi();
  });
} else {
  void import('./gameBootstrap').then(({ startGameApp }) => startGameApp());
}
