import './style.css';
import './game/game.css';
import './character/characterSheetHud.css';
import './crafting/craftingUi.css';
import './settings/gameMenuHud.css';
import './chat/chatPauseProxy.css';
import './guild/guildPauseProxy.css';
import { prepareChatBootstrap } from './chat/chatBootstrap';
import { prepareGuildBootstrap } from './guild/guildBootstrap';
import { startGame } from './game/runtime';
import './game/responsive.css';
import { installResponsiveUi } from './game/responsive';

installResponsiveUi();
const chatBootstrap = prepareChatBootstrap();
const guildBootstrap = prepareGuildBootstrap();
void startGame().then(() => {
  if (!document.querySelector('#hud')) return;
  chatBootstrap.attach();
  guildBootstrap.attach({ beforeOpen: () => chatBootstrap.chat?.close() });
});
