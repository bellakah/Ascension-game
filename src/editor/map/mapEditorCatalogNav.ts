import './mapEditorCatalogNav.css';
import { npcIdFromAssetId } from '../../npc/npcStore';
import { monsterIdFromAssetId } from '../../monsterEditor/monsterStore';
import { collectibleIdFromAssetId } from '../../gathering/collectibleStore';

type CatalogEditor = 'actors' | 'items' | 'collectibles' | 'quests' | 'events' | 'shops' | 'crafts' | 'classes' | 'skills';

function editorUrl(editor: CatalogEditor, section?: 'npc' | 'monster', id?: string) {
  const url = new URL(window.location.href);
  url.searchParams.delete('playtest');
  url.searchParams.set('editor', editor);
  if (section) url.searchParams.set('section', section); else url.searchParams.delete('section');
  if (id) url.searchParams.set('id', id); else url.searchParams.delete('id');
  return url.toString();
}

function createEditorButton(id: string, label: string, title: string, target: CatalogEditor) {
  const button = document.createElement('button');
  button.id = id;
  button.type = 'button';
  button.className = 'mep-catalog-nav-button';
  button.textContent = label;
  button.title = title;
  button.onclick = () => { window.location.href = editorUrl(target); };
  return button;
}

export function installMapEditorCatalogNav() {
  const root = document.querySelector<HTMLElement>('.mep');
  const mode = root?.querySelector<HTMLElement>('.mep-mode');
  const inspector = root?.querySelector<HTMLElement>('#mep-inspector-body');
  if (!root || !mode || root.dataset.catalogNavInstalled === '1') return;
  root.dataset.catalogNavInstalled = '1';

  const actors = createEditorButton('mep-open-actors-editor', 'NPCs / Monstros', 'Abrir o editor de NPCs e Monstros', 'actors');
  const items = createEditorButton('mep-open-items-editor', 'Itens', 'Abrir o Item Studio', 'items');
  const collectibles = createEditorButton('mep-open-collectibles-editor', 'Coletáveis', 'Abrir o editor de recursos coletáveis', 'collectibles');
  const quests = createEditorButton('mep-open-quests-editor', 'Missões', 'Abrir o Mission Studio', 'quests');
  const events = createEditorButton('mep-open-events-editor', 'Eventos', 'Abrir o Event Studio', 'events');
  const shops = createEditorButton('mep-open-shops-editor', 'Lojas', 'Abrir o Shop Studio', 'shops');
  const crafts = createEditorButton('mep-open-crafts-editor', 'Crafting', 'Abrir o Craft Studio', 'crafts');
  const classes = createEditorButton('mep-open-classes-editor', 'Classes', 'Abrir o Class Studio', 'classes');
  const skills = createEditorButton('mep-open-skills-editor', 'Skills', 'Abrir o Skill Studio', 'skills');
  mode.append(actors, items, collectibles, quests, events, shops, crafts, classes, skills);

  if (!inspector) return;

  let activeKey = '';
  let frame = 0;
  const enhanceInspector = () => {
    frame = 0;
    const canvas = inspector.querySelector<HTMLCanvasElement>('.mep-inspector-hero canvas[data-asset]');
    const assetId = canvas?.dataset.asset ?? '';
    const npcId = npcIdFromAssetId(assetId), monsterId = monsterIdFromAssetId(assetId), collectibleId = collectibleIdFromAssetId(assetId);
    const key = npcId ? `npc:${npcId}` : monsterId ? `monster:${monsterId}` : collectibleId ? `collectible:${collectibleId}` : '';
    const existing = inspector.querySelector<HTMLElement>('.catalog-editor-link');
    if (key === activeKey && existing?.dataset.catalogKey === key) return;
    existing?.remove(); activeKey = key; if (!key) return;
    const holder = document.createElement('div'); holder.className = 'catalog-editor-link'; holder.dataset.catalogKey = key;
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = npcId ? '♟ Editar no NPC Studio' : monsterId ? '☠ Editar no Monster Studio' : '⛏ Editar no Collectible Studio';
    button.onclick = () => {
      if (collectibleId) window.location.href = editorUrl('collectibles', undefined, collectibleId);
      else window.location.href = editorUrl('actors', npcId ? 'npc' : 'monster', npcId ?? monsterId ?? undefined);
    };
    holder.appendChild(button); inspector.appendChild(holder);
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(enhanceInspector); };
  const observer = new MutationObserver((mutations) => { if (mutations.every((mutation) => (mutation.target as HTMLElement).closest?.('.catalog-editor-link'))) return; schedule(); });
  observer.observe(inspector, { childList: true, subtree: true });
  window.addEventListener('pagehide', () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame); }, { once: true });
  enhanceInspector();
}
