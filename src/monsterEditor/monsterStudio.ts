import '../npc/npcStudio.css';
import './monsterStudio.css';
import { drawAssetThumbnail } from '../editor/map/mapAssetRenderer';
import { MAP_PALETTE_ENTRIES, getPaletteEntry } from '../editor/map/mapEditorCatalog';
import { openMapAnimationStudio } from '../editor/map/mapAnimationStudio';
import type { MonsterAnimationState, MonsterDefinition, MonsterDirection, MonsterDrop, MonsterRank, MonsterSkill, MonsterTemperament } from './monsterTypes';
import { MONSTER_DIRECTIONS, MONSTER_STATES } from './monsterTypes';
import { createMonsterDefinition, deleteMonsterDefinition, duplicateMonsterDefinition, getMonsterDefinition, listMonsterDefinitions, MONSTER_ASSET_PREFIX, resolveMonsterAppearanceAssetId, saveMonsterDefinition, syncMonsterDefinitionsIntoPalette } from './monsterStore';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
type StudioTab = 'general' | 'appearance' | 'stats' | 'ai' | 'content';

function appearanceEntries() {
  return MAP_PALETTE_ENTRIES.filter((entry) => !entry.id.startsWith(MONSTER_ASSET_PREFIX) && !entry.id.startsWith('npcdef:') && entry.sprite && !['terrain', 'zone'].includes(entry.palette));
}
function optionList(selected?: string) {
  return `<option value="">Usar fallback</option>${appearanceEntries().map((entry) => `<option value="${esc(entry.id)}" ${entry.id === selected ? 'selected' : ''}>${esc(entry.label)} • ${esc(entry.folder ?? entry.palette)}</option>`).join('')}`;
}
function previewEntry(definition: MonsterDefinition, state: MonsterAnimationState, direction: MonsterDirection) {
  return getPaletteEntry(resolveMonsterAppearanceAssetId(definition, state, direction));
}

export function createMonsterStudio(root: HTMLElement) {
  let definitions = listMonsterDefinitions();
  let activeId = definitions[0]?.id ?? '';
  let draft = activeId ? getMonsterDefinition(activeId) : null;
  let tab: StudioTab = 'general';
  let previewState: MonsterAnimationState = 'idle';
  let previewDirection: MonsterDirection = 'south';
  let search = '';
  let raf = 0;
  let lastPreview = 0;

  const overlay = document.createElement('section');
  overlay.className = 'npc-studio-overlay monster-studio-overlay hidden';
  overlay.innerHTML = `
    <header class="npc-studio-head"><div><strong>MONSTER STUDIO</strong><span>Criação de criaturas, aparência, combate, IA, drops e habilidades</span></div><div class="spacer"></div><button id="monster-studio-back">← Voltar ao mapa</button></header>
    <div class="npc-studio-shell">
      <aside class="npc-list"><div class="npc-list-tools"><input id="monster-list-search" placeholder="Buscar monstro..."><button id="monster-new" class="npc-primary">＋ Novo monstro</button></div><div id="monster-list-items" class="npc-list-items"></div></aside>
      <main class="npc-center"><div class="npc-preview-stage"><div class="npc-preview-toolbar"><label>Estado<select id="monster-preview-state">${MONSTER_STATES.map((value) => `<option value="${value.id}">${value.label}</option>`).join('')}</select></label><label>Direção<select id="monster-preview-direction">${MONSTER_DIRECTIONS.map((value) => `<option value="${value.id}" ${value.id === 'south' ? 'selected' : ''}>${value.short}</option>`).join('')}</select></label></div><div class="npc-preview-card"><div class="npc-preview-box"><span class="monster-preview-badge" id="monster-preview-badge">NORMAL • NV. 1</span><canvas id="monster-preview-canvas" width="280" height="280"></canvas></div><div class="npc-preview-name"><strong id="monster-preview-name">Nenhum monstro</strong><span id="monster-preview-title">Crie sua primeira criatura</span></div></div></div><div id="monster-summary" class="npc-content-summary"></div></main>
      <aside class="npc-properties"><nav id="monster-tabs" class="npc-tabs"></nav><div id="monster-form" class="npc-form"></div><footer class="npc-properties-foot"><button id="monster-duplicate">Duplicar</button><button id="monster-delete" class="npc-danger">Excluir</button><div class="spacer"></div><button id="monster-save" class="npc-primary">Salvar monstro</button></footer></aside>
    </div>`;
  root.querySelector<HTMLElement>('.mep-stage-wrap')?.appendChild(overlay);

  const listNode = overlay.querySelector<HTMLElement>('#monster-list-items')!;
  const form = overlay.querySelector<HTMLElement>('#monster-form')!;
  const tabs = overlay.querySelector<HTMLElement>('#monster-tabs')!;
  const previewCanvas = overlay.querySelector<HTMLCanvasElement>('#monster-preview-canvas')!;
  const searchInput = overlay.querySelector<HTMLInputElement>('#monster-list-search')!;

  const refreshDefinitions = () => {
    definitions = listMonsterDefinitions();
    if (activeId && !definitions.some((value) => value.id === activeId)) activeId = definitions[0]?.id ?? '';
    draft = activeId ? getMonsterDefinition(activeId) : null;
  };
  const renderList = () => {
    const query = search.trim().toLocaleLowerCase('pt-BR');
    const values = definitions.filter((value) => !query || `${value.name} ${value.title} ${value.category} ${value.rank} ${value.tags.join(' ')}`.toLocaleLowerCase('pt-BR').includes(query));
    listNode.innerHTML = values.length ? values.map((monster) => `<button class="npc-list-card ${monster.id === activeId ? 'active' : ''}" data-monster="${esc(monster.id)}"><span class="npc-list-avatar">${monster.rank === 'boss' ? '👑' : monster.rank === 'elite' ? '◆' : '☠'}</span><span><strong>${esc(monster.name)}</strong><span>${esc(monster.title || monster.category)}</span></span><span class="monster-rank">NV.${monster.level}</span></button>`).join('') : '<div style="padding:24px 10px;text-align:center;color:#6f8d9c;font-size:9px">Nenhum monstro encontrado.</div>';
    listNode.querySelectorAll<HTMLButtonElement>('[data-monster]').forEach((button) => button.onclick = () => { activeId = button.dataset.monster!; draft = getMonsterDefinition(activeId); renderAll(); });
  };
  const renderTabs = () => {
    const values: Array<[StudioTab,string]> = [['general','Geral'],['appearance','Aparência'],['stats','Atributos'],['ai','IA / Combate'],['content','Drops / Skills']];
    tabs.innerHTML = values.map(([id,label]) => `<button data-tab="${id}" class="${tab === id ? 'active' : ''}">${label}</button>`).join('');
    tabs.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => button.onclick = () => { tab = button.dataset.tab as StudioTab; renderTabs(); renderForm(); });
  };
  const bindText = (selector: string, apply: (value: string) => void) => {
    const input = form.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector); if (!input) return;
    input.oninput = () => { if (!draft) return; apply(input.value); renderSummary(); renderPreviewChrome(); };
  };
  const bindNumber = (selector: string, apply: (value: number) => void) => {
    const input = form.querySelector<HTMLInputElement>(selector); if (!input) return;
    input.oninput = () => { if (draft) { apply(Number(input.value)); renderSummary(); renderPreviewChrome(); } };
  };
  const bindCheck = (selector: string, apply: (value: boolean) => void) => {
    const input = form.querySelector<HTMLInputElement>(selector); if (!input) return;
    input.onchange = () => { if (draft) apply(input.checked); };
  };

  const renderGeneral = () => {
    if (!draft) return;
    form.innerHTML = `<section><h4>Identidade</h4><label>Nome<input id="monster-name" value="${esc(draft.name)}"></label><label>Título / subtítulo<input id="monster-title" value="${esc(draft.title)}" placeholder="Ex.: Predador da Floresta"></label><div class="npc-form-grid"><label>Categoria<input id="monster-category" value="${esc(draft.category)}"></label><label>Nível<input id="monster-level" type="number" min="1" max="999" value="${draft.level}"></label></div><label>Rank<select id="monster-rank"><option value="normal" ${draft.rank === 'normal' ? 'selected' : ''}>Normal</option><option value="elite" ${draft.rank === 'elite' ? 'selected' : ''}>Elite</option><option value="boss" ${draft.rank === 'boss' ? 'selected' : ''}>Boss</option></select></label><label>Tags<input id="monster-tags" value="${esc(draft.tags.join(', '))}" placeholder="floresta, fera, venenoso"></label><label>Notas<textarea id="monster-notes">${esc(draft.notes)}</textarea></label></section><section><h4>ID interno</h4><label>ID<input value="${esc(draft.id)}" readonly></label><p class="monster-inline-note">Pode ser usado futuramente em quests, spawners e eventos.</p></section>`;
    bindText('#monster-name', (value) => draft!.name = value || 'Monstro sem nome');
    bindText('#monster-title', (value) => draft!.title = value);
    bindText('#monster-category', (value) => draft!.category = value);
    bindNumber('#monster-level', (value) => draft!.level = clamp(Math.round(value || 1), 1, 999));
    bindText('#monster-rank', (value) => draft!.rank = value as MonsterRank);
    bindText('#monster-tags', (value) => draft!.tags = value.split(',').map((item) => item.trim()).filter(Boolean));
    bindText('#monster-notes', (value) => draft!.notes = value);
  };

  const renderAppearance = () => {
    if (!draft) return;
    const slot = (state: MonsterAnimationState, direction: MonsterDirection) => `<div class="npc-direction-slot monster-state-slot ${state === previewState && direction === previewDirection ? 'active' : ''}"><strong>${MONSTER_STATES.find((value) => value.id === state)?.label} • ${MONSTER_DIRECTIONS.find((value) => value.id === direction)?.short}</strong><select data-appearance-state="${state}" data-appearance-direction="${direction}">${optionList(draft!.appearance[state][direction])}</select></div>`;
    form.innerHTML = `<section><h4>Aparência base</h4><label>Fallback<select id="monster-fallback">${optionList(draft.appearance.fallbackAssetId)}</select></label><div class="npc-form-grid"><label>Escala<input id="monster-scale" type="number" min="0.1" max="12" step="0.05" value="${draft.appearance.scale}"></label><label class="npc-check"><input id="monster-shadow" type="checkbox" ${draft.appearance.showShadow ? 'checked' : ''}> Usar sombra</label></div><button id="monster-import-animation" class="npc-small-action">＋ Importar animação para ${MONSTER_STATES.find((value) => value.id === previewState)?.label} • ${MONSTER_DIRECTIONS.find((value) => value.id === previewDirection)?.short}</button><p class="monster-inline-note">Escolha o estado e a direção no preview antes de importar. O asset criado será ligado exatamente a esse slot.</p></section>${MONSTER_STATES.map((state) => `<section><h4>${state.label}</h4><div class="npc-direction-grid">${MONSTER_DIRECTIONS.map((direction) => slot(state.id, direction.id)).join('')}</div></section>`).join('')}`;
    form.querySelector<HTMLSelectElement>('#monster-fallback')!.onchange = (event) => { draft!.appearance.fallbackAssetId = (event.currentTarget as HTMLSelectElement).value; renderPreview(); };
    bindNumber('#monster-scale', (value) => { draft!.appearance.scale = clamp(value || 1, .1, 12); renderPreview(); });
    bindCheck('#monster-shadow', (value) => draft!.appearance.showShadow = value);
    form.querySelectorAll<HTMLSelectElement>('[data-appearance-state]').forEach((select) => select.onchange = () => {
      const state = select.dataset.appearanceState as MonsterAnimationState, direction = select.dataset.appearanceDirection as MonsterDirection;
      if (select.value) draft!.appearance[state][direction] = select.value; else delete draft!.appearance[state][direction]; renderPreview();
    });
    form.querySelector<HTMLButtonElement>('#monster-import-animation')!.onclick = () => {
      const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/png,image/webp,image/jpeg'; input.multiple = true;
      input.onchange = () => { const files = [...(input.files ?? [])]; if (!files.length) return; void openMapAnimationStudio(files, (entries) => { const created = entries[0]; if (!created || !draft) return; draft.appearance[previewState][previewDirection] = created.id; if (!draft.appearance.fallbackAssetId) draft.appearance.fallbackAssetId = created.id; renderForm(); renderPreview(); }); };
      input.click();
    };
  };

  const renderStats = () => {
    if (!draft) return;
    form.innerHTML = `<section><h4>Sobrevivência</h4><div class="npc-form-grid"><label>HP máximo<input id="monster-hp" type="number" min="1" max="99999999" value="${draft.stats.maxHp}"></label><label>Defesa<input id="monster-defense" type="number" min="0" max="999999" value="${draft.stats.defense}"></label></div></section><section><h4>Ataque</h4><div class="npc-form-grid"><label>Dano base<input id="monster-attack" type="number" min="1" max="999999" value="${draft.stats.attack}"></label><label>Alcance (tiles)<input id="monster-range" type="number" min="0.2" max="30" step="0.05" value="${draft.stats.attackRange}"></label><label>Cooldown (ms)<input id="monster-cooldown" type="number" min="100" max="60000" step="50" value="${draft.stats.attackCooldownMs}"></label><label>Velocidade<input id="monster-speed" type="number" min="0" max="20" step="0.05" value="${draft.stats.moveSpeed}"></label></div></section><section><h4>Recompensas</h4><div class="npc-form-grid"><label>EXP<input id="monster-exp" type="number" min="0" max="99999999" value="${draft.stats.expReward}"></label><label>Moedas<input id="monster-coins" type="number" min="0" max="99999999" value="${draft.stats.coinReward}"></label></div></section>`;
    bindNumber('#monster-hp', (v) => draft!.stats.maxHp = Math.max(1, Math.round(v || 1)));
    bindNumber('#monster-defense', (v) => draft!.stats.defense = Math.max(0, Math.round(v || 0)));
    bindNumber('#monster-attack', (v) => draft!.stats.attack = Math.max(1, Math.round(v || 1)));
    bindNumber('#monster-range', (v) => draft!.stats.attackRange = clamp(v || 1, .2, 30));
    bindNumber('#monster-cooldown', (v) => draft!.stats.attackCooldownMs = clamp(Math.round(v || 1000), 100, 60000));
    bindNumber('#monster-speed', (v) => draft!.stats.moveSpeed = clamp(v || 0, 0, 20));
    bindNumber('#monster-exp', (v) => draft!.stats.expReward = Math.max(0, Math.round(v || 0)));
    bindNumber('#monster-coins', (v) => draft!.stats.coinReward = Math.max(0, Math.round(v || 0)));
  };

  const renderAi = () => {
    if (!draft) return;
    form.innerHTML = `<section><h4>Temperamento</h4><label>Comportamento<select id="monster-temperament"><option value="passive" ${draft.ai.temperament === 'passive' ? 'selected' : ''}>Passivo — não inicia combate</option><option value="defensive" ${draft.ai.temperament === 'defensive' ? 'selected' : ''}>Defensivo — reage quando atacado</option><option value="aggressive" ${draft.ai.temperament === 'aggressive' ? 'selected' : ''}>Agressivo — persegue ao detectar</option></select></label></section><section><h4>Território</h4><div class="npc-form-grid"><label>Aggro (tiles)<input id="monster-aggro" type="number" min="0" max="60" step="0.1" value="${draft.ai.aggroRadius}"></label><label>Leash / retorno<input id="monster-leash" type="number" min="1" max="100" step="0.1" value="${draft.ai.leashRadius}"></label><label>Vagar (tiles)<input id="monster-wander" type="number" min="0" max="40" step="0.1" value="${draft.ai.wanderRadius}"></label><label>Respawn (ms)<input id="monster-respawn" type="number" min="500" max="3600000" step="100" value="${draft.ai.respawnMs}"></label></div></section><section><h4>Ritmo fora de combate</h4><div class="npc-form-grid"><label>Espera mínima (ms)<input id="monster-idle-min" type="number" min="0" max="60000" step="100" value="${draft.ai.idleMinMs}"></label><label>Espera máxima (ms)<input id="monster-idle-max" type="number" min="0" max="60000" step="100" value="${draft.ai.idleMaxMs}"></label></div><p class="monster-inline-note">O monstro escolhe pontos aleatórios dentro do raio de caminhada e retorna ao spawn se ultrapassar o leash.</p></section>`;
    bindText('#monster-temperament', (v) => draft!.ai.temperament = v as MonsterTemperament);
    bindNumber('#monster-aggro', (v) => draft!.ai.aggroRadius = clamp(v || 0, 0, 60));
    bindNumber('#monster-leash', (v) => draft!.ai.leashRadius = clamp(v || 1, 1, 100));
    bindNumber('#monster-wander', (v) => draft!.ai.wanderRadius = clamp(v || 0, 0, 40));
    bindNumber('#monster-respawn', (v) => draft!.ai.respawnMs = clamp(Math.round(v || 7000), 500, 3600000));
    bindNumber('#monster-idle-min', (v) => draft!.ai.idleMinMs = clamp(Math.round(v || 0), 0, 60000));
    bindNumber('#monster-idle-max', (v) => draft!.ai.idleMaxMs = clamp(Math.round(v || 0), 0, 60000));
  };

  const renderContent = () => {
    if (!draft) return;
    form.innerHTML = `<section><h4>Tabela de drops</h4><div id="monster-drops"></div><button id="monster-drop-add">＋ Adicionar drop</button><p class="monster-inline-note">Chance usa 0–100%. O item precisa existir no catálogo para aparecer corretamente no chão/inventário.</p></section><section><h4>Habilidades de monstro</h4><div id="monster-skills"></div><button id="monster-skill-add">＋ Adicionar habilidade</button><p class="monster-inline-note">Nesta primeira versão o runtime usa chance, cooldown, alcance e multiplicador de dano. O ID/nome já deixam o dado preparado para efeitos e VFX específicos depois.</p></section>`;
    const renderDrops = () => {
      const holder = form.querySelector<HTMLElement>('#monster-drops')!;
      holder.innerHTML = draft!.drops.map((drop, index) => `<div class="monster-drop-row"><label>Item<input data-drop-item="${index}" value="${esc(drop.itemId)}"></label><label>Chance %<input data-drop-chance="${index}" type="number" min="0" max="100" step="0.1" value="${(drop.chance * 100).toFixed(1)}"></label><label>Mín.<input data-drop-min="${index}" type="number" min="1" value="${drop.min}"></label><label>Máx.<input data-drop-max="${index}" type="number" min="1" value="${drop.max}"></label><button data-drop-remove="${index}" class="monster-danger">×</button></div>`).join('');
      holder.querySelectorAll<HTMLInputElement>('[data-drop-item]').forEach((input) => input.oninput = () => draft!.drops[Number(input.dataset.dropItem)].itemId = input.value.trim());
      holder.querySelectorAll<HTMLInputElement>('[data-drop-chance]').forEach((input) => input.oninput = () => draft!.drops[Number(input.dataset.dropChance)].chance = clamp((Number(input.value) || 0) / 100, 0, 1));
      holder.querySelectorAll<HTMLInputElement>('[data-drop-min]').forEach((input) => input.oninput = () => draft!.drops[Number(input.dataset.dropMin)].min = Math.max(1, Math.round(Number(input.value) || 1)));
      holder.querySelectorAll<HTMLInputElement>('[data-drop-max]').forEach((input) => input.oninput = () => draft!.drops[Number(input.dataset.dropMax)].max = Math.max(1, Math.round(Number(input.value) || 1)));
      holder.querySelectorAll<HTMLButtonElement>('[data-drop-remove]').forEach((button) => button.onclick = () => { draft!.drops.splice(Number(button.dataset.dropRemove), 1); renderDrops(); });
    };
    const renderSkills = () => {
      const holder = form.querySelector<HTMLElement>('#monster-skills')!;
      holder.innerHTML = draft!.skills.map((skill, index) => `<div class="monster-skill-row"><label>Nome<input data-skill-name="${index}" value="${esc(skill.name)}"></label><label>Chance %<input data-skill-chance="${index}" type="number" min="0" max="100" step="1" value="${Math.round(skill.chance * 100)}"></label><label>Cooldown ms<input data-skill-cd="${index}" type="number" min="100" step="100" value="${skill.cooldownMs}"></label><label>Alcance<input data-skill-range="${index}" type="number" min="0.2" step="0.1" value="${skill.range}"></label><label>Dano x<input data-skill-damage="${index}" type="number" min="0" step="0.1" value="${skill.damageMultiplier}"></label><button data-skill-remove="${index}" class="monster-danger">×</button></div>`).join('');
      holder.querySelectorAll<HTMLInputElement>('[data-skill-name]').forEach((input) => input.oninput = () => draft!.skills[Number(input.dataset.skillName)].name = input.value);
      holder.querySelectorAll<HTMLInputElement>('[data-skill-chance]').forEach((input) => input.oninput = () => draft!.skills[Number(input.dataset.skillChance)].chance = clamp((Number(input.value) || 0) / 100, 0, 1));
      holder.querySelectorAll<HTMLInputElement>('[data-skill-cd]').forEach((input) => input.oninput = () => draft!.skills[Number(input.dataset.skillCd)].cooldownMs = Math.max(100, Math.round(Number(input.value) || 1000)));
      holder.querySelectorAll<HTMLInputElement>('[data-skill-range]').forEach((input) => input.oninput = () => draft!.skills[Number(input.dataset.skillRange)].range = Math.max(.2, Number(input.value) || 1));
      holder.querySelectorAll<HTMLInputElement>('[data-skill-damage]').forEach((input) => input.oninput = () => draft!.skills[Number(input.dataset.skillDamage)].damageMultiplier = Math.max(0, Number(input.value) || 1));
      holder.querySelectorAll<HTMLButtonElement>('[data-skill-remove]').forEach((button) => button.onclick = () => { draft!.skills.splice(Number(button.dataset.skillRemove), 1); renderSkills(); });
    };
    form.querySelector<HTMLButtonElement>('#monster-drop-add')!.onclick = () => { const value: MonsterDrop = { itemId: '', chance: .25, min: 1, max: 1 }; draft!.drops.push(value); renderDrops(); };
    form.querySelector<HTMLButtonElement>('#monster-skill-add')!.onclick = () => { const value: MonsterSkill = { id: uid('monster-skill'), name: 'Golpe especial', chance: .25, cooldownMs: 5000, range: draft!.stats.attackRange, damageMultiplier: 1.5 }; draft!.skills.push(value); renderSkills(); };
    renderDrops(); renderSkills();
  };

  const renderForm = () => {
    if (!draft) { form.innerHTML = '<div style="padding:24px;color:#7896a4">Crie ou selecione um monstro.</div>'; return; }
    if (tab === 'general') renderGeneral(); else if (tab === 'appearance') renderAppearance(); else if (tab === 'stats') renderStats(); else if (tab === 'ai') renderAi(); else renderContent();
  };
  const renderSummary = () => {
    const holder = overlay.querySelector<HTMLElement>('#monster-summary')!;
    if (!draft) { holder.innerHTML = ''; return; }
    holder.innerHTML = `<div class="npc-summary-card"><span>Nível</span><strong>${draft.level}</strong></div><div class="npc-summary-card"><span>Rank</span><strong>${esc(draft.rank)}</strong></div><div class="npc-summary-card"><span>HP</span><strong>${draft.stats.maxHp}</strong></div><div class="npc-summary-card"><span>Ataque</span><strong>${draft.stats.attack}</strong></div><div class="npc-summary-card"><span>IA</span><strong>${esc(draft.ai.temperament)}</strong></div><div class="npc-summary-card"><span>Drops</span><strong>${draft.drops.length}</strong></div>`;
  };
  const renderPreviewChrome = () => {
    overlay.querySelector<HTMLElement>('#monster-preview-name')!.textContent = draft?.name ?? 'Nenhum monstro';
    overlay.querySelector<HTMLElement>('#monster-preview-title')!.textContent = draft?.title || draft?.category || 'Crie sua primeira criatura';
    overlay.querySelector<HTMLElement>('#monster-preview-badge')!.textContent = draft ? `${draft.rank.toUpperCase()} • NV. ${draft.level}` : 'MONSTRO';
  };
  const renderPreview = (time = performance.now()) => {
    const ctx = previewCanvas.getContext('2d')!; ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height); ctx.fillStyle = '#151a20'; ctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
    if (!draft) return;
    drawAssetThumbnail(previewCanvas, previewEntry(draft, previewState, previewDirection), time);
  };
  const previewLoop = (time: number) => { if (!overlay.classList.contains('hidden') && time - lastPreview > 90) { renderPreview(time); lastPreview = time; } raf = requestAnimationFrame(previewLoop); };
  const renderAll = () => { renderList(); renderTabs(); renderForm(); renderSummary(); renderPreviewChrome(); renderPreview(); };
  const saveDraft = () => {
    if (!draft) return;
    if (!draft.name.trim()) draft.name = 'Monstro sem nome';
    if (draft.ai.idleMaxMs < draft.ai.idleMinMs) draft.ai.idleMaxMs = draft.ai.idleMinMs;
    draft = saveMonsterDefinition(draft); activeId = draft.id; refreshDefinitions(); renderAll();
    document.querySelector<HTMLInputElement>('#mep-search')?.dispatchEvent(new Event('input', { bubbles: true }));
  };

  overlay.querySelector<HTMLButtonElement>('#monster-new')!.onclick = () => { const created = saveMonsterDefinition(createMonsterDefinition()); definitions = listMonsterDefinitions(); activeId = created.id; draft = created; tab = 'general'; renderAll(); };
  overlay.querySelector<HTMLButtonElement>('#monster-save')!.onclick = saveDraft;
  overlay.querySelector<HTMLButtonElement>('#monster-duplicate')!.onclick = () => { if (!activeId) return; const created = duplicateMonsterDefinition(activeId); if (!created) return; definitions = listMonsterDefinitions(); activeId = created.id; draft = created; renderAll(); };
  overlay.querySelector<HTMLButtonElement>('#monster-delete')!.onclick = () => { if (!draft || !confirm(`Excluir “${draft.name}”? As cópias já colocadas no mapa perderão a definição.`)) return; deleteMonsterDefinition(draft.id); refreshDefinitions(); renderAll(); };
  searchInput.oninput = () => { search = searchInput.value; renderList(); };
  overlay.querySelector<HTMLSelectElement>('#monster-preview-state')!.onchange = (event) => { previewState = (event.currentTarget as HTMLSelectElement).value as MonsterAnimationState; renderPreview(); if (tab === 'appearance') renderForm(); };
  overlay.querySelector<HTMLSelectElement>('#monster-preview-direction')!.onchange = (event) => { previewDirection = (event.currentTarget as HTMLSelectElement).value as MonsterDirection; renderPreview(); if (tab === 'appearance') renderForm(); };
  const close = () => { overlay.classList.add('hidden'); document.querySelector<HTMLButtonElement>('#mep-mode-monsters')?.classList.remove('active'); document.querySelector<HTMLButtonElement>('#mep-mode-map')?.classList.add('active'); };
  overlay.querySelector<HTMLButtonElement>('#monster-studio-back')!.onclick = close;
  const open = (monsterId?: string) => {
    syncMonsterDefinitionsIntoPalette(); definitions = listMonsterDefinitions();
    if (monsterId && definitions.some((value) => value.id === monsterId)) activeId = monsterId;
    if (!activeId && definitions.length) activeId = definitions[0].id;
    draft = activeId ? getMonsterDefinition(activeId) : null;
    overlay.classList.remove('hidden'); document.querySelectorAll<HTMLButtonElement>('.mep-mode button').forEach((button) => button.classList.remove('active')); document.querySelector<HTMLButtonElement>('#mep-mode-monsters')?.classList.add('active'); renderAll();
  };
  window.addEventListener('ascension-monster-definitions-change', () => { syncMonsterDefinitionsIntoPalette(); if (!overlay.classList.contains('hidden')) { const keep = draft?.id; definitions = listMonsterDefinitions(); if (keep) draft = getMonsterDefinition(keep); renderAll(); } });
  raf = requestAnimationFrame(previewLoop);
  return { open, close, element: overlay, destroy: () => { cancelAnimationFrame(raf); overlay.remove(); } };
}
