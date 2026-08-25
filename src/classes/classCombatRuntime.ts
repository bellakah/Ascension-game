import type { CharacterProgress } from '../character/characterCreator';
import type { LpcCharacter } from '../character/lpcCharacter';
import type { Monster } from '../game/monsterSystem';
import type { SkillDefinition } from '../skills/skillCatalog';
import type { SkillEffect } from '../skills/skillStudioTypes';
import type { ClassDefinition } from './classCatalog';
import type { ClassRuntimeProgress } from './classProgression';

export type CombatEffectContext = {
  progress: CharacterProgress;
  skill: SkillDefinition;
  target: Monster | null;
  targets: Monster[];
  hitMonster: (monster: Monster, damage: number, color?: number) => void;
  healPlayer: (amount: number) => void;
  dashToTarget: (target: Monster) => void;
  addResource: (amount: number) => void;
  showPulse: (radius: number, color: number, durationMs?: number) => void;
  showFloating: (text: string, color: number) => void;
  notify: (message: string) => void;
};

export function playClassAnimation(hero: LpcCharacter, animation: string) {
  if (animation === 'spellcast') return hero.cast();
  if (animation === 'emote') return hero.emote();
  // O LPC atual ainda não expõe bow/thrust como ação pública. Esses perfis usam
  // a ação de ataque corporal e mantêm projétil/VFX separados do sprite.
  return hero.attack();
}

function scaledValue(progress: CharacterProgress, effect: SkillEffect) {
  const state = progress as ClassRuntimeProgress;
  const stat = effect.scalingStat === 'attack' ? progress.attack
    : effect.scalingStat === 'magicAttack' ? state.magicAttack
      : effect.scalingStat === 'maxHp' ? progress.maxHp
        : effect.scalingStat === 'defense' ? progress.defense
          : 0;
  return effect.baseValue + stat * effect.multiplier;
}

function recipients(ctx: CombatEffectContext, effect: SkillEffect) {
  if (ctx.skill.targeting === 'area-self' || ctx.skill.targeting === 'area-target' || effect.radius) return ctx.targets;
  return ctx.target ? [ctx.target] : [];
}

export function executeSkillEffects(ctx: CombatEffectContext) {
  const color = ctx.skill.effectColor ?? 0x9ddcff;
  const effects = ctx.skill.effects.length ? ctx.skill.effects : legacyEffects(ctx.skill);
  for (const effect of effects) {
    if (effect.chance < 1 && Math.random() > effect.chance) continue;
    const value = Math.max(0, scaledValue(ctx.progress, effect));
    if (effect.type === 'damage' || effect.type === 'dot') {
      for (const monster of recipients(ctx, effect)) ctx.hitMonster(monster, Math.max(1, value), color);
      continue;
    }
    if (effect.type === 'heal' || effect.type === 'hot') {
      ctx.healPlayer(value);
      ctx.showFloating(`+${Math.round(value)} HP`, 0x8fffb1);
      continue;
    }
    if (effect.type === 'dash' && ctx.target) { ctx.dashToTarget(ctx.target); continue; }
    if (effect.type === 'resource-gain') { ctx.addResource(value); ctx.showFloating(`+${Math.round(value)} recurso`, color); continue; }
    if (effect.type === 'resource-drain') { ctx.addResource(-value); continue; }
    if (effect.type === 'buff-attack') {
      ctx.showFloating(`ATQ +${Math.round(effect.baseValue)}%`, color);
      continue;
    }
    if (effect.type === 'shield' || effect.type === 'buff-defense') {
      ctx.showFloating(effect.type === 'shield' ? 'Escudo' : 'DEF +', color);
      continue;
    }
    if (effect.type === 'stun' || effect.type === 'slow' || effect.type === 'root' || effect.type === 'knockback') {
      ctx.notify(`${ctx.skill.name}: ${effect.type} configurado; status avançado será aplicado quando o alvo suportar estados.`);
      continue;
    }
    if (effect.type === 'cleanse' || effect.type === 'revive') {
      ctx.notify(`${ctx.skill.name}: efeito ${effect.type} configurado.`);
    }
  }
  const radius = ctx.skill.radius ?? Math.max(0, ...effects.map((effect) => effect.radius ?? 0));
  if (radius > 0) ctx.showPulse(radius, color, 420);
}

function legacyEffects(skill: SkillDefinition): SkillEffect[] {
  if (skill.kind === 'buff') return [{ id: 'legacy-buff', type: 'buff-attack', baseValue: skill.buffAttackPercent ?? 0, scalingStat: 'none', multiplier: 1, durationMs: skill.buffDurationMs ?? 0, chance: 1 }];
  return [{ id: 'legacy-damage', type: 'damage', baseValue: 0, scalingStat: 'attack', multiplier: skill.damageMultiplier ?? 1, durationMs: 0, chance: 1, radius: skill.radius }];
}

export function basicAttackDamage(progress: CharacterProgress, classDef: ClassDefinition, attackMultiplier = 1) {
  const state = progress as ClassRuntimeProgress;
  const source = classDef.basicAttack.damageType === 'magical' ? state.magicAttack || progress.attack : progress.attack;
  return Math.max(1, source * classDef.basicAttack.damageMultiplier * attackMultiplier);
}

export function basicAttackColor(classDef: ClassDefinition) {
  return classDef.basicAttack.effectColor ?? (classDef.basicAttack.damageType === 'magical' ? 0x9ddcff : 0xffc2b8);
}

export function classUsesProjectile(classDef: ClassDefinition) {
  return classDef.basicAttack.type === 'projectile' || classDef.basicAttack.type === 'magic-projectile';
}
