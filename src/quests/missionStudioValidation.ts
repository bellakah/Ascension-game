import { listCollectibleDefinitions } from '../gathering/collectibleStore';
import { listItemStudioRecords } from '../items/itemStudioStore';
import { listMonsterDefinitions } from '../monsterEditor/monsterStore';
import { listNpcDefinitions } from '../npc/npcStore';
import type { MissionStudioRecord, MissionValidationIssue } from './missionStudioTypes';

const LEGACY_NPCS = new Set(['elandra', 'rowan', 'mira', 'theo']);
const LEGACY_MONSTERS = new Set(['wolf', 'sludge', 'any']);

function push(issues: MissionValidationIssue[], severity: MissionValidationIssue['severity'], code: string, message: string, path?: string) {
  issues.push({ severity, code, message, ...(path ? { path } : {}) });
}

export function validateMission(record: MissionStudioRecord, catalog: MissionStudioRecord[]) {
  const issues: MissionValidationIssue[] = [];
  const npcs = new Set([...LEGACY_NPCS, ...listNpcDefinitions().map((npc) => npc.id)]);
  const monsters = new Set([...LEGACY_MONSTERS, ...listMonsterDefinitions().map((monster) => monster.id)]);
  const items = new Set(listItemStudioRecords().map((item) => item.key));
  const resources = new Set(listCollectibleDefinitions().flatMap((resource) => [resource.id, ...resource.drops.map((drop) => drop.itemId)]));
  const questKeys = new Set(catalog.map((mission) => mission.key));

  if (!record.title.trim()) push(issues, 'error', 'title.empty', 'Defina um nome para a missão.', 'general.title');
  if (!record.key.trim()) push(issues, 'error', 'key.empty', 'A chave interna da missão está vazia.', 'general.key');
  if (!record.startNpcId && !record.autoStart) push(issues, 'error', 'giver.empty', 'Selecione o NPC que oferece a missão ou ative Início Automático.', 'general.startNpcId');
  if (record.startNpcId && !npcs.has(record.startNpcId)) push(issues, 'error', 'giver.invalid', `O NPC inicial “${record.startNpcId}” não existe mais.`, 'general.startNpcId');
  if (!record.endNpcId && !record.autoComplete) push(issues, 'error', 'turnin.empty', 'Selecione o NPC de entrega ou ative Conclusão Automática.', 'general.endNpcId');
  if (record.endNpcId && !npcs.has(record.endNpcId)) push(issues, 'error', 'turnin.invalid', `O NPC de entrega “${record.endNpcId}” não existe mais.`, 'general.endNpcId');
  if (!record.stages.length) push(issues, 'error', 'stages.empty', 'A missão precisa ter pelo menos uma etapa.', 'flow');

  record.stages.forEach((stage, stageIndex) => {
    if (!stage.objectives.length) push(issues, 'error', 'stage.empty', `A etapa ${stageIndex + 1} não possui objetivos.`, `stage.${stageIndex}`);
    stage.objectives.forEach((objective, objectiveIndex) => {
      const path = `stage.${stageIndex}.objective.${objectiveIndex}`;
      if (!objective.label.trim()) push(issues, 'error', 'objective.label.empty', `O objetivo ${objectiveIndex + 1} da etapa ${stageIndex + 1} está sem descrição.`, path);
      if ((objective.type === 'talk' || objective.type === 'deliver') && (!objective.npcId || !npcs.has(objective.npcId))) push(issues, 'error', 'objective.npc.invalid', `Selecione um NPC válido para “${objective.label || 'objetivo'}”.`, path);
      if ((objective.type === 'kill' || objective.type === 'boss') && (!objective.monsterKind || !monsters.has(objective.monsterKind))) push(issues, 'error', 'objective.monster.invalid', `Selecione um monstro válido para “${objective.label || 'objetivo'}”.`, path);
      if ((objective.type === 'collect' || objective.type === 'deliver' || objective.type === 'craft' || objective.type === 'use') && objective.itemId && !items.has(objective.itemId)) push(issues, 'error', 'objective.item.invalid', `O item “${objective.itemId}” não existe no Item Studio.`, path);
      if (objective.type === 'gather' && objective.itemId && !resources.has(objective.itemId)) push(issues, 'warning', 'objective.resource.unmapped', `Nenhum coletável conhecido entrega “${objective.itemId}”. A auto-rota pode não encontrar esse recurso.`, path);
    });
  });

  for (const required of record.requirements.completedQuests) {
    if (!questKeys.has(required)) push(issues, 'error', 'requirement.quest.invalid', `A missão pré-requisito “${required}” não existe.`, 'conditions.completedQuests');
    if (required === record.key) push(issues, 'error', 'requirement.quest.self', 'Uma missão não pode depender dela mesma.', 'conditions.completedQuests');
  }

  const graph = new Map(catalog.map((mission) => [mission.key, mission.requirements.completedQuests]));
  const visit = (key: string, chain: Set<string>): boolean => {
    if (chain.has(key)) return true;
    const next = graph.get(key) ?? [];
    const branch = new Set(chain); branch.add(key);
    return next.some((dependency) => graph.has(dependency) && visit(dependency, branch));
  };
  if (visit(record.key, new Set())) push(issues, 'error', 'requirement.quest.circular', 'Existe uma dependência circular na cadeia desta missão.', 'conditions.completedQuests');

  if (record.reset !== 'once' && record.cooldownMs <= 0 && record.reset === 'repeatable') push(issues, 'warning', 'repeat.cooldown', 'Missão repetível sem cooldown pode ser concluída continuamente.', 'conditions.reset');
  if (!(record.rewards.exp || record.rewards.coins || record.rewards.items?.length || record.rewards.chooseOne?.length)) push(issues, 'warning', 'rewards.empty', 'A missão não possui recompensa configurada.', 'rewards');
  if (record.status === 'published' && issues.some((issue) => issue.severity === 'error')) push(issues, 'error', 'publish.blocked', 'Corrija os erros críticos antes de publicar a missão.');
  return issues;
}
