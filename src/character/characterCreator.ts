import { Application } from 'pixi.js';
import { DEFAULT_CHARACTER, LpcCharacter, type BodyType, type CharacterConfig, type Sex } from './lpcCharacter';

const LPC = 'https://raw.githubusercontent.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/master/spritesheets';
const STORAGE_KEY = 'ascension.character.v1';

type Option = { id: string; label: string };

const hairBySex: Record<Sex, Option[]> = {
  male: [
    { id: 'bedhead', label: 'Despojado' },
    { id: 'afro', label: 'Afro' },
    { id: 'bangsshort', label: 'Franja curta' },
    { id: 'balding', label: 'Clássico' },
    { id: 'bob_side_part', label: 'Lateral' },
  ],
  female: [
    { id: 'bob', label: 'Bob' },
    { id: 'bob_side_part', label: 'Lateral' },
    { id: 'bangs_bun', label: 'Coque' },
    { id: 'bangsshort', label: 'Franja curta' },
    { id: 'bedhead', label: 'Despojado' },
  ],
};

const eyesBySex: Record<Sex, Option[]> = {
  male: [
    { id: 'neutral', label: 'Clássico' },
    { id: 'anger', label: 'Intenso' },
    { id: 'sad', label: 'Suave' },
    { id: 'eyeroll', label: 'Arqueado' },
    { id: 'look_l', label: 'Lateral' },
  ],
  female: [
    { id: 'neutral', label: 'Clássico' },
    { id: 'anger', label: 'Intenso' },
    { id: 'sad', label: 'Suave' },
    { id: 'eyeroll', label: 'Arqueado' },
    { id: 'look_l', label: 'Lateral' },
  ],
};

const skinColors = [0xffe0c2, 0xf3c39d, 0xd99b72, 0xad704f, 0x75462f];
const hairColors = [0x30231f, 0x6b432c, 0xb6783b, 0xe2c083, 0x9b3434, 0x394861];
const eyeColors = [0x6d93b8, 0x5f8f63, 0x8a653e, 0x5a4a73, 0x444444];
const bodyTypes: Array<{ id: BodyType; label: string; width: number }> = [
  { id: 'light', label: 'Leve', width: .82 },
  { id: 'normal', label: 'Normal', width: 1 },
  { id: 'robust', label: 'Robusto', width: 1.17 },
];

function cloneDefault(): CharacterConfig {
  return { ...DEFAULT_CHARACTER };
}

function sanitizeConfig(value: CharacterConfig): CharacterConfig {
  const sex: Sex = value.sex === 'female' ? 'female' : 'male';
  const validHair = hairBySex[sex].some((item) => item.id === value.hairStyle);
  const validEyes = eyesBySex[sex].some((item) => item.id === value.eyeStyle);
  const validEyeColor = eyeColors.includes(value.eyeColor);

  return {
    ...cloneDefault(),
    ...value,
    sex,
    hairStyle: validHair ? value.hairStyle : hairBySex[sex][0].id,
    eyeStyle: validEyes ? value.eyeStyle : eyesBySex[sex][0].id,
    eyeColor: validEyeColor ? value.eyeColor : eyeColors[0],
  };
}

function loadSaved(): CharacterConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefault();
    return sanitizeConfig({ ...cloneDefault(), ...JSON.parse(raw) } as CharacterConfig);
  } catch {
    return cloneDefault();
  }
}

function optionButton(label: string, selected: boolean, onClick: () => void) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `creator-option${selected ? ' selected' : ''}`;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function colorButton(color: number, selected: boolean, onClick: () => void) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `color-dot${selected ? ' selected' : ''}`;
  button.style.backgroundColor = `#${color.toString(16).padStart(6, '0')}`;
  button.addEventListener('click', onClick);
  return button;
}

function addThumbLayer(host: HTMLElement, path: string, z: number) {
  const layer = document.createElement('span');
  layer.className = 'lpc-thumb-layer';
  layer.style.zIndex = String(z);
  layer.style.backgroundImage = `url(${LPC}/${path})`;
  host.appendChild(layer);
}

function createHairThumb(sex: Sex, style: string) {
  const thumb = document.createElement('span');
  thumb.className = 'lpc-thumb';
  addThumbLayer(thumb, `body/bodies/${sex}/idle.png`, 1);
  addThumbLayer(thumb, `head/heads/human/${sex}/idle.png`, 2);
  addThumbLayer(thumb, `hair/${style}/adult/idle.png`, 3);
  return thumb;
}

function createEyeThumb(sex: Sex, eyeStyle: string) {
  const thumb = document.createElement('span');
  thumb.className = 'lpc-thumb face-thumb';
  addThumbLayer(thumb, `body/bodies/${sex}/idle.png`, 1);
  addThumbLayer(thumb, `head/heads/human/${sex}/idle.png`, 2);
  addThumbLayer(thumb, `eyes/human/adult/${eyeStyle}/idle/blue.png`, 3);
  return thumb;
}

function makeSection(title: string) {
  const section = document.createElement('section');
  section.className = 'creator-section';
  const heading = document.createElement('h3');
  heading.textContent = title;
  section.appendChild(heading);
  return section;
}

export async function showCharacterCreator(): Promise<CharacterConfig> {
  const boot = document.querySelector<HTMLElement>('#boot-status');
  if (boot) boot.style.display = 'none';

  let config = loadSaved();
  let facingIndex = 2;
  const facings = ['up', 'left', 'down', 'right'] as const;

  const root = document.createElement('div');
  root.id = 'character-creator';
  root.innerHTML = `
    <div class="creator-shell">
      <header class="creator-header">
        <div><span class="creator-kicker">ASCENSION</span><h1>Criação de personagem</h1></div>
        <p>Monte seu personagem e veja todas as mudanças antes de entrar no mundo.</p>
      </header>
      <div class="creator-layout">
        <aside class="creator-preview-panel">
          <div id="creator-preview"></div>
          <div class="preview-rotate"><button id="rotate-left" type="button">◀</button><span id="facing-label">Frente</span><button id="rotate-right" type="button">▶</button></div>
          <div class="preview-summary" id="preview-summary"></div>
        </aside>
        <main class="creator-controls">
          <section class="creator-section"><h3>Nome</h3><input id="character-name" maxlength="16" autocomplete="off" placeholder="Nome do personagem" /></section>
          <section class="creator-section"><h3>Sexo</h3><div id="sex-options" class="sex-options"></div></section>
          <div id="dynamic-options"></div>
          <button id="confirm-character" class="confirm-character" type="button">Criar personagem e entrar</button>
          <div id="creator-error" class="creator-error"></div>
        </main>
      </div>
    </div>`;
  document.body.appendChild(root);

  const previewHost = root.querySelector<HTMLDivElement>('#creator-preview')!;
  const previewSummary = root.querySelector<HTMLDivElement>('#preview-summary')!;
  const sexOptions = root.querySelector<HTMLDivElement>('#sex-options')!;
  const dynamicOptions = root.querySelector<HTMLDivElement>('#dynamic-options')!;
  const nameInput = root.querySelector<HTMLInputElement>('#character-name')!;
  const errorBox = root.querySelector<HTMLDivElement>('#creator-error')!;
  const facingLabel = root.querySelector<HTMLSpanElement>('#facing-label')!;
  nameInput.value = config.name;

  const previewApp = new Application();
  await previewApp.init({ width: 270, height: 310, backgroundColor: 0x16251f, antialias: false, preference: 'webgl' });
  previewHost.appendChild(previewApp.canvas);
  let previewCharacter: LpcCharacter | null = null;
  let previewToken = 0;

  async function refreshPreview() {
    const token = ++previewToken;
    try {
      const next = await LpcCharacter.create(config);
      if (token !== previewToken) return;
      if (previewCharacter) previewApp.stage.removeChild(previewCharacter.view);
      previewCharacter = next;
      next.view.position.set(135, 248);
      next.view.scale.set(2.05);
      next.setFacing(facings[facingIndex]);
      previewApp.stage.addChild(next.view);
      updateSummary();
    } catch (error) {
      console.warn('[Creator] preview parcial', error);
    }
  }

  function updateSummary() {
    const hair = hairBySex[config.sex].find((item) => item.id === config.hairStyle)?.label ?? config.hairStyle;
    const eyes = eyesBySex[config.sex].find((item) => item.id === config.eyeStyle)?.label ?? config.eyeStyle;
    const body = bodyTypes.find((item) => item.id === config.bodyType)?.label ?? config.bodyType;
    previewSummary.innerHTML = `<strong>${config.name || 'Sem nome'}</strong><span>${config.sex === 'male' ? 'Masculino' : 'Feminino'} · ${body}</span><span>${hair} · Olhos ${eyes}</span>`;
  }

  function renderSexOptions() {
    sexOptions.replaceChildren();
    const male = optionButton('♂ Masculino', config.sex === 'male', () => changeSex('male'));
    male.classList.add('sex-card');
    const female = optionButton('♀ Feminino', config.sex === 'female', () => changeSex('female'));
    female.classList.add('sex-card');
    sexOptions.append(male, female);
  }

  function changeSex(sex: Sex) {
    if (config.sex === sex) return;
    config = {
      ...config,
      sex,
      hairStyle: hairBySex[sex][0].id,
      eyeStyle: eyesBySex[sex][0].id,
    };
    renderAll();
  }

  function renderDynamic() {
    dynamicOptions.replaceChildren();

    const bodySection = makeSection(`Tipo de corpo — ${config.sex === 'male' ? 'Masculino' : 'Feminino'}`);
    const bodyGrid = document.createElement('div');
    bodyGrid.className = 'body-grid';
    for (const body of bodyTypes) {
      const card = optionButton(body.label, config.bodyType === body.id, () => {
        config.bodyType = body.id;
        renderAll();
      });
      card.classList.add('body-card');
      const silhouette = document.createElement('span');
      silhouette.className = 'body-silhouette';
      silhouette.style.setProperty('--body-width', String(body.width));
      card.prepend(silhouette);
      bodyGrid.appendChild(card);
    }
    bodySection.appendChild(bodyGrid);

    const skinSection = makeSection('Cor da pele');
    const skinPalette = document.createElement('div');
    skinPalette.className = 'color-palette';
    skinColors.forEach((color) => skinPalette.appendChild(colorButton(color, config.skinColor === color, () => {
      config.skinColor = color;
      renderAll();
    })));
    skinSection.appendChild(skinPalette);

    const hairSection = makeSection(`Cabelo — 5 opções ${config.sex === 'male' ? 'masculinas' : 'femininas'}`);
    const hairGrid = document.createElement('div');
    hairGrid.className = 'visual-option-grid';
    for (const hair of hairBySex[config.sex]) {
      const card = optionButton(hair.label, config.hairStyle === hair.id, () => {
        config.hairStyle = hair.id;
        renderAll();
      });
      card.classList.add('visual-card');
      card.prepend(createHairThumb(config.sex, hair.id));
      hairGrid.appendChild(card);
    }
    hairSection.appendChild(hairGrid);
    const hairColorTitle = document.createElement('h4');
    hairColorTitle.textContent = 'Cor do cabelo';
    hairSection.appendChild(hairColorTitle);
    const hairPalette = document.createElement('div');
    hairPalette.className = 'color-palette';
    hairColors.forEach((color) => hairPalette.appendChild(colorButton(color, config.hairColor === color, () => {
      config.hairColor = color;
      renderAll();
    })));
    hairSection.appendChild(hairPalette);

    const eyeSection = makeSection(`Olhos — 5 opções ${config.sex === 'male' ? 'masculinas' : 'femininas'}`);
    const eyeGrid = document.createElement('div');
    eyeGrid.className = 'visual-option-grid';
    for (const eye of eyesBySex[config.sex]) {
      const card = optionButton(eye.label, config.eyeStyle === eye.id, () => {
        config.eyeStyle = eye.id;
        renderAll();
      });
      card.classList.add('visual-card');
      card.prepend(createEyeThumb(config.sex, eye.id));
      eyeGrid.appendChild(card);
    }
    eyeSection.appendChild(eyeGrid);
    const eyeColorTitle = document.createElement('h4');
    eyeColorTitle.textContent = 'Cor dos olhos';
    eyeSection.appendChild(eyeColorTitle);
    const eyePalette = document.createElement('div');
    eyePalette.className = 'color-palette';
    eyeColors.forEach((color) => eyePalette.appendChild(colorButton(color, config.eyeColor === color, () => {
      config.eyeColor = color;
      renderAll();
    })));
    eyeSection.appendChild(eyePalette);

    dynamicOptions.append(bodySection, skinSection, hairSection, eyeSection);
  }

  function renderAll() {
    renderSexOptions();
    renderDynamic();
    updateSummary();
    void refreshPreview();
  }

  nameInput.addEventListener('input', () => {
    config.name = nameInput.value.trimStart().slice(0, 16);
    updateSummary();
  });

  root.querySelector<HTMLButtonElement>('#rotate-left')!.addEventListener('click', () => {
    facingIndex = (facingIndex + facings.length - 1) % facings.length;
    previewCharacter?.setFacing(facings[facingIndex]);
    facingLabel.textContent = ['Costas', 'Esquerda', 'Frente', 'Direita'][facingIndex];
  });
  root.querySelector<HTMLButtonElement>('#rotate-right')!.addEventListener('click', () => {
    facingIndex = (facingIndex + 1) % facings.length;
    previewCharacter?.setFacing(facings[facingIndex]);
    facingLabel.textContent = ['Costas', 'Esquerda', 'Frente', 'Direita'][facingIndex];
  });

  previewApp.ticker.add((ticker) => previewCharacter?.update(false, ticker.deltaTime));
  renderAll();

  return await new Promise<CharacterConfig>((resolve) => {
    root.querySelector<HTMLButtonElement>('#confirm-character')!.addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (name.length < 2) {
        errorBox.textContent = 'Digite um nome com pelo menos 2 caracteres.';
        nameInput.focus();
        return;
      }
      config.name = name.slice(0, 16);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      previewApp.destroy(true, { children: true, texture: false });
      root.remove();
      resolve({ ...config });
    });
  });
}
