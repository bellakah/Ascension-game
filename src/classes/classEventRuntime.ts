import type { CharacterProgress } from '../character/characterCreator';
import { activeEventRecords } from '../events/eventRuntime';
import { changeClass, classCharacterState, learnSkill, unlockClass } from './classAdvancement';

export type AppliedClassEventAction = { eventKey: string; actionId: string; type: string; targetId: string; applied: boolean; reason?: string };

/** Aplica uma única vez por personagem ações de classe dos eventos ativos. */
export function applyActiveClassEventActions(progress: CharacterProgress): AppliedClassEventAction[] {
  const state = classCharacterState(progress);
  state.appliedClassEventActions ??= [];
  const applied = new Set(state.appliedClassEventActions);
  const results: AppliedClassEventAction[] = [];

  for (const event of activeEventRecords()) {
    for (const action of event.actions) {
      if (!action.enabled || !['unlock-class','change-class','learn-skill'].includes(action.type)) continue;
      const token = `${event.key}:${action.id}`;
      if (applied.has(token)) continue;
      let result: { ok: boolean; reason?: string };
      if (action.type === 'unlock-class') result = unlockClass(progress, action.targetId);
      else if (action.type === 'change-class') result = changeClass(progress, action.targetId, { force: true, allowUnlockedSwitch: true });
      else result = learnSkill(progress, action.targetId);
      results.push({ eventKey: event.key, actionId: action.id, type: action.type, targetId: action.targetId, applied: result.ok, reason: result.ok ? undefined : result.reason });
      if (result.ok) { applied.add(token); state.appliedClassEventActions.push(token); }
    }
  }
  return results;
}
