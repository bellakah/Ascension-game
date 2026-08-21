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

export type CharacterEquipmentVisuals = {
  weapon?: string | null;
  armor?: string | null;
  boots?: string | null;
  head?: string | null;
  legs?: string | null;
  accessory1?: string | null;
  accessory2?: string | null;
};

type Animation = 'idle' | 'walk' | 'slash' | 'spellcast' | 'emote';
type LayerName = 'body' | 'pants' | 'boots' | 'mail' | 'head' | 'eyes' | 'hair' | 'hood' | 'weaponBg' | 'weaponFg';

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

function normalizeEquipment(value: CharacterEquipmentVisuals = {}): Required<CharacterEquipmentVisuals> {
  return {
    weapon: value.weapon ?? null,
    armor: value.armor ?? null,
    boots: value.boots ?? null,
    head: value.head ?? null,
    legs: value.legs ?? null,
    accessory1: value.accessory1 ?? null,
    accessory2: value.accessory2 ?? null,
  };
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
  private readonly config: CharacterConfig;
  private equipment: Required<CharacterEquipmentVisuals>;

  static async create(config: CharacterConfig = DEFAULT_CHARACTER, equipment: CharacterEquipmentVisuals = {}) {
    const character = new LpcCharacter({ ...DEFAULT_CHARACTER, ...config }, equipment);
    await character.load();
    character.render();
    return character;
  }

  private constructor(config: CharacterConfig, equipment: CharacterEquipmentVisuals) {
    this.config = config;
    this.equipment = normalizeEquipment(equipment);
    this.view.sortableChildren = true;
    const order: Array<[LayerName, number]> = [
      ['weaponBg', 5], ['body', 10], ['pants', 14], ['boots', 16],
      ['mail', 20], ['head', 30], ['eyes', 35], ['hair', 40], ['hood', 46], ['weaponFg', 50],
    ];
    for (const [name, zIndex] of order) {
      const sprite = new Sprite();
      sprite.anchor.set(0.5, 1);
      sprite.zIndex = zIndex;
      this.layers.set(name, sprite);
      this.view.addChild(sprite);
    }
  }

  private eyeColorName() { return eyePalette.get(this.config.eyeColor) ?? 'blue'; }

  private baseLayerPath(name: 'body' | 'pants' | 'boots' | 'head' | 'eyes' | 'hair', animation: Animation) {
    const sex = this.config.sex;
    switch (name) {
      case 'body': return url(`body/bodies/${sex}/${animation}.png`);
      case 'pants': return url(`legs/pants/${sex}/${animation}.png`);
      case 'boots': return url(`feet/boots/basic/${sex}/${animation}.png`);
      case 'head': return url(`head/heads/human/${sex}/${animation}.png`);
      case 'eyes': return url(`eyes/human/adult/${this.config.eyeStyle}/${animation}/${this.eyeColorName()}.png`);
      case 'hair': return url(`hair/${this.config.hairStyle}/adult/${animation}.png`);
    }
  }

  private armorPath(animation: Animation) {
    if (!this.equipment.armor) return null;
    if (this.equipment.armor === 'hunter_armor') return url(`torso/armour/leather/${this.config.sex}/${animation}.png`);
    return url(`torso/chainmail/${this.config.sex}/${animation}.png`);
  }

  private hoodPath(animation: Animation) {
    if (this.equipment.head !== 'wolf_hood') return null;
    return url(`hat/cloth/hood/adult/${animation}.png`);
  }

  private isStaff() {
    return this.equipment.weapon === 'apprentice_staff' || this.equipment.weapon === 'oak_arcane_staff';
  }

  private swordMaterial() {
    if (this.equipment.weapon === 'basic_sword') return 'bronze';
    if (this.equipment.weapon === 'iron_sword') return 'iron';
    if (this.equipment.weapon === 'shadow_fang_blade') return 'silver';
    if (this.isStaff()) return null;
    return this.equipment.weapon ? 'steel' : null;
  }

  private weaponPath(animation: Animation, side: 'bg' | 'fg') {
    if (this.isStaff()) {
      const staffAnimation = animation === 'idle' ? 'walk' : animation === 'slash' ? 'spellcast' : animation;
      if (staffAnimation !== 'walk' && staffAnimation !== 'spellcast') return null;
      const layer = side === 'bg' ? 'background' : 'foreground';
      return url(`weapon/magic/simple/${layer}/${staffAnimation}/simple.png`);
    }
    const material = this.swordMaterial();
    if (!material) return null;
    if (animation === 'spellcast' || animation === 'emote') return null;
    if (animation === 'slash') return url(`weapon/sword/arming/attack_slash/${side}/${material}.png`);
    return url(`weapon/sword/arming/universal/${side}/${animation}/${material}.png`);
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

  private animations(): Animation[] { return ['idle', 'walk', 'slash', 'spellcast', 'emote']; }

  private async loadBaseSheets() {
    const names: Array<'body' | 'pants' | 'boots' | 'head' | 'eyes' | 'hair'> = ['body', 'pants', 'boots', 'head', 'eyes', 'hair'];
    const jobs: Promise<void>[] = [];
    for (const animation of this.animations()) {
      for (const name of names) jobs.push(this.tryLoad(`${name}:${animation}`, this.baseLayerPath(name, animation)));
    }
    await Promise.all(jobs);
  }

  private async loadEquipmentSheets() {
    for (const animation of this.animations()) {
      this.sheets.delete(`mail:${animation}`);
      this.sheets.delete(`hood:${animation}`);
      this.sheets.delete(`weaponBg:${animation}`);
      this.sheets.delete(`weaponFg:${animation}`);
    }
    const jobs: Promise<void>[] = [];
    for (const animation of this.animations()) {
      const armor = this.armorPath(animation);
      const hood = this.hoodPath(animation);
      if (armor) jobs.push(this.tryLoad(`mail:${animation}`, armor));
      if (hood) jobs.push(this.tryLoad(`hood:${animation}`, hood));
      for (const side of ['bg', 'fg'] as const) {
        const weapon = this.weaponPath(animation, side);
        if (!weapon) continue;
        const name: LayerName = side === 'bg' ? 'weaponBg' : 'weaponFg';
        jobs.push(this.tryLoad(`${name}:${animation}`, weapon));
      }
    }
    await Promise.all(jobs);
  }

  private async load() {
    await Promise.all([this.loadBaseSheets(), this.loadEquipmentSheets()]);
    if (!this.sheets.has('body:idle')) throw new Error('Não foi possível carregar o corpo LPC básico.');
  }

  async setEquipment(equipment: CharacterEquipmentVisuals) {
    const next = normalizeEquipment(equipment);
    if (JSON.stringify(next) === JSON.stringify(this.equipment)) return;
    this.equipment = next;
    await this.loadEquipmentSheets();
    this.render();
  }

  setFacing(facing: Facing) { this.facing = facing; this.render(); }

  private startAction(animation: 'slash' | 'spellcast' | 'emote') {
    if (this.isAttacking) return false;
    this.isAttacking = true;
    this.animation = animation;
    this.frame = 0;
    this.clock = 0;
    this.render();
    return true;
  }

  attack() { return this.startAction('slash'); }
  cast() { return this.startAction('spellcast'); }
  emote() { return this.startAction('emote'); }

  update(moving: boolean, dt: number) {
    if (this.isAttacking) {
      this.clock += dt;
      const actionSpeed = this.animation === 'spellcast' ? 5.2 : this.animation === 'emote' ? 6.2 : 4.2;
      if (this.clock >= actionSpeed) {
        this.clock = 0;
        this.frame += 1;
        if (this.frame >= this.frameCount('body', this.animation)) {
          this.isAttacking = false;
          this.animation = moving ? 'walk' : 'idle';
          this.frame = 0;
        }
        this.render();
      }
      return;
    }

    const next: Animation = moving ? 'walk' : 'idle';
    if (next !== this.animation) { this.animation = next; this.frame = 0; this.clock = 0; }
    this.clock += dt;
    const speed = moving ? 6 : 16;
    if (this.clock >= speed) { this.clock = 0; this.frame = (this.frame + 1) % this.frameCount('body', this.animation); }
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
    return new Texture({ source: sheet.source, frame: new Rectangle(safeFrame * size, row[this.facing] * size, size, size) });
  }

  private tintFor(name: LayerName) {
    if (name === 'body' || name === 'head') return this.config.skinColor;
    if (name === 'hair') return this.config.hairColor;
    if (name === 'pants') return this.equipment.legs === 'ranger_legs' ? 0x88906a : 0x806653;
    if (name === 'boots') return this.equipment.boots === 'forest_boots' ? 0x68825d : 0x9a7658;
    if (name === 'hood') return 0x74594d;
    return 0xffffff;
  }

  private shouldShow(name: LayerName) {
    if (name === 'mail') return Boolean(this.equipment.armor);
    if (name === 'hood') return Boolean(this.equipment.head && (this.sheets.has(`hood:${this.animation}`) || this.sheets.has('hood:idle')));
    if (name === 'boots') return Boolean(this.equipment.boots);
    if (name === 'weaponBg' || name === 'weaponFg') return Boolean(this.equipment.weapon);
    return true;
  }

  private render() {
    for (const [name, sprite] of this.layers) {
      if (!this.shouldShow(name)) { sprite.visible = false; continue; }
      const exact = this.sheets.get(`${name}:${this.animation}`);
      const fallback = this.sheets.get(`${name}:idle`);
      const sheet = exact ?? fallback;
      if (!sheet) { sprite.visible = false; continue; }
      sprite.visible = true;
      const usingSlashFrame = this.animation === 'slash' && Boolean(exact);
      sprite.anchor.set(0.5, usingSlashFrame ? 2 / 3 : 1);
      sprite.scale.set(this.scale * bodyWidth[this.config.bodyType], this.scale);
      sprite.tint = this.tintFor(name);
      sprite.texture = this.crop(sheet, exact ? this.frame : 0);
      sprite.texture.source.scaleMode = 'nearest';
    }
  }
}
