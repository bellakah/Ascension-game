import { createStandaloneStudioShell } from './standaloneStudioShell';
import { hydrateAssetLibraryV2 } from './map/mapAssetLibraryV2';
import { ensureLegacyStudioDefinitions } from './studioLegacyMigration';
import { createNpcStudio } from '../npc/npcStudio';
import { hydrateNpcDefinitionsIntoPalette } from '../npc/npcStore';
import { createMonsterStudio } from '../monsterEditor/monsterStudio';
import { hydrateMonsterDefinitionsIntoPalette } from '../monsterEditor/monsterStore';
import { ensureItemStudioMigration } from '../items/itemStudioStore';
import { installMonsterDropItemPicker } from '../items/monsterDropItemPicker';
import { installStudioAppearanceUx } from './studioAppearanceUx';
import { installStudioAnimationStateTabsIntegration } from './studioAnimationStateTabsIntegration';

export async function startActorsEditor() {
  const shell = createStandaloneStudioShell('actors');
  await hydrateAssetLibraryV2();
  ensureLegacyStudioDefinitions();
  ensureItemStudioMigration();
  hydrateNpcDefinitionsIntoPalette();
  hydrateMonsterDefinitionsIntoPalette();

  const npcStudio = createNpcStudio(shell.root);
  const monsterStudio = createMonsterStudio(shell.root);
  const npcButton = shell.root.querySelector<HTMLButtonElement>('#mep-mode-npcs')!;
  const monsterButton = shell.root.querySelector<HTMLButtonElement>('#mep-mode-monsters')!;
  const itemButton = shell.root.querySelector<HTMLButtonElement>('#mep-mode-items')!;

  const openNpc = () => {
    monsterStudio.close();
    npcStudio.open();
    shell.setActive('npcs');
  };
  const openMonster = () => {
    npcStudio.close();
    monsterStudio.open();
    shell.setActive('monsters');
  };

  npcButton.onclick = openNpc;
  monsterButton.onclick = openMonster;
  itemButton.onclick = () => shell.navigate('items');

  npcStudio.element.querySelector<HTMLButtonElement>('#npc-studio-back')!.onclick = () => shell.navigate('map');
  monsterStudio.element.querySelector<HTMLButtonElement>('#monster-studio-back')!.onclick = () => shell.navigate('map');

  installStudioAppearanceUx();
  installStudioAnimationStateTabsIntegration();
  installMonsterDropItemPicker();

  const requested = new URLSearchParams(window.location.search).get('section');
  if (requested === 'npc') openNpc();
  else openMonster();
}
