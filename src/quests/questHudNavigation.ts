import './questHudNavigation.css';
import { QUEST_CATALOG } from './questCatalog';
import { navigateToQuestNpc, navigateToQuestObjective, resolveObjectiveRoute, resolveNpcRoute } from './questNavigation';

export function installQuestHudNavigation() {
  const box = document.querySelector<HTMLElement>('#quest-box');
  const title = document.querySelector<HTMLElement>('#quest-title');
  const text = document.querySelector<HTMLElement>('#quest-text');
  if (!box || !title || !text) return;

  const route = document.createElement('button');
  route.type = 'button';
  route.id = 'quest-hud-auto-route';
  route.hidden = true;
  route.title = 'Auto-rota até o objetivo rastreado';
  box.appendChild(route);

  let action: (() => Promise<void>) | null = null;
  const sync = () => {
    action = null;
    route.hidden = true;
    const quest = QUEST_CATALOG.find((entry) => entry.title === title.textContent?.trim());
    if (!quest) return;
    const content = text.textContent?.trim() ?? '';

    if (content.startsWith('Objetivos concluídos. Volte para')) {
      const target = resolveNpcRoute(quest.endNpcId);
      if (!target) return;
      route.textContent = `⇢ ${target.label}`;
      route.hidden = false;
      action = async () => { const result = await navigateToQuestNpc(quest.endNpcId, target.label); if (!result.ok) showMessage(result.message); };
      return;
    }

    const label = content.split(' — ')[0]?.trim();
    const objective = quest.objectives.find((entry) => entry.label === label);
    if (!objective) return;
    const target = resolveObjectiveRoute(objective);
    if (!target) return;
    route.textContent = `⇢ ${target.label}`;
    route.hidden = false;
    action = async () => { const result = await navigateToQuestObjective(objective); if (!result.ok) showMessage(result.message); };
  };

  const showMessage = (message: string) => {
    const previous = box.querySelector<HTMLElement>('.quest-hud-route-message'); previous?.remove();
    const node = document.createElement('div'); node.className = 'quest-hud-route-message'; node.textContent = message; box.appendChild(node);
    window.setTimeout(() => node.remove(), 2800);
  };

  route.addEventListener('pointerdown', (event) => { event.preventDefault(); event.stopPropagation(); void action?.(); });
  const observer = new MutationObserver(sync);
  observer.observe(title, { childList: true, characterData: true, subtree: true });
  observer.observe(text, { childList: true, characterData: true, subtree: true });
  sync();

  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
}
