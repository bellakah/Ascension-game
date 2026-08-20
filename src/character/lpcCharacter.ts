import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';

export type Facing = 'up' | 'left' | 'down' | 'right';
type Animation = 'idle' | 'walk' | 'halfslash';
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
  if (animation === 'halfslash') {
    return url(`weapon/sword/arming/attack_halfslash/${side}/steel.png`);
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

  private async load() {
    const animations: Animation[] = ['idle', 'walk', 'halfslash'];
    const jobs: Promise<void>[] = [];
    for (const animation of animations) {
      for (const [name, makePath] of Object.entries(basePaths) as Array<[Exclude<LayerName, 'swordBg' | 'swordFg'>, (a: Animation) => string]>) {
        const key = `${name}:${animation}`;
        jobs.push(Assets.load<Texture>(makePath(animation)).then((texture) => {
          texture.source.scaleMode = 'nearest';
          this.sheets.set(key, texture);
        }));
      }
      for (const side of ['bg', 'fg'] as const) {
        const name: LayerName = side === 'bg' ? 'swordBg' : 'swordFg';
        const key = `${name}:${animation}`;
        jobs.push(Assets.load<Texture>(swordPath(animation, side)).then((texture) => {
          texture.source.scaleMode = 'nearest';
          this.sheets.set(key, texture);
        }));
      }
    }
    await Promise.all(jobs);
  }

  setFacing(facing: Facing) {
    this.facing = facing;
  }

  attack() {
    if (this.isAttacking) return false;
    this.isAttacking = true;
    this.animation = 'halfslash';
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
        if (this.frame >= this.frameCount('body', 'halfslash')) {
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
      this.render();
    } else {
      this.render();
    }
  }

  private frameCount(layer: LayerName, animation: Animation) {
    const sheet = this.sheets.get(`${layer}:${animation}`);
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
      const sheet = this.sheets.get(`${name}:${this.animation}`);
      if (!sheet) {
        sprite.visible = false;
        continue;
      }
      sprite.visible = true;
      sprite.texture = this.crop(sheet, this.frame);
      sprite.texture.source.scaleMode = 'nearest';
    }
  }
}
