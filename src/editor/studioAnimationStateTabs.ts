export type StudioAnimationStateTab = {
  id: string;
  label: string;
  sectionTitle: string;
};

type SyncOptions = {
  overlay: HTMLElement;
  form: HTMLElement;
  getActiveState: () => string;
  setActiveState: (state: string) => void;
  getConfiguredCount: (state: string) => number;
  states: StudioAnimationStateTab[];
  compactLabel?: string;
};

function findStateSection(form: HTMLElement, title: string) {
  return [...form.querySelectorAll<HTMLElement>(':scope > section')].find((section) =>
    section.querySelector(':scope > h4')?.textContent?.trim().toLocaleLowerCase('pt-BR') === title.trim().toLocaleLowerCase('pt-BR')) ?? null;
}

export function syncStudioAnimationStateTabs(options: SyncOptions) {
  const { overlay, form, states } = options;
  if (!states.length || overlay.classList.contains('hidden')) return;

  const appearanceActive = [...overlay.querySelectorAll<HTMLButtonElement>('.npc-tabs [data-tab]')]
    .some((button) => button.classList.contains('active') && button.dataset.tab === 'appearance');
  if (!appearanceActive) return;

  const firstStateSection = states.map((state) => findStateSection(form, state.sectionTitle)).find(Boolean);
  if (!firstStateSection) return;

  let nav = form.querySelector<HTMLElement>(':scope > .studio-animation-state-nav');
  if (!nav) {
    nav = document.createElement('div');
    nav.className = 'studio-animation-state-nav';
    firstStateSection.before(nav);
  }

  let selectWrap = form.querySelector<HTMLElement>(':scope > .studio-animation-state-select-wrap');
  if (!selectWrap) {
    selectWrap = document.createElement('label');
    selectWrap.className = 'studio-animation-state-select-wrap';
    selectWrap.innerHTML = `<span>${options.compactLabel ?? 'Animação'}</span><select class="studio-animation-state-select"></select>`;
    nav.after(selectWrap);
  }

  const requested = options.getActiveState();
  const active = states.some((state) => state.id === requested) ? requested : states[0].id;
  const counts = new Map(states.map((state) => [state.id, Math.max(0, Math.min(8, options.getConfiguredCount(state.id)))]));
  const signature = states.map((state) => `${state.id}:${counts.get(state.id)}`).join('|') + `|active:${active}`;

  if (nav.dataset.signature !== signature) {
    nav.dataset.signature = signature;
    nav.innerHTML = states.map((state) => `<button type="button" data-animation-state-tab="${state.id}" class="${active === state.id ? 'active' : ''}"><span>${state.label}</span><small>${counts.get(state.id)}/8</small></button>`).join('');
    nav.querySelectorAll<HTMLButtonElement>('[data-animation-state-tab]').forEach((button) => {
      button.onclick = () => options.setActiveState(button.dataset.animationStateTab ?? states[0].id);
    });
  }

  const select = selectWrap.querySelector<HTMLSelectElement>('select')!;
  if (select.dataset.signature !== signature) {
    select.dataset.signature = signature;
    select.innerHTML = states.map((state) => `<option value="${state.id}" ${active === state.id ? 'selected' : ''}>${state.label} (${counts.get(state.id)}/8)</option>`).join('');
    select.onchange = () => options.setActiveState(select.value);
  }

  for (const state of states) {
    const section = findStateSection(form, state.sectionTitle);
    if (section) section.classList.toggle('studio-animation-state-hidden', state.id !== active);
  }
}
