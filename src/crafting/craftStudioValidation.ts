import { getItemStudioRecordByKey } from '../items/itemStudioStore';
import { getCraftStationTypeByKey, listCraftRecipeRecords } from './craftStudioStore';
import type { CraftRecipeStudioRecord, CraftStationTypeRecord, CraftValidationIssue } from './craftStudioTypes';

export function validateCraftRecipe(record: CraftRecipeStudioRecord): CraftValidationIssue[] {
  const issues: CraftValidationIssue[] = [];
  if (!record.name.trim()) issues.push({ severity: 'error', code: 'name', message: 'A receita precisa de um nome.' });
  if (!record.key.trim()) issues.push({ severity: 'error', code: 'key', message: 'A receita precisa de uma chave interna.' });
  if (!record.stationTypeId || !getCraftStationTypeByKey(record.stationTypeId)) issues.push({ severity: 'error', code: 'station', message: 'Selecione um tipo de estação existente.' });
  if (!record.ingredients.length) issues.push({ severity: 'warning', code: 'ingredients-empty', message: 'A receita não possui ingredientes.' });
  for (const input of record.ingredients) {
    if (!input.itemId || !getItemStudioRecordByKey(input.itemId)) issues.push({ severity: 'error', code: 'ingredient-missing', message: `Ingrediente inexistente: ${input.itemId || '(vazio)'}.` });
    if (input.quantity <= 0) issues.push({ severity: 'error', code: 'ingredient-qty', message: 'Ingredientes precisam de quantidade maior que zero.' });
  }
  const primary = record.outputs.filter((output) => output.kind === 'primary');
  if (!primary.length) issues.push({ severity: 'error', code: 'output-primary', message: 'A receita precisa de pelo menos um resultado principal.' });
  for (const output of record.outputs) {
    if (!output.itemId || !getItemStudioRecordByKey(output.itemId)) issues.push({ severity: 'error', code: 'output-missing', message: `Resultado inexistente: ${output.itemId || '(vazio)'}.` });
    if (output.quantity <= 0) issues.push({ severity: 'error', code: 'output-qty', message: 'Resultados precisam de quantidade maior que zero.' });
    if (output.chance < 0 || output.chance > 1) issues.push({ severity: 'error', code: 'output-chance', message: 'Chance do resultado deve ficar entre 0% e 100%.' });
  }
  const inputIds = new Set(record.ingredients.map((entry) => entry.itemId));
  if (record.outputs.some((entry) => inputIds.has(entry.itemId))) issues.push({ severity: 'warning', code: 'same-input-output', message: 'Há item usado ao mesmo tempo como ingrediente e resultado.' });
  if (record.requirements.learnMode === 'item' && (!record.requirements.learnItemId || !getItemStudioRecordByKey(record.requirements.learnItemId))) issues.push({ severity: 'error', code: 'learn-item', message: 'Selecione o item que ensina esta receita.' });
  if (record.requirements.learnMode === 'quest' && !record.requirements.learnQuestId) issues.push({ severity: 'error', code: 'learn-quest', message: 'Informe a missão que ensina esta receita.' });
  if (record.requirements.learnMode === 'event' && !record.requirements.eventKey) issues.push({ severity: 'error', code: 'learn-event', message: 'Informe o evento que disponibiliza esta receita.' });
  if (record.status === 'published' && issues.some((issue) => issue.severity === 'error')) issues.push({ severity: 'error', code: 'publish', message: 'Corrija os erros críticos antes de publicar.' });
  return issues;
}

export function validateCraftStation(record: CraftStationTypeRecord): CraftValidationIssue[] {
  const issues: CraftValidationIssue[] = [];
  if (!record.name.trim()) issues.push({ severity: 'error', code: 'name', message: 'A estação precisa de um nome.' });
  if (!record.key.trim()) issues.push({ severity: 'error', code: 'key', message: 'A estação precisa de uma chave interna.' });
  if (record.interactionRadius <= 0) issues.push({ severity: 'error', code: 'radius', message: 'O raio de interação deve ser maior que zero.' });
  const uses = listCraftRecipeRecords().filter((recipe) => recipe.stationTypeId === record.key).length;
  if (!uses) issues.push({ severity: 'warning', code: 'unused', message: 'Nenhuma receita utiliza este tipo de estação.' });
  if (!record.categories.length) issues.push({ severity: 'warning', code: 'categories', message: 'Nenhuma categoria foi associada à estação.' });
  return issues;
}
