import type { CharacterProgress } from '../character/characterCreator';
import { activeEventRecords } from '../events/eventRuntime';
import { addItem, getItem, itemQuantity, removeItem, type ItemDefinition } from '../items/itemCatalog';
import { getItemStudioRecordByKey } from '../items/itemStudioStore';
import { getQuestState } from '../quests/questEngine';
import { getShopStudioRecordByKey } from './shopStudioStore';
import type { ShopStudioItem, ShopStudioRecord } from './shopStudioTypes';

const STOCK_KEY = 'ascension.shop-runtime-stock.v1';
type StockState = Record<string, { remaining: number; resetAt?: number; period?: string; active?: boolean }>;
const readStock = (): StockState => { try { return JSON.parse(localStorage.getItem(STOCK_KEY) ?? '{}') as StockState; } catch { return {}; } };
const writeStock = (value: StockState) => localStorage.setItem(STOCK_KEY, JSON.stringify(value));
const stockKey = (shop: ShopStudioRecord, item: ShopStudioItem) => `${shop.key}:${item.itemId}`;
const dayKey = (now = new Date()) => `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
const weekKey = (now = new Date()) => { const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7)); return dayKey(monday); };

export function shopAvailableForProgress(shop: ShopStudioRecord, progress: CharacterProgress) {
  const req = shop.requirements;
  if (shop.status !== 'published') return false;
  if (req.minLevel && progress.level < req.minLevel) return false;
  if (req.maxLevel && progress.level > req.maxLevel) return false;
  if (req.classIds?.length && !req.classIds.includes(progress.classId)) return false;
  if (req.completedQuests?.some((id) => getQuestState(progress, id)?.status !== 'completed')) return false;
  if (req.activeQuest && getQuestState(progress, req.activeQuest)?.status !== 'active') return false;
  if (req.eventKey && !activeEventRecords().some((event) => event.key === req.eventKey)) return false;
  if (req.requiredItems?.some((entry) => itemQuantity(progress, entry.itemId) < entry.quantity)) return false;
  return true;
}

export function getRuntimeShop(shopId: string, progress: CharacterProgress) {
  const shop = getShopStudioRecordByKey(shopId);
  return shop && shopAvailableForProgress(shop, progress) ? shop : null;
}

function studioCategory(item: ItemDefinition) {
  return getItemStudioRecordByKey(item.id)?.category ?? (item.category === 'equipment' ? 'armor' : item.category);
}
function matchingRule(shop: ShopStudioRecord, item: ItemDefinition) {
  const record = getItemStudioRecordByKey(item.id), category = studioCategory(item);
  return shop.priceRules.find((rule) => (rule.category && rule.category === category) || (rule.tag && record?.tags.includes(rule.tag)));
}
export function shopBuyPrice(shop: ShopStudioRecord, entry: ShopStudioItem) {
  const item = getItem(entry.itemId), rule = item ? matchingRule(shop, item) : undefined;
  return Math.max(0, Math.round(entry.buyPrice * shop.defaultBuyMultiplier * (rule?.buyMultiplier ?? 1)));
}
export function shopSellPrice(shop: ShopStudioRecord, item: ItemDefinition) {
  const override = shop.items.find((entry) => entry.itemId === item.id)?.sellPrice;
  const base = override ?? item.value, rule = matchingRule(shop, item);
  return Math.max(0, Math.ceil(base * shop.defaultSellMultiplier * (rule?.sellMultiplier ?? 1)));
}
export function shopAcceptsItem(shop: ShopStudioRecord, item: ItemDefinition) {
  return shop.allowSell && shop.acceptedCategories.includes(studioCategory(item) as never);
}
export function shopCurrencyAmount(progress: CharacterProgress, shop: ShopStudioRecord, coins: number) {
  return shop.currency.type === 'coins' ? Math.max(0, coins) : itemQuantity(progress, shop.currency.itemId ?? '');
}
export function spendShopCurrency(progress: CharacterProgress, shop: ShopStudioRecord, coins: number, amount: number) {
  const cost = Math.max(0, Math.floor(amount));
  if (shop.currency.type === 'coins') return coins >= cost ? { ok: true, coins: coins - cost } : { ok: false, coins };
  const itemId = shop.currency.itemId ?? '';
  if (!itemId || itemQuantity(progress, itemId) < cost) return { ok: false, coins };
  return removeItem(progress, itemId, cost) === cost ? { ok: true, coins } : { ok: false, coins };
}
export function grantShopCurrency(progress: CharacterProgress, shop: ShopStudioRecord, coins: number, amount: number) {
  const value = Math.max(0, Math.floor(amount));
  if (shop.currency.type === 'coins') return { ok: true, coins: coins + value };
  const itemId = shop.currency.itemId ?? '';
  if (!itemId) return { ok: false, coins };
  return { ok: addItem(progress, itemId, value).remaining === 0, coins };
}

export function shopStockRemaining(shop: ShopStudioRecord, entry: ShopStudioItem, now = Date.now()) {
  if (entry.stock.mode === 'infinite') return Infinity;
  const state = readStock(), key = stockKey(shop, entry), initial = Math.max(1, entry.stock.quantity || 1);
  let current = state[key] ?? { remaining: initial };
  const date = new Date(now);
  if (entry.stock.restock === 'minutes') {
    const interval = Math.max(1, entry.stock.intervalMinutes ?? 60) * 60_000;
    if (!current.resetAt || now >= current.resetAt) current = { remaining: initial, resetAt: now + interval };
  } else if (entry.stock.restock === 'daily') {
    const period = dayKey(date); if (current.period !== period) current = { remaining: initial, period };
  } else if (entry.stock.restock === 'weekly') {
    const period = weekKey(date); if (current.period !== period) current = { remaining: initial, period };
  } else if (entry.stock.restock === 'event') {
    const active = shop.requirements.eventKey ? activeEventRecords(now).some((event) => event.key === shop.requirements.eventKey) : true;
    if (active && current.active === false) current = { remaining: initial, active: true }; else current.active = active;
  }
  state[key] = current; writeStock(state); return Math.max(0, current.remaining);
}
export function consumeShopStock(shop: ShopStudioRecord, entry: ShopStudioItem, amount: number) {
  if (entry.stock.mode === 'infinite') return true;
  const remaining = shopStockRemaining(shop, entry), count = Math.max(1, Math.floor(amount));
  if (remaining < count) return false;
  const state = readStock(), key = stockKey(shop, entry); state[key] = { ...(state[key] ?? {}), remaining: remaining - count }; writeStock(state); return true;
}
