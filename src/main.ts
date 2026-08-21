const params = new URLSearchParams(window.location.search);
const editor = params.get('editor');
const playtest = params.get('playtest');

if (playtest === 'map') {
  void import('./editor/map/mapPlaytest').then(({ startMapPlaytest }) => startMapPlaytest());
} else if (editor === 'map') {
  void Promise.all([
    import('./editor/map/mapEditorProOverrides.css'),
    import('./editor/map/mapEditorProApp'),
  ]).then(([, { startMapEditor }]) => startMapEditor());
} else {
  void import('./gameBootstrap').then(({ startGameApp }) => startGameApp());
}
