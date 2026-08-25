import { createStandaloneStudioShell } from './standaloneStudioShell';
import { hydrateAssetLibraryV2 } from './map/mapAssetLibraryV2';
import { ensureLegacyStudioDefinitions } from './studioLegacyMigration';
import { createNpcStudio } from '../npc/npcStudio';
import { hydrateNpcDefinitionsIntoPalette } from '../npc/npcStore';
import { createMonsterStudio } from '../monsterEditor/monsterStudio';
import { hydrateMonsterDefinitionsIntoPalette } from '../monsterEditor/monsterStore';
import { installStudioAppearanceUx } from './studioAppearanceUx';
import { installStudioAnimationStateTabsIntegration } from './studioAnimationStateTabsIntegration';
import { installNpcShopStudioIntegration } from './npcShopStudioIntegration';
import { installNpcCraftStudioIntegration } from './npcCraftStudioIntegration';

export async function startActorsEditor() {
  const shell = createStandaloneStudioShell('actors');
  await hydrateAssetLibraryV2();
  ensureLegacyStudioDefinitions();
  hydrateNpcDefinitionsIntoPalette();
  hydrateMonsterDefinitionsIntoPalette();

  const npcStudio = createNpcStudio(shell.root);
  const monsterStudio = createMonsterStudio(shell.root);
  const npcButton = shell.root.querySelector<HTMLButtonElement>('#mep-mode-npcs')!;
  const monsterButton = shell.root.querySelector<HTMLButtonElement>('#mep-mode-monsters')!;
  const itemButton = shell.root.querySelector<HTMLButtonElement>('#mep-mode-items')!;

  let dropPickerRequested = false;
  const ensureDropPicker = () => {
    if (dropPickerRequested) return;
    dropPickerRequested = true;
    window.setTimeout(() => {
      void import('../items/monsterDropItemPicker').then(({ installMonsterDropItemPicker }) => installMonsterDropItemPicker()).catch((error) => {
        console.error('[ActorsEditor] Falha ao carregar seletor de itens dos drops.', error);
        dropPickerRequested = false;
      });
    }, 0);
  };

  const openNpc = (npcId?: string) => { monsterStudio.close(); npcStudio.open(npcId); shell.setActive('npcs'); };
  const openMonster = (monsterId?: string) => { npcStudio.close(); monsterStudio.open(monsterId); shell.setActive('monsters'); ensureDropPicker(); };
  npcButton.onclick = () => openNpc();
  monsterButton.onclick = () => openMonster();
  itemButton.onclick = () => shell.navigate('items');
  npcStudio.element.querySelector<HTMLButtonElement>('#npc-studio-back')!.onclick = () => shell.navigate('map');
  monsterStudio.element.querySelector<HTMLButtonElement>('#monster-studio-back')!.onclick = () => shell.navigate('map');

  installStudioAppearanceUx();
  installStudioAnimationStateTabsIntegration();
  installNpcShopStudioIntegration(shell.root);
  installNpcCraftStudioIntegration(shell.root);

  const params = new URLSearchParams(window.location.search);
  const requested = params.get('section'), id = params.get('id') ?? undefined;
  if (requested === 'npc') openNpc(id); else openMonster(id);
}
