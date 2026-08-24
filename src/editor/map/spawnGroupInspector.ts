import { getPaletteEntry } from './mapEditorCatalog';
import { loadOrCreateActiveMap } from './mapEditorStorage';
import { DEFAULT_SPAWN_GROUP, type SpawnGroupConfig } from './spawnGroupConfig';
import { getSpawnGroup, removeSpawnGroup, saveSpawnGroup } from './spawnGroupStore';

function selectedObject() {
  const inspector = document.querySelector<HTMLElement>('#mep-inspector-body');
  const assetId = inspector?.querySelector<HTMLCanvasElement>('.mep-inspector-hero canvas[data-asset]')?.dataset.asset;
  if (!inspector || !assetId) return null;
  const map = loadOrCreateActiveMap();
  const x = Number(inspector.querySelector<HTMLInputElement>('#mep-obj-x')?.value);
  const y = Number(inspector.querySelector<HTMLInputElement>('#mep-obj-y')?.value);
  const candidates = map.objects.filter((object) => object.assetId === assetId);
  if (!candidates.length) return null;
  const object = Number.isFinite(x) && Number.isFinite(y)
    ? candidates.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0]
    : candidates[0];
  return { inspector, map, object, entry: getPaletteEntry(assetId) };
}

export function installSpawnGroupInspector() {
  const inspector = document.querySelector<HTMLElement>('#mep-inspector-body');
  if (!inspector || document.documentElement.dataset.spawnGroupInspector === 'ready') return;
  document.documentElement.dataset.spawnGroupInspector = 'ready';

  const enhance = () => {
    const current = selectedObject();
    inspector.querySelector('.spawn-group-editor')?.remove();
    if (!current || (current.entry.objectKind !== 'monster' && current.entry.objectKind !== 'resource')) return;
    const stored = getSpawnGroup(current.map.id, current.object.id);
    const config: SpawnGroupConfig = stored ? {
      count: stored.count,
      radiusTiles: stored.radiusTiles,
      minDistanceTiles: stored.minDistanceTiles,
      respawnMs: stored.respawnMs,
      respawnJitterMs: stored.respawnJitterMs,
    } : { ...DEFAULT_SPAWN_GROUP };

    const section = document.createElement('section');
    section.className = 'spawn-group-editor';
    section.innerHTML = `<h4>Grupo de Spawn</h4><p>Uma única instância pode gerar vários ${current.entry.objectKind === 'monster' ? 'monstros' : 'recursos'} ao redor deste ponto.</p><div class="spawn-group-grid"><label>Quantidade<input data-spawn="count" type="number" min="1" max="100" value="${config.count}"></label><label>Raio (tiles)<input data-spawn="radiusTiles" type="number" min="0" max="100" step=".5" value="${config.radiusTiles}"></label><label>Distância mín.<input data-spawn="minDistanceTiles" type="number" min="0" max="50" step=".5" value="${config.minDistanceTiles}"></label><label>Respawn (ms)<input data-spawn="respawnMs" type="number" min="0" value="${config.respawnMs}"></label><label>Variação ± ms<input data-spawn="respawnJitterMs" type="number" min="0" value="${config.respawnJitterMs}"></label></div><div class="spawn-group-actions"><button data-spawn-save type="button">Salvar grupo</button><button data-spawn-reset type="button">Usar padrão</button></div>`;
    inspector.appendChild(section);

    section.querySelector<HTMLButtonElement>('[data-spawn-save]')!.onclick = () => {
      const value = (key: keyof SpawnGroupConfig) => Number(section.querySelector<HTMLInputElement>(`[data-spawn="${key}"]`)?.value) || 0;
      saveSpawnGroup(current.map.id, current.object.id, {
        count: Math.max(1, Math.floor(value('count'))),
        radiusTiles: Math.max(0, value('radiusTiles')),
        minDistanceTiles: Math.max(0, value('minDistanceTiles')),
        respawnMs: Math.max(0, Math.floor(value('respawnMs'))),
        respawnJitterMs: Math.max(0, Math.floor(value('respawnJitterMs'))),
      });
      const button = section.querySelector<HTMLButtonElement>('[data-spawn-save]')!;
      button.textContent = '✓ Salvo'; window.setTimeout(() => { button.textContent = 'Salvar grupo'; }, 900);
    };
    section.querySelector<HTMLButtonElement>('[data-spawn-reset]')!.onclick = () => { removeSpawnGroup(current.map.id, current.object.id); enhance(); };
  };

  const observer = new MutationObserver(() => requestAnimationFrame(enhance));
  observer.observe(inspector, { childList: true, subtree: true });
  const style = document.createElement('style');
  style.textContent = `.spawn-group-editor{margin:10px;padding:10px;border:1px solid #274757;border-radius:8px;background:#0b1a24}.spawn-group-editor h4{margin:0 0 5px;font-size:9px;text-transform:uppercase}.spawn-group-editor p{font-size:8px;color:#7897a8;margin:0 0 8px}.spawn-group-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}.spawn-group-grid label{font-size:8px;color:#829fac;display:flex;flex-direction:column;gap:4px}.spawn-group-grid input{width:100%}.spawn-group-actions{display:flex;gap:6px;margin-top:8px}.spawn-group-actions button{flex:1;height:31px}`;
  document.head.appendChild(style);
  enhance();
}
