import { createCraftStudio } from '../crafting/craftStudio';
import { createStandaloneStudioShell } from './standaloneStudioShell';

export function startCraftsEditorApp() {
  const shell = createStandaloneStudioShell('crafts');
  const studio = createCraftStudio(shell.content);
  return { shell, studio };
}
