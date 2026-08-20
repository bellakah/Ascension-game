import './style.css';
import './game/game.css';
import './character/characterSheetHud.css';
import { startGame } from './game/runtime';
import './game/responsive.css';
import { installResponsiveUi } from './game/responsive';

installResponsiveUi();
void startGame();
