import './classSelection.css';
import { SELECTABLE_CLASSES, type ClassId } from './classCatalog';

export function showClassSelection(initial: ClassId = 'warrior'): Promise<ClassId | null> {
  return new Promise((resolve) => {
    const classes = SELECTABLE_CLASSES;
    let selected: ClassId = classes.some((entry) => entry.id === initial) ? initial : (classes[0]?.id ?? initial);
    const root = document.createElement('div');
    root.id = 'class-select-overlay';
    root.style.position = 'fixed';
    root.style.inset = '0';
    root.style.zIndex = '24000';
    root.style.display = 'grid';
    root.style.placeItems = 'center';
    root.style.padding = '16px';
    root.style.background = 'rgba(5,10,8,.94)';
    root.style.backdropFilter = 'blur(8px)';
    root.innerHTML = `
      <div style="width:min(760px,100%);max-height:min(820px,calc(100dvh - 24px));overflow:auto;padding:20px;border:1px solid rgba(255,255,255,.09);border-radius:20px;background:linear-gradient(155deg,#16261f,#0d1713);color:#eef5f1;box-shadow:0 30px 90px rgba(0,0,0,.55)">
        <header style="margin-bottom:16px"><span class="creator-kicker">ASCENSION</span><h1 style="margin:4px 0 5px;font-size:27px">Escolha sua classe</h1><p style="margin:0;color:#8fa198;font-size:11px">A classe define atributos iniciais, arma, recurso e habilidades. Essa escolha fica salva neste personagem.</p></header>
        <div id="class-choice-grid" class="class-choice-grid"></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px"><button id="class-cancel" class="creator-cancel" type="button">Cancelar</button><button id="class-confirm" class="confirm-character" type="button">Continuar</button></div>
      </div>`;
    document.body.appendChild(root);
    const grid = root.querySelector<HTMLElement>('#class-choice-grid')!;
    const confirm = root.querySelector<HTMLButtonElement>('#class-confirm')!;

    const render = () => {
      grid.replaceChildren();
      if (!classes.length) {
        grid.innerHTML = '<div style="padding:20px;color:#d9c68c">Nenhuma classe publicada está marcada como disponível na criação.</div>';
        confirm.disabled = true;
        return;
      }
      confirm.disabled = false;
      for (const entry of classes) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `class-choice-card${selected === entry.id ? ' selected' : ''}`;
        button.style.setProperty('--class-accent', entry.colorHint);
        button.innerHTML = `<span class="class-choice-icon">${entry.icon}</span><span class="class-choice-copy"><small>${entry.tagline}</small><strong>${entry.name}</strong><p>${entry.description}</p></span><span class="class-choice-stats"><span>♥ ${entry.baseStats.maxHp} HP</span><span>⚔ ${entry.baseStats.attack} ATQ</span><span>🛡 ${entry.baseStats.defense} DEF</span><span>✦ ${entry.resource.max} ${entry.resource.label}</span></span>`;
        button.addEventListener('click', () => { selected = entry.id; render(); });
        grid.appendChild(button);
      }
    };

    const finish = (value: ClassId | null) => { root.remove(); resolve(value); };
    root.querySelector<HTMLButtonElement>('#class-cancel')!.addEventListener('click', () => finish(null));
    confirm.addEventListener('click', () => finish(classes.length ? selected : null));
    render();
  });
}
