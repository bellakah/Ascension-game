import './characterSheet.css';
import type { CharacterConfig } from './lpcCharacter';
import type { CharacterProgress } from './characterCreator';
import { ensureInventoryState, getItem, ITEM_RARITY_LABELS, type EquipmentSlot } from '../items/itemCatalog';

const LPC = 'https://raw.githubusercontent.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/master/spritesheets';

const SLOTS: Array<{ id: EquipmentSlot; label: string; icon: string }> = [
  { id: 'head', label: 'Cabeça', icon: '◒' },
  { id: 'armor', label: 'Peitoral', icon: '♜' },
  { id: 'legs', label: 'Pernas', icon: '▥' },
  { id: 'boots', label: 'Botas', icon: '⌄' },
  { id: 'weapon', label: 'Arma', icon: '⚔' },
  { id: 'accessory1', label: 'Acessório I', icon: '◇' },
  { id: 'accessory2', label: 'Acessório II', icon: '◇' },
];

function eyeColorName(color: number) {
  const map = new Map<number, string>([
    [0x6d93b8, 'blue'], [0x5f8f63, 'green'], [0x8a653e, 'brown'], [0x5a4a73, 'purple'], [0x444444, 'gray'],
  ]);
  return map.get(color) ?? 'blue';
}

function swordMaterial(itemId: string | null) {
  if (itemId === 'basic_sword') return 'bronze';
  if (itemId === 'iron_sword') return 'iron';
  if (itemId === 'shadow_fang_blade') return 'silver';
  return itemId ? 'steel' : null;
}

function addPreviewLayer(host: HTMLElement, path: string, z: number, tint?: string) {
  const layer = document.createElement('span');
  layer.className = 'sheet-preview-layer';
  layer.style.zIndex = String(z);
  layer.style.backgroundImage = `url(${LPC}/${path})`;
  if (tint) layer.style.filter = tint;
  host.appendChild(layer);
}

function renderAvatar(host: HTMLElement, config: CharacterConfig, progress: CharacterProgress) {
  const state = ensureInventoryState(progress);
  host.replaceChildren();
  addPreviewLayer(host, `body/bodies/${config.sex}/idle.png`, 10);
  addPreviewLayer(host, `legs/pants/${config.sex}/idle.png`, 14);
  if (state.equipment.boots) addPreviewLayer(host, `feet/boots/basic/${config.sex}/idle.png`, 16);
  if (state.equipment.armor === 'hunter_armor') addPreviewLayer(host, `torso/armour/leather/${config.sex}/idle.png`, 20);
  else if (state.equipment.armor) addPreviewLayer(host, `torso/chainmail/${config.sex}/idle.png`, 20);
  addPreviewLayer(host, `head/heads/human/${config.sex}/idle.png`, 30);
  addPreviewLayer(host, `eyes/human/adult/${config.eyeStyle}/idle/${eyeColorName(config.eyeColor)}.png`, 35);
  addPreviewLayer(host, `hair/${config.hairStyle}/adult/idle.png`, 40);
  if (state.equipment.head === 'wolf_hood') addPreviewLayer(host, 'hat/cloth/hood/adult/idle.png', 46);
  const material = swordMaterial(state.equipment.weapon);
  if (material) {
    addPreviewLayer(host, `weapon/sword/arming/universal/bg/idle/${material}.png`, 5);
    addPreviewLayer(host, `weapon/sword/arming/universal/fg/idle/${material}.png`, 50);
  }
}

function equipmentBonus(progress: CharacterProgress) {
  const state = ensureInventoryState(progress);
  const bonus = { attack: 0, defense: 0, maxHp: 0 };
  for (const slot of SLOTS) {
    const id = state.equipment[slot.id];
    const stats = id ? getItem(id)?.stats : undefined;
    bonus.attack += stats?.attack ?? 0;
    bonus.defense += stats?.defense ?? 0;
    bonus.maxHp += stats?.maxHp ?? 0;
  }
  return bonus;
}

export function createCharacterSheet(config: CharacterConfig, progress: CharacterProgress) {
  const state = ensureInventoryState(progress);
  const root = document.createElement('div');
  root.id = 'character-sheet-overlay';
  root.className = 'character-sheet-hidden';
  root.innerHTML = `
    <div class="character-sheet-window" role="dialog" aria-label="Personagem">
      <header class="sheet-header">
        <div><span class="sheet-kicker">ASCENSION</span><h2 id="sheet-name"></h2><p id="sheet-subtitle"></p></div>
        <button id="sheet-close" class="sheet-close" type="button" aria-label="Fechar">×</button>
      </header>
      <div class="sheet-body">
        <section class="sheet-equipment-panel">
          <div class="sheet-panel-title"><strong>Equipamentos</strong><span id="sheet-power"></span></div>
          <div class="sheet-character-layout">
            <div id="sheet-left-slots" class="sheet-slot-column"></div>
            <div class="sheet-avatar-wrap">
              <div class="sheet-aura"></div>
              <div id="sheet-avatar" class="sheet-avatar"></div>
              <strong id="sheet-class-label"></strong>
              <span id="sheet-level-label"></span>
            </div>
            <div id="sheet-right-slots" class="sheet-slot-column"></div>
          </div>
        </section>
        <aside class="sheet-stats-panel">
          <div class="sheet-panel-title"><strong>Atributos</strong><span>STATUS ATUAL</span></div>
          <div id="sheet-stats" class="sheet-stats"></div>
          <div class="sheet-exp-card"><div><strong>Experiência</strong><span id="sheet-exp-text"></span></div><div class="sheet-exp-track"><span id="sheet-exp-fill"></span></div></div>
          <div id="sheet-selected-item" class="sheet-selected-item"></div>
        </aside>
      </div>
      <footer class="sheet-footer"><span>Selecione um equipamento para ver os detalhes.</span><span><kbd>C</kbd> personagem · <kbd>Esc</kbd> fechar</span></footer>
    </div>`;
  document.body.appendChild(root);

  const avatar = root.querySelector<HTMLElement>('#sheet-avatar')!;
  const leftSlots = root.querySelector<HTMLElement>('#sheet-left-slots')!;
  const rightSlots = root.querySelector<HTMLElement>('#sheet-right-slots')!;
  const stats = root.querySelector<HTMLElement>('#sheet-stats')!;
  const selectedItem = root.querySelector<HTMLElement>('#sheet-selected-item')!;
  let selectedSlot: EquipmentSlot | null = null;

  const renderSlot = (slot: typeof SLOTS[number]) => {
    const itemId = state.equipment[slot.id];
    const item = itemId ? getItem(itemId) : undefined;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `sheet-equip-slot${item ? ` sheet-rarity-${item.rarity}` : ''}${selectedSlot === slot.id ? ' selected' : ''}`;
    button.innerHTML = item
      ? `<span class="sheet-slot-icon">${item.icon}</span><span><small>${slot.label}</small><strong>${item.name}</strong><em>${ITEM_RARITY_LABELS[item.rarity]}</em></span>`
      : `<span class="sheet-slot-icon empty">${slot.icon}</span><span><small>${slot.label}</small><strong>Vazio</strong><em>Sem equipamento</em></span>`;
    button.addEventListener('click', () => { selectedSlot = slot.id; render(); });
    return button;
  };

  const renderSelected = () => {
    if (!selectedSlot) {
      selectedItem.innerHTML = '<div class="sheet-empty-detail"><span>◇</span><strong>Equipamento</strong><p>Toque em um dos slots para conferir o item e seus bônus.</p></div>';
      return;
    }
    const itemId = state.equipment[selectedSlot];
    const item = itemId ? getItem(itemId) : undefined;
    if (!item) {
      const slot = SLOTS.find((entry) => entry.id === selectedSlot);
      selectedItem.innerHTML = `<div class="sheet-empty-detail"><span>${slot?.icon ?? '◇'}</span><strong>${slot?.label ?? 'Slot'} vazio</strong><p>Nenhum equipamento está sendo usado neste espaço.</p></div>`;
      return;
    }
    const rows: string[] = [];
    if (item.stats?.attack) rows.push(`<span>⚔ Ataque <strong>+${item.stats.attack}</strong></span>`);
    if (item.stats?.defense) rows.push(`<span>🛡 Defesa <strong>+${item.stats.defense}</strong></span>`);
    if (item.stats?.maxHp) rows.push(`<span>♥ HP máximo <strong>+${item.stats.maxHp}</strong></span>`);
    selectedItem.innerHTML = `<div class="sheet-item-detail sheet-rarity-${item.rarity}"><span class="sheet-detail-icon">${item.icon}</span><div><small>${ITEM_RARITY_LABELS[item.rarity]}</small><h3>${item.name}</h3><p>${item.description}</p></div></div>${rows.length ? `<div class="sheet-item-bonuses">${rows.join('')}</div>` : '<div class="sheet-item-bonuses"><span>Sem bônus adicional</span></div>'}`;
  };

  const render = () => {
    renderAvatar(avatar, config, state);
    root.querySelector<HTMLElement>('#sheet-name')!.textContent = config.name;
    root.querySelector<HTMLElement>('#sheet-subtitle')!.textContent = `${state.className} · ${state.map}`;
    root.querySelector<HTMLElement>('#sheet-class-label')!.textContent = state.className;
    root.querySelector<HTMLElement>('#sheet-level-label')!.textContent = `Nível ${state.level}`;
    const bonus = equipmentBonus(state);
    const baseAttack = Math.max(0, state.attack - bonus.attack);
    const baseDefense = Math.max(0, state.defense - bonus.defense);
    const baseHp = Math.max(1, state.maxHp - bonus.maxHp);
    const power = Math.round(state.attack * 2 + state.defense * 3 + state.maxHp / 10);
    root.querySelector<HTMLElement>('#sheet-power')!.textContent = `Poder ${power}`;
    stats.innerHTML = `
      <div class="sheet-stat primary"><span>♥</span><div><small>HP máximo</small><strong>${state.maxHp}</strong><em>Base ${baseHp} · Equip. +${bonus.maxHp}</em></div></div>
      <div class="sheet-stat primary"><span>⚔</span><div><small>Ataque</small><strong>${state.attack}</strong><em>Base ${baseAttack} · Equip. +${bonus.attack}</em></div></div>
      <div class="sheet-stat primary"><span>🛡</span><div><small>Defesa</small><strong>${state.defense}</strong><em>Base ${baseDefense} · Equip. +${bonus.defense}</em></div></div>
      <div class="sheet-stat"><span>✦</span><div><small>Nível</small><strong>${state.level}</strong><em>Progressão do personagem</em></div></div>
      <div class="sheet-stat"><span>🪙</span><div><small>Moedas</small><strong>${state.coins}</strong><em>Saldo atual</em></div></div>
      <div class="sheet-stat"><span>⌖</span><div><small>Local</small><strong>${state.map}</strong><em>Mapa atual</em></div></div>`;
    const ratio = Math.max(0, Math.min(100, state.exp / state.expToNext * 100));
    root.querySelector<HTMLElement>('#sheet-exp-text')!.textContent = `${state.exp} / ${state.expToNext} EXP`;
    root.querySelector<HTMLElement>('#sheet-exp-fill')!.style.width = `${ratio}%`;

    leftSlots.replaceChildren(); rightSlots.replaceChildren();
    for (const slot of SLOTS.slice(0, 4)) leftSlots.appendChild(renderSlot(slot));
    for (const slot of SLOTS.slice(4)) rightSlots.appendChild(renderSlot(slot));
    renderSelected();
  };

  const open = () => { root.classList.remove('character-sheet-hidden'); root.classList.add('character-sheet-visible'); render(); };
  const close = () => { root.classList.add('character-sheet-hidden'); root.classList.remove('character-sheet-visible'); };
  const toggle = () => root.classList.contains('character-sheet-hidden') ? open() : close();

  root.querySelector<HTMLButtonElement>('#sheet-close')!.addEventListener('click', close);
  root.addEventListener('pointerdown', (event) => { if (event.target === root) close(); });
  window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'c' && !event.repeat && !(document.activeElement instanceof HTMLInputElement)) { event.preventDefault(); toggle(); }
    if (event.key === 'Escape' && !root.classList.contains('character-sheet-hidden')) close();
  });

  render();
  return { root, open, close, toggle, refresh: render, isOpen: () => !root.classList.contains('character-sheet-hidden') };
}
