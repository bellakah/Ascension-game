import type { CharacterProgress } from '../character/characterCreator';
import { getItem, itemQuantity } from '../items/itemCatalog';
import { craft, maxCraftable } from './craftingSystem';
import { CRAFTING_CATEGORY_LABELS, CRAFTING_STATION_LABELS, recipesForStation, type CraftingRecipe, type CraftingStationType } from './recipeCatalog';

type CraftingUiOptions = {
  onChanged: () => void;
  notify: (message: string) => void;
  onCrafted?: (recipe: CraftingRecipe, amount: number) => void;
  onEnhancement?: () => void;
};

export function createCraftingUi(progress: CharacterProgress, options: CraftingUiOptions) {
  const overlay = document.createElement('div');
  overlay.id = 'crafting-overlay';
  overlay.className = 'crafting-hidden';
  overlay.innerHTML = `
    <section class="crafting-window" role="dialog" aria-modal="true" aria-label="Fabricação">
      <header class="crafting-header">
        <div><div class="crafting-kicker">ARTESANATO</div><h2 id="crafting-title">Forja</h2></div>
        <div style="display:flex;gap:8px;align-items:center"><button id="crafting-enhancement" style="display:none;height:40px;border:1px solid rgba(215,189,109,.35);border-radius:11px;background:#343b27;color:#fff0af;padding:0 12px;font-weight:900">💠 Aprimorar</button><button class="crafting-close" aria-label="Fechar">×</button></div>
      </header>
      <nav class="crafting-toolbar" id="crafting-filters"></nav>
      <div class="crafting-body">
        <div class="crafting-list" id="crafting-list"></div>
        <div class="crafting-detail" id="crafting-detail"></div>
      </div>
      <footer class="crafting-footer"><span>Selecione uma receita para ver os materiais.</span><span>ESC para fechar</span></footer>
    </section>`;
  document.body.appendChild(overlay);

  const title = overlay.querySelector<HTMLHeadingElement>('#crafting-title')!;
  const filters = overlay.querySelector<HTMLDivElement>('#crafting-filters')!;
  const list = overlay.querySelector<HTMLDivElement>('#crafting-list')!;
  const detail = overlay.querySelector<HTMLDivElement>('#crafting-detail')!;
  const closeBtn = overlay.querySelector<HTMLButtonElement>('.crafting-close')!;
  const enhancementBtn = overlay.querySelector<HTMLButtonElement>('#crafting-enhancement')!;

  let station: CraftingStationType = 'forge';
  let category: CraftingRecipe['category'] | 'all' = 'all';
  let selectedId: string | null = null;
  let amount = 1;

  const currentRecipes = () => recipesForStation(station).filter((recipe) => category === 'all' || recipe.category === category);
  const selectedRecipe = () => recipesForStation(station).find((recipe) => recipe.id === selectedId) ?? currentRecipes()[0] ?? null;

  function renderFilters() {
    const categories = Array.from(new Set(recipesForStation(station).map((recipe) => recipe.category)));
    filters.innerHTML = '';
    const entries: Array<{ id: CraftingRecipe['category'] | 'all'; label: string }> = [
      { id: 'all', label: 'Todos' },
      ...categories.map((id) => ({ id, label: CRAFTING_CATEGORY_LABELS[id] })),
    ];
    for (const entry of entries) {
      const button = document.createElement('button');
      button.className = `crafting-filter${category === entry.id ? ' active' : ''}`;
      button.textContent = entry.label;
      button.addEventListener('click', () => { category = entry.id; selectedId = null; amount = 1; refresh(); });
      filters.appendChild(button);
    }
  }

  function renderList() {
    const recipes = currentRecipes(); list.innerHTML = '';
    if (!recipes.length) { list.innerHTML = '<div style="padding:16px;color:#93a198;font-size:12px">Nenhuma receita nesta categoria.</div>'; return; }
    if (!selectedId || !recipes.some((recipe) => recipe.id === selectedId)) selectedId = recipes[0].id;
    for (const recipe of recipes) {
      const output = getItem(recipe.output.itemId), possible = maxCraftable(progress, recipe);
      const button = document.createElement('button');
      button.className = `recipe-card${selectedId === recipe.id ? ' selected' : ''}${possible <= 0 ? ' disabled' : ''}`;
      button.innerHTML = `<span class="recipe-icon">${output?.icon ?? recipe.icon}</span><span><strong>${recipe.name}</strong><small>${recipe.category === 'refining' ? 'Refino' : CRAFTING_CATEGORY_LABELS[recipe.category]}</small></span><span class="recipe-ready">${possible > 0 ? `×${possible}` : 'FALTAM'}</span>`;
      button.addEventListener('click', () => { selectedId = recipe.id; amount = 1; refresh(); }); list.appendChild(button);
    }
  }

  function renderDetail() {
    const recipe = selectedRecipe(); if (!recipe) { detail.innerHTML = ''; return; }
    selectedId = recipe.id;
    const max = maxCraftable(progress, recipe); amount = Math.max(1, Math.min(amount, Math.max(1, max)));
    const output = getItem(recipe.output.itemId);
    const ingredients = recipe.inputs.map((input) => {
      const item = getItem(input.itemId), owned = itemQuantity(progress, input.itemId), needed = input.quantity * amount;
      return `<div class="ingredient${owned < needed ? ' missing' : ''}"><span>${item?.icon ?? '•'} ${item?.name ?? input.itemId}</span><strong>${owned}/${needed}</strong></div>`;
    }).join('');
    detail.innerHTML = `<h3>${output?.icon ?? recipe.icon} ${recipe.name}</h3><p>${recipe.description}</p><strong style="font-size:11px;color:#d8bd6e">MATERIAIS</strong><div class="ingredient-list">${ingredients}</div><div class="craft-output">Resultado: <strong>${recipe.output.quantity * amount}x ${output?.name ?? recipe.output.itemId}</strong>${recipe.requiredLevel ? ` · Nível ${recipe.requiredLevel}` : ''}</div><div class="craft-actions"><button id="craft-minus">−</button><span class="craft-qty">${amount}</span><button id="craft-plus">+</button><button class="craft-confirm" id="craft-confirm" ${max <= 0 ? 'disabled' : ''}>⚒ Fabricar</button></div>`;
    detail.querySelector<HTMLButtonElement>('#craft-minus')?.addEventListener('click', () => { amount = Math.max(1, amount - 1); renderDetail(); });
    detail.querySelector<HTMLButtonElement>('#craft-plus')?.addEventListener('click', () => { amount = Math.min(Math.max(1, max), amount + 1); renderDetail(); });
    detail.querySelector<HTMLButtonElement>('#craft-confirm')?.addEventListener('click', () => {
      const result = craft(progress, recipe, amount);
      if (!result.ok) { options.notify(result.reason ?? 'Não foi possível fabricar.'); refresh(); return; }
      const made = result.outputQuantity ?? recipe.output.quantity * amount;
      options.notify(`${made}x ${output?.name ?? recipe.name} fabricado com sucesso.`); options.onCrafted?.(recipe, amount); options.onChanged(); amount = 1; refresh();
    });
  }

  function refresh() {
    title.textContent = CRAFTING_STATION_LABELS[station];
    enhancementBtn.style.display = station === 'forge' && options.onEnhancement ? 'block' : 'none';
    renderFilters(); renderList(); renderDetail();
  }

  function open(type: CraftingStationType) { station = type; category = 'all'; selectedId = null; amount = 1; overlay.classList.remove('crafting-hidden'); refresh(); }
  function close() { overlay.classList.add('crafting-hidden'); }
  function isOpen() { return !overlay.classList.contains('crafting-hidden'); }

  enhancementBtn.addEventListener('click', () => { close(); options.onEnhancement?.(); });
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('pointerdown', (event) => { if (event.target === overlay) close(); });
  window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && isOpen()) close(); }, true);
  return { open, close, isOpen, refresh };
}
