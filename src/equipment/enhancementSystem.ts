import type { CharacterProgress } from '../character/characterCreator';
import { addItem, applyEquipmentStatDelta, ensureInventoryState, getItem, itemQuantity, normalizeEnhancement, removeItem, type EquipmentSlot, type ItemEnhancementData } from '../items/itemCatalog';
import { GEM_BY_ID, REFINEMENT_CONFIG, SOCKET_RULES, type GemDefinition } from './refinementConfig';

export type RefineResult = { ok: boolean; success?: boolean; reason?: string; before?: number; after?: number; chance?: number };
export type SocketResult = { ok: boolean; reason?: string; socket?: number; gem?: GemDefinition };
export type RemoveSocketResult = { ok: boolean; reason?: string; gem?: GemDefinition };

function copy(meta: ItemEnhancementData): ItemEnhancementData { return { refine: meta.refine, gems: [...meta.gems] }; }

export function getEquipmentEnhancement(progress: CharacterProgress, slot: EquipmentSlot) {
  const state = ensureInventoryState(progress), current = normalizeEnhancement(state.equipmentEnhancements?.[slot]);
  const enhancements = state.equipmentEnhancements ?? (state.equipmentEnhancements = {});
  if (state.equipment[slot]) enhancements[slot] = current;
  return current;
}

export function socketKindForSlot(progress: CharacterProgress, slot: EquipmentSlot): 'weapon' | 'equipment' | null {
  const state = ensureInventoryState(progress), itemId = state.equipment[slot], item = itemId ? getItem(itemId) : undefined;
  if (!item) return null;
  if (item.category === 'weapon') return 'weapon';
  if (item.category === 'equipment') return 'equipment';
  return null;
}
export function socketLimit(progress: CharacterProgress, slot: EquipmentSlot) { const kind = socketKindForSlot(progress, slot); return kind ? SOCKET_RULES[kind].maxSockets : 0; }
export function socketView(progress: CharacterProgress, slot: EquipmentSlot) { const limit = socketLimit(progress, slot), meta = getEquipmentEnhancement(progress, slot); return Array.from({ length: limit }, (_, index) => meta.gems[index] ?? null); }
export function nextRefineRule(progress: CharacterProgress, slot: EquipmentSlot) { const state = ensureInventoryState(progress); if (!state.equipment[slot]) return null; const current = getEquipmentEnhancement(progress, slot).refine; return REFINEMENT_CONFIG.levels.find((rule) => rule.targetLevel === current + 1) ?? null; }

export function refineEquipment(progress: CharacterProgress, slot: EquipmentSlot, roll = Math.random()): RefineResult {
  const state = ensureInventoryState(progress), itemId = state.equipment[slot];
  if (!itemId) return { ok: false, reason: 'Não há equipamento neste slot.' };
  const rule = nextRefineRule(progress, slot), beforeMeta = copy(getEquipmentEnhancement(progress, slot));
  if (!rule || beforeMeta.refine >= REFINEMENT_CONFIG.maxLevel) return { ok: false, reason: `Este item já atingiu +${REFINEMENT_CONFIG.maxLevel}.` };
  if (itemQuantity(progress, REFINEMENT_CONFIG.stoneItemId) < rule.stoneCost) return { ok: false, reason: `São necessárias ${rule.stoneCost} Pedras de Refino.` };
  if (removeItem(progress, REFINEMENT_CONFIG.stoneItemId, rule.stoneCost) !== rule.stoneCost) return { ok: false, reason: 'Não foi possível consumir as Pedras de Refino.' };
  const afterMeta = copy(beforeMeta), success = roll < rule.successChance;
  if (success) afterMeta.refine = rule.targetLevel;
  else if (rule.failureMode === 'reset') afterMeta.refine = 0;
  else if (rule.failureMode === 'downgrade') afterMeta.refine = Math.max(0, beforeMeta.refine - Math.max(1, rule.failureDrop ?? 1));
  applyEquipmentStatDelta(progress, slot, beforeMeta, afterMeta);
  const enhancements = state.equipmentEnhancements ?? (state.equipmentEnhancements = {}); enhancements[slot] = afterMeta;
  return { ok: true, success, before: beforeMeta.refine, after: afterMeta.refine, chance: rule.successChance };
}

export function socketGem(progress: CharacterProgress, slot: EquipmentSlot, gemId: string): SocketResult {
  const state = ensureInventoryState(progress), itemId = state.equipment[slot];
  if (!itemId) return { ok: false, reason: 'Não há equipamento neste slot.' };
  const kind = socketKindForSlot(progress, slot); if (!kind) return { ok: false, reason: 'Este tipo de item não aceita pedras de soquete.' };
  const gem = GEM_BY_ID[gemId];
  if (!gem || !SOCKET_RULES[kind].allowedGemIds.includes(gemId)) return { ok: false, reason: 'Esta pedra não pode ser aplicada neste equipamento.' };
  if (itemQuantity(progress, gemId) < 1) return { ok: false, reason: `Você não possui ${gem.name}.` };
  const beforeMeta = copy(getEquipmentEnhancement(progress, slot));
  const gems = Array.from({ length: SOCKET_RULES[kind].maxSockets }, (_, index) => beforeMeta.gems[index] ?? null), empty = gems.findIndex((value) => !value);
  if (empty < 0) return { ok: false, reason: 'Todos os soquetes deste equipamento estão ocupados.' };
  if (removeItem(progress, gemId, 1) !== 1) return { ok: false, reason: 'Não foi possível consumir a pedra.' };
  const afterMeta: ItemEnhancementData = { refine: beforeMeta.refine, gems: [...gems] }; afterMeta.gems[empty] = gemId;
  applyEquipmentStatDelta(progress, slot, beforeMeta, afterMeta);
  const enhancements = state.equipmentEnhancements ?? (state.equipmentEnhancements = {}); enhancements[slot] = afterMeta;
  return { ok: true, socket: empty, gem };
}

export function removeSocketGem(progress: CharacterProgress, slot: EquipmentSlot, socketIndex: number): RemoveSocketResult {
  const state = ensureInventoryState(progress), beforeMeta = copy(getEquipmentEnhancement(progress, slot)), gemId = beforeMeta.gems[socketIndex];
  if (!gemId) return { ok: false, reason: 'Este soquete está vazio.' };
  const returned = addItem(progress, gemId, 1); if (returned.remaining > 0) return { ok: false, reason: 'Inventário cheio. Libere espaço antes de remover a pedra.' };
  const afterMeta = copy(beforeMeta); afterMeta.gems[socketIndex] = null;
  applyEquipmentStatDelta(progress, slot, beforeMeta, afterMeta);
  const enhancements = state.equipmentEnhancements ?? (state.equipmentEnhancements = {}); enhancements[slot] = afterMeta;
  return { ok: true, gem: GEM_BY_ID[gemId] };
}

export function enhancementName(progress: CharacterProgress, slot: EquipmentSlot) {
  const state = ensureInventoryState(progress), itemId = state.equipment[slot], item = itemId ? getItem(itemId) : undefined;
  if (!item) return 'Vazio';
  const refine = getEquipmentEnhancement(progress, slot).refine;
  return `${item.name}${refine > 0 ? ` +${refine}` : ''}`;
}
