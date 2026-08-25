import './standaloneStudioShell.css';

export type StandaloneStudioMode = 'actors' | 'items' | 'collectibles' | 'quests' | 'events';

type EditorTarget = 'map' | 'actors' | 'items' | 'collectibles' | 'quests' | 'events';

function editorUrl(mode: EditorTarget) {
  const url = new URL(window.location.href);
  url.searchParams.delete('playtest');
  url.searchParams.delete('section');
  url.searchParams.delete('id');
  url.searchParams.set('editor', mode);
  return url.toString();
}

export function createStandaloneStudioShell(mode: StandaloneStudioMode) {
  document.body.className = 'map-editor-pro-mode standalone-studio-mode';
  document.title = mode === 'actors' ? 'Ascension NPC & Monster Editor' : mode === 'items' ? 'Ascension Item Editor' : mode === 'collectibles' ? 'Ascension Collectible Editor' : mode === 'quests' ? 'Ascension Mission Editor' : 'Ascension Event Editor';

  const mount = document.querySelector<HTMLElement>('#app') ?? document.body;
  mount.innerHTML = '';

  const root = document.createElement('div');
  root.className = 'mep standalone-studio';
  root.dataset.standaloneStudio = mode;
  root.innerHTML = `
    <header class="mep-top standalone-studio-top">
      <div class="mep-brand"><span class="mep-logo">A</span><div><strong>ASCENSION</strong><span>CONTENT EDITOR</span></div></div>
      <nav class="mep-mode standalone-studio-nav" aria-label="Editores">
        <button id="mep-mode-map" type="button">Mapa</button>
        <button id="mep-mode-npcs" type="button">NPCs</button>
        <button id="mep-mode-monsters" type="button">Monstros</button>
        <button id="mep-mode-items" type="button">Itens</button>
        <button id="mep-mode-collectibles" type="button">Coletáveis</button>
        <button id="mep-mode-quests" type="button">Missões</button>
        <button id="mep-mode-events" type="button">Eventos</button>
      </nav>
      <div class="mep-spacer"></div>
      <span class="standalone-studio-status">Catálogos compartilhados com o jogo</span>
      <button id="standalone-open-game" class="test" type="button">▶ <span>Jogo</span></button>
    </header>
    <main class="mep-stage-wrap standalone-studio-stage">
      <div class="standalone-studio-empty" aria-hidden="true">
        <strong>${mode === 'actors' ? 'NPCs & Monstros' : mode === 'items' ? 'Itens' : mode === 'collectibles' ? 'Coletáveis' : mode === 'quests' ? 'Missões' : 'Eventos'}</strong>
        <span>Carregando editor...</span>
      </div>
    </main>`;
  mount.appendChild(root);

  const navigate = (target: EditorTarget) => { window.location.href = editorUrl(target); };
  root.querySelector<HTMLButtonElement>('#mep-mode-map')!.onclick = () => navigate('map');
  root.querySelector<HTMLButtonElement>('#mep-mode-items')!.onclick = () => navigate('items');
  root.querySelector<HTMLButtonElement>('#mep-mode-collectibles')!.onclick = () => navigate('collectibles');
  root.querySelector<HTMLButtonElement>('#mep-mode-quests')!.onclick = () => navigate('quests');
  root.querySelector<HTMLButtonElement>('#mep-mode-events')!.onclick = () => navigate('events');
  root.querySelector<HTMLButtonElement>('#standalone-open-game')!.onclick = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('editor');
    url.searchParams.delete('playtest');
    url.searchParams.delete('section');
    url.searchParams.delete('id');
    window.location.href = url.toString();
  };

  if (mode === 'quests') root.querySelector<HTMLButtonElement>('#mep-mode-quests')?.classList.add('active');
  if (mode === 'events') root.querySelector<HTMLButtonElement>('#mep-mode-events')?.classList.add('active');

  return {
    root,
    content: root.querySelector<HTMLElement>('.standalone-studio-stage')!,
    navigate,
    setActive(id: 'npcs' | 'monsters' | 'items' | 'collectibles' | 'quests' | 'events') {
      root.querySelectorAll<HTMLButtonElement>('.mep-mode button').forEach((button) => button.classList.remove('active'));
      root.querySelector<HTMLButtonElement>(`#mep-mode-${id}`)?.classList.add('active');
    },
  };
}
