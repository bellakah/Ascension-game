import './studioAnimationStateTabs.css';
import { syncStudioAnimationStateTabs, type StudioAnimationStateTab } from './studioAnimationStateTabs';

const MONSTER_STATES: StudioAnimationStateTab[] = [
  { id: 'idle', label: 'Parado', sectionTitle: 'Parado' },
  { id: 'walk', label: 'Andando', sectionTitle: 'Andando' },
  { id: 'attack', label: 'Atacando', sectionTitle: 'Atacando' },
  { id: 'hurt', label: 'Dano', sectionTitle: 'Recebendo dano' },
  { id: 'death', label: 'Morrendo', sectionTitle: 'Morrendo' },
];

const NPC_STATES: StudioAnimationStateTab[] = [
  { id: 'idle', label: 'Parado', sectionTitle: 'Parado' },
  { id: 'walk', label: 'Andando', sectionTitle: 'Andando' },
];

function renameNpcSections(form: HTMLElement) {
  for (const section of form.querySelectorAll<HTMLElement>(':scope > section')) {
    const heading = section.querySelector<HTMLElement>(':scope > h4');
    const text = heading?.textContent?.trim();
    if (!heading || !text) continue;
    if (text === 'Estados e direções') heading.textContent = 'Parado';
    else if (text === 'Caminhada') heading.textContent = 'Andando';
  }
}

function configuredCount(form: HTMLElement, state: string) {
  return [...form.querySelectorAll<HTMLSelectElement>(`select[data-appearance-state="${CSS.escape(state)}"]`)]
    .filter((select) => Boolean(select.value)).length;
}

function syncOverlay(overlay: HTMLElement, kind: 'npc' | 'monster') {
  if (overlay.classList.contains('hidden')) return;
  const form = overlay.querySelector<HTMLElement>(kind === 'monster' ? '#monster-form' : '#npc-form');
  const stateSelect = overlay.querySelector<HTMLSelectElement>(kind === 'monster' ? '#monster-preview-state' : '#npc-preview-state');
  if (!form || !stateSelect) return;

  if (kind === 'npc') renameNpcSections(form);

  const globalImport = form.querySelector<HTMLElement>(kind === 'monster' ? '#monster-import-animation' : '#npc-import-animation');
  if (globalImport) {
    globalImport.style.display = 'none';
    const note = globalImport.nextElementSibling as HTMLElement | null;
    if (note?.matches('p, .monster-inline-note')) note.style.display = 'none';
  }

  const states = kind === 'monster' ? MONSTER_STATES : NPC_STATES;
  syncStudioAnimationStateTabs({
    overlay,
    form,
    states,
    compactLabel: 'Estado da animação',
    getActiveState: () => stateSelect.value,
    setActiveState: (state) => {
      if (stateSelect.value === state) return;
      stateSelect.value = state;
      stateSelect.dispatchEvent(new Event('change', { bubbles: true }));
    },
    getConfiguredCount: (state) => configuredCount(form, state),
  });
}

export function installStudioAnimationStateTabsIntegration() {
  const root = document.querySelector<HTMLElement>('.mep');
  if (!root || root.dataset.studioAnimationStateTabs === '1') return;
  root.dataset.studioAnimationStateTabs = '1';

  let frame = 0;
  const sync = () => {
    frame = 0;
    const npc = root.querySelector<HTMLElement>('.npc-studio-overlay:not(.monster-studio-overlay)');
    const monster = root.querySelector<HTMLElement>('.monster-studio-overlay');
    if (npc) syncOverlay(npc, 'npc');
    if (monster) syncOverlay(monster, 'monster');
  };
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(sync);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  root.addEventListener('change', (event) => {
    const target = event.target as HTMLElement;
    if (target.matches('#npc-preview-state, #monster-preview-state, select[data-appearance-state]')) schedule();
  });
  window.addEventListener('ascension-npc-definitions-change', schedule);
  window.addEventListener('ascension-monster-definitions-change', schedule);
  window.addEventListener('resize', schedule);
  schedule();
}
