import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';

export type Facing = 'up' | 'left' | 'down' | 'right';
export type Sex = 'male' | 'female';
export type BodyType = 'light' | 'normal' | 'robust';
export type CharacterConfig = {
  name: string;
  sex: Sex;
  bodyType: BodyType;
  skinColor: number;
  hairStyle: string;
  hairColor: number;
  eyeStyle: string;
  eyeColor: number;
};

type Animation = 'idle' | 'walk' | 'slash';
type LayerName = 'body' | 'pants' | 'boots' | 'mail' | 'head' | 'eyes' | 'hair' | 'swordBg' | 'swordFg';

export const DEFAULT_CHARACTER: CharacterConfig = {
  name: 'Herói',
  sex: 'male',
  bodyType: 'normal',
  skinColor: 0xf3c39d,
  hairStyle: 'bedhead',
  hairColor: 0x30231f,
  eyeStyle: 'neutral',
  eyeColor: 0x6d93b8,
};

const LPC = 'https://raw.githubusercontent.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/master/spritesheets';
const row: Record<Facing, number> = { up: 0, left: 1, down: 2, right: 3 };
const bodyWidth: Record<BodyType, number> = { light: .88, normal: 1, robust: 1.1 };
const eyePalette = new Map<number, string>([
  [0x6d93b8, 'blue'],
  [0x5f8f63, 'green'],
  [0x8a653e, 'brown'],
  [0x5a4a73, 'purple'],
  [0x444444, 'gray'],
]);

function url(path: string) { return `${LPC}/${path}`; }

export class LpcCharacter {
  readonly view = new Container();
  facing: Facing = 'down';
  isAttacking = false;

  private layers = new Map<LayerName, Sprite>();
  private sheets = new Map<string, Texture>();
  private animation: Animation = 'idle';
  private frame = 0;
  private clock = 0;
  private readonly scale = 1.35;
  private readonly config: CharacterConfig;

  static async create(config: CharacterConfig = DEFAULT_CHARACTER) {
    const character = new LpcCharacter({ ...DEFAULT_CHARACTER, ...config });
    await character.load();
    character.render();
    return character;
  }

  private constructor(config: CharacterConfig) {
    this.config = config;
    this.view.sortableChildren = true;
    const order: Array<[LayerName, number]> = [
      ['swordBg', 5], ['body', 10], ['pants', 14], ['boots', 16],
      ['mail', 20], ['head', 30], ['eyes', 35], ['hair', 40], ['swordFg', 50],
    ];
    for (const [name, zIndex] of order) {
      const sprite = new Sprite();
      sprite.anchor.set(0.5, 1);
      sprite.zIndex = zIndex;
      this.layers.set(name, sprite);
      this.view.addChild(sprite);
    }
  }

  private eyeColorName() {
    return eyePalette.get(this.config.eyeColor) ?? 'blue';
  }

  private layerPath(name: Exclude<LayerName, 'swordBg' | 'swordFg'>, animation: Animation) {
    const sex = this.config.sex;
    switch (name) {
      case 'body': return url(`body/bodies/${sex}/${animation}.png`);
      case 'pants': return url(`legs/pants/${sex}/${animation}.png`);
      case 'boots': return url(`feet/boots/basic/${sex}/${animation}.png`);
      case 'mail': return url(`torso/chainmail/${sex}/${animation}.png`);
      case 'head': return url(`head/heads/human/${sex}/${animation}.png`);
      case 'eyes': return url(`eyes/human/adult/${this.config.eyeStyle}/${animation}/${this.eyeColorName()}.png`);
      case 'hair': return url(`hair/${this.config.hairStyle}/adult/${animation}.png`);
    }
  }

  private swordPath(animation: Animation, side: 'bg' | 'fg') {
    if (animation === 'slash') return url(`weapon/sword/arming/attack_slash/${side}/steel.png`);
    return url(`weapon/sword/arming/universal/${side}/${animation}/steel.png`);
  }

  private async tryLoad(key: string, assetUrl: string) {
    try {
      const texture = await Assets.load<Texture>(assetUrl);
      texture.source.scaleMode = 'nearest';
      this.sheets.set(key, texture);
    } catch (error) {
      console.warn(`[LPC] asset opcional ignorado: ${key}`, assetUrl, error);
    }
  }

  private async load() {
    const animations: Animation[] = ['idle', 'walk', 'slash'];
    const names: Array<Exclude<LayerName, 'swordBg' | 'swordFg'>> = ['body', 'pants', 'boots', 'mail', 'head', 'eyes', 'hair'];
    const jobs: Promise<void>[] = [];

    for (const animation of animations) {
      for (const name of names) jobs.push(this.tryLoad(`${name}:${animation}`, this.layerPath(name, animation)));
      for (const side of ['bg', 'fg'] as const) {
        const name: LayerName = side === 'bg' ? 'swordBg' : 'swordFg';
        jobs.push(this.tryLoad(`${name}:${animation}`, this.swordPath(animation, side)));
      }
    }

    await Promise.all(jobs);
    if (!this.sheets.has('body:idle')) throw new Error('Não foi possível carregar o corpo LPC básico.');
  }

  setFacing(facing: Facing) {
    this.facing = facing;
    this.render();
  }

  attack() {
    if (this.isAttacking) return false;
    this.isAttacking = true;
    this.animation = 'slash';
    this.frame = 0;
    this.clock = 0;
    this.render();
    return true;
  }

  update(moving: boolean, dt: number) {
    if (this.isAttacking) {
      this.clock += dt;
      if (this.clock >= 4.2) {
        this.clock = 0;
        this.frame += 1;
        if (this.frame >= this.frameCount('body', 'slash')) {
          this.isAttacking = false;
          this.animation = moving ? 'walk' : 'idle';
          this.frame = 0;
        }
        this.render();
      }
      return;
    }

    const next: Animation = moving ? 'walk' : 'idle';
    if (next !== this.animation) {
      this.animation = next;
      this.frame = 0;
      this.clock = 0;
    }

    this.clock += dt;
    const speed = moving ? 6 : 16;
    if (this.clock >= speed) {
      this.clock = 0;
      this.frame = (this.frame + 1) % this.frameCount('body', this.animation);
    }
    this.render();
  }

  private frameCount(layer: LayerName, animation: Animation) {
    const sheet = this.sheets.get(`${layer}:${animation}`) ?? this.sheets.get(`${layer}:idle`);
    if (!sheet) return 1;
    const size = sheet.height / 4;
    return Math.max(1, Math.floor(sheet.width / size));
  }

  private crop(sheet: Texture, frame: number) {
    const size = sheet.height / 4;
    const count = Math.max(1, Math.floor(sheet.width / size));
    const safeFrame = Math.min(frame, count - 1);
    return new Texture({
      source: sheet.source,
      frame: new Rectangle(safeFrame * size, row[this.facing] * size, size, size),
    });
  }

  private tintFor(name: LayerName) {
    if (name === 'body' || name === 'head') return this.config.skinColor;
    if (name === 'hair') return this.config.hairColor;
    return 0xffffff;
  }

  private render() {
    for (const [name, sprite] of this.layers) {
      const exact = this.sheets.get(`${name}:${this.animation}`);
      const fallback = this.sheets.get(`${name}:idle`);
      const sheet = exact ?? fallback;
      if (!sheet) {
        sprite.visible = false;
        continue;
      }

      sprite.visible = true;
      const usingAttackFrame = this.animation === 'slash' && Boolean(exact);
      sprite.anchor.set(0.5, usingAttackFrame ? 2 / 3 : 1);
      sprite.scale.set(this.scale * bodyWidth[this.config.bodyType], this.scale);
      sprite.tint = this.tintFor(name);
      sprite.texture = this.crop(sheet, exact ? this.frame : 0);
      sprite.texture.source.scaleMode = 'nearest';
    }
  }
}
