from pathlib import Path

# Published map: use configured hitboxes and depth-sort map objects.
p = Path('src/map/publishedMapRuntime.ts')
s = p.read_text(encoding='utf-8')
s = s.replace(
    "import { getPaletteEntry, MAP_PALETTE_ENTRIES } from '../editor/map/mapEditorCatalog';",
    "import { getPaletteEntry, MAP_PALETTE_ENTRIES } from '../editor/map/mapEditorCatalog';\nimport { getAssetPreset, objectVisualBounds } from '../editor/map/mapAssetPresets';",
    1,
)
s = s.replace(
    "export type PublishedObstacle = { x: number; y: number; radius: number };",
    "export type PublishedObstacle =\n  | { kind?: 'circle'; x: number; y: number; radius: number }\n  | { kind: 'rect'; x: number; y: number; width: number; height: number }\n  | { kind: 'polygon'; points: Array<{ x: number; y: number }> };",
    1,
)
s = s.replace(
    "      sprite.position.set(cx, cy);\n      view.addChild(sprite);",
    "      sprite.position.set(cx, cy);\n      sprite.zIndex = -1_000_000;\n      view.addChild(sprite);",
    1,
)
old_obstacles = '''function buildObstacles(map: AscensionMapDocument) {
  const obstacles: PublishedObstacle[] = [];
  const tileSize = map.tileSize;
  const add = (x: number, y: number, radius = tileSize * .42) => obstacles.push({ x, y, radius });
  for (const key of map.collision) {
    const point = parseTileKey(key);
    add((point.x + .5) * tileSize, (point.y + .5) * tileSize);
  }
  for (const object of map.objects) {
    const collision = getPaletteEntry(object.assetId).footprint?.collision ?? [];
    for (const cell of collision) add((object.x + cell.x + .5) * tileSize, (object.y + cell.y + .5) * tileSize);
  }
  return obstacles;
}'''
new_obstacles = '''function buildObstacles(map: AscensionMapDocument) {
  const obstacles: PublishedObstacle[] = [];
  const tileSize = map.tileSize;
  const addCircle = (x: number, y: number, radius = tileSize * .42) => obstacles.push({ kind: 'circle', x, y, radius });

  for (const key of map.collision) {
    const point = parseTileKey(key);
    addCircle((point.x + .5) * tileSize, (point.y + .5) * tileSize);
  }

  for (const object of map.objects) {
    const entry = getPaletteEntry(object.assetId);
    const preset = getAssetPreset(entry);
    if (preset.hitbox) {
      const bounds = objectVisualBounds(entry, object);
      const bx = bounds.x * tileSize, by = bounds.y * tileSize;
      const bw = bounds.width * tileSize, bh = bounds.height * tileSize;
      const hitbox = preset.hitbox;
      if (hitbox.type === 'rectangle') {
        obstacles.push({
          kind: 'rect',
          x: bx + hitbox.x * bw,
          y: by + hitbox.y * bh,
          width: hitbox.width * bw,
          height: hitbox.height * bh,
        });
      } else if (hitbox.type === 'circle') {
        addCircle(
          bx + hitbox.x * bw,
          by + hitbox.y * bh,
          hitbox.radius * Math.min(bw, bh),
        );
      } else if (hitbox.points.length >= 3) {
        obstacles.push({
          kind: 'polygon',
          points: hitbox.points.map((point) => ({ x: bx + point.x * bw, y: by + point.y * bh })),
        });
      }
      continue;
    }

    const collision = entry.footprint?.collision ?? [];
    for (const cell of collision) addCircle((object.x + cell.x + .5) * tileSize, (object.y + cell.y + .5) * tileSize);
  }
  return obstacles;
}'''
if old_obstacles not in s:
    raise SystemExit('published obstacle block not found')
s = s.replace(old_obstacles, new_obstacles, 1)
s = s.replace(
    "  const view = new Container();\n  addTerrainChunks(view, map);",
    "  const view = new Container();\n  view.sortableChildren = true;\n  addTerrainChunks(view, map);",
    1,
)
s = s.replace(
    "  for (const object of visualObjects) view.addChild(createObjectView(getPaletteEntry(object.assetId), object, map.tileSize));",
    "  for (const object of visualObjects) {\n    const objectView = createObjectView(getPaletteEntry(object.assetId), object, map.tileSize);\n    objectView.zIndex = (object.y + 1) * map.tileSize;\n    view.addChild(objectView);\n  }",
    1,
)
p.write_text(s, encoding='utf-8')

# World collision: support circles, rectangles and free-form polygons.
p = Path('src/game/world.ts')
s = p.read_text(encoding='utf-8')
s = s.replace(
    "import { getPreparedPublishedWorldRuntime, getPublishedObjectPositions } from '../map/publishedMapRuntime';",
    "import { getPreparedPublishedWorldRuntime, getPublishedObjectPositions, type PublishedObstacle } from '../map/publishedMapRuntime';",
    1,
)
s = s.replace(
    "export type Obstacle = { x: number; y: number; radius: number };",
    "export type Obstacle = PublishedObstacle;",
    1,
)
old_collides = '''export function collides(obstacles: Obstacle[], x: number, y: number) {
  return obstacles.some((o) => distance(x, y, o.x, o.y) < PLAYER_RADIUS + o.radius);
}'''
new_collides = '''function pointInPolygon(x: number, y: number, points: Array<{ x: number; y: number }>) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    const crosses = ((a.y > y) !== (b.y > y)) && (x < (b.x - a.x) * (y - a.y) / ((b.y - a.y) || 1e-9) + a.x);
    if (crosses) inside = !inside;
  }
  return inside;
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const vx = bx - ax, vy = by - ay;
  const lengthSq = vx * vx + vy * vy;
  if (lengthSq <= 1e-9) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / lengthSq));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

export function collides(obstacles: Obstacle[], x: number, y: number) {
  return obstacles.some((obstacle) => {
    if (obstacle.kind === 'rect') {
      const nearestX = Math.max(obstacle.x, Math.min(x, obstacle.x + obstacle.width));
      const nearestY = Math.max(obstacle.y, Math.min(y, obstacle.y + obstacle.height));
      return Math.hypot(x - nearestX, y - nearestY) < PLAYER_RADIUS;
    }
    if (obstacle.kind === 'polygon') {
      if (pointInPolygon(x, y, obstacle.points)) return true;
      return obstacle.points.some((point, index) => {
        const next = obstacle.points[(index + 1) % obstacle.points.length];
        return distanceToSegment(x, y, point.x, point.y, next.x, next.y) < PLAYER_RADIUS;
      });
    }
    return distance(x, y, obstacle.x, obstacle.y) < PLAYER_RADIUS + obstacle.radius;
  });
}'''
if old_collides not in s:
    raise SystemExit('world collision block not found')
s = s.replace(old_collides, new_collides, 1)
p.write_text(s, encoding='utf-8')

# Game runtime: keep world entities ordered by their Y position (feet).
p = Path('src/game/runtime.ts')
s = p.read_text(encoding='utf-8')
next_marker = '''    const onKill = (monster: Monster) => {'''
depth_helper = '''    const syncWorldDepth = () => {
      if (!world.sortableChildren) return;
      for (const child of world.children) {
        if (child.zIndex <= -900_000) continue;
        child.zIndex = child.y;
      }
      world.sortChildren();
    };
    syncWorldDepth();

'''
if next_marker not in s:
    raise SystemExit('onKill marker not found')
s = s.replace(next_marker, depth_helper + next_marker, 1)
tick_marker = '''      world.x = Math.max(Math.min(0, app.screen.width - WORLD_W), Math.min(0, app.screen.width / 2 - player.x));'''
if tick_marker not in s:
    raise SystemExit('camera marker not found')
s = s.replace(tick_marker, "      syncWorldDepth();\n\n" + tick_marker, 1)
p.write_text(s, encoding='utf-8')
