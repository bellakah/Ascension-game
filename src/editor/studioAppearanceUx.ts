import './studioAppearanceUx.css';
import { openMapAnimationStudio } from './map/mapAnimationStudio';
import { getNpcDefinition, saveNpcDefinition } from '../npc/npcStore';
import type { NpcAnimationState, NpcDirection } from '../npc/npcTypes';
import { NPC_DIRECTIONS } from '../npc/npcTypes';
import { getMonsterDefinition, saveMonsterDefinition } from '../monsterEditor/monsterStore';
import type { MonsterAnimationState, MonsterDirection } from '../monsterEditor/monsterTypes';
import { MONSTER_DIRECTIONS, MONSTER_STATES } from '../monsterEditor/monsterTypes';

type StudioKind = 'npc' | 'monster';

const directionLabel = (kind: StudioKind, id: string) => {
  const values = kind === 'monster' ? MONSTER_DIRECTIONS : NPC_DIRECTIONS;
  return values.find((value) => value.id === id)?.label ?? id;
};

const directionShort = (kind: StudioKind, id: string) => {
  const values = kind === 'monster' ? MONSTER_DIRECTIONS : NPC_DIRECTIONS;
  return values.find((value) => value.id === id)?.short ?? id.toUpperCase();
};

const stateLabel = (kind: StudioKind, id: string) => {
  if (kind === 'monster') return MONSTER_STATES.find((value) => value.id === id)?.label ?? id;
  return id === 'idle' ? 'Parado / Idle' : 'Andando';
};

function activeDefinitionId(overlay: HTMLElement, kind: StudioKind) {
  const active = overlay.querySelector<HTMLElement>('.npc-list-card.active');
  return kind === 'monster' ? active?.dataset.monster ?? '' : active?.dataset.npc ?? '';
}

function reloadActiveDefinition(overlay: HTMLElement, kind: StudioKind, id: string) {
  window.setTimeout(() => {
    const cards = [...overlay.querySelectorAll<HTMLButtonElement>('.npc-list-card')];
    const card = cards.find((value) => (kind === 'monster' ? value.dataset.monster : value.dataset.npc) === id);
    card?.click();
  }, 0);
}

function importAnimationForSlot(overlay: HTMLElement, kind: StudioKind, state: string, direction: string) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/webp,image/jpeg';
  input.multiple = true;
  input.onchange = () => {
    const files = [...(input.files ?? [])];
    if (!files.length) return;
    void openMapAnimationStudio(files, (entries) => {
      const created = entries[0];
      const id = activeDefinitionId(overlay, kind);
      if (!created || !id) return;

      if (kind === 'monster') {
        const definition = getMonsterDefinition(id);
        if (!definition) return;
        definition.appearance[state as MonsterAnimationState][direction as MonsterDirection] = created.id;
        if (!definition.appearance.fallbackAssetId) definition.appearance.fallbackAssetId = created.id;
        saveMonsterDefinition(definition);
      } else {
        const definition = getNpcDefinition(id);
        if (!definition) return;
        definition.appearance[state as NpcAnimationState][direction as NpcDirection] = created.id;
        if (!definition.appearance.fallbackAssetId) definition.appearance.fallbackAssetId = created.id;
        saveNpcDefinition(definition);
      }
      reloadActiveDefinition(overlay, kind, id);
    });
  };
  input.click();
}

function selectPreviewSlot(overlay: HTMLElement, kind: StudioKind, state: string, direction: string) {
  const stateSelect = overlay.querySelector<HTMLSelectElement>(kind === 'monster' ? '#monster-preview-state' : '#npc-preview-state');
  const directionSelect = overlay.querySelector<HTMLSelectElement>(kind === 'monster' ? '#monster-preview-direction' : '#npc-preview-direction');
  if (stateSelect) {
    stateSelect.value = state;
    stateSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (directionSelect) {
    directionSelect.value = direction;
    directionSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function enhanceSelect(select: HTMLSelectElement, overlay: HTMLElement, kind: StudioKind) {
  if (select.dataset.studioAppearanceEnhanced === '1') return;
  const state = select.dataset.appearanceState;
  const direction = select.dataset.appearanceDirection;
  const slot = select.closest<HTMLElement>('.npc-direction-slot');
  if (!state || !direction || !slot) return;

  select.dataset.studioAppearanceEnhanced = '1';
  slot.classList.add('studio-direction-card');
  slot.querySelector(':scope > strong')?.remove();

  const head = document.createElement('div');
  head.className = 'studio-direction-head';
  head.innerHTML = `<span class="studio-direction-compass">${directionShort(kind, direction)}</span><span class="studio-direction-title"><strong>${directionLabel(kind, direction)}</strong><span>${stateLabel(kind, state)}</span></span>`;

  const status = document.createElement('div');
  status.className = 'studio-direction-status';

  const actions = document.createElement('div');
  actions.className = 'studio-direction-actions';
  const importButton = document.createElement('button');
  importButton.type = 'button';
  importButton.className = 'studio-direction-import';
  importButton.textContent = '＋ Carregar animação';
  importButton.title = `Importar frames diretamente para ${stateLabel(kind, state)} • ${directionLabel(kind, direction)}`;
  importButton.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    importAnimationForSlot(overlay, kind, state, direction);
  };

  const previewButton = document.createElement('button');
  previewButton.type = 'button';
  previewButton.className = 'studio-direction-preview';
  previewButton.textContent = '▶';
  previewButton.title = 'Mostrar este estado e direção no preview';
  previewButton.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    selectPreviewSlot(overlay, kind, state, direction);
  };
  actions.append(importButton, previewButton);

  const existingLabel = document.createElement('div');
  existingLabel.className = 'studio-direction-existing-label';
  existingLabel.textContent = 'Ou usar animação/asset já existente:';

  const sync = () => {
    const selectedText = select.selectedOptions[0]?.textContent?.trim() || 'Usar fallback';
    const configured = Boolean(select.value);
    slot.classList.toggle('is-configured', configured);
    status.textContent = configured ? `Configurada: ${selectedText}` : 'Sem animação própria • usando fallback';
  };
  select.addEventListener('change', sync);

  slot.prepend(head, status, actions, existingLabel);
  slot.addEventListener('dblclick', () => selectPreviewSlot(overlay, kind, state, direction));
  sync();
}

function addAppearanceHint(overlay: HTMLElement, kind: StudioKind) {
  const form = overlay.querySelector<HTMLElement>(kind === 'monster' ? '#monster-form' : '#npc-form');
  if (!form || form.querySelector('.studio-appearance-tip')) return;
  const fallback = form.querySelector(kind === 'monster' ? '#monster-fallback' : '#npc-fallback');
  if (!fallback) return;
  const firstSection = fallback.closest('section');
  if (!firstSection) return;
  const tip = document.createElement('div');
  tip.className = 'studio-appearance-tip monster-inline-note';
  tip.innerHTML = '<strong>Fluxo recomendado:</strong> encontre a direção abaixo e clique em <b>＋ Carregar animação</b>. Você não precisa criar o asset antes nem procurar o nome na lista.';
  firstSection.appendChild(tip);
}

function enhanceOverlay(overlay: HTMLElement, kind: StudioKind) {
  const selector = kind === 'monster' ? '#monster-form select[data-appearance-state]' : '#npc-form select[data-appearance-state]';
  overlay.querySelectorAll<HTMLSelectElement>(selector).forEach((select) => enhanceSelect(select, overlay, kind));
  addAppearanceHint(overlay, kind);
}

export function installStudioAppearanceUx() {
  const root = document.querySelector<HTMLElement>('.mep');
  if (!root || root.dataset.studioAppearanceUx === '1') return;
  root.dataset.studioAppearanceUx = '1';

  let frame = 0;
  const enhance = () => {
    frame = 0;
    const npc = root.querySelector<HTMLElement>('.npc-studio-overlay:not(.monster-studio-overlay)');
    const monster = root.querySelector<HTMLElement>('.monster-studio-overlay');
    if (npc) enhanceOverlay(npc, 'npc');
    if (monster) enhanceOverlay(monster, 'monster');
  };
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(enhance);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(root, { childList: true, subtree: true });
  window.addEventListener('ascension-npc-definitions-change', schedule);
  window.addEventListener('ascension-monster-definitions-change', schedule);
  schedule();
}
