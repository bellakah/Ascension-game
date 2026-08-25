import { createSkillStudioRecord, getSkillStudioRecord, saveSkillStudioRecord } from '../skills/skillStudioStore';
import type { SkillEffect, SkillStudioRecord } from '../skills/skillStudioTypes';
import { createClassStudioRecord, getClassStudioRecord, saveClassStudioRecord } from './classStudioStore';

function damage(multiplier: number, radius?: number): SkillEffect {
  return { id: `effect-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`, type: 'damage', baseValue: 0, scalingStat: 'attack', multiplier, durationMs: 0, chance: 1, ...(radius ? { radius } : {}) };
}

function saveArcherSkill(key: string, slot: number, name: string, icon: string, description: string, configure: (skill: SkillStudioRecord) => void) {
  if (getSkillStudioRecord(key)) return key;
  const skill = createSkillStudioRecord(name);
  skill.id = key;
  skill.key = key;
  skill.classId = 'archer';
  skill.className = 'Arqueiro';
  skill.status = 'published';
  skill.slot = slot;
  skill.unlockLevel = 1;
  skill.name = name;
  skill.shortName = name.slice(0, 12);
  skill.icon = icon;
  skill.description = description;
  skill.kind = 'projectile';
  skill.targeting = 'enemy';
  skill.animation = 'bow';
  skill.energyCost = 15;
  skill.cooldownMs = 3000;
  skill.castTimeMs = 0;
  skill.range = 560;
  skill.projectileKey = 'arrow';
  skill.projectileSpeed = 900;
  skill.effectColor = 0xc9e6a3;
  skill.effects = [damage(1.35)];
  configure(skill);
  saveSkillStudioRecord(skill);
  return key;
}

/**
 * Preset de demonstração do editor. Ele cria registros normais no Class/Skill
 * Studio; o runtime não possui qualquer `if archer` ou comportamento especial.
 */
export function createArcherPrototype() {
  if (getClassStudioRecord('archer')) throw new Error('A classe archer já existe. Edite-a pelo Class Studio.');

  const archer = createClassStudioRecord('Arqueiro');
  archer.id = 'archer';
  archer.key = 'archer';
  archer.status = 'draft';
  archer.selectable = true;
  archer.shortName = 'Arqueiro';
  archer.icon = '🏹';
  archer.colorHint = '#77b97b';
  archer.tagline = 'Dano físico à distância';
  archer.description = 'Especialista em ataques de longo alcance, mobilidade e chuva de projéteis.';
  archer.archetype = 'dps';
  archer.tags = ['ranged', 'physical', 'prototype'];
  archer.baseStats = { ...archer.baseStats, maxHp: 90, attack: 36, defense: 3, magicAttack: 4, magicDefense: 4, accuracy: 112, evasion: 8, critChance: 8, critDamage: 160, attackSpeed: 1.08, castSpeed: 1, moveSpeed: 1.05, hpRegen: .25 };
  archer.resource = { key: 'energy', label: 'Energia', mode: 'regenerate', max: 100, startingValue: 100, regenPerSecond: 15, regenInCombat: true, regenOutOfCombat: true, gainOnBasicAttack: 4, gainOnDamageTaken: 0, drainOutOfCombatPerSecond: 0, resetOnCombatEnd: false };
  archer.basicAttack = { type: 'projectile', animation: 'bow', damageType: 'physical', range: 550, cooldownTicks: 32, damageMultiplier: 1, projectileKey: 'arrow', projectileSpeed: 900, projectileColor: 0xd8e8b2, effectColor: 0xc9e6a3 };
  archer.progression = { ...archer.progression, maxHpPerLevel: 10, attackPerLevel: 4, defensePerLevel: 1, magicAttackPerLevel: .5, magicDefensePerLevel: 1, resourcePerLevel: 1 };
  archer.startingEquipment = { weapon: null, armor: null, boots: 'basic_boots', head: null, legs: null, accessory1: null, accessory2: null };
  archer.allowedEquipmentTags = ['weapon:bow', 'armor:light', 'armor:medium', 'armor:universal'];
  saveClassStudioRecord(archer);

  const skills = [
    saveArcherSkill('archer.precise_shot', 1, 'Tiro Preciso', '🎯', 'Um disparo preciso que causa 150% do Ataque.', (skill) => { skill.energyCost = 16; skill.cooldownMs = 2600; skill.effects = [damage(1.5)]; }),
    saveArcherSkill('archer.piercing_shot', 2, 'Flecha Perfurante', '➵', 'Disparo pesado de alto dano a longa distância.', (skill) => { skill.energyCost = 24; skill.cooldownMs = 5200; skill.range = 610; skill.effects = [damage(1.85)]; }),
    saveArcherSkill('archer.arrow_rain', 3, 'Chuva de Flechas', '🌧️', 'Atinge inimigos em uma área escolhida.', (skill) => { skill.kind = 'aoe'; skill.targeting = 'area-target'; skill.energyCost = 34; skill.cooldownMs = 9000; skill.radius = 180; skill.effects = [damage(.95, 180)]; }),
    saveArcherSkill('archer.hunter_focus', 4, 'Foco do Caçador', '👁️', 'Aumenta o Ataque em 22% por 9 segundos.', (skill) => { skill.kind = 'buff'; skill.targeting = 'self'; skill.animation = 'emote'; skill.energyCost = 28; skill.cooldownMs = 14000; skill.projectileKey = undefined; skill.effects = [{ id: `buff-${Date.now()}`, type: 'buff-attack', baseValue: 22, scalingStat: 'none', multiplier: 1, durationMs: 9000, chance: 1 }]; skill.buffAttackPercent = 22; skill.buffDurationMs = 9000; }),
  ];

  const saved = getClassStudioRecord('archer')!;
  saved.skillIds = skills;
  saved.status = 'published';
  return saveClassStudioRecord(saved);
}
