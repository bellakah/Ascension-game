import './questJournal.css';
import type { CharacterProgress } from '../character/characterCreator';
import { NPC_NAMES, getQuestState, getTrackedQuest, questLists, questObjectiveProgress, questStatusLabel, rewardText, setTrackedQuest } from './questEngine';
import type { QuestDefinition } from './questTypes';

type JournalTab = 'active' | 'available' | 'completed';

type QuestJournalCallbacks = {
  onChanged?: () => void;
};

export function createQuestJournal(progress: CharacterProgress, callbacks: QuestJournalCallbacks = {}) {
  const root = document.createElement('div');
  root.id = 'quest-journal-overlay';
  root.className = 'quest-journal-hidden';
  root.innerHTML = `
    <div class="quest-journal-window" role="dialog" aria-label="Diário de Missões">
      <header class="quest-journal-header">
        <div><span class="quest-journal-kicker">ASCENSION</span><h2>Diário de Missões</h2></div>
        <button class="quest-journal-close" type="button" aria-label="Fechar">×</button>
      </header>
      <div class="quest-tabs">
        <button class="quest-tab active" data-tab="active" type="button">Em andamento</button>
        <button class="quest-tab" data-tab="available" type="button">Disponíveis</button>
        <button class="quest-tab" data-tab="completed" type="button">Concluídas</button>
      </div>
      <div class="quest-journal-body"><div class="quest-list"></div><div class="quest-detail"></div></div>
      <footer class="quest-journal-footer"><span>Rastreie uma missão para vê-la na HUD.</span><span><kbd>J</kbd> diário · <kbd>Esc</kbd> fechar</span></footer>
    </div>`;
  document.body.appendChild(root);

  const listHost = root.querySelector<HTMLElement>('.quest-list')!;
  const detailHost = root.querySelector<HTMLElement>('.quest-detail')!;
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('.quest-tab'));
  let tab: JournalTab = 'active';
  let selectedQuestId: string | null = null;

  const questsForTab = () => {
    const lists = questLists(progress);
    if (tab === 'active') return lists.active;
    if (tab === 'available') return lists.available;
    return lists.completed;
  };

  const renderDetail = (quest: QuestDefinition | undefined) => {
    if (!quest) {
      detailHost.innerHTML = '<div class="quest-empty"><div><strong>Nenhuma missão nesta categoria.</strong><p>Novas missões aparecerão aqui quando forem liberadas.</p></div></div>';
      return;
    }
    const state = getQuestState(progress, quest.id)!;
    const tracked = getTrackedQuest(progress)?.id === quest.id;
    const objectiveRows = quest.objectives.map((objective, index) => {
      const value = questObjectiveProgress(progress, quest, objective);
      const typeIcon: Record<string, string> = { kill: '⚔', boss: '♛', collect: '◆', deliver: '▣', talk: '💬', visit: '⌖', interact: '✦' };
      return `<div class="quest-objective${value.done ? ' done' : ''}"><b>${value.done ? '✓' : typeIcon[objective.type] ?? '•'}</b><div><strong>${objective.label}</strong><small>${value.current}/${value.target}${quest.mode === 'sequential' ? ` · Etapa ${index + 1}` : ''}</small></div></div>`;
    }).join('');
    const canTrack = state.status === 'active' || state.status === 'ready';
    detailHost.innerHTML = `
      <h3>${quest.title}</h3>
      <div class="quest-detail-meta"><span>${quest.category === 'story' ? 'História' : quest.category === 'side' ? 'Secundária' : quest.category === 'tutorial' ? 'Tutorial' : 'Diária'}</span><span>${questStatusLabel(progress, quest)}</span><span>${quest.mode === 'sequential' ? 'Objetivos em sequência' : 'Objetivos paralelos'}</span></div>
      <p class="quest-detail-summary">${quest.summary}</p>
      <strong>Objetivos</strong><div class="quest-objectives">${objectiveRows}</div>
      <div class="quest-rewards"><strong>Recompensas</strong><br>${rewardText(quest) || 'Sem recompensa definida'}</div>
      ${canTrack ? `<button class="quest-track${tracked ? ' tracked' : ''}" type="button">${tracked ? '✓ Rastreando na HUD' : 'Rastrear na HUD'}</button>` : ''}
      <p class="quest-detail-summary" style="margin-top:14px">Início: ${NPC_NAMES[quest.startNpcId] ?? quest.startNpcId} · Entrega: ${NPC_NAMES[quest.endNpcId] ?? quest.endNpcId}</p>`;
    detailHost.querySelector<HTMLButtonElement>('.quest-track')?.addEventListener('click', () => {
      setTrackedQuest(progress, tracked ? null : quest.id);
      callbacks.onChanged?.();
      render();
    });
  };

  const render = () => {
    tabs.forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
    const quests = questsForTab();
    if (!selectedQuestId || !quests.some((quest) => quest.id === selectedQuestId)) selectedQuestId = quests[0]?.id ?? null;
    listHost.replaceChildren();
    for (const quest of quests) {
      const state = getQuestState(progress, quest.id)!;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `quest-list-card${selectedQuestId === quest.id ? ' selected' : ''}`;
      button.innerHTML = `<strong>${quest.title}</strong><span>${questStatusLabel(progress, quest)}</span><em>${state.status === 'ready' ? 'Pronta para entregar' : quest.category === 'story' ? 'História' : quest.category === 'side' ? 'Secundária' : 'Tutorial'}</em>`;
      button.addEventListener('click', () => { selectedQuestId = quest.id; render(); });
      listHost.appendChild(button);
    }
    renderDetail(quests.find((quest) => quest.id === selectedQuestId));
  };

  tabs.forEach((button) => button.addEventListener('click', () => { tab = button.dataset.tab as JournalTab; selectedQuestId = null; render(); }));
  const open = () => { root.classList.remove('quest-journal-hidden'); render(); };
  const close = () => root.classList.add('quest-journal-hidden');
  const toggle = () => root.classList.contains('quest-journal-hidden') ? open() : close();
  root.querySelector<HTMLButtonElement>('.quest-journal-close')!.addEventListener('click', close);
  root.addEventListener('pointerdown', (event) => { if (event.target === root) close(); });
  window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'j' && !event.repeat && !(document.activeElement instanceof HTMLInputElement)) { event.preventDefault(); toggle(); }
    if (event.key === 'Escape' && !root.classList.contains('quest-journal-hidden')) close();
  });

  render();
  return { root, open, close, toggle, refresh: render, isOpen: () => !root.classList.contains('quest-journal-hidden') };
}
