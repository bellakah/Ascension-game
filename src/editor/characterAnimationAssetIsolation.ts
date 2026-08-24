import { MAP_PALETTE_ENTRIES } from './map/mapEditorCatalog';
import { STUDIO_INTERNAL_ASSET_TAG } from './map/mapAssetLibraryV2';
import type { MapPaletteEntry } from './map/mapEditorTypes';
import { listNpcDefinitions, NPC_ASSET_PREFIX } from '../npc/npcStore';
import { listMonsterDefinitions, MONSTER_ASSET_PREFIX } from '../monsterEditor/monsterStore';
import { MONSTER_STATES } from '../monsterEditor/monsterTypes';
import { COLLECTIBLE_ASSET_PREFIX, listCollectibleDefinitions } from '../gathering/collectibleStore';

const LEGACY_INTERNAL_TAG = 'character-animation-internal';

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

  for (const collectible of listCollectibleDefinitions()) {
    for (const state of ['idle', 'harvest', 'break', 'depleted', 'respawn'] as const) {
      const value = collectible.appearance[state];
      if (value) ids.add(value);
    }
  }

  return ids;
}

function isCompositeDefinition(entry: MapPaletteEntry) {
  return entry.id.startsWith(NPC_ASSET_PREFIX)
    || entry.id.startsWith(MONSTER_ASSET_PREFIX)
    || entry.id.startsWith(COLLECTIBLE_ASSET_PREFIX);
}

function shouldIsolate(entry: MapPaletteEntry, linked: Set<string>) {
  if (isCompositeDefinition(entry)) return false;
  if (entry.tags?.includes(STUDIO_INTERNAL_ASSET_TAG) || entry.tags?.includes(LEGACY_INTERNAL_TAG)) return true;
  if (!linked.has(entry.id)) return false;
  return entry.source === 'custom' && Boolean(entry.sprite?.animation?.frames.length);
}

function isolateEntry(entry: MapPaletteEntry) {
  // O asset continua no catálogo interno para preview/runtime encontrá-lo pelo ID,
  // mas nunca pode virar um objeto independente colocável no mapa.
  entry.objectKind = undefined;
  entry.tags = [...new Set([...(entry.tags ?? []), STUDIO_INTERNAL_ASSET_TAG])];
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

    // Remove cards renderizados pelo painel. A fonte continua disponível para o
    // NPC/monstro/coletável composto, mas não aparece como objeto independente.
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
  window.addEventListener('ascension-collectible-definitions-change', schedule);
  window.addEventListener('ascension-editor-studio-open', schedule);

  apply();
}
