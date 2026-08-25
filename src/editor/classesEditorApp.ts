import { createClassStudio } from '../classes/classStudio';
import { createStandaloneStudioShell } from './standaloneStudioShell';

export function startClassesEditorApp() {
  const shell = createStandaloneStudioShell('classes');
  const studio = createClassStudio(shell.content);
  return { shell, studio };
}
