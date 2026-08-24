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
  const heading = shell?.querySelector<HTMLElement>('.minimap-heading');
  const north = heading?.querySelector<HTMLElement>('.minimap-north');
  if (!shell || !heading || !north || heading.querySelector('.minimap-shape-toggle')) return;

  const toggle = document.createElement('span');
  toggle.className = 'minimap-shape-toggle';
  toggle.setAttribute('role', 'button');
  toggle.tabIndex = 0;
  toggle.innerHTML = '<span class="minimap-shape-toggle-glyph" aria-hidden="true"></span>';
  heading.insertBefore(toggle, north);

  let shape: MinimapShape = readShape();

  const apply = (next: MinimapShape, persist = false) => {
    shape = next;
    shell.classList.toggle('minimap-shape-round', shape === 'round');
    shell.classList.toggle('minimap-shape-square', shape === 'square');
    const target = shape === 'round' ? 'quadrado' : 'redondo';
    toggle.dataset.currentShape = shape;
    toggle.title = `Usar minimapa ${target}`;
    toggle.setAttribute('aria-label', `Usar minimapa ${target}`);
    if (persist) saveShape(shape);

    // O Marker Runtime usa as dimensões do canvas legado para posicionar a
    // camada V2. Disparar resize faz o overlay acompanhar a troca imediatamente.
    window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  };

  const switchShape = () => apply(shape === 'round' ? 'square' : 'round', true);

  toggle.addEventListener('pointerdown', (event) => event.stopPropagation());
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
}
