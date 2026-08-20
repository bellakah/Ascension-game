import { Assets, Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';

const IDLE_SHEET = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAAAgCAMAAADt/IAXAAAAAXNSR0IArs4c6QAAADBQTFRFAAAAAAAAAQACEyYyWHw9LUdKXXpHgbA8ruI4yfJSAAAAAAAAAAAAAAAAAAAAAAAA6U446QAAABB0Uk5TAP///////////////////8BQi0MAAAJqSURBVFiF7VbRjtxACDsXsJn//+EKkms3CclKlU730JuH3Qc8YMAw+fj4Of/PAYBvjU9lPjLA11KEB3M9RAClpa/jgAj3fIgAkVpL/EcKb6+BdElr3ZUBQd4D3vlH+DuEU7n2CDcMqwkN+HUxSs/+QfINQlKulBCzL2yxOQLgcjzpFKHq3n2hiuFSQAyMVBF6ACAoIlY3aOYfJD3zniFdQMg1V6AlYJ1IDAyLgSTPddPCBpR1pgBGRMCl5cuHhYBgMLoMrFEYPHQPl2fYHKFbqMyRYM8AKbosRwIkWXWWbMVVhR0g0yHZDQFX0iSNBMGurWiEYZiYHZAMgTaosFqYgU405gTkqFEapYhwRfkGMKqwVRYytXlUoUtWG90yB4KVQPSv5JcM+3oRiCIwlKgl+MnQxgy7QiYtrLh0uVOvCpddV4KIqn6HB2wsQAPYkBHQGUqJhDAE4Kafssa1R/sQBMxiSnCbgZ1h2HVQC9Atyq7RucvlnzKv8LizFwej0XTVWBOsKSwFmOy8CVADorDKHWY0P7qo+yVwrxQMPKfwSUCttND54QBpG8AUJQXjocswmpFhnb2ZjHoF9P06VvbKoJ7+F7v3hAdrTFttPBBE+1Zvgg2wDghQTZC2VYhadhA66j69RBSmcC7Ti9IrfngTkFcpfNlxFVVVpWghRe+j45OMMNNOsN0oz3bqbwK1b+2QQPSCqptZiUhp5x6lWgZaHnHdJGBm2zfA5eWt9bTbc9V/Eiezb/7bHJ5xmoRNuR1gfkuwT3A/aRfIp/QttgfxMgV//DvHMXnFTYYD4o356bvzuz/Nf87PGc5vuxsWEIZy2IsAAAAASUVORK5CYII=';
const ATTACK_SHEET = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAAAgCAMAAADt/IAXAAAAAXNSR0IArs4c6QAAADBQTFRFAAAAAAAAAQACAxUVExgrEyYyKTNGLUdTOVpQSGlIY445gbA8ruI45uqoAAAAAAAAZVlfsQAAABB0Uk5TAP///////////////////8BQi0MAAAJ3SURBVFiF7ZbdjpwwDIVxYyf+m/d/3cohsDA4mUpVtb3YXPLZx8cOkGzbz/qPFgB8b311X1r4W4Of8oHV3ecxf2JwiT/kA7t3B7OgYXAqAWu8gSwb7PVZfRoUAeKLGnuBaYWi7rxoEFyp98ikWUTUNza3lUGeGwRzKWHRZvlOQDGBCqmDMFjCoGBu0NwiP0aYcm8Q+UZ5/gbKPb9vRGqgArKFjVQBXAouCoA1bF2f6mTEUZ+dyTVrAZSHgEpqQGvZG0DkjEvt+jLR34DY1ZkMjbIIaNTM2bW6pAa5NnVxqc6WcWq7Phl5SSegymTwghdY0uJuUIqXicGDg9Xc4Jd+PmLWjmO9MgOsqjgEkhaDC/q0wEf9xj5w9JIKlLVB+8BP/ZLtYbyDcNRn/7UwWDARgNbOAphM4E0/NaAE8wmEQBk8E7jwMuGKC/14h0b9CkD+mCE0UjhWNgEmLSuOhz6FftoA1f4GveCVWATi0UDJDRJjOfjzM4BGTDTXByYhNYr3yKrpYxPjL1BPg+UpUK8c3/nQRy8GTv7Qj0OAiMZZqPFB31sERkG1akWLtzBYJtyKV1O5n0iAa/2ozxEQS+MsULarR0BRROx/OndpbvLOBengUeDGT3059d/y4x/DxBGmcZ5xPPiKgComlSoLSxcQufEQ6DyWRIE7P/WFMdOPk1Y5ziLtyD2sXE5VcFNhDOPUT3Rudy6qwsQy475zVW2S6MdljmMDurmI830zIOM1pnznEI8HF3ryDaCd+Zjo7/fJUX8E0v3mdHLEneOV77+ng8uDX/Ux1d93ipX3H93zM+xcBpcPfJ4vi/yvWzVMrtf/mv+sb1q/AfVwKFyXl+HSAAAAAElFTkSuQmCC';
const DEATH_SHEET = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAAAgCAMAAADt/IAXAAAAAXNSR0IArs4c6QAAADBQTFRFAAAAAAAAAQACBAwNCw8VExcYExgrEyYyWHw9KTNGLUdTOVpQSGlIY445gbA8ruI4VfVH8wAAABB0Uk5TAP///////////////////8BQi0MAAARySURBVFiFzZeNjuM2DISPlSySmqH4/m9bUM5u4vxcW7SHqxFgk6Wd+TgiJebHj//TJSK/Vz8yfyeCBIBC+AzxS/EkMAQRmZkfdCQ+Rf4LfYSKAhvgvY4YLdvPHPpXAIaSj0wk3hKIeVeunzj01yIn+7sMJG76WJqCNxJiJg0nwEeCUvhskeRZYu+eFwCBkl89u77eIYRPrwVi+vpAIJlLPi9hrrDMVa/nG0o/gRw50JfKO4AJWqwZeO/QVghbmfGeQJZhZ5B4zUAUkRjRl6ArxnohnIw1k6mm2Xq2d/rLCMvIOF4JRGgO5mIkX9qp9AMqIRBtiuMVAEz28BR0jvYS3x6Zk2mRbPaSIWbEEUzS1nixULT0teRFmiJe9NUipkSnuIz56tDN4cVUX0P8KiCiXIsalmxuIvMprij9XvIio5bjJYFFPwTiIl3nC2Dln8G+aK1Hl2sVy3CGceq0NVubIvOagSAAnSInwSuAwOhfgMc7wI4IzrY0Wp8iekEU0kpfG02lS2N70gcBhUiHDBHVuCrINMDvgM5nQKfZ9KNZt9ZU2S+PO0jCe5P6kqbz6XmBuinQRZcMSFdcikRmESqadN9r5LwWWRlE+BA5hoscT4ACd8K9i+yNfEyudgWAQgPaI//oIV2rKeQhrk4FDhnRDq01wuMailaGri4yRmk4Lw4K4PRKsPUCaI71RFglGIERqR1RDjwqCKhTSW+WrbEAp60nwKk+W+uUdsgxsS5xm6qkSvejAPu8JHAC1DmI/Sa1X8vsBLQN6EJ2BZ8A3dWNvR3rELRDnxKoCjSbrS/KIW0M2BMBsG0/AbBGnQv3O46gT1o6ggPpXWHrXmeCoCvDvDG1Re8TWP3h+62eD1PNNbxLm3iyoDxHpR1h+0wqQ+QNoBUAlk573EqanYALnjbW0Rz2WIcyWauUAa5Q2xZeNvM9iGyNzBXY2zLyTlDxagNLMxYgfSJwj896eJpVvztjudOOe6+LV4KgwRjKFX7tM1HdFoTuobBWouoh43aui6rvnUKZuawORTgz7St+OujTMlYYGeHumfyaC0QniFnPrCDLCgX9i0AqdS2IrLE0IuP04DYYiatijLJ9A1qYraTaPT6cLI+8DlsLWtTH7GeWcvQJTqcXQrloUeHbCL7zDyh3K95cABbqk5z6NJ9UTyNgkYvG+I5P16k6RsWxh4YgV8yvXhQdrsdxqK/gmWDVC/HVq/soOjeCsxb2cHQO6Cegkd5pGGZ2AhJ8iLtRJzG1MvfKLWimvgtNag9A7cZQM6taWBlWTWNptxlxm1DWn39rKeK7TCpcx1kGHLXp1mvGvPWBdJBTcROnWVhEPb70BJylXccR5y7FusqLdPuuEjn1qxXr2gT3wUoE27Ta7iws167Er7ioe20MuSpOs7UzZN1RS9RmjZOsOOpGi7DqJmI9DE5yu84fJnH7dG+UfYw0Ed5+NzzGRWRXRlSrnjcsqxHyRBQt2aj/UY/bXG1VkfXux9P1rPw34/Lp+mnwV/3G+UfXn2hoSbpQDN/mAAAAAElFTkSuQmCC';

type SludgeAnimation = 'idle' | 'attack' | 'death';
type SludgeFrames = Record<SludgeAnimation, Texture[]>;
let framesPromise: Promise<SludgeFrames> | null = null;

async function sliceSheet(source: string) {
  const texture = await Assets.load<Texture>(source);
  texture.source.scaleMode = 'nearest';
  return Array.from({ length: 4 }, (_, frame) => new Texture({
    source: texture.source,
    frame: new Rectangle(frame * 32, 0, 32, 32),
  }));
}

export async function loadToxicSludgeFrames(): Promise<SludgeFrames> {
  if (!framesPromise) {
    framesPromise = Promise.all([sliceSheet(IDLE_SHEET), sliceSheet(ATTACK_SHEET), sliceSheet(DEATH_SHEET)])
      .then(([idle, attack, death]) => ({ idle, attack, death }));
  }
  return framesPromise;
}

export class ToxicSludgeView {
  readonly view = new Container();
  private readonly sprite: Sprite;
  private readonly frames: SludgeFrames;
  private animation: SludgeAnimation = 'idle';
  private frame = 0;
  private clock = 0;
  private attackClock = 0;

  static async create(name: string) {
    return new ToxicSludgeView(name, await loadToxicSludgeFrames());
  }

  private constructor(name: string, frames: SludgeFrames) {
    this.frames = frames;
    const shadow = new Graphics().ellipse(0, 10, 28, 9).fill({ color: 0, alpha: .22 });
    this.sprite = new Sprite(frames.idle[0]);
    this.sprite.anchor.set(.5, 1);
    this.sprite.scale.set(2.25);
    this.sprite.y = 15;
    const label = new Text({ text: name, style: { fill: 0xd9ff9f, fontSize: 13, fontWeight: 'bold', stroke: { color: 0, width: 4 } } });
    label.anchor.set(.5);
    label.y = -57;
    this.view.addChild(shadow, this.sprite, label);
  }

  setFacingLeft(left: boolean) {
    this.sprite.scale.x = Math.abs(this.sprite.scale.x) * (left ? -1 : 1);
  }

  attack() {
    if (this.animation === 'death') return;
    this.animation = 'attack';
    this.frame = 0;
    this.clock = 0;
    this.attackClock = 26;
    this.sprite.texture = this.frames.attack[0];
  }

  die() {
    this.animation = 'death';
    this.frame = 0;
    this.clock = 0;
    this.attackClock = 0;
    this.sprite.texture = this.frames.death[0];
  }

  reset() {
    this.animation = 'idle';
    this.frame = 0;
    this.clock = 0;
    this.attackClock = 0;
    this.sprite.texture = this.frames.idle[0];
  }

  update(dt: number) {
    this.clock += dt;
    if (this.attackClock > 0) {
      this.attackClock = Math.max(0, this.attackClock - dt);
      if (this.attackClock === 0 && this.animation === 'attack') {
        this.animation = 'idle';
        this.frame = 0;
        this.clock = 0;
      }
    }
    const speed = this.animation === 'death' ? 5 : this.animation === 'attack' ? 4.5 : 8;
    if (this.clock >= speed) {
      this.clock = 0;
      const frames = this.frames[this.animation];
      if (this.animation === 'death') this.frame = Math.min(frames.length - 1, this.frame + 1);
      else this.frame = (this.frame + 1) % frames.length;
      this.sprite.texture = frames[this.frame];
    }
  }
}
