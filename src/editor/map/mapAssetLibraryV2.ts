import { MAP_PALETTE_ENTRIES } from './mapEditorCatalog';
import type { MapAnimationDefinition, MapAssetFolder, MapFootprintDefinition, MapObject, MapPaletteEntry, MapPaletteId, MapSpriteRect } from './mapEditorTypes';

const DB_NAME = 'ascension-map-assets-v2';
const DB_VERSION = 1;
const SOURCE_STORE = 'sources';
const ASSET_STORE = 'assets';
const V2_PREFIX = 'v2-';

export const STUDIO_INTERNAL_ASSET_TAG = 'studio-internal';

type SourceRecord = {
  id: string;
  name: string;
  blob: Blob;
  width: number;
  height: number;
  createdAt: number;
};

type AssetRecord = {
  id: string;
  sourceId: string;
  label: string;
  palette: MapPaletteId;
  folder: MapAssetFolder;
  objectKind?: MapObject['kind'];
  color: string;
  sourceRect?: MapSpriteRect;
  animation?: MapAnimationDefinition;
  widthTiles: number;
  heightTiles: number;
  anchorX: number;
  anchorY: number;
  footprint?: MapFootprintDefinition;
  tags: string[];
  internal?: boolean;
  createdAt: number;
};

export type AssetLibraryCreateInput = Omit<AssetRecord, 'id' | 'sourceId' | 'createdAt'>;
export type AssetSourceInfo = Pick<SourceRecord, 'id' | 'name' | 'width' | 'height' | 'createdAt'>;

const sourceUrls = new Map<string, string>();

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Falha no banco de assets.'));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Falha ao salvar asset.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Operação de asset cancelada.'));
  });
}

async function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SOURCE_STORE)) db.createObjectStore(SOURCE_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(ASSET_STORE)) {
        const store = db.createObjectStore(ASSET_STORE, { keyPath: 'id' });
        store.createIndex('sourceId', 'sourceId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Não foi possível abrir a biblioteca de assets.'));
  });
}

function uid(prefix: string) {
  return `${V2_PREFIX}${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function getAll<T>(storeName: string) {
  const db = await openDb();
  try {
    const transaction = db.transaction(storeName, 'readonly');
    return await requestToPromise(transaction.objectStore(storeName).getAll()) as T[];
  } finally {
    db.close();
  }
}

async function getSourceRecord(sourceId: string) {
  const db = await openDb();
  try {
    const transaction = db.transaction(SOURCE_STORE, 'readonly');
    return await requestToPromise(transaction.objectStore(SOURCE_STORE).get(sourceId)) as SourceRecord | undefined;
  } finally {
    db.close();
  }
}

function sourceUrl(source: SourceRecord) {
  const existing = sourceUrls.get(source.id);
  if (existing) return existing;
  const url = URL.createObjectURL(source.blob);
  sourceUrls.set(source.id, url);
  return url;
}

function toEntry(asset: AssetRecord, source: SourceRecord): MapPaletteEntry {
  const internal = asset.internal === true;
  return {
    id: asset.id,
    palette: asset.palette,
    folder: asset.folder,
    label: asset.label,
    icon: asset.animation?.frames.length ? '▶' : '◇',
    color: asset.color || '#61788b',
    description: asset.animation?.frames.length ? `Asset animado • ${asset.animation.frames.length} frames` : 'Asset recortado na biblioteca visual.',
    defaultLayer: asset.palette === 'terrain' ? 'ground' : 'objects',
    objectKind: asset.palette === 'terrain' || internal ? undefined : (asset.objectKind ?? 'doodad'),
    source: 'custom',
    tags: [...new Set([...asset.tags, 'biblioteca-v2', ...(internal ? [STUDIO_INTERNAL_ASSET_TAG] : [])])],
    sprite: {
      src: sourceUrl(source),
      nativeWidth: source.width,
      nativeHeight: source.height,
      sourceRect: asset.sourceRect,
      animation: asset.animation,
      widthTiles: asset.widthTiles,
      heightTiles: asset.heightTiles,
      anchorX: asset.anchorX,
      anchorY: asset.anchorY,
      pixelated: true,
    },
    footprint: asset.footprint,
  };
}

export async function hydrateAssetLibraryV2() {
  if (!('indexedDB' in window)) return [] as MapPaletteEntry[];
  const [sources, assets] = await Promise.all([getAll<SourceRecord>(SOURCE_STORE), getAll<AssetRecord>(ASSET_STORE)]);
  const sourceMap = new Map(sources.map((value) => [value.id, value]));
  const entries = assets.flatMap((asset) => {
    const source = sourceMap.get(asset.sourceId);
    return source ? [toEntry(asset, source)] : [];
  });
  for (let index = MAP_PALETTE_ENTRIES.length - 1; index >= 0; index--) {
    if (MAP_PALETTE_ENTRIES[index].id.startsWith(V2_PREFIX)) MAP_PALETTE_ENTRIES.splice(index, 1);
  }
  MAP_PALETTE_ENTRIES.push(...entries);
  return entries;
}

export async function addAssetSource(file: Blob, name: string, width: number, height: number) {
  const record: SourceRecord = { id: uid('sheet'), name, blob: file, width, height, createdAt: Date.now() };
  const db = await openDb();
  try {
    const transaction = db.transaction(SOURCE_STORE, 'readwrite');
    transaction.objectStore(SOURCE_STORE).put(record);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
  return record.id;
}

export async function getAssetSourceUrl(sourceId: string) {
  const source = await getSourceRecord(sourceId);
  return source ? sourceUrl(source) : null;
}

export async function getAssetSourceInfo(sourceId: string): Promise<AssetSourceInfo | null> {
  const source = await getSourceRecord(sourceId);
  return source ? { id: source.id, name: source.name, width: source.width, height: source.height, createdAt: source.createdAt } : null;
}

/** Remove o PNG original somente quando nenhum asset recortado ainda depende dele. */
export async function deleteAssetSourceIfUnused(sourceId: string) {
  const db = await openDb();
  try {
    const countTx = db.transaction(ASSET_STORE, 'readonly');
    const count = await requestToPromise(countTx.objectStore(ASSET_STORE).index('sourceId').count(sourceId));
    if (count > 0) return false;
    const sourceTx = db.transaction(SOURCE_STORE, 'readwrite');
    sourceTx.objectStore(SOURCE_STORE).delete(sourceId);
    await transactionDone(sourceTx);
    const url = sourceUrls.get(sourceId);
    if (url) URL.revokeObjectURL(url);
    sourceUrls.delete(sourceId);
    return true;
  } finally {
    db.close();
  }
}

export async function addAssetsToLibrary(sourceId: string, values: AssetLibraryCreateInput[]) {
  const records: AssetRecord[] = values.map((value) => ({ ...value, id: uid('asset'), sourceId, createdAt: Date.now() }));
  const db = await openDb();
  try {
    const transaction = db.transaction(ASSET_STORE, 'readwrite');
    const store = transaction.objectStore(ASSET_STORE);
    for (const record of records) store.put(record);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
  await hydrateAssetLibraryV2();
  return records.map((record) => MAP_PALETTE_ENTRIES.find((entry) => entry.id === record.id)).filter((entry): entry is MapPaletteEntry => Boolean(entry));
}

export async function markLibraryAssetInternal(assetId: string, tags: string[] = []) {
  const db = await openDb();
  try {
    const transaction = db.transaction(ASSET_STORE, 'readwrite');
    const store = transaction.objectStore(ASSET_STORE);
    const record = await requestToPromise(store.get(assetId)) as AssetRecord | undefined;
    if (!record) return null;
    record.internal = true;
    record.tags = [...new Set([...(record.tags ?? []), ...tags, STUDIO_INTERNAL_ASSET_TAG])];
    store.put(record);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
  await hydrateAssetLibraryV2();
  return MAP_PALETTE_ENTRIES.find((entry) => entry.id === assetId) ?? null;
}

export async function deleteLibraryAsset(assetId: string) {
  const db = await openDb();
  let sourceId: string | null = null;
  try {
    const lookup = db.transaction(ASSET_STORE, 'readonly');
    const record = await requestToPromise(lookup.objectStore(ASSET_STORE).get(assetId)) as AssetRecord | undefined;
    sourceId = record?.sourceId ?? null;

    const transaction = db.transaction(ASSET_STORE, 'readwrite');
    transaction.objectStore(ASSET_STORE).delete(assetId);
    await transactionDone(transaction);

    if (sourceId) {
      const countTx = db.transaction(ASSET_STORE, 'readonly');
      const count = await requestToPromise(countTx.objectStore(ASSET_STORE).index('sourceId').count(sourceId));
      if (count === 0) {
        const sourceTx = db.transaction(SOURCE_STORE, 'readwrite');
        sourceTx.objectStore(SOURCE_STORE).delete(sourceId);
        await transactionDone(sourceTx);
        const url = sourceUrls.get(sourceId);
        if (url) URL.revokeObjectURL(url);
        sourceUrls.delete(sourceId);
      }
    }
  } finally {
    db.close();
  }
  const index = MAP_PALETTE_ENTRIES.findIndex((entry) => entry.id === assetId);
  if (index >= 0) MAP_PALETTE_ENTRIES.splice(index, 1);
}

export async function listAssetSources() {
  return getAll<SourceRecord>(SOURCE_STORE);
}

export function isV2LibraryAsset(entry: MapPaletteEntry) {
  return entry.id.startsWith(V2_PREFIX);
}
