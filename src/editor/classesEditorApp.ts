import { createClassStudio } from '../classes/classStudio';
import { installClassSkillStudioIntegration } from './classSkillStudioIntegration';
import { installClassTemplateStudioIntegration } from './classTemplateStudioIntegration';
import { createStandaloneStudioShell } from './standaloneStudioShell';

export function startClassesEditorApp() {
  const shell = createStandaloneStudioShell('classes');
  const studio = createClassStudio(shell.content);
  installClassSkillStudioIntegration(shell.root);
  installClassTemplateStudioIntegration(shell.root);
  return { shell, studio };
}
