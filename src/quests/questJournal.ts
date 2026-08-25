import './questJournal.css';
import type { CharacterProgress } from '../character/characterCreator';
import { listCollectibleDefinitions } from '../gathering/collectibleStore';
import { getMonsterDefinition } from '../monsterEditor/monsterStore';
import { getNpcDefinition } from '../npc/npcStore';
import { navigateToQuestNpc, navigateToQuestObjective, resolveObjectiveRoute } from './questNavigation';
import { NPC_NAMES, getQuestState, getTrackedQuest, questLists, questObjectiveProgress, questStatusLabel, rewardText, setTrackedQuest } from './questEngine';
import type { QuestCategory, QuestDefinition, QuestObjective } from './questTypes';

type JournalTab = 'active' | 'available' | 'completed';
type QuestJournalCallbacks = { onChanged?: () => void };

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
const CATEGORY_LABELS: Record<QuestCategory, string> = {
  story: 'História', side: 'Secundária', tutorial: 'Tutorial', daily: 'Diária', weekly: 'Semanal', repeatable: 'Repetível', event: 'Evento', world: 'Mundo', hidden: 'Oculta',
};
const LEGACY_MONSTER_NAMES: Record<string, string> = { wolf: 'Lobo Sombrio', sludge: 'Lodo Tóxico', any: 'Monstros' };

function npcName(id: string) { return NPC_NAMES[id] ?? getNpcDefinition(id)?.name ?? id; }
function objectiveTargetName(objective: QuestObjective) {
  const nav = objective.navigation;
  if (nav?.targetType === 'npc' && nav.targetId) return npcName(nav.targetId);
  if (nav?.targetType === 'monster' && nav.targetId) return LEGACY_MONSTER_NAMES[nav.targetId] ?? getMonsterDefinition(nav.targetId)?.name ?? nav.targetId;
  if (nav?.targetType === 'resource' && nav.targetId) {
    const definition = listCollectibleDefinitions().find((entry) => entry.id === nav.targetId || entry.drops.some((drop) => drop.itemId === nav.targetId));
    return definition?.name ?? nav.targetId;
  }
  if ((nav?.targetType === 'marker' || nav?.targetType === 'portal') && nav.targetId) return nav.targetId;
  if ((objective.type === 'talk' || objective.type === 'deliver') && objective.npcId) return npcName(objective.npcId);
  if ((objective.type === 'kill' || objective.type === 'boss') && objective.monsterKind && objective.monsterKind !== 'any') return LEGACY_MONSTER_NAMES[objective.monsterKind] ?? getMonsterDefinition(objective.monsterKind)?.name ?? objective.monsterKind;
  if (objective.type === 'gather') {
    const id = objective.target || objective.itemId;
    const definition = id ? listCollectibleDefinitions().find((entry) => entry.id === id || entry.drops.some((drop) => drop.itemId === id)) : null;
    return definition?.name ?? id ?? null;
  }
  if ((objective.type === 'visit' || objective.type === 'interact') && objective.target) return objective.target;
  return null;
}

export function createQuestJournal(progress: CharacterProgress, callbacks: QuestJournalCallbacks = {}) {
  const root = document.createElement('div');
  root.id = 'quest-journal-overlay';
  root.className = 'quest-journal-hidden';
  root.innerHTML = `
    <div class="quest-journal-window" role="dialog" aria-label="Diário de Missões">
      <header class="quest-journal-header"><div><span class="quest-journal-kicker">ASCENSION</span><h2>Diário de Missões</h2></div><button class="quest-journal-close" type="button" aria-label="Fechar">×</button></header>
      <div class="quest-tabs"><button class="quest-tab active" data-tab="active" type="button">Em andamento</button><button class="quest-tab" data-tab="available" type="button">Disponíveis</button><button class="quest-tab" data-tab="completed" type="button">Concluídas</button></div>
      <div class="quest-journal-body"><div class="quest-list"></div><div class="quest-detail"></div></div>
      <footer class="quest-journal-footer"><span>Rastreie uma missão para vê-la na HUD · clique em ⇢ para navegar.</span><span><kbd>J</kbd> diário · <kbd>Esc</kbd> fechar</span></footer>
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

  const showRouteFeedback = (message: string, ok: boolean) => {
    detailHost.querySelector('.quest-route-feedback')?.remove();
    const node = document.createElement('div');
    node.className = `quest-route-feedback${ok ? ' ok' : ' error'}`;
    node.textContent = message;
    detailHost.prepend(node);
    window.setTimeout(() => node.remove(), 3200);
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
      const typeIcon: Record<string, string> = { kill: '⚔', boss: '♛', collect: '◆', deliver: '▣', talk: '💬', visit: '⌖', interact: '✦', gather: '⛏', craft: '⚒', use: '◇', wait: '◷' };
      const targetName = objectiveTargetName(objective);
      const canRoute = Boolean(targetName && resolveObjectiveRoute(objective));
      return `<div class="quest-objective${value.done ? ' done' : ''}"><b>${value.done ? '✓' : typeIcon[objective.type] ?? '•'}</b><div><strong>${esc(objective.label)}</strong><small>${value.current}/${value.target}${quest.mode === 'sequential' ? ` · Etapa ${index + 1}` : ''}</small>${canRoute ? `<button class="quest-objective-route" type="button" data-route-objective="${index}" title="Auto-rota até ${esc(targetName)}">⇢ ${esc(targetName)}</button>` : ''}</div></div>`;
    }).join('');
    const canTrack = state.status === 'active' || state.status === 'ready';
    const relevantNpcId = state.status === 'ready' ? quest.endNpcId : state.status === 'not_started' ? quest.startNpcId : '';
    const relevantNpcLabel = relevantNpcId ? npcName(relevantNpcId) : '';
    detailHost.innerHTML = `
      <h3>${esc(quest.title)}</h3>
      <div class="quest-detail-meta"><span>${esc(CATEGORY_LABELS[quest.category])}</span><span>${esc(questStatusLabel(progress, quest))}</span><span>${quest.mode === 'sequential' ? 'Objetivos em sequência' : 'Objetivos paralelos'}</span>${quest.numericId ? `<span>Quest #${quest.numericId}</span>` : ''}</div>
      <p class="quest-detail-summary">${esc(quest.summary)}</p>
      <strong>Objetivos</strong><div class="quest-objectives">${objectiveRows}</div>
      <div class="quest-rewards"><strong>Recompensas</strong><br>${esc(rewardText(quest) || 'Sem recompensa definida')}</div>
      ${canTrack ? `<button class="quest-track${tracked ? ' tracked' : ''}" type="button"${tracked ? ' disabled' : ''}>${tracked ? '✓ Rastreando na HUD' : 'Rastrear na HUD'}</button>` : ''}
      <div class="quest-npc-route-row"><span>Início: <b>${esc(npcName(quest.startNpcId))}</b> · Entrega: <b>${esc(npcName(quest.endNpcId))}</b></span>${relevantNpcId ? `<button class="quest-npc-route" type="button" data-route-npc="${esc(relevantNpcId)}">⇢ Ir até ${esc(relevantNpcLabel)}</button>` : ''}</div>`;

    if (!tracked) detailHost.querySelector<HTMLButtonElement>('.quest-track')?.addEventListener('click', () => { setTrackedQuest(progress, quest.id); callbacks.onChanged?.(); render(); });
    detailHost.querySelectorAll<HTMLButtonElement>('[data-route-objective]').forEach((button) => button.addEventListener('click', async () => {
      const objective = quest.objectives[Number(button.dataset.routeObjective)];
      if (!objective) return;
      const result = await navigateToQuestObjective(objective);
      showRouteFeedback(result.message, result.ok);
      if (result.ok) root.classList.add('quest-journal-hidden');
    }));
    detailHost.querySelector<HTMLButtonElement>('[data-route-npc]')?.addEventListener('click', async (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      const id = button.dataset.routeNpc!;
      const result = await navigateToQuestNpc(id, npcName(id));
      showRouteFeedback(result.message, result.ok);
      if (result.ok) root.classList.add('quest-journal-hidden');
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
      button.innerHTML = `<strong>${esc(quest.title)}</strong><span>${esc(questStatusLabel(progress, quest))}</span><em>${state.status === 'ready' ? 'Pronta para entregar' : esc(CATEGORY_LABELS[quest.category])}</em>`;
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
