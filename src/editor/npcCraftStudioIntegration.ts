import { craftStationDisplay, listCraftStationTypeRecords } from '../crafting/craftStudioStore';
import { getNpcDefinition, saveNpcDefinition } from '../npc/npcStore';

function currentNpcId(root: HTMLElement) {
  return root.querySelector<HTMLElement>('.npc-list-card.active[data-npc]')?.dataset.npc ?? '';
}

export function installNpcCraftStudioIntegration(root: HTMLElement) {
  const overlay = root.querySelector<HTMLElement>('.npc-studio-overlay');
  if (!overlay || overlay.dataset.craftStudioIntegration === '1') return;
  overlay.dataset.craftStudioIntegration = '1';

  const enhance = () => {
    const contentAnchor = overlay.querySelector<HTMLElement>('.npc-shop-studio-link') ?? overlay.querySelector<HTMLInputElement>('#npc-shop-enabled')?.closest<HTMLElement>('section');
    if (!contentAnchor) return;
    const npcId = currentNpcId(overlay), definition = npcId ? getNpcDefinition(npcId) : null;
    let panel = contentAnchor.parentElement?.querySelector<HTMLElement>('.npc-craft-studio-link');
    if (!panel) { panel = document.createElement('section'); panel.className = 'npc-craft-studio-link'; contentAnchor.insertAdjacentElement('afterend', panel); }
    const craft = definition?.craft ?? { enabled: false, stationTypeId: '' };
    panel.innerHTML = `<h4>Craft Studio</h4><label class="npc-check"><input id="npc-craft-link-enabled" type="checkbox" ${craft.enabled ? 'checked' : ''}> Este NPC oferece fabricação</label><label>Tipo de estação<select id="npc-craft-link-select"><option value="">Selecione uma estação...</option>${listCraftStationTypeRecords().map((station) => `<option value="${station.key}" ${station.key === craft.stationTypeId ? 'selected' : ''}>${craftStationDisplay(station)}</option>`).join('')}</select></label><button id="npc-craft-open-studio" type="button">Abrir Craft Studio</button><p style="font-size:8px;color:#7592a1;margin:6px 0 0">O NPC reutiliza as mesmas receitas da estação escolhida.</p>`;
    panel.querySelector<HTMLButtonElement>('#npc-craft-open-studio')!.onclick = () => { const url = new URL(window.location.href); url.searchParams.set('editor', 'crafts'); url.searchParams.delete('section'); url.searchParams.delete('id'); window.location.href = url.toString(); };
  };

  overlay.querySelector<HTMLButtonElement>('#npc-save')?.addEventListener('click', () => {
    const npcId = currentNpcId(overlay), panel = overlay.querySelector<HTMLElement>('.npc-craft-studio-link');
    const enabled = panel?.querySelector<HTMLInputElement>('#npc-craft-link-enabled')?.checked ?? false;
    const stationTypeId = panel?.querySelector<HTMLSelectElement>('#npc-craft-link-select')?.value ?? '';
    window.setTimeout(() => {
      const definition = npcId ? getNpcDefinition(npcId) : null; if (!definition) return;
      definition.craft = { enabled, stationTypeId }; saveNpcDefinition(definition);
    }, 0);
  }, true);

  const observer = new MutationObserver(enhance); observer.observe(overlay, { childList: true, subtree: true });
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
  enhance();
}
