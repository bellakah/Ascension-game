import { createMonsterStudio } from './monsterStudio';
import { getMonsterDefinition, monsterAssetId, monsterIdFromAssetId, syncMonsterDefinitionsIntoPalette } from './monsterStore';

export function installMonsterEditorIntegration() {
  const root = document.querySelector<HTMLElement>('.mep');
  const mode = root?.querySelector<HTMLElement>('.mep-mode');
  const inspectorBody = root?.querySelector<HTMLElement>('#mep-inspector-body');
  if (!root || !mode || !inspectorBody || root.dataset.monsterStudioInstalled === '1') return;
  root.dataset.monsterStudioInstalled = '1';
  syncMonsterDefinitionsIntoPalette();

  const studio = createMonsterStudio(root);
  const monsterMode = document.createElement('button');
  monsterMode.id = 'mep-mode-monsters';
  monsterMode.textContent = 'Monstros';
  monsterMode.title = 'Criador e editor profissional de monstros';
  mode.appendChild(monsterMode);
  monsterMode.onclick = () => studio.open();

  const place = document.createElement('button');
  place.className = 'npc-primary';
  place.textContent = '＋ Colocar no mapa';
  place.title = 'Salva o monstro e seleciona sua ferramenta de colocação';
  const back = studio.element.querySelector<HTMLButtonElement>('#monster-studio-back');
  back?.before(place);
  place.onclick = () => {
    studio.element.querySelector<HTMLButtonElement>('#monster-save')?.click();
    const activeId = studio.element.querySelector<HTMLButtonElement>('.npc-list-card.active')?.dataset.monster;
    if (!activeId) return;
    const definition = getMonsterDefinition(activeId); if (!definition) return;
    studio.close();
    root.querySelector<HTMLButtonElement>('[data-rail="objects"]')?.click();
    const search = root.querySelector<HTMLInputElement>('#mep-search');
    if (search) { search.value = definition.name; search.dispatchEvent(new Event('input', { bubbles: true })); }
    window.setTimeout(() => {
      const card = root.querySelector<HTMLElement>(`[data-card="${CSS.escape(monsterAssetId(activeId))}"]`);
      card?.click();
      if (search && card) { search.value = ''; search.dispatchEvent(new Event('input', { bubbles: true })); }
    }, 180);
  };

  const enhanceInspector = () => {
    const heroCanvas = inspectorBody.querySelector<HTMLCanvasElement>('.mep-inspector-hero canvas[data-asset]');
    const assetId = heroCanvas?.dataset.asset ?? '';
    const monsterId = monsterIdFromAssetId(assetId);
    if (!monsterId || inspectorBody.querySelector('.monster-editor-integration-actions')) return;
    const definition = getMonsterDefinition(monsterId); if (!definition) return;
    const actions = document.createElement('div');
    actions.className = 'npc-editor-integration-actions monster-editor-integration-actions';
    actions.innerHTML = '<button data-monster-edit>☠ Editar monstro</button>';
    inspectorBody.appendChild(actions);
    actions.querySelector<HTMLButtonElement>('[data-monster-edit]')!.onclick = () => studio.open(monsterId);
  };

  const observer = new MutationObserver(enhanceInspector);
  observer.observe(inspectorBody, { childList: true, subtree: true });
  enhanceInspector();

  window.addEventListener('ascension-monster-definitions-change', () => {
    syncMonsterDefinitionsIntoPalette();
    window.dispatchEvent(new Event('resize'));
  });
}
