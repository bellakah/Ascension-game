import type { AscensionMapDocument } from './mapEditorTypes';

export type WorldDirection = 'north' | 'south' | 'east' | 'west';

export type WorldMapNode = {
  mapId: string;
  col: number;
  row: number;
};

export type WorldMapLink = {
  fromMapId: string;
  toMapId: string;
  direction: WorldDirection;
};

export type AscensionWorldLayout = {
  version: 1;
  nodes: WorldMapNode[];
  links: WorldMapLink[];
  updatedAt: number;
};

const WORLD_KEY = 'ascension.map-editor.world-layout.v1';
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const opposite: Record<WorldDirection, WorldDirection> = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
};

export function rebuildWorldLinks(nodes: WorldMapNode[]) {
  const byCell = new Map(nodes.map((node) => [`${node.col},${node.row}`, node]));
  const links: WorldMapLink[] = [];
  const directions: Array<{ direction: WorldDirection; dx: number; dy: number }> = [
    { direction: 'north', dx: 0, dy: -1 },
    { direction: 'south', dx: 0, dy: 1 },
    { direction: 'west', dx: -1, dy: 0 },
    { direction: 'east', dx: 1, dy: 0 },
  ];

  for (const node of nodes) {
    for (const value of directions) {
      const neighbor = byCell.get(`${node.col + value.dx},${node.row + value.dy}`);
      if (!neighbor) continue;
      links.push({ fromMapId: node.mapId, toMapId: neighbor.mapId, direction: value.direction });
    }
  }
  return links;
}

export function createWorldLayout(documents: AscensionMapDocument[]): AscensionWorldLayout {
  const columns = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, documents.length))));
  const nodes = documents.map((document, index) => ({
    mapId: document.id,
    col: index % columns,
    row: Math.floor(index / columns),
  }));
  return { version: 1, nodes, links: rebuildWorldLinks(nodes), updatedAt: Date.now() };
}

export function loadWorldLayout(documents: AscensionMapDocument[] = []): AscensionWorldLayout {
  let layout: AscensionWorldLayout | null = null;
  try {
    const raw = JSON.parse(localStorage.getItem(WORLD_KEY) ?? '') as Partial<AscensionWorldLayout>;
    if (raw.version === 1 && Array.isArray(raw.nodes)) {
      const nodes = raw.nodes
        .filter((value): value is WorldMapNode => Boolean(value && typeof value.mapId === 'string' && Number.isFinite(value.col) && Number.isFinite(value.row)))
        .map((value) => ({ mapId: value.mapId, col: Math.round(value.col), row: Math.round(value.row) }));
      layout = { version: 1, nodes, links: rebuildWorldLinks(nodes), updatedAt: Number(raw.updatedAt) || Date.now() };
    }
  } catch {
    layout = null;
  }

  if (!layout) layout = createWorldLayout(documents);
  if (documents.length) {
    const validIds = new Set(documents.map((document) => document.id));
    layout.nodes = layout.nodes.filter((node) => validIds.has(node.mapId));
    const existing = new Set(layout.nodes.map((node) => node.mapId));
    const used = new Set(layout.nodes.map((node) => `${node.col},${node.row}`));
    let cursor = 0;
    for (const document of documents) {
      if (existing.has(document.id)) continue;
      while (used.has(`${cursor},0`)) cursor += 1;
      layout.nodes.push({ mapId: document.id, col: cursor, row: 0 });
      used.add(`${cursor},0`);
      cursor += 1;
    }
    layout.links = rebuildWorldLinks(layout.nodes);
  }
  return clone(layout);
}

export function saveWorldLayout(layout: AscensionWorldLayout) {
  const copy: AscensionWorldLayout = {
    version: 1,
    nodes: clone(layout.nodes).map((node) => ({ ...node, col: Math.round(node.col), row: Math.round(node.row) })),
    links: rebuildWorldLinks(layout.nodes),
    updatedAt: Date.now(),
  };
  localStorage.setItem(WORLD_KEY, JSON.stringify(copy));
  window.dispatchEvent(new CustomEvent('ascension-world-layout-change', { detail: clone(copy) }));
  return clone(copy);
}

export function moveWorldMap(mapId: string, col: number, row: number, documents: AscensionMapDocument[] = []) {
  const layout = loadWorldLayout(documents);
  const occupied = layout.nodes.find((node) => node.mapId !== mapId && node.col === col && node.row === row);
  if (occupied) return { layout, moved: false, occupiedBy: occupied.mapId };
  const node = layout.nodes.find((value) => value.mapId === mapId);
  if (node) { node.col = Math.round(col); node.row = Math.round(row); }
  else layout.nodes.push({ mapId, col: Math.round(col), row: Math.round(row) });
  return { layout: saveWorldLayout(layout), moved: true, occupiedBy: null as string | null };
}

export function worldLinkFrom(mapId: string, direction: WorldDirection, documents: AscensionMapDocument[] = []) {
  return loadWorldLayout(documents).links.find((link) => link.fromMapId === mapId && link.direction === direction) ?? null;
}

export function oppositeWorldDirection(direction: WorldDirection) {
  return opposite[direction];
}
