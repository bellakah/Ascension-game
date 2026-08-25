import { listClassStudioRecords } from '../classes/classStudioStore';
import { listSkillStudioRecords } from './skillStudioStore';
import type { SkillStudioRecord, SkillValidationIssue } from './skillStudioTypes';

export function validateSkill(record: SkillStudioRecord): SkillValidationIssue[] {
  const issues: SkillValidationIssue[] = [];
  const error=(code:string,message:string)=>issues.push({severity:'error',code,message} as const);
  const warn=(code:string,message:string)=>issues.push({severity:'warning',code,message} as const);
  const records=listSkillStudioRecords();
  if(!record.name.trim()) error('name','A habilidade precisa de nome.');
  if(!/^[a-z0-9][a-z0-9_.-]*$/i.test(record.key)) error('key','A chave da habilidade contém caracteres inválidos.');
  if(records.some((entry)=>entry.key===record.key&&entry.numericId!==record.numericId)) error('key-duplicate',`A chave ${record.key} já está em uso.`);
  if(records.some((entry)=>entry.numericId===record.numericId&&entry.key!==record.key)) error('id-duplicate',`Skill ID #${record.numericId} já está em uso.`);
  if(!listClassStudioRecords().some((entry)=>entry.key===record.classId)) error('class',`Classe ${record.classId} não existe.`);
  if(record.slot<1||record.slot>12) error('slot','Slot precisa estar entre 1 e 12.');
  if(record.unlockLevel<1) error('level','Nível de aprendizado inválido.');
  if(record.energyCost<0) error('cost','Custo não pode ser negativo.');
  if(record.cooldownMs<0) error('cooldown','Cooldown não pode ser negativo.');
  if((record.targeting==='enemy'||record.targeting==='ally'||record.targeting==='area-target')&&!record.range) warn('range','Targeting escolhido normalmente exige alcance.');
  if((record.targeting==='area-self'||record.targeting==='area-target')&&!record.radius) warn('radius','Habilidade em área ainda não possui raio.');
  if(!record.effects.length) warn('effects','Habilidade ainda não possui efeitos configurados.');
  record.effects.forEach((effect,index)=>{if(effect.chance<0||effect.chance>1)error(`effect-chance-${index}`,'Chance de efeito deve ficar entre 0 e 100%.');if(effect.durationMs<0)error(`effect-duration-${index}`,'Duração não pode ser negativa.');});
  return issues;
}
