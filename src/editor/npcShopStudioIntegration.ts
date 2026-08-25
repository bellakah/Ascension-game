import { getNpcDefinition, saveNpcDefinition } from '../npc/npcStore';
import { listShopStudioRecords, shopStudioDisplay } from '../shops/shopStudioStore';

function currentNpcId(root: HTMLElement) {
  return root.querySelector<HTMLElement>('.npc-list-card.active[data-npc]')?.dataset.npc ?? '';
}

export function installNpcShopStudioIntegration(root: HTMLElement) {
  const overlay = root.querySelector<HTMLElement>('.npc-studio-overlay');
  if (!overlay || overlay.dataset.shopStudioIntegration === '1') return;
  overlay.dataset.shopStudioIntegration = '1';

  let pendingShopId = '';
  let pendingEnabled = false;

  const enhance = () => {
    const legacyToggle = overlay.querySelector<HTMLInputElement>('#npc-shop-enabled');
    const legacySection = legacyToggle?.closest<HTMLElement>('section');
    if (!legacyToggle || !legacySection) return;
    const npcId = currentNpcId(overlay);
    const definition = npcId ? getNpcDefinition(npcId) : null;
    let panel = legacySection.parentElement?.querySelector<HTMLElement>('.npc-shop-studio-link');
    if (!panel) {
      panel = document.createElement('section'); panel.className = 'npc-shop-studio-link';
      legacySection.insertAdjacentElement('afterend', panel);
    }
    legacySection.style.display = 'none';
    const shops = listShopStudioRecords();
    const shopId = pendingShopId || definition?.shop.shopId || '';
    const enabled = pendingShopId ? pendingEnabled : Boolean(definition?.shop.enabled);
    panel.innerHTML = `<h4>Shop Studio</h4><label class="npc-check"><input id="npc-shop-link-enabled" type="checkbox" ${enabled ? 'checked' : ''}> Este NPC possui comércio</label><label>Loja vinculada<select id="npc-shop-link-select"><option value="">Selecione uma loja...</option>${shops.map((shop) => `<option value="${shop.key}" ${shop.key === shopId ? 'selected' : ''}>${shopStudioDisplay(shop)}</option>`).join('')}</select></label><div style="display:flex;gap:6px"><button id="npc-shop-open-studio" type="button" style="flex:1">Abrir Shop Studio</button></div><p style="font-size:8px;color:#7592a1;margin:6px 0 0">Estoque, preços, moeda e regras são administrados centralmente no Shop Studio.</p>`;
    const enabledInput = panel.querySelector<HTMLInputElement>('#npc-shop-link-enabled')!;
    const select = panel.querySelector<HTMLSelectElement>('#npc-shop-link-select')!;
    enabledInput.onchange = () => { pendingEnabled = enabledInput.checked; pendingShopId = select.value; legacyToggle.checked = enabledInput.checked; legacyToggle.dispatchEvent(new Event('change', { bubbles: true })); };
    select.onchange = () => { pendingShopId = select.value; pendingEnabled = enabledInput.checked; };
    panel.querySelector<HTMLButtonElement>('#npc-shop-open-studio')!.onclick = () => { const url = new URL(window.location.href); url.searchParams.set('editor', 'shops'); url.searchParams.delete('section'); url.searchParams.delete('id'); window.location.href = url.toString(); };
  };

  const save = overlay.querySelector<HTMLButtonElement>('#npc-save');
  save?.addEventListener('click', () => {
    const npcId = currentNpcId(overlay); const panel = overlay.querySelector<HTMLElement>('.npc-shop-studio-link');
    const enabled = panel?.querySelector<HTMLInputElement>('#npc-shop-link-enabled')?.checked ?? false;
    const shopId = panel?.querySelector<HTMLSelectElement>('#npc-shop-link-select')?.value ?? '';
    window.setTimeout(() => {
      const definition = npcId ? getNpcDefinition(npcId) : null; if (!definition) return;
      definition.shop.enabled = enabled; definition.shop.shopId = shopId; saveNpcDefinition(definition); pendingShopId = ''; pendingEnabled = false;
    }, 0);
  }, true);

  const observer = new MutationObserver(() => enhance()); observer.observe(overlay, { childList: true, subtree: true });
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
  enhance();
}
