import './enhancementUi.css';
import type { CharacterProgress } from '../character/characterCreator';
import { ensureInventoryState, getItem, itemQuantity, type EquipmentSlot } from '../items/itemCatalog';
import { GEM_BY_ID, REFINEMENT_CONFIG, SOCKET_RULES } from './refinementConfig';
import { enhancementName, getEquipmentEnhancement, nextRefineRule, refineEquipment, removeSocketGem, socketGem, socketKindForSlot, socketView } from './enhancementSystem';

type EnhancementUiOptions = {
  onChanged: () => void;
  notify: (message: string) => void;
};

type Mode = 'refine' | 'socket';

const SLOTS: Array<{ id: EquipmentSlot; label: string; icon: string }> = [
  { id: 'weapon', label: 'Arma', icon: '⚔' },
  { id: 'armor', label: 'Peitoral', icon: '♜' },
  { id: 'head', label: 'Cabeça', icon: '◒' },
  { id: 'legs', label: 'Pernas', icon: '▥' },
  { id: 'boots', label: 'Botas', icon: '⌄' },
  { id: 'accessory1', label: 'Acessório I', icon: '◇' },
  { id: 'accessory2', label: 'Acessório II', icon: '◇' },
];

function percent(value: number) { return `${Math.round(value * 100)}%`; }

export function createEnhancementUi(progress: CharacterProgress, options: EnhancementUiOptions) {
  const state = ensureInventoryState(progress);
  const overlay = document.createElement('div');
  overlay.id = 'enhancement-overlay';
  overlay.className = 'enhancement-hidden';
  overlay.innerHTML = `
    <section class="enhancement-window" role="dialog" aria-modal="true" aria-label="Aprimoramento de equipamento">
      <header class="enhancement-header">
        <div><div class="enhancement-kicker">FORJA DA CLAREIRA</div><h2>Aprimorar equipamento</h2></div>
        <button class="enhancement-close" aria-label="Fechar">×</button>
      </header>
      <nav class="enhancement-tabs"><button class="enhancement-tab active" data-mode="refine">💠 Refino</button><button class="enhancement-tab" data-mode="socket">◇ Soquetes</button></nav>
      <div class="enhancement-body"><aside class="enhancement-equipment"></aside><main class="enhancement-detail"></main></div>
      <footer class="enhancement-footer"><span>Refino e pedras ficam salvos no próprio equipamento.</span><span>ESC para fechar</span></footer>
    </section>`;
  document.body.appendChild(overlay);

  const list = overlay.querySelector<HTMLElement>('.enhancement-equipment')!;
  const detail = overlay.querySelector<HTMLElement>('.enhancement-detail')!;
  const tabs = Array.from(overlay.querySelectorAll<HTMLButtonElement>('.enhancement-tab'));
  let mode: Mode = 'refine';
  let selected: EquipmentSlot = 'weapon';

  function validSelection() {
    if (state.equipment[selected]) return;
    selected = SLOTS.find((slot) => Boolean(state.equipment[slot.id]))?.id ?? 'weapon';
  }

  function renderList() {
    validSelection(); list.replaceChildren();
    for (const slot of SLOTS) {
      const itemId = state.equipment[slot.id], item = itemId ? getItem(itemId) : undefined;
      const meta = item ? getEquipmentEnhancement(progress, slot.id) : null;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `enhance-slot${selected === slot.id ? ' selected' : ''}${item ? '' : ' empty'}`;
      button.innerHTML = item
        ? `<span class="enhance-slot-icon">${item.icon}</span><span><strong>${item.name}</strong><small>${slot.label}</small></span><span class="enhance-level">${meta && meta.refine > 0 ? `+${meta.refine}` : '—'}</span>`
        : `<span class="enhance-slot-icon">${slot.icon}</span><span><strong>Vazio</strong><small>${slot.label}</small></span><span></span>`;
      button.addEventListener('click', () => { selected = slot.id; render(); });
      list.appendChild(button);
    }
  }

  function renderRefine() {
    const itemId = state.equipment[selected], item = itemId ? getItem(itemId) : undefined;
    if (!item) { detail.innerHTML = '<div class="enhance-card"><strong>Equipe um item para aprimorá-lo.</strong></div>'; return; }
    const meta = getEquipmentEnhancement(progress, selected), rule = nextRefineRule(progress, selected);
    const stones = itemQuantity(progress, REFINEMENT_CONFIG.stoneItemId);
    const dots = Array.from({ length: REFINEMENT_CONFIG.maxLevel + 1 }, (_, level) => `<span class="refine-dot${level <= meta.refine ? ' done' : ''}${level === meta.refine ? ' current' : ''}">${level === 0 ? '+0' : `+${level}`}</span>`).join('');
    const failure = !rule ? 'Limite atingido' : rule.failureMode === 'keep' ? 'Mantém o nível' : rule.failureMode === 'reset' ? 'Volta para +0' : `Cai ${rule.failureDrop ?? 1} nível`;
    detail.innerHTML = `
      <h3>${item.icon} ${enhancementName(progress, selected)}</h3>
      <p>${item.description}</p>
      <section class="enhance-card">
        <div class="enhance-card-title"><strong>REFINO</strong><span>Limite +${REFINEMENT_CONFIG.maxLevel}</span></div>
        <div class="refine-track">${dots}</div>
        <div class="enhance-info-grid">
          <div class="enhance-info"><span>Próximo nível</span><strong>${rule ? `+${rule.targetLevel}` : 'MAX'}</strong></div>
          <div class="enhance-info"><span>Chance</span><strong>${rule ? percent(rule.successChance) : '—'}</strong></div>
          <div class="enhance-info"><span>Falha</span><strong>${failure}</strong></div>
        </div>
      </section>
      <section class="enhance-card"><div class="enhance-card-title"><strong>💠 PEDRAS DE REFINO</strong><span>${stones} disponíveis</span></div><p style="margin:0;color:#aebcb5;font-size:11px">${rule ? `Custo desta tentativa: ${rule.stoneCost}` : 'Nenhuma pedra necessária no limite atual.'}</p></section>
      <button class="enhance-action" id="enhance-refine" ${!rule || stones < (rule?.stoneCost ?? 0) ? 'disabled' : ''}>Tentar refino ${rule ? `+${rule.targetLevel}` : ''}</button>`;

    detail.querySelector<HTMLButtonElement>('#enhance-refine')?.addEventListener('click', () => {
      const result = refineEquipment(progress, selected);
      if (!result.ok) { options.notify(result.reason ?? 'Não foi possível refinar.'); render(); return; }
      if (result.success) options.notify(`Sucesso! ${item.name} agora está +${result.after}.`);
      else options.notify(`Refino falhou. ${item.name}: +${result.before} → +${result.after}.`);
      options.onChanged(); render();
    });
  }

  function renderSockets() {
    const itemId = state.equipment[selected], item = itemId ? getItem(itemId) : undefined;
    if (!item) { detail.innerHTML = '<div class="enhance-card"><strong>Equipe uma arma ou armadura para usar soquetes.</strong></div>'; return; }
    const kind = socketKindForSlot(progress, selected);
    if (!kind) { detail.innerHTML = `<h3>${item.icon} ${enhancementName(progress, selected)}</h3><p>Acessórios podem ser refinados, mas nesta configuração não recebem pedras de soquete.</p>`; return; }
    const sockets = socketView(progress, selected);
    const socketHtml = sockets.map((gemId, index) => {
      const gem = gemId ? GEM_BY_ID[gemId] : undefined;
      return gem
        ? `<button class="socket-cell filled" data-remove="${index}" title="Remover ${gem.name}"><span><b>${gem.icon}</b><small>${gem.name}<br>toque para remover</small></span></button>`
        : `<div class="socket-cell"><span><b>◇</b><small>Soquete ${index + 1}<br>vazio</small></span></div>`;
    }).join('');
    const allowed = SOCKET_RULES[kind].allowedGemIds.map((gemId) => GEM_BY_ID[gemId]).filter(Boolean);
    const gemButtons = allowed.map((gem) => {
      const owned = itemQuantity(progress, gem.id);
      const bonus = Object.entries(gem.bonus).map(([stat, value]) => `${stat === 'attack' ? 'ATQ' : stat === 'defense' ? 'DEF' : 'HP'} +${value}`).join(' · ');
      return `<button class="gem-button" data-gem="${gem.id}" ${owned <= 0 || !sockets.some((value) => !value) ? 'disabled' : ''}><strong>${gem.icon} ${gem.name} ×${owned}</strong><small>${bonus}</small></button>`;
    }).join('');
    detail.innerHTML = `
      <h3>${item.icon} ${enhancementName(progress, selected)}</h3>
      <p>${kind === 'weapon' ? 'Armas possuem até 2 soquetes.' : 'Equipamentos possuem até 4 soquetes.'} Cada pedra concede seu bônus enquanto permanecer aplicada.</p>
      <section class="enhance-card"><div class="enhance-card-title"><strong>SOQUETES</strong><span>${sockets.filter(Boolean).length}/${sockets.length}</span></div><div class="socket-grid">${socketHtml}</div></section>
      <section class="enhance-card"><div class="enhance-card-title"><strong>PEDRAS DISPONÍVEIS</strong><span>Inventário</span></div><div class="gem-options">${gemButtons}</div></section>`;

    detail.querySelectorAll<HTMLButtonElement>('[data-gem]').forEach((button) => button.addEventListener('click', () => {
      const gemId = button.dataset.gem!;
      const result = socketGem(progress, selected, gemId);
      if (!result.ok) { options.notify(result.reason ?? 'Não foi possível aplicar a pedra.'); return; }
      options.notify(`${result.gem?.name ?? 'Pedra'} aplicada em ${item.name}.`); options.onChanged(); render();
    }));
    detail.querySelectorAll<HTMLButtonElement>('[data-remove]').forEach((button) => button.addEventListener('click', () => {
      const result = removeSocketGem(progress, selected, Number(button.dataset.remove));
      if (!result.ok) { options.notify(result.reason ?? 'Não foi possível remover a pedra.'); return; }
      options.notify(`${result.gem?.name ?? 'Pedra'} removida e devolvida ao inventário.`); options.onChanged(); render();
    }));
  }

  function render() {
    tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.mode === mode));
    renderList(); mode === 'refine' ? renderRefine() : renderSockets();
  }

  tabs.forEach((tab) => tab.addEventListener('click', () => { mode = tab.dataset.mode as Mode; render(); }));
  const open = () => { overlay.classList.remove('enhancement-hidden'); render(); };
  const close = () => overlay.classList.add('enhancement-hidden');
  const isOpen = () => !overlay.classList.contains('enhancement-hidden');
  overlay.querySelector<HTMLButtonElement>('.enhancement-close')!.addEventListener('click', close);
  overlay.addEventListener('pointerdown', (event) => { if (event.target === overlay) close(); });
  window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && isOpen()) close(); }, true);
  return { open, close, isOpen, refresh: render };
}
