import './petUi.css';
import type { CharacterProgress } from '../character/characterCreator';
import { ITEM_CATEGORY_LABELS, ITEM_RARITY_LABELS, type ItemCategory, type ItemRarity } from '../items/itemCatalog';
import { getPetDefinition } from './petCatalog';
import { ensurePetState, setPetCategory, setPetCollectionEnabled, setPetMinimumRarity } from './petState';

type PetUiOptions = { onChanged: () => void; notify: (message: string) => void };
const CATEGORIES: ItemCategory[] = ['material', 'consumable', 'weapon', 'equipment', 'accessory'];
const RARITIES: ItemRarity[] = ['common', 'uncommon', 'rare', 'epic'];

export function createPetUi(progress: CharacterProgress, options: PetUiOptions) {
  const root = document.createElement('div');
  root.id = 'pet-overlay';
  root.className = 'pet-hidden';
  document.body.appendChild(root);

  const render = () => {
    const state = ensurePetState(progress);
    const pet = getPetDefinition(state.activePetId);
    const owned = pet ? state.owned[pet.id] : undefined;
    if (!pet || !owned) {
      root.innerHTML = '<section class="pet-window"><div class="pet-settings"><strong>Nenhum mascote ativo.</strong></div></section>';
      return;
    }
    const categoryRows = CATEGORIES.map((category) => `
      <label class="pet-category"><input type="checkbox" data-pet-category="${category}" ${state.collection.categories[category] ? 'checked' : ''}><span>${ITEM_CATEGORY_LABELS[category]}</span></label>`).join('');
    const rarityOptions = RARITIES.map((rarity) => `<option value="${rarity}" ${state.collection.minRarity === rarity ? 'selected' : ''}>${ITEM_RARITY_LABELS[rarity]}</option>`).join('');

    root.innerHTML = `
      <section class="pet-window" role="dialog" aria-modal="true" aria-label="Mascote">
        <header class="pet-header"><div><span class="pet-kicker">COMPANHEIRO</span><h2>Mascote</h2></div><button class="pet-close" type="button" aria-label="Fechar">×</button></header>
        <div class="pet-body">
          <aside class="pet-profile">
            <div class="pet-avatar">${pet.icon}</div>
            <h3>${pet.name}</h3>
            <div class="pet-evolution">Nível ${owned.level} · ${pet.evolutionName}</div>
            <p class="pet-description">${pet.description}</p>
            <div class="pet-stats">
              <div class="pet-stat"><span>Raio de coleta</span><strong>${pet.collection.radius}px</strong></div>
              <div class="pet-stat"><span>Por viagem</span><strong>${pet.collection.maxDropsPerTrip} drop</strong></div>
              <div class="pet-stat"><span>Intervalo</span><strong>${(pet.collection.pickupCooldownMs / 1000).toFixed(1)}s</strong></div>
              <div class="pet-stat"><span>Nível máximo</span><strong>${pet.maxLevel}</strong></div>
            </div>
          </aside>
          <main class="pet-settings">
            <section class="pet-section">
              <div class="pet-section-title"><strong>Coleta automática</strong><small>Configuração salva neste personagem</small></div>
              <div class="pet-switch-row"><div><strong>Permitir coleta</strong><small>O mascote procura drops válidos enquanto acompanha você.</small></div><button class="pet-toggle ${state.collection.enabled ? 'on' : ''}" id="pet-collection-toggle" type="button" aria-pressed="${state.collection.enabled}"></button></div>
            </section>
            <section class="pet-section">
              <div class="pet-section-title"><strong>O que coletar</strong><small>Desmarque categorias que o pet deve ignorar</small></div>
              <div class="pet-categories">${categoryRows}</div>
            </section>
            <section class="pet-section">
              <div class="pet-section-title"><strong>Filtro de raridade</strong><small>Vale para todas as categorias marcadas</small></div>
              <label class="pet-rarity-row"><span><strong>Raridade mínima</strong><small>Ex.: Raro ignora Comum e Incomum.</small></span><select id="pet-min-rarity">${rarityOptions}</select></label>
            </section>
            <section class="pet-section pet-security"><b>🔒</b><div><strong>Loot privado do dono</strong><small>Este mascote só pode recolher drops cujo proprietário seja este personagem. Drops de outros jogadores são bloqueados no sistema de loot, não apenas no filtro visual do pet.</small></div></section>
            <section class="pet-section">
              <div class="pet-section-title"><strong>Preparado para evolução</strong><small>Capacidades definidas pelo catálogo do pet</small></div>
              <div class="pet-future"><div class="pet-future-card"><strong>Raio maior</strong><small>Pets/evoluções poderão procurar loot mais longe.</small></div><div class="pet-future-card"><strong>Múltiplos drops</strong><small>maxDropsPerTrip já existe na engine.</small></div><div class="pet-future-card"><strong>Mais velocidade</strong><small>Cada pet poderá ter velocidade própria.</small></div></div>
            </section>
          </main>
        </div>
        <footer class="pet-footer"><span>As preferências são individuais por personagem.</span><span><kbd>P</kbd> mascote · <kbd>Esc</kbd> fechar</span></footer>
      </section>`;

    root.querySelector<HTMLButtonElement>('.pet-close')?.addEventListener('click', close);
    root.querySelector<HTMLButtonElement>('#pet-collection-toggle')?.addEventListener('click', () => {
      setPetCollectionEnabled(progress, !ensurePetState(progress).collection.enabled);
      options.onChanged(); render();
    });
    root.querySelectorAll<HTMLInputElement>('[data-pet-category]').forEach((input) => input.addEventListener('change', () => {
      setPetCategory(progress, input.dataset.petCategory as ItemCategory, input.checked);
      options.onChanged();
    }));
    root.querySelector<HTMLSelectElement>('#pet-min-rarity')?.addEventListener('change', (event) => {
      setPetMinimumRarity(progress, (event.currentTarget as HTMLSelectElement).value as ItemRarity);
      options.onChanged();
      options.notify(`Mascote: coletar itens ${ITEM_RARITY_LABELS[ensurePetState(progress).collection.minRarity]} ou superiores.`);
    });
  };

  const open = () => { root.classList.remove('pet-hidden'); render(); };
  const close = () => root.classList.add('pet-hidden');
  const toggle = () => root.classList.contains('pet-hidden') ? open() : close();
  root.addEventListener('pointerdown', (event) => { if (event.target === root) close(); });
  window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !root.classList.contains('pet-hidden')) close(); });

  render();
  return { root, open, close, toggle, refresh: render, isOpen: () => !root.classList.contains('pet-hidden') };
}
