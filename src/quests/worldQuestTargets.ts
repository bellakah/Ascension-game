export type QuestVisitZone = {
  id: string;
  name: string;
  map: string;
  x: number;
  y: number;
  radius: number;
};

export type QuestInteractable = {
  id: string;
  name: string;
  map: string;
  x: number;
  y: number;
  radius: number;
  ambientText: string;
};

// Estes dados serão gerados pelo futuro Editor de Mapas/Quests.
export const QUEST_VISIT_ZONES: QuestVisitZone[] = [
  { id: 'village-well', name: 'Poço da Vila da Clareira', map: 'Floresta Inicial', x: 1090, y: 1450, radius: 86 },
];

export const QUEST_INTERACTABLES: QuestInteractable[] = [
  { id: 'respawn-shrine', name: 'Santuário de Renascimento', map: 'Floresta Inicial', x: 970, y: 1380, radius: 78, ambientText: 'O santuário pulsa com uma energia tranquila.' },
];

export function visitZonesAt(x: number, y: number, map = 'Floresta Inicial') {
  return QUEST_VISIT_ZONES.filter((zone) => zone.map === map && Math.hypot(x - zone.x, y - zone.y) <= zone.radius);
}

export function nearestQuestInteractable(x: number, y: number, map = 'Floresta Inicial') {
  let nearest: QuestInteractable | null = null;
  let best = Infinity;
  for (const target of QUEST_INTERACTABLES) {
    if (target.map !== map) continue;
    const distance = Math.hypot(x - target.x, y - target.y);
    if (distance <= target.radius && distance < best) { nearest = target; best = distance; }
  }
  return nearest;
}
