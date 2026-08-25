import { createMissionStudio } from '../quests/missionStudio';
import { createStandaloneStudioShell } from './standaloneStudioShell';

export function startQuestsEditorApp() {
  const shell = createStandaloneStudioShell('quests');
  const studio = createMissionStudio(shell.content);
  return { shell, studio };
}
