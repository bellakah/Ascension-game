import { getPreparedPublishedWorldRuntime } from '../map/publishedMapRuntime';
import { getNpcDefinition, npcIdFromAssetId } from './npcStore';

export function nearestPublishedNpcInteraction(x: number, y: number, maxDistance = 120) {
  const runtime = getPreparedPublishedWorldRuntime();
  if (!runtime) return null;
  let best: { npcId: string; name: string; shopId?: string; x: number; y: number; distance: number } | null = null;
  for (const object of runtime.document.objects) {
    const npcId = npcIdFromAssetId(object.assetId); if (!npcId) continue;
    const definition = getNpcDefinition(npcId); if (!definition?.interaction.enabled) continue;
    const live = runtime.view.children.find((child) => child.label === object.id && child.visible);
    const px = live?.x ?? (object.x + .5) * runtime.document.tileSize;
    const py = live?.y ?? (object.y + 1) * runtime.document.tileSize;
    const distance = Math.hypot(x - px, y - py);
    if (distance > maxDistance || (best && distance >= best.distance)) continue;
    const shopId = definition.role === 'trainer' ? 'class-trainer' : definition.shop.enabled ? definition.shop.shopId : undefined;
    best = { npcId, name: definition.name, shopId, x: px, y: py, distance };
  }
  return best;
}
