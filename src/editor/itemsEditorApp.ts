import { createStandaloneStudioShell } from './standaloneStudioShell';
import { createItemStudio } from '../items/itemStudio';
import { ensureItemStudioMigration } from '../items/itemStudioStore';
import { installItemClassStudioIntegration } from './itemClassStudioIntegration';

function actorsUrl(section: 'npc' | 'monster') {
  const url = new URL(window.location.href);
  url.searchParams.delete('playtest');
  url.searchParams.set('editor', 'actors');
  url.searchParams.set('section', section);
  return url.toString();
}

export function startItemsEditor() {
  const shell = createStandaloneStudioShell('items');
  ensureItemStudioMigration();

  const studio = createItemStudio(shell.root);
  installItemClassStudioIntegration(studio.element);
  shell.root.querySelector<HTMLButtonElement>('#mep-mode-npcs')!.onclick = () => { window.location.href = actorsUrl('npc'); };
  shell.root.querySelector<HTMLButtonElement>('#mep-mode-monsters')!.onclick = () => { window.location.href = actorsUrl('monster'); };
  shell.root.querySelector<HTMLButtonElement>('#mep-mode-items')!.onclick = () => studio.open();
  studio.element.querySelector<HTMLButtonElement>('#item-studio-back')!.onclick = () => shell.navigate('map');

  studio.open();
  shell.setActive('items');
}
