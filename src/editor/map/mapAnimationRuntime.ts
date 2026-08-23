import type { MapAnimationDefinition, MapAnimationFrame } from './mapEditorTypes';

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function playback(animation: MapAnimationDefinition) {
  return animation.playback ?? (animation.loop ? 'loop' : 'once');
}

export function animationFrameDuration(animation: MapAnimationDefinition, frame: MapAnimationFrame) {
  return Math.max(16, frame.durationMs ?? 1000 / Math.max(1, animation.fps || 1));
}

function sequence(animation: MapAnimationDefinition) {
  const count = animation.frames.length;
  if (count <= 1) return [0];
  if (playback(animation) !== 'pingpong') return Array.from({ length: count }, (_, index) => index);
  return [...Array.from({ length: count }, (_, index) => index), ...Array.from({ length: count - 2 }, (_, index) => count - 2 - index)];
}

export function animationCycleDuration(animation: MapAnimationDefinition) {
  return Math.max(16, sequence(animation).reduce((total, index) => total + animationFrameDuration(animation, animation.frames[index]), 0));
}

function phaseOffset(animation: MapAnimationDefinition, seed: string) {
  if ((animation.sync ?? 'global') !== 'random' || !seed) return 0;
  return (hashString(seed) / 0xffffffff) * animationCycleDuration(animation);
}

export function animationFrameIndex(animation: MapAnimationDefinition, nowMs: number, seed = '') {
  if (animation.frames.length <= 1) return 0;
  const time = Math.max(0, nowMs + phaseOffset(animation, seed));
  const mode = playback(animation);
  if (mode === 'random') {
    const step = Math.max(16, 1000 / Math.max(1, animation.fps || 1));
    return hashString(`${seed || 'global'}:${Math.floor(time / step)}`) % animation.frames.length;
  }
  const order = sequence(animation);
  const total = animationCycleDuration(animation);
  let cursor = mode === 'once' ? Math.min(time, total - 0.001) : time % total;
  for (const index of order) {
    const duration = animationFrameDuration(animation, animation.frames[index]);
    if (cursor < duration) return index;
    cursor -= duration;
  }
  return order[order.length - 1] ?? 0;
}

export function activeAnimationFrame(animation: MapAnimationDefinition, nowMs: number, seed = '') {
  return animation.frames[animationFrameIndex(animation, nowMs, seed)] ?? null;
}
