import './skillBar.css';
import type { SkillDefinition, SkillId } from './skillCatalog';
import type { SkillSnapshot } from './skillController';

type SkillBarCallbacks = { onUse: (skillId: SkillId) => void };

export function createSkillBar(skills: SkillDefinition[], callbacks: SkillBarCallbacks) {
  const root = document.createElement('div');
  root.id = 'skill-bar';
  root.innerHTML = `
    <div class="skill-energy" title="Recurso da classe">
      <div class="skill-energy-track"><span id="skill-energy-fill"></span></div>
      <strong id="skill-energy-text"></strong>
    </div>
    <div class="skill-buttons"></div>
    <div id="skill-buff" class="skill-buff skill-buff-hidden"></div>`;

  const host = document.querySelector<HTMLElement>('#hud') ?? document.body;
  host.appendChild(root);
  const buttonsHost = root.querySelector<HTMLElement>('.skill-buttons')!;
  const energyFill = root.querySelector<HTMLElement>('#skill-energy-fill')!;
  const energyText = root.querySelector<HTMLElement>('#skill-energy-text')!;
  const buff = root.querySelector<HTMLElement>('#skill-buff')!;
  const buttons = new Map<SkillId, HTMLButtonElement>();

  for (const skill of skills) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'skill-button';
    button.dataset.skillId = skill.id;
    button.title = `${skill.slot}. ${skill.name} — ${skill.description} Custo ${skill.energyCost}. Recarga ${Math.round(skill.cooldownMs / 1000)}s.`;
    button.innerHTML = `<span class="skill-key">${skill.slot}</span><span class="skill-icon">${skill.icon}</span><span class="skill-name">${skill.shortName}</span><span class="skill-cost">${skill.energyCost}</span><span class="skill-cooldown"></span>`;
    button.addEventListener('pointerdown', (event) => { event.preventDefault(); callbacks.onUse(skill.id); });
    buttonsHost.appendChild(button);
    buttons.set(skill.id, button);
  }

  const refresh = (snapshot: SkillSnapshot, disabled = false) => {
    const energyPercent = snapshot.maxEnergy > 0 ? Math.max(0, Math.min(100, snapshot.energy / snapshot.maxEnergy * 100)) : 0;
    energyFill.style.width = `${energyPercent}%`;
    energyText.textContent = `${snapshot.resourceLabel} ${Math.floor(snapshot.energy)}/${snapshot.maxEnergy}`;

    for (const skill of skills) {
      const button = buttons.get(skill.id)!;
      const remaining = snapshot.cooldowns[skill.id] ?? 0;
      const cooldown = button.querySelector<HTMLElement>('.skill-cooldown')!;
      const cooling = remaining > 0;
      button.classList.toggle('cooling', cooling);
      button.classList.toggle('no-energy', snapshot.energy < skill.energyCost);
      button.disabled = disabled;
      cooldown.textContent = cooling ? (remaining / 1000).toFixed(remaining < 1000 ? 1 : 0) : '';
      cooldown.style.setProperty('--cooldown', `${Math.max(0, Math.min(1, remaining / skill.cooldownMs))}`);
    }

    if (snapshot.buffRemainingMs > 0 && snapshot.buffAttackPercent > 0) {
      buff.classList.remove('skill-buff-hidden');
      buff.textContent = `${snapshot.buffIcon || '✦'} ${snapshot.buffName || 'Buff'} · ATQ +${snapshot.buffAttackPercent}% · ${Math.ceil(snapshot.buffRemainingMs / 1000)}s`;
    } else {
      buff.classList.add('skill-buff-hidden');
      buff.textContent = '';
    }
  };

  return { root, refresh };
}
