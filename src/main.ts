import { Application, Container, Graphics, Text } from 'pixi.js';
import './style.css';

const bootStatus = document.querySelector<HTMLDivElement>('#boot-status');

function setBootMessage(message: string) {
  if (bootStatus) bootStatus.textContent = message;
}

async function startGame() {
  try {
    setBootMessage('Carregando Floresta Inicial...');

    const app = new Application();
    await app.init({
      resizeTo: window,
      backgroundColor: 0x14231d,
      antialias: true,
      preference: 'webgl',
    });

    const mount = document.querySelector<HTMLDivElement>('#app');
    if (!mount) throw new Error('Elemento #app não encontrado.');
    mount.appendChild(app.canvas);

    const world = new Container();
    app.stage.addChild(world);

    const WORLD_W = 2200;
    const WORLD_H = 1600;
    const PLAYER_RADIUS = 22;

    const ground = new Graphics().rect(0, 0, WORLD_W, WORLD_H).fill(0x527b45);
    world.addChild(ground);

    const path = new Graphics()
      .roundRect(760, 0, 420, WORLD_H, 100)
      .fill({ color: 0xa58458, alpha: 0.88 });
    world.addChild(path);

    for (let i = 0; i < 80; i++) {
      const flower = new Graphics().circle(0, 0, 3).fill(i % 2 ? 0xf4d35e : 0xd983a6);
      flower.position.set(80 + ((i * 149) % 2040), 70 + ((i * 227) % 1460));
      world.addChild(flower);
    }

    type Obstacle = { x: number; y: number; radius: number };
    const obstacles: Obstacle[] = [];

    function addTree(x: number, y: number, scale = 1) {
      const tree = new Container();
      const shadow = new Graphics().ellipse(0, 26, 32 * scale, 13 * scale).fill({ color: 0x000000, alpha: 0.18 });
      const trunk = new Graphics().roundRect(-9 * scale, -6 * scale, 18 * scale, 48 * scale, 5).fill(0x765034);
      const crownBack = new Graphics().circle(-17 * scale, -28 * scale, 30 * scale).fill(0x245638);
      const crownFront = new Graphics().circle(15 * scale, -34 * scale, 34 * scale).fill(0x317044);
      const crownTop = new Graphics().circle(0, -58 * scale, 33 * scale).fill(0x3d8150);
      tree.addChild(shadow, trunk, crownBack, crownFront, crownTop);
      tree.position.set(x, y);
      world.addChild(tree);
      obstacles.push({ x, y: y + 12, radius: 25 * scale });
    }

    const treePositions = [
      [220, 240], [420, 410], [610, 220], [300, 720], [590, 880], [250, 1180], [540, 1390],
      [1400, 220], [1640, 390], [1900, 250], [1470, 760], [1840, 840], [1430, 1200], [1740, 1370],
      [1060, 280], [900, 1250], [1180, 1380], [710, 570], [1310, 540],
    ];
    treePositions.forEach(([x, y], index) => addTree(x, y, index % 3 === 0 ? 1.15 : 1));

    const npc = new Container();
    const npcShadow = new Graphics().ellipse(0, 22, 22, 9).fill({ color: 0x000000, alpha: 0.22 });
    const npcBody = new Graphics().roundRect(-18, -28, 36, 50, 9).fill(0x4f78b8).stroke({ width: 3, color: 0xbfd8ff });
    const npcHead = new Graphics().circle(0, -39, 14).fill(0xe4b991);
    const npcMark = new Text({ text: '!', style: { fill: 0xffdd57, fontSize: 32, fontWeight: 'bold', stroke: { color: 0x000000, width: 5 } } });
    npcMark.anchor.set(0.5);
    npcMark.position.set(0, -82);
    const npcName = new Text({ text: 'Elandra', style: { fill: 0xffffff, fontSize: 14, fontWeight: 'bold', stroke: { color: 0x000000, width: 4 } } });
    npcName.anchor.set(0.5);
    npcName.position.set(0, -62);
    npc.addChild(npcShadow, npcBody, npcHead, npcMark, npcName);
    npc.position.set(970, 520);
    world.addChild(npc);

    const player = new Container();
    const playerShadow = new Graphics().ellipse(0, 25, 24, 10).fill({ color: 0x000000, alpha: 0.25 });
    const playerBody = new Graphics().roundRect(-18, -28, 36, 52, 10).fill(0xd8b45c).stroke({ width: 3, color: 0xf4e2a1 });
    const playerHead = new Graphics().circle(0, -38, 15).fill(0xe3b98c);
    const sword = new Graphics().roundRect(15, -22, 6, 36, 3).fill(0xd9e2e8).stroke({ width: 2, color: 0x6f7c85 });
    player.addChild(playerShadow, playerBody, playerHead, sword);
    player.position.set(970, 900);
    world.addChild(player);

    const playerName = new Text({ text: 'Herói', style: { fill: 0xffffff, fontSize: 14, fontWeight: 'bold', stroke: { color: 0x000000, width: 4 } } });
    playerName.anchor.set(0.5);
    playerName.position.set(0, -70);
    player.addChild(playerName);

    const enemy = new Container();
    const enemyShadow = new Graphics().ellipse(0, 19, 23, 9).fill({ color: 0x000000, alpha: 0.22 });
    const enemyBody = new Graphics().circle(0, -5, 27).fill(0x7a3b35).stroke({ width: 3, color: 0xc66a58 });
    const enemyEye1 = new Graphics().circle(-9, -11, 4).fill(0xffe06b);
    const enemyEye2 = new Graphics().circle(9, -11, 4).fill(0xffe06b);
    const enemyName = new Text({ text: 'Lobo Sombrio', style: { fill: 0xffd0ca, fontSize: 13, fontWeight: 'bold', stroke: { color: 0x000000, width: 4 } } });
    enemyName.anchor.set(0.5);
    enemyName.position.set(0, -50);
    const enemyHpBack = new Graphics().roundRect(-31, -39, 62, 7, 3).fill(0x301718);
    const enemyHpBar = new Graphics().roundRect(-30, -38, 60, 5, 2).fill(0xdb5b52);
    enemy.addChild(enemyShadow, enemyBody, enemyEye1, enemyEye2, enemyName, enemyHpBack, enemyHpBar);
    enemy.position.set(1320, 930);
    world.addChild(enemy);

    const loot = new Container();
    const lootGlow = new Graphics().circle(0, 0, 16).fill({ color: 0xffd35a, alpha: 0.25 });
    const lootCore = new Graphics().circle(0, 0, 7).fill(0xffd35a);
    loot.addChild(lootGlow, lootCore);
    loot.visible = false;
    world.addChild(loot);

    let playerHp = 100;
    let enemyHp = 100;
    let enemyAlive = true;
    let questAccepted = false;
    let questCompleted = false;
    let coins = 0;
    let attackCooldown = 0;
    let enemyAttackCooldown = 0;

    const hud = document.createElement('div');
    hud.id = 'hud';
    hud.innerHTML = `
      <div class="topbar">
        <div class="brand">ASCENSION <span>• Floresta Inicial</span></div>
        <div class="hp-shell"><div id="hp-fill"></div><span id="hp-text">HP 100/100</span></div>
        <div class="coins">🪙 <span id="coins">0</span></div>
      </div>
      <div id="quest-box"><strong>Missão</strong><div id="quest-text">Fale com Elandra.</div></div>
      <div id="dialog-box" class="hidden"></div>
      <div id="stick"><div id="knob"></div></div>
      <button id="attack-btn">⚔</button>
      <button id="interact-btn">💬</button>
    `;
    document.body.appendChild(hud);

    const hpFill = document.querySelector<HTMLDivElement>('#hp-fill');
    const hpText = document.querySelector<HTMLSpanElement>('#hp-text');
    const coinText = document.querySelector<HTMLSpanElement>('#coins');
    const questText = document.querySelector<HTMLDivElement>('#quest-text');
    const dialogBox = document.querySelector<HTMLDivElement>('#dialog-box');
    const stick = document.querySelector<HTMLDivElement>('#stick');
    const knob = document.querySelector<HTMLDivElement>('#knob');
    const attackBtn = document.querySelector<HTMLButtonElement>('#attack-btn');
    const interactBtn = document.querySelector<HTMLButtonElement>('#interact-btn');
    if (!hpFill || !hpText || !coinText || !questText || !dialogBox || !stick || !knob || !attackBtn || !interactBtn) {
      throw new Error('HUD não foi criado corretamente.');
    }

    const keys = new Set<string>();
    window.addEventListener('keydown', (event) => keys.add(event.key.toLowerCase()));
    window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));

    let stickX = 0;
    let stickY = 0;

    function distance(ax: number, ay: number, bx: number, by: number) {
      return Math.hypot(ax - bx, ay - by);
    }

    function collides(x: number, y: number) {
      return obstacles.some((obstacle) => distance(x, y, obstacle.x, obstacle.y) < PLAYER_RADIUS + obstacle.radius);
    }

    function updateHud() {
      hpFill.style.width = `${Math.max(0, playerHp)}%`;
      hpText.textContent = `HP ${Math.max(0, Math.ceil(playerHp))}/100`;
      coinText.textContent = String(coins);
      if (!questAccepted) questText.textContent = 'Fale com Elandra.';
      else if (!questCompleted) questText.textContent = enemyAlive ? 'Derrote o Lobo Sombrio.' : 'Volte e fale com Elandra.';
      else questText.textContent = 'Concluída: A ameaça na floresta.';
    }

    function showDialog(text: string) {
      dialogBox.textContent = text;
      dialogBox.classList.remove('hidden');
      window.setTimeout(() => dialogBox.classList.add('hidden'), 3200);
    }

    function interact() {
      if (distance(player.x, player.y, npc.x, npc.y) < 115) {
        if (!questAccepted) {
          questAccepted = true;
          showDialog('Elandra: Um Lobo Sombrio está rondando a trilha. Pode derrotá-lo para mim?');
        } else if (!enemyAlive && !questCompleted) {
          questCompleted = true;
          coins += 25;
          npcMark.text = '✓';
          npcMark.style.fill = 0x9cf28f;
          showDialog('Elandra: Excelente! A trilha está segura novamente. Recompensa: 25 moedas.');
        } else if (questCompleted) {
          showDialog('Elandra: Obrigada, aventureiro. Continue explorando a floresta!');
        } else {
          showDialog('Elandra: O lobo está mais adiante, perto da trilha.');
        }
        updateHud();
      }

      if (loot.visible && distance(player.x, player.y, loot.x, loot.y) < 70) {
        loot.visible = false;
        coins += 5;
        showDialog('Você coletou 5 moedas do Lobo Sombrio.');
        updateHud();
      }
    }

    function attack() {
      if (!enemyAlive || attackCooldown > 0) return;
      attackCooldown = 26;
      sword.rotation = -0.9;
      window.setTimeout(() => { sword.rotation = 0; }, 130);

      if (distance(player.x, player.y, enemy.x, enemy.y) <= 92) {
        enemyHp = Math.max(0, enemyHp - 34);
        enemyHpBar.scale.x = enemyHp / 100;
        if (enemyHp <= 0) {
          enemyAlive = false;
          enemy.visible = false;
          loot.position.copyFrom(enemy.position);
          loot.visible = true;
          showDialog('Lobo Sombrio derrotado! Colete o brilho dourado e volte para Elandra.');
          updateHud();
        }
      }
    }

    attackBtn.addEventListener('pointerdown', attack);
    interactBtn.addEventListener('pointerdown', interact);
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Space') attack();
      if (event.key.toLowerCase() === 'e') interact();
    });

    function updateStick(clientX: number, clientY: number) {
      const r = stick.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const max = 42;
      const len = Math.hypot(dx, dy);
      if (len > max) {
        dx = (dx / len) * max;
        dy = (dy / len) * max;
      }
      stickX = dx / max;
      stickY = dy / max;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    }

    function resetStick() {
      stickX = 0;
      stickY = 0;
      knob.style.transform = 'translate(0, 0)';
    }

    stick.addEventListener('pointerdown', (event) => {
      stick.setPointerCapture(event.pointerId);
      updateStick(event.clientX, event.clientY);
    });
    stick.addEventListener('pointermove', (event) => {
      if (stick.hasPointerCapture(event.pointerId)) updateStick(event.clientX, event.clientY);
    });
    stick.addEventListener('pointerup', resetStick);
    stick.addEventListener('pointercancel', resetStick);

    app.ticker.add((ticker) => {
      const dt = ticker.deltaTime;
      attackCooldown = Math.max(0, attackCooldown - dt);
      enemyAttackCooldown = Math.max(0, enemyAttackCooldown - dt);

      let dx = stickX;
      let dy = stickY;
      if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
      if (keys.has('d') || keys.has('arrowright')) dx += 1;
      if (keys.has('w') || keys.has('arrowup')) dy -= 1;
      if (keys.has('s') || keys.has('arrowdown')) dy += 1;

      const len = Math.hypot(dx, dy);
      if (len > 0) {
        dx /= Math.max(1, len);
        dy /= Math.max(1, len);
        const speed = 4.4 * dt;
        const nextX = Math.max(40, Math.min(WORLD_W - 40, player.x + dx * speed));
        const nextY = Math.max(80, Math.min(WORLD_H - 40, player.y + dy * speed));
        if (!collides(nextX, player.y)) player.x = nextX;
        if (!collides(player.x, nextY)) player.y = nextY;
      }

      if (enemyAlive) {
        const d = distance(enemy.x, enemy.y, player.x, player.y);
        if (d < 360 && d > 68) {
          const ex = (player.x - enemy.x) / d;
          const ey = (player.y - enemy.y) / d;
          enemy.x += ex * 2.05 * dt;
          enemy.y += ey * 2.05 * dt;
        }
        if (d <= 72 && enemyAttackCooldown <= 0) {
          enemyAttackCooldown = 58;
          playerHp = Math.max(0, playerHp - 12);
          updateHud();
          if (playerHp <= 0) {
            playerHp = 100;
            player.position.set(970, 900);
            showDialog('Você foi derrotado e retornou ao ponto inicial.');
            updateHud();
          }
        }
      }

      loot.rotation += 0.025 * dt;
      loot.scale.set(1 + Math.sin(app.ticker.lastTime / 220) * 0.08);

      const maxCamX = 0;
      const minCamX = Math.min(0, app.screen.width - WORLD_W);
      const maxCamY = 0;
      const minCamY = Math.min(0, app.screen.height - WORLD_H);
      world.x = Math.max(minCamX, Math.min(maxCamX, app.screen.width / 2 - player.x));
      world.y = Math.max(minCamY, Math.min(maxCamY, app.screen.height / 2 - player.y));
    });

    updateHud();
    if (bootStatus) bootStatus.remove();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Falha ao iniciar Ascension Game:', error);
    setBootMessage(`Erro ao iniciar o jogo: ${message}`);
    if (bootStatus) {
      bootStatus.style.background = '#2b1115';
      bootStatus.style.color = '#ffd7dc';
    }
  }
}

void startGame();
