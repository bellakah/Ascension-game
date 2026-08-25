import { getItemStudioRecordByKey } from '../items/itemStudioStore';
import type { ShopStudioItem, ShopStudioRecord } from './shopStudioTypes';

const STORAGE_KEY = 'ascension.shop-studio.v1';
const CHANGE_EVENT = 'ascension-shop-definitions-change';
const clone = <T>(value: T): T => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;

type ShopStudioFile = { version: 1; shops: ShopStudioRecord[] };

const LEGACY_SHOPS: Array<Pick<ShopStudioRecord, 'key' | 'name' | 'role' | 'icon' | 'greeting' | 'specialty' | 'acceptedCategories'> & { items: Array<{ itemId: string; price: number }> }> = [
  {
    key: 'rowan', name: 'Rowan', role: 'Ferreiro da Clareira', icon: '⚒️',
    greeting: 'Aço bom mantém aventureiro vivo. Veja o que preparei na forja.',
    specialty: 'Compra armas, equipamentos e acessórios.',
    acceptedCategories: ['weapon', 'armor', 'accessory'],
    items: [
      { itemId: 'iron_sword', price: 120 }, { itemId: 'hunter_armor', price: 145 }, { itemId: 'forest_boots', price: 95 },
      { itemId: 'ranger_legs', price: 110 }, { itemId: 'wolf_hood', price: 245 }, { itemId: 'fang_charm', price: 280 },
    ],
  },
  {
    key: 'mira', name: 'Mira', role: 'Alquimista', icon: '⚗️',
    greeting: 'Minhas misturas são testadas. Na maior parte do tempo.',
    specialty: 'Poções de vida e compra de ingredientes alquímicos.',
    acceptedCategories: ['consumable', 'material'],
    items: [
      { itemId: 'small_health_potion', price: 20 }, { itemId: 'medium_health_potion', price: 45 }, { itemId: 'large_health_potion', price: 90 },
    ],
  },
  {
    key: 'theo', name: 'Theo', role: 'Comerciante', icon: '🪙',
    greeting: 'Tudo tem valor para a pessoa certa. Principalmente materiais da floresta.',
    specialty: 'Compra qualquer item e paga 25% a mais por materiais.',
    acceptedCategories: ['consumable', 'material', 'weapon', 'armor', 'accessory'],
    items: [
      { itemId: 'adventurer_bag', price: 180 }, { itemId: 'reinforced_bag', price: 360 }, { itemId: 'small_health_potion', price: 24 },
      { itemId: 'basic_sword', price: 30 }, { itemId: 'basic_boots', price: 25 },
    ],
  },
];

function normalizeItem(item: ShopStudioItem, index: number): ShopStudioItem {
  const resolved = getItemStudioRecordByKey(String(item.itemId ?? ''));
  return {
    itemId: String(item.itemId ?? ''),
    ...(resolved ? { numericId: resolved.numericId } : Number.isFinite(item.numericId) ? { numericId: Math.max(1, Math.floor(Number(item.numericId))) } : {}),
    buyPrice: Math.max(0, Math.floor(Number(item.buyPrice) || 0)),
    ...(Number.isFinite(item.sellPrice) ? { sellPrice: Math.max(0, Math.floor(Number(item.sellPrice))) } : {}),
    useItemValueForSell: item.useItemValueForSell !== false,
    stock: {
      mode: item.stock?.mode === 'limited' ? 'limited' : 'infinite',
      quantity: Math.max(0, Math.floor(Number(item.stock?.quantity) || 0)),
      restock: item.stock?.restock ?? 'never',
      ...(Number(item.stock?.intervalMinutes) > 0 ? { intervalMinutes: Math.max(1, Math.floor(Number(item.stock.intervalMinutes))) } : {}),
    },
    ...(Number(item.perPlayerLimit) > 0 ? { perPlayerLimit: Math.max(1, Math.floor(Number(item.perPlayerLimit))) } : {}),
    sortOrder: Number.isFinite(item.sortOrder) ? Number(item.sortOrder) : index * 10,
  };
}

function normalizeRecord(record: ShopStudioRecord): ShopStudioRecord {
  const now = Date.now();
  return {
    version: 1,
    numericId: Math.max(1, Math.floor(Number(record.numericId) || 1)),
    key: String(record.key || `shop_${record.numericId || 1}`).trim(),
    source: record.source === 'legacy' ? 'legacy' : 'custom',
    status: record.status === 'draft' || record.status === 'disabled' ? record.status : 'published',
    name: String(record.name || 'Loja sem nome'), role: String(record.role || 'Comerciante'), description: String(record.description || ''),
    icon: String(record.icon || '🪙'), greeting: String(record.greeting || ''), specialty: String(record.specialty || ''),
    tags: Array.isArray(record.tags) ? record.tags.map(String).filter(Boolean) : [], priority: Number(record.priority) || 0,
    currency: record.currency?.type === 'item' ? { type: 'item', itemId: String(record.currency.itemId || ''), ...(record.currency.numericId ? { numericId: record.currency.numericId } : {}) } : { type: 'coins' },
    allowBuy: record.allowBuy !== false, allowSell: record.allowSell !== false,
    defaultBuyMultiplier: Math.max(0, Number(record.defaultBuyMultiplier) || 1), defaultSellMultiplier: Math.max(0, Number(record.defaultSellMultiplier) || .5),
    acceptedCategories: Array.isArray(record.acceptedCategories) ? [...record.acceptedCategories] : [],
    items: Array.isArray(record.items) ? record.items.map(normalizeItem) : [],
    priceRules: Array.isArray(record.priceRules) ? record.priceRules.map((rule, index) => ({
      id: String(rule.id || `rule_${index + 1}`), ...(rule.category ? { category: rule.category } : {}), ...(rule.tag ? { tag: String(rule.tag) } : {}),
      buyMultiplier: Math.max(0, Number(rule.buyMultiplier) || 1), sellMultiplier: Math.max(0, Number(rule.sellMultiplier) || 1),
    })) : [],
    requirements: { ...(record.requirements ?? {}) },
    createdAt: Number(record.createdAt) || now, updatedAt: Number(record.updatedAt) || now,
  };
}

function readFile(): ShopStudioFile {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as Partial<ShopStudioFile>;
    if (parsed.version !== 1 || !Array.isArray(parsed.shops)) return { version: 1, shops: [] };
    return { version: 1, shops: parsed.shops.filter(Boolean).map((shop) => normalizeRecord(shop as ShopStudioRecord)) };
  } catch { return { version: 1, shops: [] }; }
}

function writeFile(file: ShopStudioFile, notify = true) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, shops: file.shops.map(normalizeRecord) }));
  if (notify) window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

function legacyRecord(seed: typeof LEGACY_SHOPS[number], numericId: number): ShopStudioRecord {
  const now = Date.now();
  return normalizeRecord({
    version: 1, numericId, key: seed.key, source: 'legacy', status: 'published', name: seed.name, role: seed.role, description: '', icon: seed.icon,
    greeting: seed.greeting, specialty: seed.specialty, tags: ['legacy'], priority: numericId * 10, currency: { type: 'coins' }, allowBuy: true, allowSell: true,
    defaultBuyMultiplier: 1, defaultSellMultiplier: .5, acceptedCategories: seed.acceptedCategories,
    items: seed.items.map((item, index) => ({ itemId: item.itemId, numericId: getItemStudioRecordByKey(item.itemId)?.numericId, buyPrice: item.price, useItemValueForSell: true, stock: { mode: 'infinite', quantity: 0, restock: 'never' }, sortOrder: index * 10 })),
    priceRules: seed.key === 'theo' ? [{ id: 'materials-bonus', category: 'material', buyMultiplier: 1, sellMultiplier: 1.25 }] : [], requirements: {}, createdAt: now, updatedAt: now,
  });
}

export function ensureShopStudioMigration() {
  const file = readFile();
  const keys = new Set(file.shops.map((shop) => shop.key));
  let next = Math.max(0, ...file.shops.map((shop) => shop.numericId)) + 1;
  let changed = false;
  for (const seed of LEGACY_SHOPS) {
    if (keys.has(seed.key)) continue;
    file.shops.push(legacyRecord(seed, next++)); keys.add(seed.key); changed = true;
  }
  if (changed) writeFile(file, false);
  return file.shops.map(clone).sort((a, b) => a.numericId - b.numericId);
}

export function listShopStudioRecords() { return ensureShopStudioMigration(); }
export function listPublishedShopStudioRecords() { return ensureShopStudioMigration().filter((shop) => shop.status === 'published'); }
export function getShopStudioRecordByKey(key: string) { const found = ensureShopStudioMigration().find((shop) => shop.key === key); return found ? clone(found) : null; }
export function getShopStudioRecordByNumericId(id: number) { const found = ensureShopStudioMigration().find((shop) => shop.numericId === Math.floor(Number(id))); return found ? clone(found) : null; }
export function shopStudioDisplay(shop: Pick<ShopStudioRecord, 'numericId' | 'name'>) { return `#${shop.numericId} · ${shop.name}`; }
export function nextShopNumericId() { return Math.max(0, ...ensureShopStudioMigration().map((shop) => shop.numericId)) + 1; }

export function createShopStudioRecord(): ShopStudioRecord {
  const numericId = nextShopNumericId(), now = Date.now();
  return normalizeRecord({ version: 1, numericId, key: `shop_${numericId}`, source: 'custom', status: 'draft', name: 'Nova Loja', role: 'Comerciante', description: '', icon: '🪙', greeting: '', specialty: '', tags: [], priority: 0, currency: { type: 'coins' }, allowBuy: true, allowSell: true, defaultBuyMultiplier: 1, defaultSellMultiplier: .5, acceptedCategories: ['consumable', 'material', 'weapon', 'armor', 'accessory'], items: [], priceRules: [], requirements: {}, createdAt: now, updatedAt: now });
}

export function saveShopStudioRecord(input: ShopStudioRecord) {
  const file = readFile(), record = normalizeRecord({ ...input, updatedAt: Date.now() });
  const idCollision = file.shops.find((shop) => shop.numericId === record.numericId && shop.key !== record.key);
  if (idCollision) throw new Error(`O Shop ID ${record.numericId} já pertence a “${idCollision.name}”.`);
  const keyCollision = file.shops.find((shop) => shop.key === record.key && shop.numericId !== record.numericId);
  if (keyCollision) throw new Error(`A chave interna “${record.key}” já está em uso.`);
  const index = file.shops.findIndex((shop) => shop.key === record.key);
  if (index >= 0) file.shops[index] = record; else file.shops.push(record);
  writeFile(file); return clone(record);
}

export function duplicateShopStudioRecord(source: ShopStudioRecord) {
  const copy = clone(source), now = Date.now(); copy.numericId = nextShopNumericId(); copy.key = `shop_${copy.numericId}`; copy.source = 'custom'; copy.status = 'draft'; copy.name = `${source.name} - Cópia`; copy.createdAt = now; copy.updatedAt = now; return saveShopStudioRecord(copy);
}

export function deleteShopStudioRecord(record: ShopStudioRecord) {
  if (record.source === 'legacy') throw new Error('Lojas migradas não podem ser apagadas; desative-as para preservar compatibilidade.');
  const file = readFile(); file.shops = file.shops.filter((shop) => shop.key !== record.key); writeFile(file);
}

export function onShopStudioChange(listener: () => void) {
  const handler = () => listener(); window.addEventListener(CHANGE_EVENT, handler); return () => window.removeEventListener(CHANGE_EVENT, handler);
}
