import type { AscensionMapDocument } from '../editor/map/mapEditorTypes';

const PUBLISHED_KEY = 'ascension.map.published.v1';
const CHANNEL_NAME = 'ascension-map-published';

export type PublishedMapRecord = {
  version: 1;
  publishedAt: number;
  document: AscensionMapDocument;
};

type PublishMessage = { type: 'published-map'; record: PublishedMapRecord };

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function loadPublishedMap(): PublishedMapRecord | null {
  try {
    const value = JSON.parse(localStorage.getItem(PUBLISHED_KEY) ?? '') as Partial<PublishedMapRecord>;
    if (value.version !== 1 || !value.document || value.document.version !== 1) return null;
    return { version: 1, publishedAt: Number(value.publishedAt) || 0, document: clone(value.document) };
  } catch {
    return null;
  }
}

export function publishMap(document: AscensionMapDocument) {
  const record: PublishedMapRecord = { version: 1, publishedAt: Date.now(), document: clone(document) };
  localStorage.setItem(PUBLISHED_KEY, JSON.stringify(record));
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ type: 'published-map', record } satisfies PublishMessage);
    channel.close();
  }
  return record;
}

export function clearPublishedMap() {
  localStorage.removeItem(PUBLISHED_KEY);
}

export function subscribePublishedMap(onPublish: (record: PublishedMapRecord) => void) {
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;
  const onMessage = (event: MessageEvent<PublishMessage>) => {
    if (event.data?.type === 'published-map' && event.data.record?.version === 1) onPublish(event.data.record);
  };
  channel?.addEventListener('message', onMessage);

  const onStorage = (event: StorageEvent) => {
    if (event.key !== PUBLISHED_KEY || !event.newValue) return;
    try {
      const record = JSON.parse(event.newValue) as PublishedMapRecord;
      if (record?.version === 1 && record.document?.version === 1) onPublish(record);
    } catch { /* ignore invalid external data */ }
  };
  window.addEventListener('storage', onStorage);

  return () => {
    channel?.removeEventListener('message', onMessage);
    channel?.close();
    window.removeEventListener('storage', onStorage);
  };
}
