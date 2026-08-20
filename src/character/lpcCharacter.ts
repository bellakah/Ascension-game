import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';

export type Facing = 'up' | 'left' | 'down' | 'right';
type Animation = 'idle' | 'walk' | 'slash';
type LayerName = 'body' | 'pants' | 'boots' | 'mail' | 'head' | 'hair' | 'swordBg' | 'swordFg';

const LPC = 'https://raw.githubusercontent.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/master/spritesheets';
const row: Record<Facing, number> = { up: 0, left: 1, down: 2, right: 3 };

function url(path: string) { return `${LPC}/${path}`; }

const basePaths: Record<Exclude<LayerName, 'swordBg' | 'swordFg'>, (animation: Animation) => string> = {
  body: (a) => url(`body/bodies/male/${a}.png`),
  pants: (a) => url(`legs/pants/male/${a}.png`),
  boots: (a) => url(`feet/boots/basic/male/${a}.png`),
  mail: (a) => url(`torso/chainmail/male/${a}.png`),
  head: (a) => url(`head/heads/human/male/${a}.png`),
  hair: (a) => url(`hair/bedhead/adult/${a}.png`),
};

function swordPath(animation: Animation, side: 'bg' | 'fg') {
  if (animation === 'slash') {
    return url(`weapon/sword/arming/attack_slash/${side}/steel.png`);
  }
  return url(`weapon/sword/arming/universal/${side}/${animation}/steel.png`);
}

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

  static async create() {
    const character = new LpcCharacter();
    await character.load();
    character.render();
    return character;
  }

  private constructor() {
    this.view.sortableChildren = true;
    const order: Array<[LayerName, number]> = [
      ['swordBg', 5], ['body', 10], ['pants', 14], ['boots', 16],
      ['mail', 20], ['head', 30], ['hair', 40], ['swordFg', 50],
    ];
    for (const [name, zIndex] of order) {
      const sprite = new Sprite();
      sprite.anchor.set(0.5, 1);
      sprite.scale.set(this.scale);
      sprite.zIndex = zIndex;
      this.layers.set(name, sprite);
      this.view.addChild(sprite);
    }
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
    const jobs: Promise<void>[] = [];

    for (const animation of animations) {
      for (const [name, makePath] of Object.entries(basePaths) as Array<[Exclude<LayerName, 'swordBg' | 'swordFg'>, (a: Animation) => string]>) {
        jobs.push(this.tryLoad(`${name}:${animation}`, makePath(animation)));
      }

      for (const side of ['bg', 'fg'] as const) {
        const name: LayerName = side === 'bg' ? 'swordBg' : 'swordFg';
        jobs.push(this.tryLoad(`${name}:${animation}`, swordPath(animation, side)));
      }
    }

    await Promise.all(jobs);

    if (!this.sheets.has('body:idle')) {
      throw new Error('Não foi possível carregar o corpo LPC básico (body:idle).');
    }
  }

  setFacing(facing: Facing) {
    this.facing = facing;
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

      // LPC usa células ampliadas no ataque (normalmente 192x192) para dar espaço
      // ao arco da arma. Os pés do personagem continuam na linha de 128 px,
      // portanto ancorar o frame inteiro no rodapé (y=1) deslocava a espada/corpo.
      // 128/192 = 2/3 mantém todas as camadas do slash alinhadas ao ponto do jogador.
      sprite.anchor.set(0.5, usingAttackFrame ? 2 / 3 : 1);
      sprite.texture = this.crop(sheet, exact ? this.frame : 0);
      sprite.texture.source.scaleMode = 'nearest';
    }
  }
}
