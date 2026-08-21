import type { AscensionMapDocument } from './mapEditorTypes';

const SNAPSHOT_KEY = 'ascension.map-editor.playtest.v1';
const CHANNEL_NAME = 'ascension-map-playtest';

type PreviewPayload = { type: 'map-snapshot'; document: AscensionMapDocument };

export function writePlaytestSnapshot(document: AscensionMapDocument) {
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(document));
}

export function readPlaytestSnapshot(mapId?: string) {
  try {
    const value = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) ?? '') as AscensionMapDocument;
    if (value?.version !== 1) return null;
    if (mapId && value.id !== mapId) return null;
    return value;
  } catch {
    return null;
  }
}

export function createMapPreviewPublisher() {
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;
  return {
    publish(document: AscensionMapDocument) {
      writePlaytestSnapshot(document);
      const payload: PreviewPayload = { type: 'map-snapshot', document };
      channel?.postMessage(payload);
    },
    close() { channel?.close(); },
  };
}

export function subscribeMapPreview(onDocument: (document: AscensionMapDocument) => void) {
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;
  const onMessage = (event: MessageEvent<PreviewPayload>) => {
    if (event.data?.type === 'map-snapshot' && event.data.document?.version === 1) onDocument(event.data.document);
  };
  channel?.addEventListener('message', onMessage);

  const onStorage = (event: StorageEvent) => {
    if (event.key !== SNAPSHOT_KEY || !event.newValue) return;
    try {
      const document = JSON.parse(event.newValue) as AscensionMapDocument;
      if (document?.version === 1) onDocument(document);
    } catch { /* ignore malformed external data */ }
  };
  window.addEventListener('storage', onStorage);

  return () => {
    channel?.removeEventListener('message', onMessage);
    channel?.close();
    window.removeEventListener('storage', onStorage);
  };
}
