import { MAP_PALETTE_ENTRIES } from '../editor/map/mapEditorCatalog';
import { loadOrCreateActiveMap } from '../editor/map/mapEditorStorage';
import { createNpcStudio } from './npcStudio';
import { getNpcDefinition, NPC_ASSET_PREFIX, npcAssetId, npcIdFromAssetId, saveNpcDefinition, syncNpcDefinitionsIntoPalette } from './npcStore';
import { openNpcRouteStudio } from './npcRouteStudio';

const STUDIO_OPEN_EVENT = 'ascension-editor-studio-open';

function normalizeAnimatedPreviewRects() {
  for (const entry of MAP_PALETTE_ENTRIES) {
    const sprite = entry.sprite;
    const firstFrame = sprite?.animation?.frames[0];
    if (!sprite || sprite.sourceRect || !firstFrame) continue;
    sprite.sourceRect = { x: firstFrame.x, y: firstFrame.y, width: firstFrame.width, height: firstFrame.height };
  }
}

export function installNpcEditorIntegration() {
  const root = document.querySelector<HTMLElement>('.mep');
  const mode = root?.querySelector<HTMLElement>('.mep-mode');
  const inspectorBody = root?.querySelector<HTMLElement>('#mep-inspector-body');
  if (!root || !mode || !inspectorBody || root.dataset.npcStudioInstalled === '1') return;
  root.dataset.npcStudioInstalled = '1';
  normalizeAnimatedPreviewRects();
  syncNpcDefinitionsIntoPalette();
  normalizeAnimatedPreviewRects();

  const studio = createNpcStudio(root);
  const npcMode = document.createElement('button');
  npcMode.id = 'mep-mode-npcs';
  npcMode.textContent = 'NPCs';
  npcMode.title = 'Criador e editor profissional de NPCs';
  mode.appendChild(npcMode);

  const closeStudio = () => {
    studio.close();
    npcMode.classList.remove('active');
  };
  const openStudio = (npcId?: string) => {
    window.dispatchEvent(new CustomEvent(STUDIO_OPEN_EVENT, { detail: { kind: 'npc' } }));
    studio.open(npcId);
  };

  npcMode.onclick = () => openStudio();
  root.querySelector<HTMLButtonElement>('#mep-mode-map')?.addEventListener('click', closeStudio, { capture: true });
  root.querySelector<HTMLButtonElement>('#mep-mode-world')?.addEventListener('click', closeStudio, { capture: true });
  window.addEventListener(STUDIO_OPEN_EVENT, (event) => {
    const kind = (event as CustomEvent<{ kind?: string }>).detail?.kind;
    if (kind && kind !== 'npc') closeStudio();
  });

  const place = document.createElement('button');
  place.className = 'npc-primary';
  place.textContent = '＋ Colocar no mapa';
  place.title = 'Salva o NPC e seleciona sua ferramenta de colocação no mapa';
  const back = studio.element.querySelector<HTMLButtonElement>('#npc-studio-back');
  back?.before(place);
  place.onclick = () => {
    studio.element.querySelector<HTMLButtonElement>('#npc-save')?.click();
    const activeId = studio.element.querySelector<HTMLButtonElement>('.npc-list-card.active')?.dataset.npc;
    if (!activeId) return;
    const definition = getNpcDefinition(activeId); if (!definition) return;
    closeStudio();
    root.querySelector<HTMLButtonElement>('[data-rail="objects"]')?.click();
    const search = root.querySelector<HTMLInputElement>('#mep-search');
    if (search) {
      search.value = definition.name;
      search.dispatchEvent(new Event('input', { bubbles: true }));
    }
    window.setTimeout(() => {
      const card = root.querySelector<HTMLElement>(`[data-card="${CSS.escape(npcAssetId(activeId))}"]`);
      card?.click();
      if (search && card) { search.value = ''; search.dispatchEvent(new Event('input', { bubbles: true })); }
    }, 180);
  };

  const enhanceInspector = () => {
    const heroCanvas = inspectorBody.querySelector<HTMLCanvasElement>('.mep-inspector-hero canvas[data-asset]');
    const assetId = heroCanvas?.dataset.asset ?? '';
    const npcId = npcIdFromAssetId(assetId);
    if (!npcId || inspectorBody.querySelector('.npc-editor-integration-actions')) return;
    const definition = getNpcDefinition(npcId);
    if (!definition) return;
    const actions = document.createElement('div');
    actions.className = 'npc-editor-integration-actions';
    actions.innerHTML = '<button data-npc-edit>♟ Editar NPC</button><button data-npc-route>⌁ Editar rota</button>';
    inspectorBody.appendChild(actions);
    actions.querySelector<HTMLButtonElement>('[data-npc-edit]')!.onclick = () => openStudio(npcId);
    actions.querySelector<HTMLButtonElement>('[data-npc-route]')!.onclick = () => {
      root.querySelector<HTMLButtonElement>('#mep-save')?.click();
      window.setTimeout(() => {
        const map = loadOrCreateActiveMap();
        const x = Number(inspectorBody.querySelector<HTMLInputElement>('#mep-obj-x')?.value);
        const y = Number(inspectorBody.querySelector<HTMLInputElement>('#mep-obj-y')?.value);
        const candidates = map.objects.filter((object) => object.assetId === assetId);
        const object = candidates.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
        const currentDefinition = getNpcDefinition(npcId);
        if (!object || !currentDefinition) return;
        openNpcRouteStudio(map, object, currentDefinition);
      }, 60);
    };
  };

  const observer = new MutationObserver(enhanceInspector);
  observer.observe(inspectorBody, { childList: true, subtree: true });
  enhanceInspector();

  window.addEventListener('ascension-asset-preset-change', (event) => {
    const detail = (event as CustomEvent<{ assetId?: string; preset?: { scale?: number } }>).detail;
    const assetId = detail?.assetId ?? '';
    if (!assetId.startsWith(NPC_ASSET_PREFIX)) return;
    const npcId = npcIdFromAssetId(assetId);
    if (!npcId) return;
    const definition = getNpcDefinition(npcId);
    if (!definition) return;
    const scale = Number(detail?.preset?.scale);
    if (!Number.isFinite(scale)) return;
    definition.appearance.scale = Math.max(.1, Math.min(10, scale));
    saveNpcDefinition(definition);
    syncNpcDefinitionsIntoPalette();
    normalizeAnimatedPreviewRects();
    window.dispatchEvent(new Event('resize'));
  });

  window.addEventListener('ascension-npc-definitions-change', () => {
    syncNpcDefinitionsIntoPalette();
    normalizeAnimatedPreviewRects();
    window.dispatchEvent(new Event('resize'));
  });
}
