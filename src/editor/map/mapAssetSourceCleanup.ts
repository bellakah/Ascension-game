const DB_NAME = 'ascension-map-assets-v2';
const DB_VERSION = 1;
const SOURCE_STORE = 'sources';
const ASSET_STORE = 'assets';

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Falha ao consultar a biblioteca de assets.'));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Falha ao limpar source.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Limpeza cancelada.'));
  });
}

async function openDb() {
  return await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Não foi possível abrir a biblioteca de assets.'));
  });
}

/** Remove o PNG original somente quando nenhum asset recortado ainda depende dele. */
export async function deleteAssetSourceIfUnused(sourceId: string) {
  if (!sourceId || !('indexedDB' in window)) return false;
  const db = await openDb();
  try {
    const countTx = db.transaction(ASSET_STORE, 'readonly');
    const count = await requestToPromise(countTx.objectStore(ASSET_STORE).index('sourceId').count(sourceId));
    if (count > 0) return false;
    const sourceTx = db.transaction(SOURCE_STORE, 'readwrite');
    sourceTx.objectStore(SOURCE_STORE).delete(sourceId);
    await transactionDone(sourceTx);
    return true;
  } finally {
    db.close();
  }
}
