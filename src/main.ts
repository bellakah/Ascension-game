import { Application, Container, Graphics, Text } from 'pixi.js';
import './style.css';

const app = new Application();
await app.init({ resizeTo: window, background: '#17252c', antialias: true });
document.querySelector<HTMLDivElement>('#app')!.appendChild(app.canvas);

const world = new Container();
app.stage.addChild(world);

const WORLD_W = 2400;
const WORLD_H = 1800;

const ground = new Graphics().rect(0, 0, WORLD_W, WORLD_H).fill('#4f7f45');
world.addChild(ground);

const grid = new Graphics();
for (let x = 0; x <= WORLD_W; x += 128) grid.moveTo(x, 0).lineTo(x, WORLD_H);
for (let y = 0; y <= WORLD_H; y += 128) grid.moveTo(0, y).lineTo(WORLD_W, y);
grid.stroke({ width: 1, color: '#315b35', alpha: 0.35 });
world.addChild(grid);

for (let i = 0; i < 28; i++) {
  const tree = new Container();
  const crown = new Graphics().circle(0, -25, 34).fill('#275b35');
  const trunk = new Graphics().rect(-7, 0, 14, 32).fill('#6b4c2e');
  tree.addChild(trunk, crown);
  tree.position.set(120 + ((i * 233) % 2150), 130 + ((i * 317) % 1500));
  world.addChild(tree);
}

const player = new Container();
const shadow = new Graphics().ellipse(0, 25, 24, 10).fill({ color: '#000000', alpha: 0.25 });
const body = new Graphics().roundRect(-18, -28, 36, 52, 10).fill('#d8b45c').stroke({ width: 3, color: '#f4e2a1' });
const head = new Graphics().circle(0, -38, 15).fill('#e3b98c');
player.addChild(shadow, body, head);
player.position.set(WORLD_W / 2, WORLD_H / 2);
world.addChild(player);

const label = new Text({ text: 'Herói', style: { fill: '#ffffff', fontSize: 14, fontWeight: 'bold', stroke: { color: '#000000', width: 4 } } });
label.anchor.set(0.5);
label.position.set(0, -70);
player.addChild(label);

const hud = document.createElement('div');
hud.id = 'hud';
hud.innerHTML = '<div class="title">ASCENSION • Protótipo 0.1</div><div class="hint">Use WASD/setas ou o analógico.</div><div id="stick"><div id="knob"></div></div>';
document.body.appendChild(hud);

const keys = new Set<string>();
window.addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

let stickX = 0;
let stickY = 0;
const stick = document.querySelector<HTMLDivElement>('#stick')!;
const knob = document.querySelector<HTMLDivElement>('#knob')!;

function updateStick(clientX: number, clientY: number) {
  const r = stick.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  let dx = clientX - cx;
  let dy = clientY - cy;
  const max = 42;
  const len = Math.hypot(dx, dy);
  if (len > max) { dx = dx / len * max; dy = dy / len * max; }
  stickX = dx / max;
  stickY = dy / max;
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
}

function resetStick() {
  stickX = 0; stickY = 0;
  knob.style.transform = 'translate(0, 0)';
}

stick.addEventListener('pointerdown', (e) => { stick.setPointerCapture(e.pointerId); updateStick(e.clientX, e.clientY); });
stick.addEventListener('pointermove', (e) => { if (stick.hasPointerCapture(e.pointerId)) updateStick(e.clientX, e.clientY); });
stick.addEventListener('pointerup', resetStick);
stick.addEventListener('pointercancel', resetStick);

app.ticker.add((ticker) => {
  let dx = stickX;
  let dy = stickY;
  if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
  if (keys.has('d') || keys.has('arrowright')) dx += 1;
  if (keys.has('w') || keys.has('arrowup')) dy -= 1;
  if (keys.has('s') || keys.has('arrowdown')) dy += 1;

  const len = Math.hypot(dx, dy);
  if (len > 0) {
    dx /= Math.max(1, len); dy /= Math.max(1, len);
    const speed = 4.2 * ticker.deltaTime;
    player.x = Math.max(30, Math.min(WORLD_W - 30, player.x + dx * speed));
    player.y = Math.max(70, Math.min(WORLD_H - 30, player.y + dy * speed));
  }

  world.x = app.screen.width / 2 - player.x;
  world.y = app.screen.height / 2 - player.y;
});
