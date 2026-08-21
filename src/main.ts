import './style.css';
import './game/game.css';
import './character/characterSheetHud.css';
import './crafting/craftingUi.css';
import './settings/gameMenuHud.css';
import { startGame } from './game/runtime';
import './game/responsive.css';
import { installResponsiveUi } from './game/responsive';

installResponsiveUi();
void startGame();
