import './minimapShape.css';

type MinimapShape = 'square' | 'round';

const STORAGE_KEY = 'ascension.ui.minimap-shape.v1';

function readShape(): MinimapShape {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'round' ? 'round' : 'square';
  } catch {
    return 'square';
  }
}

function saveShape(shape: MinimapShape) {
  try {
    window.localStorage.setItem(STORAGE_KEY, shape);
  } catch {
    // A preferência visual não deve impedir o jogo de iniciar.
  }
}

export function installMinimapShape() {
  const shell = document.querySelector<HTMLElement>('#minimap-shell');
  if (!shell || document.querySelector('.minimap-shape-toggle-floating')) return;

  // Remove a implementação antiga caso exista em uma sessão reaproveitada.
  shell.querySelector('.minimap-shape-toggle')?.remove();

  // O shell do minimapa é um <button>. Colocar outro controle interativo dentro
  // dele gera uma árvore inválida e alguns navegadores engolem o clique. O
  // seletor de formato passa a ser um botão independente, fixo sobre a HUD.
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'minimap-shape-toggle minimap-shape-toggle-floating';
  toggle.innerHTML = '<span class="minimap-shape-toggle-glyph" aria-hidden="true"></span>';
  document.body.appendChild(toggle);

  let shape: MinimapShape = readShape();

  const resizeCanvases = (next: MinimapShape) => {
    const legacy = shell.querySelector<HTMLCanvasElement>('#minimap-canvas');
    const v2 = shell.querySelector<HTMLCanvasElement>('.minimap-v2-canvas');
    const width = 400;
    const height = next === 'round' ? 400 : 352;

    if (legacy && (legacy.width !== width || legacy.height !== height)) {
      legacy.width = width;
      legacy.height = height;
    }
    if (v2 && (v2.width !== width || v2.height !== height)) {
      v2.width = width;
      v2.height = height;
    }
  };

  const apply = (next: MinimapShape, persist = false) => {
    shape = next;
    shell.classList.toggle('minimap-shape-round', shape === 'round');
    shell.classList.toggle('minimap-shape-square', shape === 'square');
    document.documentElement.dataset.minimapShape = shape;

    const target = shape === 'round' ? 'quadrado' : 'redondo';
    toggle.dataset.currentShape = shape;
    toggle.title = `Usar minimapa ${target}`;
    toggle.setAttribute('aria-label', `Usar minimapa ${target}`);
    resizeCanvases(shape);
    if (persist) saveShape(shape);

    // O Marker Runtime usa as dimensões do canvas legado para posicionar a
    // camada V2. Disparar resize faz o overlay acompanhar a troca imediatamente.
    window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  };

  const switchShape = () => apply(shape === 'round' ? 'square' : 'round', true);

  toggle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    switchShape();
  });
  toggle.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    switchShape();
  });

  apply(shape);

  window.addEventListener('pagehide', () => toggle.remove(), { once: true });
}
