import { MAP_PALETTE_ENTRIES } from './map/mapEditorCatalog';
import type { MapPaletteEntry } from './map/mapEditorTypes';
import { listNpcDefinitions, NPC_ASSET_PREFIX } from '../npc/npcStore';
import { listMonsterDefinitions, MONSTER_ASSET_PREFIX } from '../monsterEditor/monsterStore';
import { MONSTER_STATES } from '../monsterEditor/monsterTypes';

const INTERNAL_TAG = 'character-animation-internal';

function addValues(target: Set<string>, values: Record<string, string | undefined>) {
  for (const value of Object.values(values)) {
    if (value) target.add(value);
  }
}

function linkedAnimationIds() {
  const ids = new Set<string>();

  for (const npc of listNpcDefinitions()) {
    addValues(ids, npc.appearance.idle);
    addValues(ids, npc.appearance.walk);
  }

  for (const monster of listMonsterDefinitions()) {
    for (const state of MONSTER_STATES) addValues(ids, monster.appearance[state.id]);
  }

  return ids;
}

function isCompositeDefinition(entry: MapPaletteEntry) {
  return entry.id.startsWith(NPC_ASSET_PREFIX) || entry.id.startsWith(MONSTER_ASSET_PREFIX);
}

function shouldIsolate(entry: MapPaletteEntry, linked: Set<string>) {
  if (!linked.has(entry.id) || isCompositeDefinition(entry)) return false;
  if (entry.tags?.includes(INTERNAL_TAG)) return true;
  return entry.source === 'custom' && Boolean(entry.sprite?.animation?.frames.length);
}

function isolateEntry(entry: MapPaletteEntry) {
  // A animação continua no catálogo para o preview/runtime encontrá-la pelo ID,
  // mas deixa de ser um objeto independente que pode ser colocado no mapa.
  entry.objectKind = undefined;
  entry.tags = [...new Set([...(entry.tags ?? []), INTERNAL_TAG])];
}

export function installCharacterAnimationAssetIsolation() {
  const root = document.querySelector<HTMLElement>('.mep');
  const grid = root?.querySelector<HTMLElement>('#mep-asset-grid');
  if (!root || !grid || root.dataset.characterAnimationIsolation === '1') return;
  root.dataset.characterAnimationIsolation = '1';

  let frame = 0;
  const apply = () => {
    frame = 0;
    const linked = linkedAnimationIds();
    const hidden = new Set<string>();

    for (const entry of MAP_PALETTE_ENTRIES) {
      if (!shouldIsolate(entry, linked)) continue;
      isolateEntry(entry);
      hidden.add(entry.id);
    }

    // Remove cards já renderizados antes desta integração iniciar. O asset não é
    // apagado: só deixa de aparecer como item independente na biblioteca do mapa.
    grid.querySelectorAll<HTMLElement>('[data-card]').forEach((card) => {
      const id = card.dataset.card;
      if (id && hidden.has(id)) card.remove();
    });
  };

  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(apply);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(grid, { childList: true });

  window.addEventListener('ascension-npc-definitions-change', schedule);
  window.addEventListener('ascension-monster-definitions-change', schedule);
  window.addEventListener('ascension-editor-studio-open', schedule);

  apply();
}