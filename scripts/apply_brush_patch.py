from pathlib import Path
import re

app_path = Path('src/editor/map/mapEditorProApp.ts')
text = app_path.read_text(encoding='utf-8')

if "type BrushShape = 'circle' | 'square';" not in text:
    text = text.replace(
        "type SnapMode = 'grid' | 'half' | 'free';",
        "type SnapMode = 'grid' | 'half' | 'free';\ntype BrushShape = 'circle' | 'square';",
    )
    text = text.replace(
        "const SNAP_KEY = 'ascension.map-editor.snap.v1';",
        "const SNAP_KEY = 'ascension.map-editor.snap.v1';\nconst BRUSH_SHAPE_KEY = 'ascension.map-editor.brush-shape.v1';",
    )
    text = text.replace(
        "  let brushSize = 1;\n",
        "  let brushSize = 1;\n  let brushShape: BrushShape = (localStorage.getItem(BRUSH_SHAPE_KEY) as BrushShape) || 'circle';\n",
    )
    text = text.replace(")) * .92, .2, 2.5);", ")) * .80, .2, 2.5);", 1)

    old_paint = '''  const paintTerrain = (x: number, y: number, random = false) => {
    const radius = Math.floor(brushSize / 2);
    for (let oy = -radius; oy <= radius; oy++) for (let ox = -radius; ox <= radius; ox++) paintTerrainOne(x + ox, y + oy, random ? randomEntry() : entry);
  };
  const eraseTerrain = (x: number, y: number) => {
    const radius = Math.floor(brushSize / 2);
    for (let oy = -radius; oy <= radius; oy++) for (let ox = -radius; ox <= radius; ox++) {
      if (!validTile(x + ox, y + oy)) continue;
      const key = tileKey(x + ox, y + oy), value = mapDoc.tiles[key] ?? {};
      if (layer === 'detail') delete value.detail; else value.ground = 'grass';
      mapDoc.tiles[key] = value;
    }
  };'''

    new_paint = '''  const brushContains = (ox: number, oy: number) => {
    if (brushShape === 'square' || brushSize <= 1) return true;
    const radius = Math.max(.75, (brushSize - 1) / 2 + .25);
    return Math.hypot(ox, oy) <= radius;
  };
  const paintTerrain = (x: number, y: number, random = false) => {
    const radius = Math.floor(brushSize / 2);
    for (let oy = -radius; oy <= radius; oy++) for (let ox = -radius; ox <= radius; ox++) {
      if (!brushContains(ox, oy)) continue;
      paintTerrainOne(x + ox, y + oy, random ? randomEntry() : entry);
    }
  };
  const eraseTerrain = (x: number, y: number) => {
    const radius = Math.floor(brushSize / 2);
    for (let oy = -radius; oy <= radius; oy++) for (let ox = -radius; ox <= radius; ox++) {
      if (!brushContains(ox, oy) || !validTile(x + ox, y + oy)) continue;
      const key = tileKey(x + ox, y + oy), value = mapDoc.tiles[key] ?? {};
      if (layer === 'detail') delete value.detail; else value.ground = 'grass';
      mapDoc.tiles[key] = value;
    }
  };'''

    if old_paint not in text:
        raise SystemExit('terrain paint block not found')
    text = text.replace(old_paint, new_paint, 1)

    old_collision = '''  const paintCollision = (x: number, y: number, remove = false) => {
    const radius = Math.floor(brushSize / 2);
    for (let oy = -radius; oy <= radius; oy++) for (let ox = -radius; ox <= radius; ox++) {
      const tx = x + ox, ty = y + oy; if (!validTile(tx, ty)) continue;
      const key = tileKey(tx, ty);
      if (remove) mapDoc.collision = mapDoc.collision.filter((value) => value !== key);
      else if (!mapDoc.collision.includes(key)) mapDoc.collision.push(key);
    }
  };'''

    new_collision = '''  const paintCollision = (x: number, y: number, remove = false) => {
    const radius = Math.floor(brushSize / 2);
    for (let oy = -radius; oy <= radius; oy++) for (let ox = -radius; ox <= radius; ox++) {
      if (!brushContains(ox, oy)) continue;
      const tx = x + ox, ty = y + oy; if (!validTile(tx, ty)) continue;
      const key = tileKey(tx, ty);
      if (remove) mapDoc.collision = mapDoc.collision.filter((value) => value !== key);
      else if (!mapDoc.collision.includes(key)) mapDoc.collision.push(key);
    }
  };'''
    text = text.replace(old_collision, new_collision, 1)

    toolbar_marker = '''<div class="group"><label>Tamanho<select id="mep-brush-size"><option>1</option><option>3</option><option>5</option><option>7</option></select></label><label>Camada<select id="mep-terrain-layer">'''
    toolbar_replacement = '''<div class="group"><label>Formato</label><button data-brush-shape="circle" class="${brushShape === 'circle' ? 'active' : ''}">Circular</button><button data-brush-shape="square" class="${brushShape === 'square' ? 'active' : ''}">Quadrado</button></div><div class="group"><label>Tamanho<select id="mep-brush-size"><option>1</option><option>3</option><option>5</option><option>7</option></select></label><label>Camada<select id="mep-terrain-layer">'''
    if toolbar_marker not in text:
        raise SystemExit('terrain toolbar block not found')
    text = text.replace(toolbar_marker, toolbar_replacement, 1)

    binding = "    const brush = contextBar.querySelector<HTMLSelectElement>('#mep-brush-size'); if (brush) { brush.value = String(brushSize); brush.onchange = () => { brushSize = Number(brush.value) || 1; }; }\n"
    if binding not in text:
        raise SystemExit('brush binding not found')
    text = text.replace(
        binding,
        binding + "    contextBar.querySelectorAll<HTMLButtonElement>('[data-brush-shape]').forEach((button) => button.onclick = () => { brushShape = button.dataset.brushShape === 'square' ? 'square' : 'circle'; localStorage.setItem(BRUSH_SHAPE_KEY, brushShape); renderContext(); render(); });\n",
        1,
    )

    old_preview = '''        const radius = Math.floor(brushSize / 2), start = { x: hoverTile.x - radius, y: hoverTile.y - radius };
        const hx = (start.x * mapDoc.tileSize - cameraX) * zoom, hy = (start.y * mapDoc.tileSize - cameraY) * zoom;
        ctx.fillStyle = 'rgba(133,219,255,.13)'; ctx.strokeStyle = '#8ddcff'; ctx.fillRect(hx, hy, tilePx * brushSize, tilePx * brushSize); ctx.strokeRect(hx, hy, tilePx * brushSize, tilePx * brushSize);'''

    new_preview = '''        const radius = Math.floor(brushSize / 2), start = { x: hoverTile.x - radius, y: hoverTile.y - radius };
        const hx = (start.x * mapDoc.tileSize - cameraX) * zoom, hy = (start.y * mapDoc.tileSize - cameraY) * zoom;
        ctx.fillStyle = 'rgba(133,219,255,.13)'; ctx.strokeStyle = '#8ddcff'; ctx.lineWidth = 1.5;
        if (brushShape === 'circle') {
          const diameter = tilePx * brushSize, cx = hx + diameter / 2, cy = hy + diameter / 2;
          ctx.beginPath(); ctx.arc(cx, cy, diameter / 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        } else {
          ctx.fillRect(hx, hy, tilePx * brushSize, tilePx * brushSize); ctx.strokeRect(hx, hy, tilePx * brushSize, tilePx * brushSize);
        }'''

    if old_preview not in text:
        raise SystemExit('brush preview block not found')
    text = text.replace(old_preview, new_preview, 1)
    app_path.write_text(text, encoding='utf-8')

pack_path = Path('src/editor/map/pixelCrawlerPack.ts')
pack = pack_path.read_text(encoding='utf-8')
for key in ('pc_grass', 'pc_stone', 'pc_dirt', 'pc_water'):
    pack = re.sub(rf'^\s*"{key}":.*\n', '', pack, count=1, flags=re.MULTILINE)
pack_path.write_text(pack, encoding='utf-8')
