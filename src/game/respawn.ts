import './respawn.css';
import type { Village } from './world';

type RespawnCallbacks = {
  onRespawn: () => void;
};

export function createRespawnScreen(callbacks: RespawnCallbacks) {
  const root = document.createElement('div');
  root.id = 'respawn-overlay';
  root.className = 'respawn-hidden';
  root.innerHTML = `
    <div class="respawn-card" role="dialog" aria-modal="true" aria-label="Renascimento">
      <div class="respawn-emblem"><span>✦</span></div>
      <span class="respawn-kicker">ASCENSION</span>
      <h1>Você foi derrotado</h1>
      <p class="respawn-copy">Seu espírito aguarda um ponto seguro para retornar ao mundo.</p>
      <div class="respawn-destination">
        <span class="respawn-shield">🛡</span>
        <div><small>VILA MAIS PRÓXIMA</small><strong id="respawn-village-name">Vila</strong><em>Área segura • HP restaurado</em></div>
      </div>
      <button id="respawn-button" type="button">Renascer na vila mais próxima</button>
      <p class="respawn-note">Você permanecerá derrotado até escolher renascer.</p>
    </div>`;
  document.body.appendChild(root);

  const villageName = root.querySelector<HTMLElement>('#respawn-village-name')!;
  const button = root.querySelector<HTMLButtonElement>('#respawn-button')!;
  let visible = false;

  const show = (village: Village) => {
    villageName.textContent = village.name;
    root.classList.remove('respawn-hidden');
    root.classList.add('respawn-visible');
    visible = true;
  };

  const hide = () => {
    root.classList.add('respawn-hidden');
    root.classList.remove('respawn-visible');
    visible = false;
  };

  button.addEventListener('click', () => {
    if (!visible) return;
    button.disabled = true;
    callbacks.onRespawn();
    window.setTimeout(() => { button.disabled = false; }, 250);
  });

  return { root, show, hide, isOpen: () => visible };
}
