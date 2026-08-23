import './style.css';
import './game/game.css';
import './character/characterSheetHud.css';
import './crafting/craftingUi.css';
import './settings/gameMenuHud.css';
import './chat/chatPauseProxy.css';
import './guild/guildPauseProxy.css';
import './guild/guildHud.css';
import { prepareChatBootstrap } from './chat/chatBootstrap';
import { prepareGuildBootstrap } from './guild/guildBootstrap';
import { startGame } from './game/runtime';
import './game/responsive.css';
import { installResponsiveUi } from './game/responsive';
import { preparePublishedWorldRuntime } from './map/publishedMapRuntime';
import { subscribePublishedMap } from './map/publishedMapStore';
import { hydrateNpcDefinitionsIntoPalette } from './npc/npcStore';
import { installPublishedNpcRuntime } from './npc/npcRuntime';
import { hydrateMonsterDefinitionsIntoPalette } from './monsterEditor/monsterStore';

export async function startGameApp() {
  installResponsiveUi();
  const chatBootstrap = prepareChatBootstrap();
  const guildBootstrap = prepareGuildBootstrap();
  hydrateNpcDefinitionsIntoPalette();
  hydrateMonsterDefinitionsIntoPalette();
  await preparePublishedWorldRuntime();
  await installPublishedNpcRuntime();
  const unsubscribePublished = subscribePublishedMap(() => {
    sessionStorage.setItem('ascension.map.just-published.v1', '1');
    window.location.reload();
  });
  window.addEventListener('pagehide', unsubscribePublished, { once: true });

  return startGame().then(() => {
    if (!document.querySelector('#hud')) return;
    chatBootstrap.attach();
    guildBootstrap.attach({ beforeOpen: () => chatBootstrap.chat?.close() });
  });
}
