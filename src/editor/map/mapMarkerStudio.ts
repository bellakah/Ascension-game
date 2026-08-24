import './mapMarkerStudio.css';
import {
  DEFAULT_MARKER_CONFIG,
  MARKER_CATEGORIES,
  MARKER_CATEGORY_LABELS,
  loadMarkerConfig,
  resetMarkerConfig,
  saveMarkerConfig,
} from '../../map/markerStore';
import type { MarkerCategory, MarkerSourceKind, MarkerStyle } from '../../map/markerTypes';
import { renderMarkerSource } from '../../map/markerVisual';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);

function sourceLabel(kind: MarkerSourceKind) {
  if (kind === 'fa') return 'Font Awesome';
  if (kind === 'svg') return 'SVG';
  if (kind === 'image') return 'Imagem';
  return 'Símbolo / texto';
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function openMapMarkerStudio() {
  let config = loadMarkerConfig();
  let category: MarkerCategory = 'npc';
  let draft: MarkerStyle = clone(config.styles[category]);

  const backdrop = document.createElement('div');
  backdrop.className = 'marker-studio-backdrop';
  backdrop.innerHTML = `
    <section class="marker-studio" role="dialog" aria-modal="true" aria-label="Editor de marcadores">
      <header class="marker-studio-head"><div><strong>Marker Studio</strong><span>Mapa mundial e minimapa · mudanças sem editar código</span></div><div class="spacer"></div><button data-marker-close title="Fechar">×</button></header>
      <div class="marker-studio-body">
        <aside class="marker-studio-categories"><h3>TIPOS DE MARCADOR</h3><div id="marker-categories"></div></aside>
        <main class="marker-studio-controls">
          <section><h3>Fonte visual</h3>
            <label class="marker-field"><span>Tipo</span><select id="marker-source-kind"><option value="symbol">Símbolo / texto</option><option value="fa">Font Awesome</option><option value="svg">SVG</option><option value="image">Imagem PNG/WebP/JPG</option></select></label>
            <div class="marker-source-fields">
              <label class="marker-field" data-source-field="symbol"><span>Símbolo</span><input id="marker-symbol" maxlength="12" placeholder="◆"></label>
              <div data-source-field="fa"><label class="marker-field"><span>Classes Font Awesome</span><input id="marker-fa" placeholder="fa-solid fa-user"></label><p class="marker-hint">Use classes como fa-solid fa-user, fa-solid fa-skull ou fa-solid fa-location-dot. O editor carrega a versão Free pelo CDN.</p></div>
              <label class="marker-field" data-source-field="svg"><span>SVG completo</span><textarea id="marker-svg" spellcheck="false" placeholder="<svg xmlns=...>...</svg>"></textarea></label>
              <div data-source-field="image"><label class="marker-field"><span>Imagem</span><div class="marker-file-row"><input id="marker-image-value" readonly placeholder="Nenhuma imagem carregada"><button id="marker-image-pick" type="button">Carregar</button></div></label><p class="marker-hint">Use imagens pequenas e transparentes. Limite recomendado: 700 KB.</p></div>
            </div>
          </section>
          <section><h3>Aparência</h3>
            <div class="marker-two"><label class="marker-field"><span>Tamanho (px)</span><input id="marker-size" type="number" min="8" max="64" step="1"></label><label class="marker-field"><span>Opacidade</span><input id="marker-opacity" type="number" min="0.15" max="1" step="0.05"></label></div>
            <div class="marker-two"><label class="marker-field"><span>Cor</span><input id="marker-color" type="color"></label><label class="marker-field"><span>Fundo</span><input id="marker-bg-color" type="color"></label></div>
            <div class="marker-two"><label class="marker-field"><span>Contorno</span><input id="marker-border-color" type="color"></label><label class="marker-field"><span>Espessura</span><input id="marker-border-width" type="number" min="0" max="5" step="1"></label></div>
            <div class="marker-checks"><label><input id="marker-background" type="checkbox"> Mostrar fundo</label><label><input id="marker-shadow" type="checkbox"> Sombra</label><label><input id="marker-glow" type="checkbox"> Brilho</label></div>
          </section>
          <section><h3>Nome / label</h3><div class="marker-two"><label class="marker-field"><span>Quando mostrar</span><select id="marker-label-mode"><option value="always">Sempre</option><option value="hover">Ao passar mouse</option><option value="selected">Somente selecionado</option><option value="never">Nunca</option></select></label><label class="marker-field"><span>Tamanho do texto</span><input id="marker-label-size" type="number" min="8" max="24" step="1"></label></div></section>
        </main>
        <aside class="marker-studio-preview"><h3>Preview</h3><div class="marker-preview-stage"><div class="marker-preview-wrap"><div id="marker-preview-visual" class="marker-preview-visual"><span id="marker-preview-source" class="marker-source"></span></div><span id="marker-preview-label" class="marker-preview-label">Rowan</span></div></div><div id="marker-preview-meta" class="marker-preview-meta"></div>
          <div class="marker-override"><h3>Override individual</h3><label class="marker-field"><span>ID exato do marcador</span><input id="marker-override-id" placeholder="npc:rowan"></label><p class="marker-hint">Opcional. Permite um NPC, monstro ou ponto específico usar visual diferente do padrão da categoria.</p><div class="marker-override-actions"><button class="marker-small-button" id="marker-load-override">Carregar</button><button class="marker-small-button" id="marker-save-override">Salvar override</button><button class="marker-small-button" id="marker-remove-override">Remover</button></div></div>
        </aside>
      </div>
      <footer class="marker-studio-foot"><button id="marker-reset-category">Restaurar categoria</button><button id="marker-reset-all" class="danger">Restaurar todos</button><div class="spacer"></div><button data-marker-close>Cancelar</button><button id="marker-save" class="primary">Salvar alterações</button></footer>
    </section>`;
  document.body.appendChild(backdrop);

  const categories = backdrop.querySelector<HTMLElement>('#marker-categories')!;
  const sourceKind = backdrop.querySelector<HTMLSelectElement>('#marker-source-kind')!;
  const symbol = backdrop.querySelector<HTMLInputElement>('#marker-symbol')!;
  const fa = backdrop.querySelector<HTMLInputElement>('#marker-fa')!;
  const svg = backdrop.querySelector<HTMLTextAreaElement>('#marker-svg')!;
  const imageValue = backdrop.querySelector<HTMLInputElement>('#marker-image-value')!;
  const size = backdrop.querySelector<HTMLInputElement>('#marker-size')!;
  const opacity = backdrop.querySelector<HTMLInputElement>('#marker-opacity')!;
  const color = backdrop.querySelector<HTMLInputElement>('#marker-color')!;
  const bgColor = backdrop.querySelector<HTMLInputElement>('#marker-bg-color')!;
  const borderColor = backdrop.querySelector<HTMLInputElement>('#marker-border-color')!;
  const borderWidth = backdrop.querySelector<HTMLInputElement>('#marker-border-width')!;
  const background = backdrop.querySelector<HTMLInputElement>('#marker-background')!;
  const shadow = backdrop.querySelector<HTMLInputElement>('#marker-shadow')!;
  const glow = backdrop.querySelector<HTMLInputElement>('#marker-glow')!;
  const labelMode = backdrop.querySelector<HTMLSelectElement>('#marker-label-mode')!;
  const labelSize = backdrop.querySelector<HTMLInputElement>('#marker-label-size')!;
  const previewVisual = backdrop.querySelector<HTMLElement>('#marker-preview-visual')!;
  const previewSource = backdrop.querySelector<HTMLElement>('#marker-preview-source')!;
  const previewLabel = backdrop.querySelector<HTMLElement>('#marker-preview-label')!;
  const previewMeta = backdrop.querySelector<HTMLElement>('#marker-preview-meta')!;
  const overrideId = backdrop.querySelector<HTMLInputElement>('#marker-override-id')!;

  const close = () => backdrop.remove();

  const sourceValue = () => {
    if (sourceKind.value === 'fa') return fa.value.trim();
    if (sourceKind.value === 'svg') return svg.value.trim();
    if (sourceKind.value === 'image') return draft.source.kind === 'image' ? draft.source.value : '';
    return symbol.value;
  };

  const readDraft = () => {
    const kind = sourceKind.value as MarkerSourceKind;
    draft = {
      ...draft,
      source: { kind, value: sourceValue(), fallback: draft.source.fallback },
      size: Math.max(8, Math.min(64, Number(size.value) || 18)),
      opacity: Math.max(.15, Math.min(1, Number(opacity.value) || 1)),
      color: color.value,
      background: background.checked,
      backgroundColor: bgColor.value,
      borderColor: borderColor.value,
      borderWidth: Math.max(0, Math.min(5, Number(borderWidth.value) || 0)),
      shadow: shadow.checked,
      glow: glow.checked,
      labelMode: labelMode.value as MarkerStyle['labelMode'],
      labelSize: Math.max(8, Math.min(24, Number(labelSize.value) || 12)),
    };
  };

  const renderPreview = () => {
    readDraft();
    previewVisual.style.setProperty('--preview-size', `${draft.size}px`);
    previewVisual.style.setProperty('--preview-color', draft.color);
    previewVisual.style.setProperty('--preview-bg', draft.background ? draft.backgroundColor : 'transparent');
    previewVisual.style.setProperty('--preview-border', draft.background ? draft.borderColor : 'transparent');
    previewVisual.style.setProperty('--preview-border-width', draft.background ? `${draft.borderWidth}px` : '0px');
    previewVisual.style.setProperty('--preview-filter', `${draft.glow ? `drop-shadow(0 0 7px ${draft.color}) ` : ''}${draft.shadow ? 'drop-shadow(0 3px 2px rgba(0,0,0,.65))' : 'none'}`);
    previewVisual.style.opacity = String(draft.opacity);
    previewLabel.style.setProperty('--preview-label-size', `${draft.labelSize}px`);
    previewLabel.style.display = draft.labelMode === 'never' ? 'none' : 'block';
    renderMarkerSource(previewSource, draft);
    previewMeta.innerHTML = `<strong>${esc(MARKER_CATEGORY_LABELS[category])}</strong><br>${esc(sourceLabel(draft.source.kind))} · ${draft.size}px · label: ${esc(draft.labelMode)}<br>As mudanças são usadas no mapa mundial e no minimapa.`;
  };

  const syncSourceFields = () => {
    backdrop.querySelectorAll<HTMLElement>('[data-source-field]').forEach((node) => node.classList.toggle('active', node.dataset.sourceField === sourceKind.value));
  };

  const syncInputs = () => {
    sourceKind.value = draft.source.kind;
    symbol.value = draft.source.kind === 'symbol' ? draft.source.value : (draft.source.fallback || '◆');
    fa.value = draft.source.kind === 'fa' ? draft.source.value : 'fa-solid fa-location-dot';
    svg.value = draft.source.kind === 'svg' ? draft.source.value : '';
    imageValue.value = draft.source.kind === 'image' ? 'Imagem carregada e salva' : '';
    size.value = String(draft.size);
    opacity.value = String(draft.opacity);
    color.value = draft.color;
    bgColor.value = draft.backgroundColor;
    borderColor.value = draft.borderColor.startsWith('#') ? draft.borderColor : '#d8bd72';
    borderWidth.value = String(draft.borderWidth);
    background.checked = draft.background;
    shadow.checked = draft.shadow;
    glow.checked = draft.glow;
    labelMode.value = draft.labelMode;
    labelSize.value = String(draft.labelSize);
    syncSourceFields();
    renderPreview();
  };

  const renderCategories = () => {
    categories.innerHTML = MARKER_CATEGORIES.map((id) => `<button class="marker-category ${id === category ? 'active' : ''}" data-marker-category="${id}"><b>${id === 'player' ? '▲' : id.startsWith('quest') ? '!' : '◆'}</b><span>${esc(MARKER_CATEGORY_LABELS[id])}</span></button>`).join('');
    categories.querySelectorAll<HTMLButtonElement>('[data-marker-category]').forEach((button) => button.addEventListener('click', () => {
      readDraft();
      config.styles[category] = clone(draft);
      category = button.dataset.markerCategory as MarkerCategory;
      draft = clone(config.styles[category]);
      renderCategories();
      syncInputs();
    }));
  };

  sourceKind.addEventListener('change', () => { syncSourceFields(); readDraft(); renderPreview(); });
  backdrop.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('.marker-studio-controls input,.marker-studio-controls select,.marker-studio-controls textarea').forEach((node) => node.addEventListener('input', renderPreview));

  backdrop.querySelector<HTMLButtonElement>('#marker-image-pick')!.addEventListener('click', () => {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'image/png,image/webp,image/jpeg';
    picker.onchange = async () => {
      const file = picker.files?.[0];
      if (!file) return;
      if (file.size > 1_500_000) { window.alert('A imagem é muito grande para um marcador. Use até 1,5 MB.'); return; }
      draft.source = { kind: 'image', value: await readFileAsDataUrl(file), fallback: draft.source.fallback };
      sourceKind.value = 'image';
      imageValue.value = file.name;
      syncSourceFields();
      renderPreview();
    };
    picker.click();
  });

  backdrop.querySelector<HTMLButtonElement>('#marker-save')!.addEventListener('click', () => {
    readDraft();
    config.styles[category] = clone(draft);
    saveMarkerConfig(config);
    close();
  });

  backdrop.querySelector<HTMLButtonElement>('#marker-reset-category')!.addEventListener('click', () => {
    config.styles[category] = clone(DEFAULT_MARKER_CONFIG.styles[category]);
    draft = clone(config.styles[category]);
    syncInputs();
  });

  backdrop.querySelector<HTMLButtonElement>('#marker-reset-all')!.addEventListener('click', () => {
    if (!window.confirm('Restaurar todos os marcadores para o padrão do Ascension?')) return;
    config = resetMarkerConfig();
    draft = clone(config.styles[category]);
    syncInputs();
  });

  backdrop.querySelector<HTMLButtonElement>('#marker-load-override')!.addEventListener('click', () => {
    const id = overrideId.value.trim();
    if (!id) return;
    const stored = config.overrides[id];
    if (!stored) { window.alert('Não existe override salvo para esse ID.'); return; }
    draft = { ...clone(config.styles[category]), ...clone(stored), source: { ...config.styles[category].source, ...(stored.source ?? {}) } };
    syncInputs();
  });

  backdrop.querySelector<HTMLButtonElement>('#marker-save-override')!.addEventListener('click', () => {
    const id = overrideId.value.trim();
    if (!id) { window.alert('Informe o ID do marcador, por exemplo npc:rowan.'); return; }
    readDraft();
    config.overrides[id] = clone(draft);
    saveMarkerConfig(config);
    previewMeta.innerHTML += `<br><strong>Override salvo:</strong> ${esc(id)}`;
  });

  backdrop.querySelector<HTMLButtonElement>('#marker-remove-override')!.addEventListener('click', () => {
    const id = overrideId.value.trim();
    if (!id) return;
    delete config.overrides[id];
    saveMarkerConfig(config);
    draft = clone(config.styles[category]);
    syncInputs();
  });

  backdrop.querySelectorAll<HTMLButtonElement>('[data-marker-close]').forEach((button) => button.addEventListener('click', close));
  backdrop.addEventListener('pointerdown', (event) => { if (event.target === backdrop) close(); });
  const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); close(); window.removeEventListener('keydown', onKey, true); } };
  window.addEventListener('keydown', onKey, true);

  renderCategories();
  syncInputs();
}

export function installMapMarkerStudioIntegration() {
  if (document.documentElement.dataset.markerStudioIntegration === 'ready') return;
  const rail = document.querySelector<HTMLElement>('.mep-rail');
  if (!rail) return;
  document.documentElement.dataset.markerStudioIntegration = 'ready';

  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.markerStudio = '1';
  button.dataset.tip = 'Marcadores do mapa';
  button.title = 'Marker Studio — personalizar marcadores';
  button.textContent = '⌖';
  const assets = rail.querySelector<HTMLElement>('[data-rail="assets"]');
  assets?.after(button);
  if (!assets) rail.appendChild(button);
  button.addEventListener('click', () => openMapMarkerStudio());

  const moreMenu = document.querySelector<HTMLElement>('#mep-more-menu');
  if (moreMenu && !moreMenu.querySelector('[data-open-marker-studio]')) {
    const menuButton = document.createElement('button');
    menuButton.type = 'button';
    menuButton.dataset.openMarkerStudio = '1';
    menuButton.textContent = '⌖ Editar marcadores do mapa';
    menuButton.addEventListener('click', () => openMapMarkerStudio());
    moreMenu.appendChild(menuButton);
  }
}
