import './classStudio.css';
import { itemStudioDisplay, listItemStudioRecords } from '../items/itemStudioStore';
import {
  createClassStudioRecord,
  deleteClassStudioRecord,
  duplicateClassStudioRecord,
  ensureClassStudioMigration,
  listClassStudioRecords,
  saveClassStudioRecord,
} from './classStudioStore';
import type { ClassArchetype, ClassAttackAnimation, ClassBasicAttackType, ClassDamageType, ClassStudioRecord, ClassStudioStatus } from './classStudioTypes';
import { validateClass } from './classStudioValidation';

const clone = <T>(value: T): T => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
const option = (value: string, label: string, selected?: string) => `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`;
const STATUS: Record<ClassStudioStatus, string> = { draft: 'Draft', published: 'Published', disabled: 'Disabled' };
const ARCHETYPE: Record<ClassArchetype, string> = { tank: 'Tank', dps: 'DPS', healer: 'Healer', support: 'Support', hybrid: 'Hybrid', custom: 'Custom' };
const TABS = [['general','Geral'],['stats','Atributos'],['progression','Progressão'],['resource','Recursos'],['combat','Combate'],['equipment','Equipamentos'],['spawn','Spawn'],['advancement','Evolução'],['test','Teste']] as const;
type ClassTab = typeof TABS[number][0];

function itemOptions(selected = '', slot?: string) {
  const items = listItemStudioRecords().filter((item) => !slot || item.equipSlot === slot || (slot.startsWith('accessory') && item.equipSlot === 'accessory'));
  return `<option value="">Nenhum</option>${items.map((item) => option(item.key, itemStudioDisplay(item), selected)).join('')}`;
}
function anyItemOptions(selected = '') { return `<option value="">Selecione um item...</option>${listItemStudioRecords().map((item) => option(item.key, itemStudioDisplay(item), selected)).join('')}`; }
function classOptions(selected = '', exclude = '') { return `<option value="">Nenhuma</option>${listClassStudioRecords().filter((entry) => entry.key !== exclude).map((entry) => option(entry.key, `#${entry.numericId} · ${entry.name}`, selected)).join('')}`; }

export function createClassStudio(host: HTMLElement) {
  ensureClassStudioMigration();
  host.querySelector('.standalone-studio-empty')?.remove();
  const root = document.createElement('div'); root.className = 'class-studio'; host.appendChild(root);
  let records = listClassStudioRecords();
  let current = clone(records[0] ?? createClassStudioRecord());
  let tab: ClassTab = 'general';
  let query = '';
  let statusFilter = 'all';
  let simLevel = 1;
  let toastTimer = 0;

  const toast = (message: string) => {
    root.querySelector('.class-toast')?.remove();
    const node = document.createElement('div'); node.className = 'class-toast'; node.textContent = message; root.appendChild(node);
    window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => node.remove(), 2500);
  };
  const mutate = (fn: (record: ClassStudioRecord) => void) => { fn(current); current.id = current.key; current.updatedAt = Date.now(); render(); };
  const refresh = (numericId = current.numericId) => { records = listClassStudioRecords(); const found = records.find((entry) => entry.numericId === numericId); if (found) current = clone(found); };
  const shown = () => records.filter((entry) => (statusFilter === 'all' || entry.status === statusFilter) && (!query || `${entry.numericId} ${entry.key} ${entry.name} ${entry.tagline} ${entry.tags.join(' ')}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))));

  function general() {
    return `<section class="class-section"><div class="class-section-head"><strong>Identidade da classe</strong><span>Class #${current.numericId}</span></div><div class="class-section-body"><div class="class-grid">
      <div class="class-field"><label>Nome</label><input data-field="name" value="${esc(current.name)}"></div>
      <div class="class-field"><label>Nome curto</label><input data-field="shortName" value="${esc(current.shortName)}"></div>
      <div class="class-field"><label>Chave interna</label><input data-field="key" value="${esc(current.key)}" ${current.source === 'legacy' ? 'readonly' : ''}></div>
      <div class="class-field"><label>Arquétipo</label><select data-field="archetype">${(Object.keys(ARCHETYPE) as ClassArchetype[]).map((value) => option(value, ARCHETYPE[value], current.archetype)).join('')}</select></div>
      <div class="class-field"><label>Ícone</label><input data-field="icon" value="${esc(current.icon)}"></div>
      <div class="class-field"><label>Cor da classe</label><input data-field="colorHint" type="color" value="${esc(current.colorHint)}"></div>
      <div class="class-field full"><label>Tagline</label><input data-field="tagline" value="${esc(current.tagline)}"></div>
      <div class="class-field full"><label>Descrição</label><textarea data-field="description">${esc(current.description)}</textarea></div>
      <div class="class-field full"><label>Tags (vírgula)</label><input data-tags value="${esc(current.tags.join(', '))}"></div>
      <label class="class-check"><input data-bool="selectable" type="checkbox" ${current.selectable ? 'checked' : ''}> Disponível na criação de personagem</label>
      <div class="class-field"><label>Prioridade / ordem</label><input data-number="priority" type="number" value="${current.priority}"></div>
      <label class="class-check"><input data-sex="male" type="checkbox" ${current.allowedSexes.includes('male') ? 'checked' : ''}> Masculino permitido</label>
      <label class="class-check"><input data-sex="female" type="checkbox" ${current.allowedSexes.includes('female') ? 'checked' : ''}> Feminino permitido</label>
    </div></div></section>`;
  }

  const statFields: Array<[keyof ClassStudioRecord['baseStats'], string, number]> = [
    ['maxHp','HP',1],['attack','Ataque físico',0],['defense','Defesa física',0],['magicAttack','Ataque mágico',0],['magicDefense','Defesa mágica',0],['accuracy','Precisão',0],['evasion','Evasão',0],['critChance','Crítico %',0],['critDamage','Dano crítico %',0],['attackSpeed','Vel. ataque',0],['castSpeed','Vel. conjuração',0],['moveSpeed','Vel. movimento',0],['hpRegen','Regen HP/s',0],
  ];
  function stats() {
    return `<section class="class-section"><div class="class-section-head"><strong>Atributos base</strong><span>Valores no nível 1, sem equipamentos</span></div><div class="class-section-body"><div class="class-stat-grid">${statFields.map(([key,label,min]) => `<div class="class-stat"><label>${label}</label><input data-stat="${key}" type="number" step="0.1" min="${min}" value="${current.baseStats[key]}"></div>`).join('')}</div></div></section>`;
  }

  function progression() {
    const p = current.progression;
    return `<section class="class-section"><div class="class-section-head"><strong>Progressão por nível</strong><span>Curva inicial editável</span></div><div class="class-section-body"><div class="class-grid three">
      <div class="class-field"><label>Nível máximo</label><input data-prog="maxLevel" type="number" min="1" value="${p.maxLevel}"></div>
      <div class="class-field"><label>EXP base</label><input data-prog="baseExp" type="number" min="1" value="${p.baseExp}"></div>
      <div class="class-field"><label>Crescimento EXP %</label><input data-prog="expGrowthPercent" type="number" min="0" step="0.1" value="${p.expGrowthPercent}"></div>
      <div class="class-field"><label>HP por nível</label><input data-prog="maxHpPerLevel" type="number" step="0.1" value="${p.maxHpPerLevel}"></div>
      <div class="class-field"><label>ATQ por nível</label><input data-prog="attackPerLevel" type="number" step="0.1" value="${p.attackPerLevel}"></div>
      <div class="class-field"><label>DEF por nível</label><input data-prog="defensePerLevel" type="number" step="0.1" value="${p.defensePerLevel}"></div>
      <div class="class-field"><label>ATQ mágico / nível</label><input data-prog="magicAttackPerLevel" type="number" step="0.1" value="${p.magicAttackPerLevel}"></div>
      <div class="class-field"><label>DEF mágica / nível</label><input data-prog="magicDefensePerLevel" type="number" step="0.1" value="${p.magicDefensePerLevel}"></div>
      <div class="class-field"><label>Recurso por nível</label><input data-prog="resourcePerLevel" type="number" step="0.1" value="${p.resourcePerLevel}"></div>
    </div></div></section>`;
  }

  function resource() {
    const r = current.resource;
    return `<section class="class-section"><div class="class-section-head"><strong>Recurso de combate</strong><span>${esc(r.label)}</span></div><div class="class-section-body"><div class="class-grid three">
      <div class="class-field"><label>Chave</label><input data-resource="key" value="${esc(r.key)}"></div><div class="class-field"><label>Nome exibido</label><input data-resource="label" value="${esc(r.label)}"></div>
      <div class="class-field"><label>Modo</label><select data-resource="mode">${option('regenerate','Regenera',r.mode)}${option('build-up','Acumula',r.mode)}${option('hybrid','Híbrido',r.mode)}${option('none','Sem recurso',r.mode)}</select></div>
      <div class="class-field"><label>Máximo</label><input data-resource-number="max" type="number" min="1" value="${r.max}"></div><div class="class-field"><label>Valor inicial</label><input data-resource-number="startingValue" type="number" min="0" value="${r.startingValue}"></div><div class="class-field"><label>Regen / segundo</label><input data-resource-number="regenPerSecond" type="number" step="0.1" value="${r.regenPerSecond}"></div>
      <div class="class-field"><label>Ganho ao atacar</label><input data-resource-number="gainOnBasicAttack" type="number" step="0.1" value="${r.gainOnBasicAttack}"></div><div class="class-field"><label>Ganho ao receber dano</label><input data-resource-number="gainOnDamageTaken" type="number" step="0.1" value="${r.gainOnDamageTaken}"></div><div class="class-field"><label>Dreno fora combate /s</label><input data-resource-number="drainOutOfCombatPerSecond" type="number" step="0.1" value="${r.drainOutOfCombatPerSecond}"></div>
      <label class="class-check"><input data-resource-bool="regenInCombat" type="checkbox" ${r.regenInCombat ? 'checked' : ''}> Regenera em combate</label><label class="class-check"><input data-resource-bool="regenOutOfCombat" type="checkbox" ${r.regenOutOfCombat ? 'checked' : ''}> Regenera fora de combate</label><label class="class-check"><input data-resource-bool="resetOnCombatEnd" type="checkbox" ${r.resetOnCombatEnd ? 'checked' : ''}> Reset ao sair do combate</label>
    </div></div></section>`;
  }

  function combat() {
    const a = current.basicAttack;
    const types: Array<[ClassBasicAttackType,string]> = [['melee','Melee'],['projectile','Projétil'],['magic-projectile','Projétil mágico'],['area','Área']];
    const animations: Array<[ClassAttackAnimation,string]> = [['slash','Slash'],['thrust','Thrust'],['spellcast','Spellcast'],['bow','Bow']];
    const damage: Array<[ClassDamageType,string]> = [['physical','Físico'],['magical','Mágico'],['true','Verdadeiro']];
    return `<section class="class-section"><div class="class-section-head"><strong>Ataque básico</strong><span>Perfil dirigido por dados</span></div><div class="class-section-body"><div class="class-grid three">
      <div class="class-field"><label>Tipo</label><select data-attack="type">${types.map(([v,l]) => option(v,l,a.type)).join('')}</select></div><div class="class-field"><label>Animação</label><select data-attack="animation">${animations.map(([v,l]) => option(v,l,a.animation)).join('')}</select></div><div class="class-field"><label>Tipo de dano</label><select data-attack="damageType">${damage.map(([v,l]) => option(v,l,a.damageType)).join('')}</select></div>
      <div class="class-field"><label>Alcance</label><input data-attack-number="range" type="number" value="${a.range}"></div><div class="class-field"><label>Cooldown ticks</label><input data-attack-number="cooldownTicks" type="number" value="${a.cooldownTicks}"></div><div class="class-field"><label>Multiplicador dano</label><input data-attack-number="damageMultiplier" type="number" step="0.05" value="${a.damageMultiplier}"></div>
      <div class="class-field"><label>Projectile Key</label><input data-attack="projectileKey" value="${esc(a.projectileKey ?? '')}"></div><div class="class-field"><label>Vel. projétil</label><input data-attack-number="projectileSpeed" type="number" value="${a.projectileSpeed ?? 700}"></div>
    </div></div></section><section class="class-section"><div class="class-section-head"><strong>Habilidades vinculadas</strong><span>Catálogo de Skills será migrado na próxima fase</span></div><div class="class-section-body"><div class="class-field"><label>Skill IDs (uma por linha)</label><textarea data-skills>${esc(current.skillIds.join('\n'))}</textarea></div></div></section>`;
  }

  function equipment() {
    const slots: Array<[keyof ClassStudioRecord['startingEquipment'],string,string]> = [['weapon','Arma','weapon'],['armor','Peitoral','armor'],['boots','Botas','boots'],['head','Cabeça','head'],['legs','Pernas','legs'],['accessory1','Acessório I','accessory'],['accessory2','Acessório II','accessory']];
    return `<section class="class-section"><div class="class-section-head"><strong>Equipamento inicial</strong><span>Item Studio</span></div><div class="class-section-body"><div class="class-grid">${slots.map(([slot,label,filter]) => `<div class="class-field"><label>${label}</label><select data-equip="${slot}">${itemOptions(current.startingEquipment[slot] ?? '',filter)}</select></div>`).join('')}</div></div></section>
    <section class="class-section"><div class="class-section-head"><strong>Inventário inicial</strong><button class="class-btn" data-add-start-item>+ Item</button></div><div class="class-section-body">${current.startingItems.length ? current.startingItems.map((entry,index) => `<div class="class-row"><select data-start-item="${index}">${anyItemOptions(entry.itemId)}</select><input data-start-qty="${index}" type="number" min="1" value="${entry.quantity}"><button class="class-btn danger" data-remove-start-item="${index}">×</button></div>`).join('') : '<div class="class-empty">Nenhum item extra no inventário inicial.</div>'}<div class="class-field"><label>Tags de equipamento permitidas (vírgula)</label><input data-equip-tags value="${esc(current.allowedEquipmentTags.join(', '))}"></div></div></section>`;
  }

  function spawn() {
    return `<section class="class-section"><div class="class-section-head"><strong>Spawn inicial</strong><span>Preparado para Marker Studio</span></div><div class="class-section-body"><div class="class-grid">
      <div class="class-field"><label>Modo</label><select data-spawn="mode">${option('global','Spawn global',current.spawn.mode)}${option('class','Spawn exclusivo da classe',current.spawn.mode)}</select></div><div class="class-field"><label>Mapa</label><input data-spawn="map" value="${esc(current.spawn.map)}"></div>
      <div class="class-field"><label>Marker ID</label><input data-spawn="markerId" value="${esc(current.spawn.markerId ?? '')}" placeholder="ex.: class_spawn_archer"></div><div class="class-field"><label>Fallback X</label><input data-spawn-number="x" type="number" value="${current.spawn.x ?? ''}"></div><div class="class-field"><label>Fallback Y</label><input data-spawn-number="y" type="number" value="${current.spawn.y ?? ''}"></div>
    </div></div></section>`;
  }

  function advancement() {
    const req = current.advancementRequirements ?? { level: 1 };
    return `<section class="class-section"><div class="class-section-head"><strong>Evolução de classe</strong><span>Classes avançadas podem ficar fora da criação</span></div><div class="class-section-body"><div class="class-grid">
      <div class="class-field"><label>Classe pai</label><select data-parent>${classOptions(current.parentClassId ?? '', current.key)}</select></div><div class="class-field"><label>Nível necessário</label><input data-advance="level" type="number" min="1" value="${req.level}"></div>
      <div class="class-field"><label>Quest necessária (key)</label><input data-advance-text="questId" value="${esc(req.questId ?? '')}"></div><div class="class-field"><label>Item necessário</label><select data-advance-text="itemId">${anyItemOptions(req.itemId ?? '')}</select></div>
      <div class="class-field full"><label>Próximas classes (keys, vírgula)</label><input data-next-classes value="${esc(current.nextClassIds.join(', '))}"></div>
    </div></div></section>`;
  }

  function test() {
    const level = Math.max(1, Math.min(current.progression.maxLevel, simLevel));
    const step = level - 1; const p = current.progression; const b = current.baseStats;
    const hp = Math.round(b.maxHp + p.maxHpPerLevel * step), atk = Math.round(b.attack + p.attackPerLevel * step), def = Math.round(b.defense + p.defensePerLevel * step), matk = Math.round(b.magicAttack + p.magicAttackPerLevel * step), mdef = Math.round(b.magicDefense + p.magicDefensePerLevel * step), resourceMax = Math.round(current.resource.max + p.resourcePerLevel * step);
    let exp = p.baseExp; for (let i=1;i<level;i++) exp = Math.round(exp * (1 + p.expGrowthPercent / 100));
    return `<section class="class-section"><div class="class-section-head"><strong>Balance Simulator</strong><span>Prévia sem alterar save</span></div><div class="class-section-body"><div class="class-field" style="max-width:220px;margin-bottom:12px"><label>Nível simulado: ${level}</label><input data-sim-level type="range" min="1" max="${p.maxLevel}" value="${level}"></div><div class="class-sim"><div class="class-sim-card"><strong>${hp}</strong><span>HP</span></div><div class="class-sim-card"><strong>${atk}</strong><span>ATQ</span></div><div class="class-sim-card"><strong>${def}</strong><span>DEF</span></div><div class="class-sim-card"><strong>${matk}</strong><span>ATQ Mágico</span></div><div class="class-sim-card"><strong>${mdef}</strong><span>DEF Mágica</span></div><div class="class-sim-card"><strong>${resourceMax}</strong><span>${esc(current.resource.label)}</span></div><div class="class-sim-card"><strong>${exp}</strong><span>EXP próximo nível</span></div><div class="class-sim-card"><strong>${current.basicAttack.range}</strong><span>Alcance</span></div><div class="class-sim-card"><strong>${current.skillIds.length}</strong><span>Skills</span></div></div></div></section>`;
  }

  function content() { return tab === 'general' ? general() : tab === 'stats' ? stats() : tab === 'progression' ? progression() : tab === 'resource' ? resource() : tab === 'combat' ? combat() : tab === 'equipment' ? equipment() : tab === 'spawn' ? spawn() : tab === 'advancement' ? advancement() : test(); }

  function render() {
    const issues = validateClass(current), errors = issues.filter((i) => i.severity === 'error').length, warnings = issues.filter((i) => i.severity === 'warning').length;
    root.innerHTML = `<aside class="class-catalog"><div class="class-panel-head"><h2>Class Studio</h2><p>Classes, progressão, combate e evolução</p><div class="class-toolbar"><button class="class-btn primary" data-new>+ Nova</button><button class="class-btn" data-duplicate>Duplicar</button></div><input class="class-search" data-search value="${esc(query)}" placeholder="Buscar classe"><select class="class-search" data-filter>${option('all','Todos os status',statusFilter)}${option('draft','Draft',statusFilter)}${option('published','Published',statusFilter)}${option('disabled','Disabled',statusFilter)}</select></div><div class="class-list">${shown().map((entry) => `<button class="class-card${entry.numericId === current.numericId ? ' selected' : ''}" data-select="${entry.numericId}"><div class="class-card-top"><span>${esc(entry.icon)}</span><span class="class-id">#${entry.numericId}</span><strong>${esc(entry.name)}</strong><span class="class-badge ${entry.status}">${entry.status}</span></div><small>${esc(entry.key)} · ${esc(ARCHETYPE[entry.archetype])}${entry.selectable ? ' · Inicial' : ' · Avançada'}</small></button>`).join('')}</div></aside>
    <main class="class-workspace"><header class="class-work-head"><div class="class-title"><strong>${esc(current.icon)} #${current.numericId} · ${esc(current.name)}</strong><span>${esc(current.key)} · ${current.source === 'legacy' ? 'Migrada do jogo' : 'Custom'}</span></div><select class="class-status" data-status>${(Object.keys(STATUS) as ClassStudioStatus[]).map((value) => option(value,STATUS[value],current.status)).join('')}</select><button class="class-btn primary" data-save>Salvar</button></header><nav class="class-tabs">${TABS.map(([id,label]) => `<button class="class-tab${tab === id ? ' active' : ''}" data-tab="${id}">${label}</button>`).join('')}</nav><div class="class-scroll">${content()}</div></main>
    <aside class="class-inspector"><div class="class-panel-head"><h3>Class Inspector</h3><p>Validação e dependências</p></div><div class="class-inspector-body"><div class="class-score"><div><strong>${current.skillIds.length}</strong><span>Skills</span></div><div><strong>${errors}</strong><span>Erros</span></div><div><strong>${warnings}</strong><span>Avisos</span></div></div>${issues.length ? issues.map((issue) => `<div class="class-issue ${issue.severity}"><strong>${issue.severity === 'error' ? 'Erro' : issue.severity === 'warning' ? 'Atenção' : 'Info'}</strong><span>${esc(issue.message)}</span></div>`).join('') : '<div class="class-issue info"><strong>Classe válida</strong><span>Nenhum problema encontrado.</span></div>'}</div><div class="class-inspector-actions"><button class="class-btn" data-export>Exportar</button><button class="class-btn" data-import>Importar</button><button class="class-btn danger" data-delete>Excluir</button></div></aside>`;
    bind();
  }

  function bind() {
    root.querySelectorAll<HTMLButtonElement>('[data-select]').forEach((button) => button.onclick = () => { const found = records.find((entry) => entry.numericId === Number(button.dataset.select)); if (found) { current = clone(found); simLevel = 1; render(); } });
    root.querySelector<HTMLInputElement>('[data-search]')!.oninput = (event) => { query = (event.currentTarget as HTMLInputElement).value; render(); };
    root.querySelector<HTMLSelectElement>('[data-filter]')!.onchange = (event) => { statusFilter = (event.currentTarget as HTMLSelectElement).value; render(); };
    root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => button.onclick = () => { tab = button.dataset.tab as ClassTab; render(); });
    root.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('[data-field]').forEach((input) => input.onchange = () => mutate((record) => { (record as unknown as Record<string,unknown>)[input.dataset.field!] = input.value; }));
    root.querySelectorAll<HTMLInputElement>('[data-number]').forEach((input) => input.onchange = () => mutate((record) => { (record as unknown as Record<string,unknown>)[input.dataset.number!] = Number(input.value) || 0; }));
    root.querySelectorAll<HTMLInputElement>('[data-bool]').forEach((input) => input.onchange = () => mutate((record) => { (record as unknown as Record<string,unknown>)[input.dataset.bool!] = input.checked; }));
    root.querySelector<HTMLInputElement>('[data-tags]')?.addEventListener('change', (event) => mutate((record) => { record.tags = (event.currentTarget as HTMLInputElement).value.split(',').map((v) => v.trim()).filter(Boolean); }));
    root.querySelectorAll<HTMLInputElement>('[data-sex]').forEach((input) => input.onchange = () => mutate((record) => { const sex = input.dataset.sex as 'male'|'female'; const set = new Set(record.allowedSexes); input.checked ? set.add(sex) : set.delete(sex); record.allowedSexes = [...set]; }));
    root.querySelectorAll<HTMLInputElement>('[data-stat]').forEach((input) => input.onchange = () => mutate((record) => { (record.baseStats as unknown as Record<string,number>)[input.dataset.stat!] = Number(input.value) || 0; }));
    root.querySelectorAll<HTMLInputElement>('[data-prog]').forEach((input) => input.onchange = () => mutate((record) => { (record.progression as unknown as Record<string,number>)[input.dataset.prog!] = Number(input.value) || 0; }));
    root.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-resource]').forEach((input) => input.onchange = () => mutate((record) => { (record.resource as unknown as Record<string,unknown>)[input.dataset.resource!] = input.value; }));
    root.querySelectorAll<HTMLInputElement>('[data-resource-number]').forEach((input) => input.onchange = () => mutate((record) => { (record.resource as unknown as Record<string,unknown>)[input.dataset.resourceNumber!] = Number(input.value) || 0; }));
    root.querySelectorAll<HTMLInputElement>('[data-resource-bool]').forEach((input) => input.onchange = () => mutate((record) => { (record.resource as unknown as Record<string,unknown>)[input.dataset.resourceBool!] = input.checked; }));
    root.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-attack]').forEach((input) => input.onchange = () => mutate((record) => { (record.basicAttack as unknown as Record<string,unknown>)[input.dataset.attack!] = input.value || undefined; }));
    root.querySelectorAll<HTMLInputElement>('[data-attack-number]').forEach((input) => input.onchange = () => mutate((record) => { (record.basicAttack as unknown as Record<string,unknown>)[input.dataset.attackNumber!] = Number(input.value) || 0; }));
    root.querySelector<HTMLTextAreaElement>('[data-skills]')?.addEventListener('change', (event) => mutate((record) => { record.skillIds = (event.currentTarget as HTMLTextAreaElement).value.split(/\n|,/).map((v) => v.trim()).filter(Boolean); }));
    root.querySelectorAll<HTMLSelectElement>('[data-equip]').forEach((input) => input.onchange = () => mutate((record) => { (record.startingEquipment as unknown as Record<string,string|null>)[input.dataset.equip!] = input.value || null; }));
    root.querySelector<HTMLInputElement>('[data-equip-tags]')?.addEventListener('change', (event) => mutate((record) => { record.allowedEquipmentTags = (event.currentTarget as HTMLInputElement).value.split(',').map((v) => v.trim()).filter(Boolean); }));
    root.querySelector<HTMLButtonElement>('[data-add-start-item]')?.addEventListener('click', () => mutate((record) => { const first = listItemStudioRecords()[0]; if (first) record.startingItems.push({ itemId:first.key,quantity:1 }); }));
    root.querySelectorAll<HTMLSelectElement>('[data-start-item]').forEach((input) => input.onchange = () => mutate((record) => { record.startingItems[Number(input.dataset.startItem)].itemId = input.value; }));
    root.querySelectorAll<HTMLInputElement>('[data-start-qty]').forEach((input) => input.onchange = () => mutate((record) => { record.startingItems[Number(input.dataset.startQty)].quantity = Math.max(1,Number(input.value)||1); }));
    root.querySelectorAll<HTMLButtonElement>('[data-remove-start-item]').forEach((button) => button.onclick = () => mutate((record) => { record.startingItems.splice(Number(button.dataset.removeStartItem),1); }));
    root.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-spawn]').forEach((input) => input.onchange = () => mutate((record) => { (record.spawn as unknown as Record<string,unknown>)[input.dataset.spawn!] = input.value || undefined; }));
    root.querySelectorAll<HTMLInputElement>('[data-spawn-number]').forEach((input) => input.onchange = () => mutate((record) => { (record.spawn as unknown as Record<string,unknown>)[input.dataset.spawnNumber!] = input.value === '' ? undefined : Number(input.value); }));
    root.querySelector<HTMLSelectElement>('[data-parent]')?.addEventListener('change', (event) => mutate((record) => { record.parentClassId = (event.currentTarget as HTMLSelectElement).value || undefined; }));
    root.querySelector<HTMLInputElement>('[data-advance]')?.addEventListener('change', (event) => mutate((record) => { record.advancementRequirements = { ...(record.advancementRequirements ?? {level:1}), level: Math.max(1,Number((event.currentTarget as HTMLInputElement).value)||1) }; }));
    root.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-advance-text]').forEach((input) => input.onchange = () => mutate((record) => { record.advancementRequirements = { ...(record.advancementRequirements ?? {level:1}), [input.dataset.advanceText!]: input.value || undefined }; }));
    root.querySelector<HTMLInputElement>('[data-next-classes]')?.addEventListener('change', (event) => mutate((record) => { record.nextClassIds = (event.currentTarget as HTMLInputElement).value.split(',').map((v) => v.trim()).filter(Boolean); }));
    root.querySelector<HTMLInputElement>('[data-sim-level]')?.addEventListener('input', (event) => { simLevel = Number((event.currentTarget as HTMLInputElement).value) || 1; render(); });

    root.querySelector<HTMLSelectElement>('[data-status]')!.onchange = (event) => mutate((record) => { record.status = (event.currentTarget as HTMLSelectElement).value as ClassStudioStatus; });
    root.querySelector<HTMLButtonElement>('[data-save]')!.onclick = () => { const issues = validateClass(current); if (current.status === 'published' && issues.some((issue) => issue.severity === 'error')) { toast('Corrija os erros críticos antes de publicar.'); return; } try { const saved = saveClassStudioRecord(current); refresh(saved.numericId); render(); toast('Classe salva.'); } catch (error) { toast(error instanceof Error ? error.message : 'Falha ao salvar.'); } };
    root.querySelector<HTMLButtonElement>('[data-new]')!.onclick = () => { current = createClassStudioRecord(); tab='general'; simLevel=1; render(); toast('Nova classe criada como Draft.'); };
    root.querySelector<HTMLButtonElement>('[data-duplicate]')!.onclick = () => { const copy = duplicateClassStudioRecord(current); if (copy) { refresh(copy.numericId); current=clone(copy); tab='general'; render(); toast('Classe duplicada como Draft.'); } };
    root.querySelector<HTMLButtonElement>('[data-delete]')!.onclick = () => { try { if (!confirm(`Excluir ${current.name}?`)) return; deleteClassStudioRecord(current.key); records=listClassStudioRecords(); current=clone(records[0] ?? createClassStudioRecord()); render(); toast('Classe excluída.'); } catch(error) { toast(error instanceof Error ? error.message : 'Não foi possível excluir.'); } };
    root.querySelector<HTMLButtonElement>('[data-export]')!.onclick = () => { const blob=new Blob([JSON.stringify(current,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`class-${current.key}.json`; a.click(); URL.revokeObjectURL(a.href); };
    root.querySelector<HTMLButtonElement>('[data-import]')!.onclick = () => { const input=document.createElement('input'); input.type='file'; input.accept='application/json'; input.onchange=async()=>{ const file=input.files?.[0]; if(!file)return; try{ const parsed=JSON.parse(await file.text()) as ClassStudioRecord; const draft={...parsed,numericId:createClassStudioRecord().numericId,id:`class_import_${Date.now().toString(36)}`,key:`class_import_${Date.now().toString(36)}`,source:'custom' as const,status:'draft' as const,selectable:false,createdAt:Date.now(),updatedAt:Date.now()}; const saved=saveClassStudioRecord(draft); refresh(saved.numericId); current=clone(saved); render(); toast('Classe importada como Draft.'); }catch{toast('JSON de classe inválido.');}}; input.click(); };
  }

  render();
  return { root, refresh: () => { refresh(); render(); } };
}
