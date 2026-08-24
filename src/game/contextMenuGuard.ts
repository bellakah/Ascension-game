const GAME_CONTEXT_MENU_GUARD = 'ascensionContextMenuGuard';

export function installGameContextMenuGuard() {
  const root = document.documentElement;
  if (root.dataset[GAME_CONTEXT_MENU_GUARD] === 'ready') return;
  root.dataset[GAME_CONTEXT_MENU_GUARD] = 'ready';

  const onContextMenu = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    // Mantém o menu nativo somente em campos editáveis para preservar
    // copiar/colar e ações de texto no chat ou formulários.
    if (target.closest('input, textarea, [contenteditable="true"]')) return;

    event.preventDefault();
  };

  document.addEventListener('contextmenu', onContextMenu, { capture: true });

  window.addEventListener('pagehide', () => {
    document.removeEventListener('contextmenu', onContextMenu, { capture: true });
    delete root.dataset[GAME_CONTEXT_MENU_GUARD];
  }, { once: true });
}
