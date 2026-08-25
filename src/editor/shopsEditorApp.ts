import { createShopStudio } from '../shops/shopStudio';
import { createStandaloneStudioShell } from './standaloneStudioShell';

export function startShopsEditorApp() {
  const shell = createStandaloneStudioShell('shops');
  const studio = createShopStudio(shell.content);
  return { shell, studio };
}
