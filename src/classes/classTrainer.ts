import './classTrainer.css';
import type { CharacterProgress } from '../character/characterCreator';
import { classStatsAtLevel } from './classProgression';
import { advancementTargets, changeClass, checkClassAdvancement, classCharacterState, unlockedClasses } from './classAdvancement';
import { getClassDefinition, type ClassDefinition } from './classCatalog';

type ClassTrainerCallbacks = {
  onChanged: () => void;
  notify: (message: string) => void;
};

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));

function statsHtml(current: ClassDefinition, target: ClassDefinition, level: number) {
  const before = classStatsAtLevel(current, level), after = classStatsAtLevel(target, level);
  const rows: Array<[string, number, number]> = [
    ['HP', before.maxHp, after.maxHp], ['ATQ', before.attack, after.attack], ['DEF', before.defense, after.defense], ['ATQ M.', before.magicAttack, after.magicAttack], ['DEF M.', before.magicDefense, after.magicDefense],
  ];
  return `<div class="class-trainer-compare">${rows.map(([label,a,b]) => `<div class="class-trainer-stat"><strong>${b}${b !== a ? ` <small style="color:${b > a ? '#9dd6a5' : '#e3a09a'}">${b > a ? '+' : ''}${b-a}</small>` : ''}</strong><span>${label}</span></div>`).join('')}</div>`;
}

export function createClassTrainerUi(progress: CharacterProgress, callbacks: ClassTrainerCallbacks) {
  const root = document.createElement('div');
  root.id = 'class-trainer-overlay';
  root.className = 'hidden';
  document.body.appendChild(root);
  let selectedTarget = '';

  const reloadAfterSave = (message: string) => {
    callbacks.onChanged();
    callbacks.notify(message);
    window.setTimeout(() => window.location.reload(), 650);
  };

  function advancementCard(target: ClassDefinition) {
    const check = checkClassAdvancement(progress, target.id);
    return `<div class="class-trainer-card${check.ok ? '' : ' locked'}"><span class="class-trainer-card-icon">${esc(target.icon)}</span><div><strong>${esc(target.name)}</strong><small>${esc(target.tagline || target.description)}</small><div class="class-trainer-reqs">${check.requirements.map((req) => `<span class="class-trainer-req ${req.met ? 'met' : 'missing'}">${req.met ? '✓' : '×'} ${esc(req.label)}</span>`).join('') || '<span class="class-trainer-req met">✓ Sem requisito extra</span>'}</div></div><button data-advance="${esc(target.id)}" ${check.ok ? '' : 'disabled'}>Evoluir</button></div>`;
  }

  function unlockedCard(target: ClassDefinition) {
    return `<div class="class-trainer-card"><span class="class-trainer-card-icon">${esc(target.icon)}</span><div><strong>${esc(target.name)}</strong><small>${esc(target.tagline || target.description)}</small></div><button data-switch="${esc(target.id)}">Trocar</button></div>`;
  }

  function render() {
    const current = getClassDefinition(progress.classId);
    const next = advancementTargets(progress);
    const unlocked = unlockedClasses(progress).filter((entry) => entry.id !== current.id);
    const selected = selectedTarget ? [...next, ...unlocked].find((entry) => entry.id === selectedTarget) : next[0] ?? unlocked[0] ?? null;
    root.innerHTML = `<section class="class-trainer-window" role="dialog" aria-modal="true" aria-label="Instrutor de Classes"><header class="class-trainer-head"><span class="class-trainer-symbol">✦</span><div><small>ASCENSION · CLASS TRAINER</small><h2>Instrutor de Classes</h2><p>Evolua sua classe, confira requisitos e alterne entre caminhos já desbloqueados.</p></div><button class="class-trainer-close" type="button">×</button></header><main class="class-trainer-body"><section class="class-trainer-current"><span class="class-trainer-class-icon">${esc(current.icon)}</span><div><h3>${esc(current.name)}</h3><p>${esc(current.description)}</p></div><span class="class-trainer-level">Nível ${progress.level}</span></section><section class="class-trainer-section"><header><h3>Evoluções disponíveis</h3><span>${next.length} caminho(s) a partir de ${esc(current.name)}</span></header><div class="class-trainer-grid">${next.length ? next.map(advancementCard).join('') : '<div class="class-trainer-empty">Nenhuma evolução publicada foi vinculada a esta classe.</div>'}</div></section><section class="class-trainer-section"><header><h3>Classes desbloqueadas</h3><span>Troca livre no Instrutor</span></header><div class="class-trainer-grid">${unlocked.length ? unlocked.map(unlockedCard).join('') : '<div class="class-trainer-empty">Você ainda não possui outra classe desbloqueada.</div>'}</div></section>${selected ? `<section class="class-trainer-section"><header><h3>Comparação · ${esc(selected.name)}</h3><span>Mesmo nível atual</span></header>${statsHtml(current, selected, progress.level)}</section>` : ''}</main><footer class="class-trainer-footer"><span>Itens incompatíveis são movidos para o inventário antes da troca.</span><span>A troca recarrega o personagem para reconstruir skills, recurso e combate.</span></footer></section>`;

    root.querySelector<HTMLButtonElement>('.class-trainer-close')!.onclick = close;
    root.querySelectorAll<HTMLButtonElement>('[data-advance]').forEach((button) => {
      button.onmouseenter = () => { selectedTarget = button.dataset.advance ?? ''; };
      button.onclick = () => {
        const targetId = button.dataset.advance!;
        const target = getClassDefinition(targetId);
        if (!window.confirm(`Evoluir ${progress.className} para ${target.name}?`)) return;
        const result = changeClass(progress, targetId, { allowUnlockedSwitch: false });
        if (!result.ok) { callbacks.notify(result.reason); render(); return; }
        reloadAfterSave(`Classe evoluída para ${result.target.name}. Recarregando personagem...`);
      };
    });
    root.querySelectorAll<HTMLButtonElement>('[data-switch]').forEach((button) => {
      button.onmouseenter = () => { selectedTarget = button.dataset.switch ?? ''; };
      button.onclick = () => {
        const targetId = button.dataset.switch!;
        const target = getClassDefinition(targetId);
        if (!window.confirm(`Trocar sua classe atual para ${target.name}?`)) return;
        const result = changeClass(progress, targetId, { allowUnlockedSwitch: true });
        if (!result.ok) { callbacks.notify(result.reason); render(); return; }
        reloadAfterSave(`Classe alterada para ${result.target.name}. Recarregando personagem...`);
      };
    });
  }

  function open() { classCharacterState(progress); selectedTarget = ''; render(); root.classList.remove('hidden'); }
  function close() { root.classList.add('hidden'); }
  root.addEventListener('pointerdown', (event) => { if (event.target === root) close(); });
  window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !root.classList.contains('hidden')) close(); }, true);
  return { root, open, close, refresh: render, isOpen: () => !root.classList.contains('hidden') };
}
