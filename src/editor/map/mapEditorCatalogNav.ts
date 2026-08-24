import './mapEditorCatalogNav.css';
import { npcIdFromAssetId } from '../../npc/npcStore';
import { monsterIdFromAssetId } from '../../monsterEditor/monsterStore';
import { collectibleIdFromAssetId } from '../../gathering/collectibleStore';

function editorUrl(editor: 'actors' | 'items' | 'collectibles', section?: 'npc' | 'monster', id?: string) {
  const url = new URL(window.location.href);
  url.searchParams.delete('playtest');
  url.searchParams.set('editor', editor);
  if (section) url.searchParams.set('section', section); else url.searchParams.delete('section');
  if (id) url.searchParams.set('id', id); else url.searchParams.delete('id');
  return url.toString();
}

export function installMapEditorCatalogNav() {
  const root = document.querySelector<HTMLElement>('.mep');
  const mode = root?.querySelector<HTMLElement>('.mep-mode');
  const inspector = root?.querySelector<HTMLElement>('#mep-inspector-body');
  if (!root || !mode || root.dataset.catalogNavInstalled === '1') return;
  root.dataset.catalogNavInstalled = '1';

  const actors = document.createElement('button');
  actors.id = 'mep-open-actors-editor';
  actors.type = 'button';
  actors.textContent = 'NPCs / Monstros';
  actors.title = 'Abrir o editor separado de NPCs e Monstros';
  actors.onclick = () => { window.location.href = editorUrl('actors'); };

  const items = document.createElement('button');
  items.id = 'mep-open-items-editor';
  items.type = 'button';
  items.textContent = 'Itens';
  items.title = 'Abrir o Item Studio separado';
  items.onclick = () => { window.location.href = editorUrl('items'); };

  const collectibles = document.createElement('button');
  collectibles.id = 'mep-open-collectibles-editor';
  collectibles.type = 'button';
  collectibles.textContent = 'Coletáveis';
  collectibles.title = 'Abrir o editor separado de recursos coletáveis';
  collectibles.onclick = () => { window.location.href = editorUrl('collectibles'); };
  mode.append(actors, items, collectibles);

  if (!inspector) return;
  const enhanceInspector = () => {
    inspector.querySelector('.catalog-editor-link')?.remove();
    const canvas = inspector.querySelector<HTMLCanvasElement>('.mep-inspector-hero canvas[data-asset]');
    const assetId = canvas?.dataset.asset ?? '';
    const npcId = npcIdFromAssetId(assetId);
    const monsterId = monsterIdFromAssetId(assetId);
    const collectibleId = collectibleIdFromAssetId(assetId);
    if (!npcId && !monsterId && !collectibleId) return;

    const holder = document.createElement('div');
    holder.className = 'catalog-editor-link';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = npcId ? '♟ Editar no NPC Studio' : monsterId ? '☠ Editar no Monster Studio' : '⛏ Editar no Collectible Studio';
    button.onclick = () => {
      if (collectibleId) window.location.href = editorUrl('collectibles', undefined, collectibleId);
      else window.location.href = editorUrl('actors', npcId ? 'npc' : 'monster', npcId ?? monsterId ?? undefined);
    };
    holder.appendChild(button);
    inspector.appendChild(holder);
  };

  const observer = new MutationObserver(enhanceInspector);
  observer.observe(inspector, { childList: true, subtree: true });
  enhanceInspector();
}
