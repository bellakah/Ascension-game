from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'{label}: trecho não encontrado')
    return text.replace(old, new, 1)

# 1) Preset reutilizável do objeto
p = Path('src/editor/map/mapAssetPresets.ts')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "export type MapAssetPreset = {\n  scaleMode: 'set' | 'custom';",
    "export type AssetDepthMode = 'ground' | 'auto' | 'foreground';\n\nexport type MapAssetPreset = {\n  depthMode: AssetDepthMode;\n  scaleMode: 'set' | 'custom';",
    'preset type',
)
s = replace_once(
    s,
    "const defaults: MapAssetPreset = {\n  scaleMode: 'set',",
    "const defaults: MapAssetPreset = {\n  depthMode: 'auto',\n  scaleMode: 'set',",
    'preset defaults',
)
p.write_text(s, encoding='utf-8')

# 2) Configurador visual do objeto
p = Path('src/editor/map/mapAssetConfigurator.ts')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "          <div class=\"pro-config-controls\">\n            <section>\n              <h3>Colisão</h3>",
    "          <div class=\"pro-config-controls\">\n            <section>\n              <h3>Camada do personagem</h3>\n              <label>Comportamento<select id=\"pro-depth-mode\"><option value=\"ground\">No chão — personagem sempre por cima</option><option value=\"auto\">Automática — passa na frente ou atrás</option><option value=\"foreground\">Sempre na frente — objeto cobre o personagem</option></select></label>\n              <p>Escolha como este tipo de objeto deve aparecer em relação ao personagem. Isso não altera a colisão.</p>\n            </section>\n            <section>\n              <h3>Colisão</h3>",
    'config section',
)
s = replace_once(
    s,
    "    const hitType = backdrop.querySelector<HTMLSelectElement>('#pro-hit-type')!;",
    "    const depthMode = backdrop.querySelector<HTMLSelectElement>('#pro-depth-mode')!;\n    const hitType = backdrop.querySelector<HTMLSelectElement>('#pro-hit-type')!;",
    'depth selector',
)
s = replace_once(
    s,
    "    const syncInputs = () => {\n      hitType.value = preset.hitbox?.type ?? 'none';",
    "    const syncInputs = () => {\n      depthMode.value = preset.depthMode ?? 'auto';\n      hitType.value = preset.hitbox?.type ?? 'none';",
    'depth sync',
)
s = replace_once(
    s,
    "    hitType.onchange = () => { ensureHitbox(hitType.value); syncInputs(); };",
    "    depthMode.onchange = () => { preset.depthMode = depthMode.value === 'ground' ? 'ground' : depthMode.value === 'foreground' ? 'foreground' : 'auto'; };\n    hitType.onchange = () => { ensureHitbox(hitType.value); syncInputs(); };",
    'depth change',
)
p.write_text(s, encoding='utf-8')

# 3) Jogo publicado: fixa objetos de chão/primeiro plano e mantém automático por posição dos pés
p = Path('src/map/publishedMapRuntime.ts')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "  for (const object of visualObjects) {\n    const objectView = createObjectView(getPaletteEntry(object.assetId), object, map.tileSize);\n    objectView.zIndex = (object.y + 1) * map.tileSize;\n    view.addChild(objectView);\n  }",
    "  for (const object of visualObjects) {\n    const objectEntry = getPaletteEntry(object.assetId);\n    const objectView = createObjectView(objectEntry, object, map.tileSize);\n    const depthMode = getAssetPreset(objectEntry).depthMode ?? 'auto';\n    objectView.zIndex = depthMode === 'ground'\n      ? -500_000\n      : depthMode === 'foreground'\n        ? 500_000\n        : (object.y + 1) * map.tileSize;\n    view.addChild(objectView);\n  }",
    'published depth',
)
p.write_text(s, encoding='utf-8')

# 4) Ordenação dinâmica: não sobrescreve objetos fixos no chão/primeiro plano
p = Path('src/game/runtime.ts')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "        if (child.zIndex <= -900_000) continue;\n        child.zIndex = child.y;",
    "        if (child.zIndex <= -400_000 || child.zIndex >= 400_000) continue;\n        child.zIndex = child.y;",
    'runtime depth preservation',
)
p.write_text(s, encoding='utf-8')
