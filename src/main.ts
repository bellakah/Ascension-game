import './style.css';
import './game/game.css';
import './character/characterSheetHud.css';
import './crafting/craftingUi.css';
import './settings/gameMenuHud.css';
import './chat/chatPauseProxy.css';
import { prepareChatBootstrap } from './chat/chatBootstrap';
import { startGame } from './game/runtime';
import './game/responsive.css';
import { installResponsiveUi } from './game/responsive';

installResponsiveUi();
const chatBootstrap = prepareChatBootstrap();
void startGame().then(() => {
  if (document.querySelector('#hud')) chatBootstrap.attach();
});
