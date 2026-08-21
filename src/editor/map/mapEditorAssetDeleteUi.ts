import './mapEditorPublishUi.css';
import { deleteLibraryAsset, isV2LibraryAsset } from './mapAssetLibraryV2';
import { MAP_PALETTE_ENTRIES } from './mapEditorCatalog';
import { listMapDocuments, saveMapDocument } from './mapEditorStorage';
import type { AscensionMapDocument } from './mapEditorTypes';
import { loadPublishedMap, publishMap } from '../../map/publishedMapStore';

const FAVORITES_KEY = 'ascension.map-editor.favorites.v2';
const RECENTS_KEY = 'ascension.map-editor.recents.v2';

function countReferences(document: AscensionMapDocument, assetId: string) {
  let count = document.objects.filter((object) => object.assetId === assetId).length;
  for (const tile of Object.values(document.tiles)) {
    if (tile.ground === assetId) count++;
    if (tile.detail === assetId) count++;
  }
  return count;
}

function removeReferences(document: AscensionMapDocument, assetId: string) {
  let changed = false;
  const before = document.objects.length;
  document.objects = document.objects.filter((object) => object.assetId !== assetId);
  if (document.objects.length !== before) changed = true;
  for (const tile of Object.values(document.tiles)) {
    if (tile.ground === assetId) { tile.ground = 'grass'; changed = true; }
    if (tile.detail === assetId) { delete tile.detail; changed = true; }
  }
  return changed;
}

function removeStoredId(key: string, assetId: string) {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (Array.isArray(value)) localStorage.setItem(key, JSON.stringify(value.map(String).filter((id) => id !== assetId)));
  } catch { /* ignore malformed preference */ }
}

async function removeAsset(assetId: string) {
  const asset = MAP_PALETTE_ENTRIES.find((entry) => entry.id === assetId);
  if (!asset || !isV2LibraryAsset(asset)) return;

  const documents = listMapDocuments();
  const usages = documents.map((document) => ({ document, count: countReferences(document, assetId) })).filter((value) => value.count > 0);
  const total = usages.reduce((sum, value) => sum + value.count, 0);
  const published = loadPublishedMap();
  const publishedCount = published ? countReferences(published.document, assetId) : 0;
  const mapNames = usages.slice(0, 4).map((value) => `${value.document.name} (${value.count})`).join(', ');
  const extra = usages.length > 4 ? ` e mais ${usages.length - 4}` : '';
  const warning = total > 0
    ? `\n\nEste asset está sendo usado ${total} vez(es) em: ${mapNames}${extra}. Ao excluir, objetos serão removidos e terrenos serão substituídos por grama.`
    : '';
  const publishedWarning = publishedCount > 0 ? '\n\nEle também está na versão PUBLICADA. A publicação será corrigida automaticamente e o jogo aberto será atualizado.' : '';
  if (!window.confirm(`Excluir “${asset.label}” permanentemente da biblioteca?${warning}${publishedWarning}\n\nEsta ação não pode ser desfeita.`)) return;

  const currentId = document.querySelector<HTMLSelectElement>('#me2-map-select')?.value ?? '';
  const changed: AscensionMapDocument[] = [];
  for (const document of documents) {
    if (removeReferences(document, assetId)) changed.push(document);
  }
  for (const document of changed.filter((value) => value.id !== currentId)) saveMapDocument(document);
  const current = changed.find((value) => value.id === currentId);
  if (current) saveMapDocument(current);

  if (published && removeReferences(published.document, assetId)) publishMap(published.document);
  await deleteLibraryAsset(assetId);
  removeStoredId(FAVORITES_KEY, assetId);
  removeStoredId(RECENTS_KEY, assetId);
  window.location.reload();
}

function decorateCards() {
  document.querySelectorAll<HTMLElement>('.me2-asset-card[data-asset-card]').forEach((card) => {
    if (card.querySelector('.me2-asset-delete')) return;
    const id = card.dataset.assetCard;
    if (!id) return;
    const asset = MAP_PALETTE_ENTRIES.find((entry) => entry.id === id);
    if (!asset || !isV2LibraryAsset(asset)) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'me2-asset-delete';
    button.textContent = '🗑';
    button.title = `Excluir ${asset.label} da biblioteca`;
    button.setAttribute('aria-label', `Excluir ${asset.label}`);
    button.onclick = (event) => { event.preventDefault(); event.stopPropagation(); void removeAsset(id); };
    card.appendChild(button);
  });
}

export function installMapEditorAssetDeleteUi() {
  decorateCards();
  const grid = document.querySelector('#me2-asset-grid');
  if (!grid) return;
  const observer = new MutationObserver(decorateCards);
  observer.observe(grid, { childList: true, subtree: true });
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
}
