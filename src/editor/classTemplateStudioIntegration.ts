import { createArcherPrototype } from '../classes/classTemplatePresets';

export function installClassTemplateStudioIntegration(root: HTMLElement) {
  const toolbar = root.querySelector<HTMLElement>('.class-toolbar');
  if (!toolbar || toolbar.querySelector('[data-archer-template]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'class-btn';
  button.dataset.archerTemplate = '1';
  button.textContent = '🏹 Template Arqueiro';
  button.title = 'Cria uma classe Arqueiro completa usando somente registros do Class/Skill Studio';
  button.addEventListener('click', () => {
    if (!confirm('Criar o protótipo Arqueiro com 4 skills publicadas?')) return;
    try {
      createArcherPrototype();
      window.location.reload();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível criar o template.');
    }
  });
  toolbar.appendChild(button);
}
