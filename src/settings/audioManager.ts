import { effectiveChannelVolume, type AudioChannel, type SettingsStore } from './settingsState';

type RegisteredAudio = { element: HTMLMediaElement; channel: AudioChannel; baseVolume: number };

// Mixer central: músicas, SFX, ambiente, UI e falas poderão registrar seus elementos aqui.
export function createAudioManager(store: SettingsStore) {
  const registered = new Set<RegisteredAudio>();

  const applyOne = (entry: RegisteredAudio) => {
    entry.element.volume = Math.max(0, Math.min(1, entry.baseVolume * effectiveChannelVolume(store.settings, entry.channel)));
  };
  const applyAll = () => { for (const entry of registered) applyOne(entry); };
  const unsubscribe = store.onChange(applyAll);

  return {
    register(element: HTMLMediaElement, channel: AudioChannel, baseVolume = 1) {
      const entry: RegisteredAudio = { element, channel, baseVolume: Math.max(0, Math.min(1, baseVolume)) };
      registered.add(entry); applyOne(entry);
      return () => registered.delete(entry);
    },
    volume(channel: AudioChannel) { return effectiveChannelVolume(store.settings, channel); },
    refresh: applyAll,
    destroy() { unsubscribe(); registered.clear(); },
  };
}

export type AudioManager = ReturnType<typeof createAudioManager>;
