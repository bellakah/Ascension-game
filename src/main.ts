const params = new URLSearchParams(window.location.search);
const editor = params.get('editor');

if (editor === 'map') {
  void import('./editor/map/mapEditor').then(({ startMapEditor }) => startMapEditor());
} else {
  void import('./gameBootstrap').then(({ startGameApp }) => startGameApp());
}
