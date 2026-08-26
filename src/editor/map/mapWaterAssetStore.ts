const STORAGE_KEY = 'ascension.map-water-assets.v1';
const DB_NAME = 'ascension-map-water-assets-v1';
const DB_VERSION = 1;
const BLOB_STORE = 'blobs';
const CHANGE_EVENT = 'ascension-map-water-assets-change';

export type WaterAssetLayout = 'horizontal' | 'vertical' | 'grid';

export type WaterAssetDefinition = {
  version: 1;
  id: string;
  name: string;
  imageWidth: number;
  imageHeight: number;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  frameCount: number;
  fps: number;
  loop: boolean;
  layout: WaterAssetLayout;
  createdAt: number;
  updatedAt: number;
};

type WaterAssetFile = { version: 1; assets: WaterAssetDefinition[] };
type WaterBlobRecord = { id: string; blob: Blob };

const objectUrls = new Map<string, string>();
const imageCache = new Map<string, HTMLImageElement>();
const pendingImages = new Map<string, Promise<HTMLImageElement | null>>();

const clone = <T>(value: T): T => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
const clampInt = (value: number, min = 1) => Math.max(min, Math.floor(Number(value) || min));
const clampNumber = (value: number, min: number, max: number, fallback: number) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : fallback));
const uid = () => `water-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function normalize(input: WaterAssetDefinition): WaterAssetDefinition {
  const imageWidth = clampInt(input.imageWidth);
  const imageHeight = clampInt(input.imageHeight);
  const frameWidth = Math.min(imageWidth, clampInt(input.frameWidth));
  const frameHeight = Math.min(imageHeight, clampInt(input.frameHeight));
  const columns = Math.max(1, Math.floor(imageWidth / frameWidth));
  const rows = Math.max(1, Math.floor(imageHeight / frameHeight));
  const maximumFrames = columns * rows;
  return {
    version: 1,
    id: String(input.id || uid()),
    name: String(input.name || 'Água').trim() || 'Água',
    imageWidth,
    imageHeight,
    frameWidth,
    frameHeight,
    columns,
    rows,
    frameCount: Math.max(1, Math.min(maximumFrames, clampInt(input.frameCount))),
    fps: clampNumber(input.fps, .1, 60, 8.33),
    loop: input.loop !== false,
    layout: input.layout === 'vertical' || input.layout === 'grid' ? input.layout : 'horizontal',
    createdAt: Number(input.createdAt) || Date.now(),
    updatedAt: Number(input.updatedAt) || Date.now(),
  };
}

function readFile(): WaterAssetFile {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as Partial<WaterAssetFile>;
    return { version: 1, assets: Array.isArray(parsed.assets) ? parsed.assets.map((value) => normalize(value as WaterAssetDefinition)) : [] };
  } catch {
    return { version: 1, assets: [] };
  }
}

function writeFile(file: WaterAssetFile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, assets: file.assets.map(normalize) }));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Falha ao acessar a biblioteca de água.'));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Falha ao salvar a água.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Operação de água cancelada.'));
  });
}

async function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BLOB_STORE)) db.createObjectStore(BLOB_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Não foi possível abrir a biblioteca de água.'));
  });
}

async function putBlob(id: string, blob: Blob) {
  const db = await openDb();
  try {
    const transaction = db.transaction(BLOB_STORE, 'readwrite');
    transaction.objectStore(BLOB_STORE).put({ id, blob } satisfies WaterBlobRecord);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

async function getBlob(id: string) {
  const db = await openDb();
  try {
    const transaction = db.transaction(BLOB_STORE, 'readonly');
    const record = await requestToPromise(transaction.objectStore(BLOB_STORE).get(id)) as WaterBlobRecord | undefined;
    return record?.blob ?? null;
  } finally {
    db.close();
  }
}

async function removeBlob(id: string) {
  const db = await openDb();
  try {
    const transaction = db.transaction(BLOB_STORE, 'readwrite');
    transaction.objectStore(BLOB_STORE).delete(id);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export function detectWaterAnimation(imageWidth: number, imageHeight: number) {
  const width = Math.max(1, Math.floor(imageWidth));
  const height = Math.max(1, Math.floor(imageHeight));
  if (width > height && width % height === 0) {
    const count = width / height;
    if (count >= 2 && count <= 64) return { frameWidth: height, frameHeight: height, frameCount: count, columns: count, rows: 1, layout: 'horizontal' as const, fps: 8.33 };
  }
  if (height > width && height % width === 0) {
    const count = height / width;
    if (count >= 2 && count <= 64) return { frameWidth: width, frameHeight: width, frameCount: count, columns: 1, rows: count, layout: 'vertical' as const, fps: 8.33 };
  }
  return { frameWidth: width, frameHeight: height, frameCount: 1, columns: 1, rows: 1, layout: 'horizontal' as const, fps: 8.33 };
}

export function listWaterAssets() {
  return readFile().assets.map(clone).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function getWaterAsset(id: string | null | undefined) {
  const record = readFile().assets.find((value) => value.id === id);
  return record ? clone(record) : null;
}

export function saveWaterAsset(input: WaterAssetDefinition) {
  const file = readFile();
  const record = normalize({ ...input, updatedAt: Date.now() });
  const index = file.assets.findIndex((value) => value.id === record.id);
  if (index >= 0) file.assets[index] = record; else file.assets.push(record);
  writeFile(file);
  return clone(record);
}

export async function createWaterAssetFromFile(file: File | Blob, name: string, imageWidth: number, imageHeight: number, options?: Partial<Pick<WaterAssetDefinition, 'frameWidth' | 'frameHeight' | 'frameCount' | 'fps' | 'loop' | 'layout'>>) {
  if (!('indexedDB' in window)) throw new Error('IndexedDB indisponível neste navegador.');
  const guessed = detectWaterAnimation(imageWidth, imageHeight);
  const now = Date.now();
  const id = uid();
  const record = normalize({
    version: 1,
    id,
    name: name.replace(/\.[^.]+$/, '').trim() || 'Água',
    imageWidth,
    imageHeight,
    frameWidth: options?.frameWidth ?? guessed.frameWidth,
    frameHeight: options?.frameHeight ?? guessed.frameHeight,
    columns: guessed.columns,
    rows: guessed.rows,
    frameCount: options?.frameCount ?? guessed.frameCount,
    fps: options?.fps ?? guessed.fps,
    loop: options?.loop ?? true,
    layout: options?.layout ?? guessed.layout,
    createdAt: now,
    updatedAt: now,
  });
  await putBlob(id, file);
  return saveWaterAsset(record);
}

export async function deleteWaterAsset(id: string) {
  const file = readFile();
  if (!file.assets.some((value) => value.id === id)) return false;
  file.assets = file.assets.filter((value) => value.id !== id);
  writeFile(file);
  const url = objectUrls.get(id);
  if (url) URL.revokeObjectURL(url);
  objectUrls.delete(id);
  imageCache.delete(id);
  pendingImages.delete(id);
  await removeBlob(id);
  return true;
}

export function waterAssetFrameRect(asset: WaterAssetDefinition, index: number) {
  const safe = Math.max(0, Math.min(asset.frameCount - 1, Math.floor(index)));
  const column = asset.layout === 'vertical' ? 0 : safe % asset.columns;
  const row = asset.layout === 'vertical' ? safe : Math.floor(safe / asset.columns);
  return { x: column * asset.frameWidth, y: row * asset.frameHeight, width: asset.frameWidth, height: asset.frameHeight };
}

export async function getWaterAssetObjectUrl(id: string) {
  const existing = objectUrls.get(id);
  if (existing) return existing;
  const blob = await getBlob(id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  objectUrls.set(id, url);
  return url;
}

export function peekWaterAssetImage(id: string | null | undefined) {
  return id ? imageCache.get(id) ?? null : null;
}

export function ensureWaterAssetImage(id: string | null | undefined, onReady?: () => void) {
  if (!id) return null;
  const cached = imageCache.get(id);
  if (cached?.complete && cached.naturalWidth > 0) return cached;
  if (!pendingImages.has(id)) {
    const pending = getWaterAssetObjectUrl(id).then((url) => new Promise<HTMLImageElement | null>((resolve) => {
      if (!url) { resolve(null); return; }
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => { imageCache.set(id, image); pendingImages.delete(id); resolve(image); };
      image.onerror = () => { pendingImages.delete(id); resolve(null); };
      image.src = url;
    }));
    pendingImages.set(id, pending);
  }
  if (onReady) void pendingImages.get(id)?.then(() => onReady());
  return cached ?? null;
}

export async function loadWaterAssetImage(id: string | null | undefined) {
  if (!id) return null;
  const cached = imageCache.get(id);
  if (cached?.complete && cached.naturalWidth > 0) return cached;
  ensureWaterAssetImage(id);
  return await pendingImages.get(id) ?? imageCache.get(id) ?? null;
}

export function onWaterAssetsChange(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}
