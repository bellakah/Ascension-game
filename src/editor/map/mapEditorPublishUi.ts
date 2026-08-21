import './mapEditorPublishUi.css';
import { loadMapDocument } from './mapEditorStorage';
import { loadPublishedMap, publishMap } from '../../map/publishedMapStore';

function showNote(message: string) {
  let note = document.querySelector<HTMLElement>('.me2-publish-note');
  if (!note) {
    note = document.createElement('div');
    note.className = 'me2-publish-note';
    document.body.appendChild(note);
  }
  note.textContent = message;
  note.classList.add('show');
  window.setTimeout(() => note?.classList.remove('show'), 2600);
}

function currentMapId() {
  return document.querySelector<HTMLSelectElement>('#me2-map-select')?.value || null;
}

export function installMapEditorPublishUi() {
  const topbar = document.querySelector<HTMLElement>('.me2-topbar');
  const saveButton = document.querySelector<HTMLButtonElement>('#me2-save');
  const mapSelect = document.querySelector<HTMLSelectElement>('#me2-map-select');
  if (!topbar || !saveButton || !mapSelect || document.querySelector('#me2-publish')) return;

  const publishButton = document.createElement('button');
  publishButton.id = 'me2-publish';
  publishButton.className = 'me2-publish';
  publishButton.textContent = 'SALVAR E PUBLICAR';
  publishButton.title = 'Salvar este Draft e torná-lo imediatamente o mapa ativo do jogo';
  saveButton.insertAdjacentElement('afterend', publishButton);

  const statusBadge = document.createElement('span');
  statusBadge.className = 'me2-published-badge';
  statusBadge.hidden = true;
  const stageTabs = document.querySelector<HTMLElement>('.me2-stage-tabs');
  stageTabs?.appendChild(statusBadge);

  const refreshStatus = () => {
    const id = currentMapId();
    const published = loadPublishedMap();
    const current = id ? loadMapDocument(id) : null;
    const isPublished = Boolean(current && published?.document.id === current.id && published.document.updatedAt >= current.updatedAt);
    publishButton.classList.toggle('published', isPublished);
    publishButton.textContent = isPublished ? '✓ PUBLICADO' : 'SALVAR E PUBLICAR';
    statusBadge.hidden = !isPublished;
    statusBadge.textContent = isPublished ? '● VERSÃO ATIVA NO JOGO' : '';
  };

  publishButton.onclick = async () => {
    const id = currentMapId();
    if (!id) return;
    const previous = loadPublishedMap();
    const isFirst = !previous;
    const question = isFirst
      ? 'Salvar e publicar este mapa como mapa ativo do jogo?\n\nO Draft continuará separado. Se o jogo estiver aberto em outra aba, ele será atualizado automaticamente.'
      : `Salvar e substituir a versão publicada de “${previous.document.name}” por este Draft?\n\nO jogo aberto em outra aba será atualizado automaticamente.`;
    if (!window.confirm(question)) return;

    publishButton.classList.add('busy');
    publishButton.textContent = 'PUBLICANDO…';
    try {
      saveButton.click();
      await Promise.resolve();
      const document = loadMapDocument(id);
      if (!document) throw new Error('Não foi possível localizar o mapa salvo.');
      publishMap(document);
      publishButton.classList.add('published');
      statusBadge.hidden = false;
      statusBadge.textContent = '● VERSÃO ATIVA NO JOGO';
      showNote(`✓ ${document.name} publicado. O jogo já usa esta versão sem novo deploy.`);
    } catch (error) {
      showNote(error instanceof Error ? error.message : 'Falha ao publicar mapa.');
    } finally {
      publishButton.classList.remove('busy');
      refreshStatus();
    }
  };

  mapSelect.addEventListener('change', () => window.setTimeout(refreshStatus));
  saveButton.addEventListener('click', () => window.setTimeout(refreshStatus));
  refreshStatus();
}
