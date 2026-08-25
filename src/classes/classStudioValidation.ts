import { listItemStudioRecords } from '../items/itemStudioStore';
import { listClassStudioRecords } from './classStudioStore';
import type { ClassStudioRecord, ClassValidationIssue } from './classStudioTypes';

export function validateClass(record: ClassStudioRecord): ClassValidationIssue[] {
  const issues: ClassValidationIssue[] = [];
  const classes = listClassStudioRecords();
  const itemRecords = listItemStudioRecords();
  const items = new Map(itemRecords.map((item) => [item.key, item]));
  const error = (code: string, message: string) => issues.push({ severity: 'error', code, message });
  const warn = (code: string, message: string) => issues.push({ severity: 'warning', code, message });

  if (!record.name.trim()) error('name', 'A classe precisa de um nome.');
  if (!/^[a-z0-9][a-z0-9_.-]*$/i.test(record.key)) error('key', 'A chave interna deve usar apenas letras, números, ponto, hífen ou underscore.');
  if (classes.some((entry) => entry.key === record.key && entry.numericId !== record.numericId)) error('key-duplicate', `A chave ${record.key} já está em uso.`);
  if (classes.some((entry) => entry.numericId === record.numericId && entry.key !== record.key)) error('id-duplicate', `O Class ID #${record.numericId} já está em uso.`);
  if (!record.allowedSexes.length) error('sex', 'Selecione ao menos um sexo permitido.');
  if (record.baseStats.maxHp <= 0) error('hp', 'HP base deve ser maior que zero.');
  if (record.baseStats.attack < 0 || record.baseStats.defense < 0) error('stats', 'Ataque e Defesa não podem ser negativos.');
  if (record.resource.max <= 0) error('resource', 'O recurso da classe precisa ter máximo maior que zero.');
  if (record.basicAttack.range <= 0) error('range', 'O ataque básico precisa de alcance válido.');
  if (record.basicAttack.cooldownTicks <= 0) error('cooldown', 'O ataque básico precisa de cooldown válido.');
  if (record.progression.maxLevel < 1) error('max-level', 'Nível máximo inválido.');
  if (record.progression.baseExp < 1) error('base-exp', 'EXP base precisa ser maior que zero.');

  for (const [slot, itemId] of Object.entries(record.startingEquipment)) {
    if (!itemId) continue;
    const item = items.get(itemId);
    if (!item) error(`equipment-${slot}`, `Equipamento inicial ${itemId} (${slot}) não existe no Item Studio.`);
    else if (item.allowedClasses?.length && !item.allowedClasses.includes(record.key)) error(`equipment-class-${slot}`, `${item.name} não permite uso pela classe ${record.name}.`);
  }
  for (const entry of record.startingItems) {
    if (!items.has(entry.itemId)) error('starting-item', `Item inicial ${entry.itemId} não existe no Item Studio.`);
  }

  if (record.parentClassId) {
    if (record.parentClassId === record.key) error('parent-self', 'Uma classe não pode ser evolução dela mesma.');
    else if (!classes.some((entry) => entry.key === record.parentClassId)) error('parent-missing', `Classe pai ${record.parentClassId} não existe.`);
  }
  const seen = new Set<string>();
  let cursor: ClassStudioRecord | undefined = record;
  while (cursor?.parentClassId) {
    if (seen.has(cursor.parentClassId)) { error('advancement-cycle', 'Existe uma dependência circular na evolução de classes.'); break; }
    seen.add(cursor.parentClassId);
    cursor = classes.find((entry) => entry.key === cursor!.parentClassId);
  }

  if (record.status === 'published' && record.selectable && !record.skillIds.length) warn('no-skills', 'Classe selecionável ainda não possui habilidades vinculadas.');
  if (record.status === 'published' && !record.selectable && !record.parentClassId) warn('unreachable', 'Classe publicada não é inicial e ainda não possui classe pai.');
  if (!record.startingEquipment.weapon && record.selectable) warn('no-weapon', 'Classe inicial não possui arma inicial.');
  if (record.spawn.mode === 'class' && !record.spawn.markerId && (!Number.isFinite(record.spawn.x) || !Number.isFinite(record.spawn.y))) warn('spawn-fallback', 'Spawn exclusivo sem Marker ID nem coordenadas de fallback.');
  return issues;
}
