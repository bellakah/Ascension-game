import { createEventStudio } from '../events/eventStudio';
import { createStandaloneStudioShell } from './standaloneStudioShell';

export function startEventsEditorApp() {
  const shell = createStandaloneStudioShell('events');
  const studio = createEventStudio(shell.content);
  return { shell, studio };
}
