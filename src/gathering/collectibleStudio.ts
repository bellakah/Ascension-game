import '../npc/npcStudio.css';
import './collectibleStudio.css';
import { getPaletteEntry } from '../editor/map/mapEditorCatalog';
import { drawAssetThumbnail, getMapAssetImage } from '../editor/map/mapAssetRenderer';
import { openMapAnimationStudio } from '../editor/map/mapAnimationStudio';
import { markLibraryAssetInternal } from '../editor/map/mapAssetLibraryV2';
import { findItemStudioRecord, itemStudioDisplay, listItemStudioRecords } from '../items/itemStudioStore';
import {
  createCollectibleDefinition,
  deleteCollectibleDefinition,
  duplicateCollectibleDefinition,
  getCollectibleDefinition,
  listCollectibleDefinitions,
  saveCollectibleDefinition,
} from './collectibleStore';
import { COLLECTIBLE_KIND_LABELS, COLLECTIBLE_PLAYER_ANIMATIONS, type CollectibleAnimationState, type CollectibleDefinition, type CollectibleDrop, type CollectibleKind } from './collectibleTypes';

const clone = <T>(value: T): T => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
const STATES: Array<[CollectibleAnimationState, string]> = [['idle','Parado'], ['harvest','Durante coleta'], ['break','Quebrar / cair'], ['depleted','Esgotado'], ['respawn','Reaparecer']];
const KINDS = Object.entries(COLLECTIBLE_KIND_LABELS) as Array<[CollectibleKind, string]>;

function itemOptions() {
  return listItemStudioRecords().map((item) => `<option value="${esc(itemStudioDisplay(item))}">${esc(item.key)}</option>`).join('');
}

function stateLabel(state: CollectibleAnimationState) {
  return STATES.find(([id]) => id === state)?.[1] ?? state;
}

function explicitAppearance(definition: CollectibleDefinition, state: CollectibleAnimationState) {
  return definition.appearance[state] || '';
}

function effectiveAppearance(definition: CollectibleDefinition, state: CollectibleAnimationState) {
  return explicitAppearance(definition, state)
    || definition.appearance.idle
    || definition.appearance.fallbackAssetId;
}

export function createCollectibleStudio(root: HTMLElement) {
  let values = listCollectibleDefinitions();
  let activeId = values[0]?.id ?? '';
  let draft = activeId ? clone(values[0]) : null as CollectibleDefinition | null;
  let search = '';
  let tab: 'general' | 'appearance' | 'drops' = 'general';
  let previewState: CollectibleAnimationState = 'idle';

  const overlay = document.createElement('section');
  overlay.className = 'npc-studio-overlay collectible-studio-overlay hidden';
  overlay.innerHTML = `
    <header class="npc-studio-head"><div><strong>COLLECTIBLE STUDIO</strong><span>Recursos, ferramentas, animações e loot</span></div><div class="spacer"></div><button id="collectible-back">← Voltar ao mapa</button></header>
    <div class="npc-studio-shell collectible-studio-shell">
      <aside class="npc-list"><div class="npc-list-tools"><input id="collectible-search" placeholder="Buscar nome, ID ou categoria..."><button id="collectible-new" class="npc-primary">＋ Novo coletável</button></div><div id="collectible-list" class="npc-list-items"></div></aside>
      <main class="npc-center collectible-center"><div class="npc-preview-stage"><div class="collectible-preview-card"><canvas id="collectible-preview" width="320" height="320"></canvas><div><span id="collectible-preview-id"></span><strong id="collectible-preview-name">Coletável</strong><span id="collectible-preview-kind"></span></div></div></div><div id="collectible-summary" class="npc-content-summary"></div></main>
      <aside class="npc-properties"><nav id="collectible-tabs" class="npc-tabs"></nav><div id="collectible-form" class="npc-form"></div><footer class="npc-properties-foot"><button id="collectible-duplicate">Duplicar</button><button id="collectible-delete" class="npc-danger">Excluir</button><div class="spacer"></div><button id="collectible-save" class="npc-primary">Salvar</button></footer></aside>
    </div>`;
  root.querySelector<HTMLElement>('.mep-stage-wrap')?.appendChild(overlay);

  const listNode = overlay.querySelector<HTMLElement>('#collectible-list')!;
  const form = overlay.querySelector<HTMLElement>('#collectible-form')!;
  const tabs = overlay.querySelector<HTMLElement>('#collectible-tabs')!;
  const canvas = overlay.querySelector<HTMLCanvasElement>('#collectible-preview')!;
  const ctx = canvas.getContext('2d')!;

  const reload = (keep = activeId) => {
    values = listCollectibleDefinitions();
    activeId = values.some((entry) => entry.id === keep) ? keep : values[0]?.id ?? '';
    draft = activeId ? clone(values.find((entry) => entry.id === activeId)!) : null;
  };

  const saveDraftAndReload = () => {
    if (!draft) return;
    const saved = saveCollectibleDefinition(draft);
    activeId = saved.id;
    reload(saved.id);
  };

  const renderPreview = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#08141d'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(90,142,166,.16)'; ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 32) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke(); }
    for (let y = 0; y < canvas.height; y += 32) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke(); }
    if (!draft) return;
    const entry = getPaletteEntry(effectiveAppearance(draft, previewState));
    const image = getMapAssetImage(entry, renderPreview);
    const sprite = entry.sprite;
    if (image?.complete && image.naturalWidth > 0) {
      const frame = sprite?.animation?.frames?.[0] ?? sprite?.sourceRect ?? { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
      const max = 220 * draft.appearance.scale;
      const ratio = Math.min(max / Math.max(1, frame.width), max / Math.max(1, frame.height));
      const width = frame.width * ratio, height = frame.height * ratio;
      ctx.imageSmoothingEnabled = !sprite?.pixelated;
      ctx.drawImage(image, frame.x, frame.y, frame.width, frame.height, 160 - width / 2, 260 - height, width, height);
    } else {
      ctx.fillStyle = entry.color || '#6d9470'; ctx.beginPath(); ctx.arc(160, 175, 42, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '700 34px system-ui'; ctx.textAlign = 'center'; ctx.fillText(draft.icon, 160, 187);
    }
    overlay.querySelector<HTMLElement>('#collectible-preview-id')!.textContent = `COLETÁVEL #${draft.numericId}`;
    overlay.querySelector<HTMLElement>('#collectible-preview-name')!.textContent = draft.name;
    overlay.querySelector<HTMLElement>('#collectible-preview-kind')!.textContent = `${COLLECTIBLE_KIND_LABELS[draft.kind]} · ${stateLabel(previewState)}`;
    overlay.querySelector<HTMLElement>('#collectible-summary')!.innerHTML = `<div class="npc-summary-card"><span>Coleta</span><strong>${(draft.harvestDurationMs / 1000).toFixed(1)}s</strong></div><div class="npc-summary-card"><span>Respawn</span><strong>${(draft.respawnMs / 1000).toFixed(1)}s</strong></div><div class="npc-summary-card"><span>Drops</span><strong>${draft.drops.length}</strong></div>`;
  };

  const renderList = () => {
    const query = search.trim().toLocaleLowerCase('pt-BR').replace(/^#/, '');
    const filtered = values.filter((entry) => !query || `${entry.numericId} ${entry.name} ${entry.kind} ${entry.category} ${entry.tags.join(' ')}`.toLocaleLowerCase('pt-BR').includes(query));
    listNode.innerHTML = filtered.map((entry) => `<button class="npc-list-card ${entry.id === activeId ? 'active' : ''}" data-collectible="${esc(entry.id)}"><span class="npc-list-avatar">${esc(entry.icon)}</span><span><strong>${esc(entry.name)}</strong><span>#${entry.numericId} · ${esc(entry.category)}</span></span><span class="npc-list-role">${esc(COLLECTIBLE_KIND_LABELS[entry.kind])}</span></button>`).join('') || '<div class="collectible-empty">Nenhum coletável.</div>';
    listNode.querySelectorAll<HTMLButtonElement>('[data-collectible]').forEach((button) => button.onclick = () => { activeId = button.dataset.collectible!; draft = clone(values.find((entry) => entry.id === activeId)!); previewState = 'idle'; renderAll(); });
  };

  const bindText = (selector: string, apply: (value: string) => void) => {
    const input = form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selector); if (!input) return;
    input.oninput = () => { if (!draft) return; apply(input.value); renderPreview(); };
  };
  const bindNumber = (selector: string, apply: (value: number) => void) => {
    const input = form.querySelector<HTMLInputElement>(selector); if (!input) return;
    input.oninput = () => { if (!draft) return; apply(Number(input.value)); renderPreview(); };
  };

  const renderGeneral = () => {
    if (!draft) return;
    form.innerHTML = `<section><h4>Identidade</h4><div class="npc-form-grid"><label>ID numérico<input value="${draft.numericId}" disabled></label><label>Categoria<input id="collectible-category" value="${esc(draft.category)}"></label></div><label>Nome<input id="collectible-name" value="${esc(draft.name)}"></label><label>Descrição<textarea id="collectible-description">${esc(draft.description)}</textarea></label><div class="npc-form-grid"><label>Tipo<select id="collectible-kind">${KINDS.map(([id,label]) => `<option value="${id}" ${draft!.kind === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Ícone<input id="collectible-icon" value="${esc(draft.icon)}"></label></div><label>Tags<input id="collectible-tags" value="${esc(draft.tags.join(', '))}"></label></section>
      <section><h4>Interação</h4><div class="npc-form-grid"><label>Texto da ação<input id="collectible-hint" value="${esc(draft.hint)}"></label><label>Alcance (tiles)<input id="collectible-radius" type="number" min=".3" max="8" step=".1" value="${draft.interactionRadiusTiles}"></label><label>Duração coleta (ms)<input id="collectible-duration" type="number" min="150" value="${draft.harvestDurationMs}"></label><label>Animação do jogador<select id="collectible-player-animation">${COLLECTIBLE_PLAYER_ANIMATIONS.map(([id,label]) => `<option value="${id}" ${draft!.playerAnimation === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><label>Ferramenta necessária<input id="collectible-tool" list="collectible-item-options" value="${draft.requiredToolItemId ? esc(itemStudioDisplay(findItemStudioRecord(draft.requiredToolNumericId ?? draft.requiredToolItemId) ?? { numericId: draft.requiredToolNumericId ?? 0, name: draft.requiredToolItemId })) : ''}" placeholder="#ID, nome ou vazio para nenhuma"><datalist id="collectible-item-options">${itemOptions()}</datalist></label><div class="npc-form-grid"><label>Respawn (ms)<input id="collectible-respawn" type="number" min="250" value="${draft.respawnMs}"></label><label>Variação ± ms<input id="collectible-respawn-jitter" type="number" min="0" value="${draft.respawnJitterMs}"></label></div></section>`;
    bindText('#collectible-category', (value) => draft!.category = value || 'Outros');
    bindText('#collectible-name', (value) => draft!.name = value || 'Novo Coletável');
    bindText('#collectible-description', (value) => draft!.description = value);
    bindText('#collectible-kind', (value) => draft!.kind = value as CollectibleKind);
    bindText('#collectible-icon', (value) => draft!.icon = value || '◆');
    bindText('#collectible-tags', (value) => draft!.tags = value.split(',').map((tag) => tag.trim()).filter(Boolean));
    bindText('#collectible-hint', (value) => draft!.hint = value || 'Coletar');
    bindNumber('#collectible-radius', (value) => draft!.interactionRadiusTiles = Math.max(.3, value || 1.5));
    bindNumber('#collectible-duration', (value) => draft!.harvestDurationMs = Math.max(150, Math.floor(value || 1000)));
    bindText('#collectible-player-animation', (value) => draft!.playerAnimation = value as CollectibleDefinition['playerAnimation']);
    bindNumber('#collectible-respawn', (value) => draft!.respawnMs = Math.max(250, Math.floor(value || 10000)));
    bindNumber('#collectible-respawn-jitter', (value) => draft!.respawnJitterMs = Math.max(0, Math.floor(value || 0)));
    const tool = form.querySelector<HTMLInputElement>('#collectible-tool')!;
    tool.onchange = () => {
      if (!draft) return;
      if (!tool.value.trim()) { delete draft.requiredToolItemId; delete draft.requiredToolNumericId; return; }
      const found = findItemStudioRecord(tool.value);
      if (!found) { tool.classList.add('invalid'); return; }
      tool.classList.remove('invalid'); draft.requiredToolItemId = found.key; draft.requiredToolNumericId = found.numericId; tool.value = itemStudioDisplay(found);
    };
  };

  const importAppearance = (state: CollectibleAnimationState) => {
    if (!draft) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/webp,image/jpeg';
    input.multiple = true;
    input.onchange = () => {
      const files = [...(input.files ?? [])];
      if (!files.length) return;
      void openMapAnimationStudio(files, (entries) => {
        const created = entries[0];
        if (!created || !draft) return;
        void markLibraryAssetInternal(created.id, ['collectible-animation-internal', `collectible:${draft.id}`, `collectible-state:${state}`]).then(() => {
          if (!draft) return;
          draft.appearance[state] = created.id;
          previewState = state;
          saveDraftAndReload();
          tab = 'appearance';
          renderAll();
        });
      }).catch((error) => alert(error instanceof Error ? error.message : 'Não foi possível importar a animação.'));
    };
    input.click();
  };

  const renderAppearance = () => {
    if (!draft) return;
    form.innerHTML = `<section><h4>Aparência por estado</h4><p class="monster-inline-note">Carregue a imagem, spritesheet ou vários frames diretamente em cada estado. Essas animações ficam internas ao coletável e não aparecem como objetos separados no Map Editor.</p><div class="collectible-state-list">${STATES.map(([state,label]) => {
      const explicit = explicitAppearance(draft!, state);
      const effective = effectiveAppearance(draft!, state);
      const entry = getPaletteEntry(effective);
      const inherited = !explicit;
      return `<article class="collectible-state-card ${previewState === state ? 'active' : ''}" data-state-card="${state}"><button type="button" class="collectible-state-preview" data-preview-state="${state}" title="Visualizar ${esc(label)}"><canvas data-state-thumb="${state}" width="92" height="76"></canvas></button><div class="collectible-state-copy"><strong>${esc(label)}</strong><span>${inherited ? (state === 'idle' ? `Fallback: ${esc(entry.label)}` : `Usa Parado · ${esc(entry.label)}`) : esc(entry.label)}</span><small>${explicit ? (entry.sprite?.animation?.frames.length ? `${entry.sprite.animation.frames.length} frames` : 'Imagem estática') : 'Sem asset próprio'}</small></div><div class="collectible-state-actions"><button type="button" data-import-state="${state}" class="npc-small-action">${explicit ? 'Substituir' : '＋ Carregar'}</button>${explicit ? `<button type="button" data-clear-state="${state}" class="collectible-clear-state">Limpar</button>` : ''}</div></article>`;
    }).join('')}</div></section><section><h4>Visual</h4><div class="npc-form-grid"><label>Escala<input id="collectible-scale" type="number" min=".1" max="10" step=".1" value="${draft.appearance.scale}"></label><label class="npc-check"><input id="collectible-shadow" type="checkbox" ${draft.appearance.showShadow ? 'checked' : ''}> Mostrar sombra</label></div></section>`;

    form.querySelectorAll<HTMLCanvasElement>('[data-state-thumb]').forEach((thumb) => {
      const state = thumb.dataset.stateThumb as CollectibleAnimationState;
      drawAssetThumbnail(thumb, getPaletteEntry(effectiveAppearance(draft!, state)));
    });
    form.querySelectorAll<HTMLButtonElement>('[data-preview-state]').forEach((button) => button.onclick = () => {
      previewState = button.dataset.previewState as CollectibleAnimationState;
      renderAppearance();
      renderPreview();
    });
    form.querySelectorAll<HTMLButtonElement>('[data-import-state]').forEach((button) => button.onclick = () => importAppearance(button.dataset.importState as CollectibleAnimationState));
    form.querySelectorAll<HTMLButtonElement>('[data-clear-state]').forEach((button) => button.onclick = () => {
      if (!draft) return;
      const state = button.dataset.clearState as CollectibleAnimationState;
      delete draft.appearance[state];
      previewState = state;
      saveDraftAndReload();
      tab = 'appearance';
      renderAll();
    });
    bindNumber('#collectible-scale', (value) => draft!.appearance.scale = Math.max(.1, Math.min(10, value || 1)));
    const shadow = form.querySelector<HTMLInputElement>('#collectible-shadow')!; shadow.onchange = () => { if (draft) draft.appearance.showShadow = shadow.checked; };
  };

  const renderDrops = () => {
    if (!draft) return;
    form.innerHTML = `<section><h4>Loot table</h4><datalist id="collectible-drop-options">${itemOptions()}</datalist><div id="collectible-drop-list"></div><button id="collectible-drop-add" type="button">＋ Adicionar item</button></section>`;
    const holder = form.querySelector<HTMLElement>('#collectible-drop-list')!;
    const renderRows = () => {
      holder.innerHTML = draft!.drops.map((drop,index) => { const found = findItemStudioRecord(drop.numericId ?? drop.itemId); const display = found ? itemStudioDisplay(found) : drop.itemId; return `<div class="collectible-drop-row"><label>Item<input data-drop-item="${index}" list="collectible-drop-options" value="${esc(display)}"></label><label>Chance %<input data-drop-chance="${index}" type="number" min="0" max="100" step=".1" value="${(drop.chance * 100).toFixed(1)}"></label><label>Mín.<input data-drop-min="${index}" type="number" min="1" value="${drop.min}"></label><label>Máx.<input data-drop-max="${index}" type="number" min="1" value="${drop.max}"></label><button data-drop-remove="${index}" class="npc-danger">×</button></div>`; }).join('') || '<div class="collectible-empty">Nenhum drop configurado.</div>';
      holder.querySelectorAll<HTMLInputElement>('[data-drop-item]').forEach((input) => input.onchange = () => { const found = findItemStudioRecord(input.value); if (!found || !draft) { input.classList.add('invalid'); return; } const drop = draft.drops[Number(input.dataset.dropItem)]; drop.itemId = found.key; drop.numericId = found.numericId; input.value = itemStudioDisplay(found); input.classList.remove('invalid'); });
      holder.querySelectorAll<HTMLInputElement>('[data-drop-chance]').forEach((input) => input.oninput = () => { if (draft) draft.drops[Number(input.dataset.dropChance)].chance = Math.max(0, Math.min(1, (Number(input.value) || 0) / 100)); });
      holder.querySelectorAll<HTMLInputElement>('[data-drop-min]').forEach((input) => input.oninput = () => { if (draft) draft.drops[Number(input.dataset.dropMin)].min = Math.max(1, Math.floor(Number(input.value) || 1)); });
      holder.querySelectorAll<HTMLInputElement>('[data-drop-max]').forEach((input) => input.oninput = () => { if (draft) draft.drops[Number(input.dataset.dropMax)].max = Math.max(1, Math.floor(Number(input.value) || 1)); });
      holder.querySelectorAll<HTMLButtonElement>('[data-drop-remove]').forEach((button) => button.onclick = () => { if (!draft) return; draft.drops.splice(Number(button.dataset.dropRemove), 1); renderRows(); });
    };
    form.querySelector<HTMLButtonElement>('#collectible-drop-add')!.onclick = () => { if (!draft) return; const first = listItemStudioRecords()[0]; const drop: CollectibleDrop = { itemId: first?.key ?? '', numericId: first?.numericId, chance: 1, min: 1, max: 1 }; draft.drops.push(drop); renderRows(); };
    renderRows();
  };

  const renderTabs = () => {
    tabs.innerHTML = [['general','Geral'],['appearance','Aparência'],['drops','Drops']].map(([id,label]) => `<button data-tab="${id}" class="${tab === id ? 'active' : ''}">${label}</button>`).join('');
    tabs.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => button.onclick = () => { tab = button.dataset.tab as typeof tab; renderTabs(); renderForm(); });
  };
  const renderForm = () => { if (!draft) { form.innerHTML = '<div class="collectible-empty">Crie ou selecione um coletável.</div>'; return; } if (tab === 'general') renderGeneral(); else if (tab === 'appearance') renderAppearance(); else renderDrops(); };
  const renderAll = () => { renderList(); renderTabs(); renderForm(); renderPreview(); };

  overlay.querySelector<HTMLInputElement>('#collectible-search')!.oninput = (event) => { search = (event.currentTarget as HTMLInputElement).value; renderList(); };
  overlay.querySelector<HTMLButtonElement>('#collectible-new')!.onclick = () => { draft = createCollectibleDefinition(); activeId = draft.id; tab = 'general'; previewState = 'idle'; renderAll(); };
  overlay.querySelector<HTMLButtonElement>('#collectible-save')!.onclick = () => { if (!draft) return; const saved = saveCollectibleDefinition(draft); activeId = saved.id; reload(saved.id); renderAll(); };
  overlay.querySelector<HTMLButtonElement>('#collectible-duplicate')!.onclick = () => { if (!draft) return; if (!values.some((value) => value.id === draft!.id)) saveCollectibleDefinition(draft); const copy = duplicateCollectibleDefinition(draft.id); if (copy) { activeId = copy.id; reload(copy.id); previewState = 'idle'; renderAll(); } };
  overlay.querySelector<HTMLButtonElement>('#collectible-delete')!.onclick = () => { if (!draft || !confirm(`Excluir “${draft.name}”?`)) return; try { deleteCollectibleDefinition(draft.id); reload(''); previewState = 'idle'; renderAll(); } catch (error) { alert(error instanceof Error ? error.message : 'Não foi possível excluir.'); } };

  const close = () => overlay.classList.add('hidden');
  overlay.querySelector<HTMLButtonElement>('#collectible-back')!.onclick = close;
  const open = (id?: string) => { values = listCollectibleDefinitions(); if (id && getCollectibleDefinition(id)) activeId = id; reload(activeId); previewState = 'idle'; overlay.classList.remove('hidden'); renderAll(); };
  renderAll();
  return { open, close, element: overlay };
}
