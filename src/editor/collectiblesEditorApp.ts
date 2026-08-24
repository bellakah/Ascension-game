import { createStandaloneStudioShell } from './standaloneStudioShell';
import { hydrateAssetLibraryV2 } from './map/mapAssetLibraryV2';
import { ensureItemStudioMigration } from '../items/itemStudioStore';
import { ensureDefaultGatheringTools } from '../gathering/gatheringToolMigration';
import { ensureCollectibleMigration } from '../gathering/collectibleStore';
import { createCollectibleStudio } from '../gathering/collectibleStudio';

function actorsUrl(section: 'npc' | 'monster') {
  const url = new URL(window.location.href);
  url.searchParams.delete('playtest');
  url.searchParams.set('editor', 'actors');
  url.searchParams.set('section', section);
  url.searchParams.delete('id');
  return url.toString();
}

export async function startCollectiblesEditor() {
  const shell = createStandaloneStudioShell('collectibles');
  await hydrateAssetLibraryV2();
  ensureItemStudioMigration();
  ensureDefaultGatheringTools();
  ensureCollectibleMigration();

  const studio = createCollectibleStudio(shell.root);
  shell.root.querySelector<HTMLButtonElement>('#mep-mode-npcs')!.onclick = () => { window.location.href = actorsUrl('npc'); };
  shell.root.querySelector<HTMLButtonElement>('#mep-mode-monsters')!.onclick = () => { window.location.href = actorsUrl('monster'); };
  shell.root.querySelector<HTMLButtonElement>('#mep-mode-items')!.onclick = () => shell.navigate('items');
  shell.root.querySelector<HTMLButtonElement>('#mep-mode-collectibles')!.onclick = () => studio.open();
  studio.element.querySelector<HTMLButtonElement>('#collectible-back')!.onclick = () => shell.navigate('map');

  studio.open(new URLSearchParams(window.location.search).get('id') ?? undefined);
  shell.setActive('collectibles');
}
