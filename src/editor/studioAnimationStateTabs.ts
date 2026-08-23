export type StudioAnimationStateTab = {
  id: string;
  label: string;
  sectionTitle: string;
};

type InstallOptions = {
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

export function installStudioAnimationStateTabs(options: InstallOptions) {
  const { overlay, form, states } = options;
  if (!states.length) return () => {};

  let guard = false;
  const sync = () => {
    if (guard || overlay.classList.contains('hidden')) return;
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

    const active = states.some((state) => state.id === options.getActiveState()) ? options.getActiveState() : states[0].id;
    nav.innerHTML = states.map((state) => {
      const count = Math.max(0, Math.min(8, options.getConfiguredCount(state.id)));
      return `<button type="button" data-animation-state-tab="${state.id}" class="${active === state.id ? 'active' : ''}"><span>${state.label}</span><small>${count}/8</small></button>`;
    }).join('');

    const select = selectWrap.querySelector<HTMLSelectElement>('select')!;
    select.innerHTML = states.map((state) => {
      const count = Math.max(0, Math.min(8, options.getConfiguredCount(state.id)));
      return `<option value="${state.id}" ${active === state.id ? 'selected' : ''}>${state.label} (${count}/8)</option>`;
    }).join('');

    const activate = (stateId: string) => {
      if (!states.some((state) => state.id === stateId)) return;
      guard = true;
      options.setActiveState(stateId);
      guard = false;
      queueMicrotask(sync);
    };

    nav.querySelectorAll<HTMLButtonElement>('[data-animation-state-tab]').forEach((button) => {
      button.onclick = () => activate(button.dataset.animationStateTab ?? states[0].id);
    });
    select.onchange = () => activate(select.value);

    for (const state of states) {
      const section = findStateSection(form, state.sectionTitle);
      if (section) section.classList.toggle('studio-animation-state-hidden', state.id !== active);
    }
  };

  const observer = new MutationObserver(() => queueMicrotask(sync));
  observer.observe(form, { childList: true, subtree: true });
  overlay.addEventListener('click', (event) => {
    const tab = (event.target as HTMLElement).closest<HTMLButtonElement>('.npc-tabs [data-tab="appearance"]');
    if (tab) queueMicrotask(sync);
  });
  window.addEventListener('resize', sync);
  sync();

  return () => {
    observer.disconnect();
    window.removeEventListener('resize', sync);
  };
}
