import { createSkillStudio } from '../skills/skillStudio';
import { createStandaloneStudioShell } from './standaloneStudioShell';

export function startSkillsEditorApp() {
  const shell = createStandaloneStudioShell('skills');
  const studio = createSkillStudio(shell.content);
  return { shell, studio };
}
