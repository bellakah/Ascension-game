import { Application, Assets, Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import './style.css';

const bootStatus = document.querySelector<HTMLDivElement>('#boot-status');
const setBootMessage = (message: string) => { if (bootStatus) bootStatus.textContent = message; };

const LPC = 'https://raw.githubusercontent.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/master/spritesheets';
const BODY_WALK = `${LPC}/body/bodies/male/walk.png`;
const MAIL_WALK = `${LPC}/torso/chainmail/male/walk.png`;
const FRAME = 64;
const WALK_FRAMES = 9;
// LPC walk rows: up, left, down, right.
type Facing = 'up' | 'left' | 'down' | 'right';
const row: Record<Facing, number> = { up: 0, left: 1, down: 2, right: 3 };

async function startGame() {
  try {
    setBootMessage('Carregando guerreiro LPC...');
    const app = new Application();
    await app.init({ resizeTo: window, backgroundColor: 0x14231d, antialias: false, preference: 'webgl' });
    const mount = document.querySelector<HTMLDivElement>('#app');
    if (!mount) throw new Error('Elemento #app não encontrado.');
    mount.appendChild(app.canvas);

    const world = new Container();
    app.stage.addChild(world);
    const WORLD_W = 2200, WORLD_H = 1600, PLAYER_RADIUS = 20;
    world.addChild(new Graphics().rect(0, 0, WORLD_W, WORLD_H).fill(0x527b45));
    world.addChild(new Graphics().roundRect(760, 0, 420, WORLD_H, 100).fill({ color: 0xa58458, alpha: 0.88 }));

    for (let i = 0; i < 80; i++) {
      const flower = new Graphics().circle(0, 0, 3).fill(i % 2 ? 0xf4d35e : 0xd983a6);
      flower.position.set(80 + ((i * 149) % 2040), 70 + ((i * 227) % 1460)); world.addChild(flower);
    }

    type Obstacle = { x: number; y: number; radius: number };
    const obstacles: Obstacle[] = [];
    function addTree(x: number, y: number, scale = 1) {
      const t = new Container();
      t.addChild(
        new Graphics().ellipse(0, 26, 32 * scale, 13 * scale).fill({ color: 0, alpha: .18 }),
        new Graphics().roundRect(-9 * scale, -6 * scale, 18 * scale, 48 * scale, 5).fill(0x765034),
        new Graphics().circle(-17 * scale, -28 * scale, 30 * scale).fill(0x245638),
        new Graphics().circle(15 * scale, -34 * scale, 34 * scale).fill(0x317044),
        new Graphics().circle(0, -58 * scale, 33 * scale).fill(0x3d8150),
      );
      t.position.set(x, y); world.addChild(t); obstacles.push({ x, y: y + 12, radius: 25 * scale });
    }
    [[220,240],[420,410],[610,220],[300,720],[590,880],[250,1180],[540,1390],[1400,220],[1640,390],[1900,250],[1470,760],[1840,840],[1430,1200],[1740,1370],[1060,280],[900,1250],[1180,1380],[710,570],[1310,540]].forEach((p,i)=>addTree(p[0],p[1],i%3===0?1.15:1));

    const npc = new Container();
    const npcMark = new Text({ text:'!', style:{ fill:0xffdd57,fontSize:32,fontWeight:'bold',stroke:{color:0,width:5} } }); npcMark.anchor.set(.5); npcMark.y=-82;
    const npcName = new Text({ text:'Elandra', style:{ fill:0xffffff,fontSize:14,fontWeight:'bold',stroke:{color:0,width:4} } }); npcName.anchor.set(.5); npcName.y=-62;
    npc.addChild(new Graphics().ellipse(0,22,22,9).fill({color:0,alpha:.22}),new Graphics().roundRect(-18,-28,36,50,9).fill(0x4f78b8).stroke({width:3,color:0xbfd8ff}),new Graphics().circle(0,-39,14).fill(0xe4b991),npcMark,npcName);
    npc.position.set(970,520); world.addChild(npc);

    const [bodySheet, mailSheet] = await Promise.all([Assets.load<Texture>(BODY_WALK), Assets.load<Texture>(MAIL_WALK)]);
    const player = new Container();
    const shadow = new Graphics().ellipse(0, 5, 25, 10).fill({ color:0, alpha:.25 }); player.addChild(shadow);
    const body = new Sprite(); const mail = new Sprite();
    for (const s of [body, mail]) { s.anchor.set(.5,1); s.scale.set(1.35); s.texture.source.scaleMode='nearest'; player.addChild(s); }
    const playerName = new Text({ text:'Herói', style:{fill:0xffffff,fontSize:14,fontWeight:'bold',stroke:{color:0,width:4}} }); playerName.anchor.set(.5); playerName.y=-92; player.addChild(playerName);
    player.position.set(970,900); world.addChild(player);

    let facing: Facing='down', animFrame=0, animClock=0;
    function frameTexture(sheet: Texture, direction: Facing, frame: number) {
      return new Texture({ source: sheet.source, frame: new Rectangle(frame*FRAME,row[direction]*FRAME,FRAME,FRAME) });
    }
    function renderHero(moving=false) {
      const f = moving ? animFrame : 0;
      body.texture=frameTexture(bodySheet,facing,f); mail.texture=frameTexture(mailSheet,facing,f);
    }
    renderHero();

    const enemy = new Container();
    const enemyName = new Text({text:'Lobo Sombrio',style:{fill:0xffd0ca,fontSize:13,fontWeight:'bold',stroke:{color:0,width:4}}}); enemyName.anchor.set(.5); enemyName.y=-50;
    const enemyHpBar = new Graphics().roundRect(-30,-38,60,5,2).fill(0xdb5b52);
    enemy.addChild(new Graphics().ellipse(0,19,23,9).fill({color:0,alpha:.22}),new Graphics().circle(0,-5,27).fill(0x7a3b35).stroke({width:3,color:0xc66a58}),new Graphics().circle(-9,-11,4).fill(0xffe06b),new Graphics().circle(9,-11,4).fill(0xffe06b),enemyName,new Graphics().roundRect(-31,-39,62,7,3).fill(0x301718),enemyHpBar);
    enemy.position.set(1320,930); world.addChild(enemy);
    const loot=new Container(); loot.addChild(new Graphics().circle(0,0,16).fill({color:0xffd35a,alpha:.25}),new Graphics().circle(0,0,7).fill(0xffd35a)); loot.visible=false; world.addChild(loot);

    let playerHp=100,enemyHp=100,enemyAlive=true,questAccepted=false,questCompleted=false,coins=0,attackCooldown=0,enemyAttackCooldown=0;
    const hud=document.createElement('div'); hud.id='hud'; hud.innerHTML=`<div class="topbar"><div class="brand">ASCENSION <span>• Floresta Inicial</span></div><div class="hp-shell"><div id="hp-fill"></div><span id="hp-text">HP 100/100</span></div><div class="coins">🪙 <span id="coins">0</span></div></div><div id="quest-box"><strong>Missão</strong><div id="quest-text">Fale com Elandra.</div></div><div id="dialog-box" class="hidden"></div><div id="stick"><div id="knob"></div></div><button id="attack-btn">⚔</button><button id="interact-btn">💬</button>`; document.body.appendChild(hud);
    const hpFill=document.querySelector<HTMLDivElement>('#hp-fill')!,hpText=document.querySelector<HTMLSpanElement>('#hp-text')!,coinText=document.querySelector<HTMLSpanElement>('#coins')!,questText=document.querySelector<HTMLDivElement>('#quest-text')!,dialogBox=document.querySelector<HTMLDivElement>('#dialog-box')!,stick=document.querySelector<HTMLDivElement>('#stick')!,knob=document.querySelector<HTMLDivElement>('#knob')!,attackBtn=document.querySelector<HTMLButtonElement>('#attack-btn')!,interactBtn=document.querySelector<HTMLButtonElement>('#interact-btn')!;
    const distance=(ax:number,ay:number,bx:number,by:number)=>Math.hypot(ax-bx,ay-by);
    const collides=(x:number,y:number)=>obstacles.some(o=>distance(x,y,o.x,o.y)<PLAYER_RADIUS+o.radius);
    function updateHud(){hpFill.style.width=`${Math.max(0,playerHp)}%`;hpText.textContent=`HP ${Math.max(0,Math.ceil(playerHp))}/100`;coinText.textContent=String(coins);questText.textContent=!questAccepted?'Fale com Elandra.':!questCompleted?(enemyAlive?'Derrote o Lobo Sombrio.':'Volte e fale com Elandra.'):'Concluída: A ameaça na floresta.';}
    function showDialog(text:string){dialogBox.textContent=text;dialogBox.classList.remove('hidden');setTimeout(()=>dialogBox.classList.add('hidden'),3200);}
    function interact(){if(distance(player.x,player.y,npc.x,npc.y)<115){if(!questAccepted){questAccepted=true;showDialog('Elandra: Um Lobo Sombrio está rondando a trilha. Pode derrotá-lo para mim?');}else if(!enemyAlive&&!questCompleted){questCompleted=true;coins+=25;npcMark.text='✓';npcMark.style.fill=0x9cf28f;showDialog('Elandra: Excelente! Recompensa: 25 moedas.');}else showDialog(questCompleted?'Elandra: Obrigada, aventureiro!':'Elandra: O lobo está mais adiante.');updateHud();}if(loot.visible&&distance(player.x,player.y,loot.x,loot.y)<70){loot.visible=false;coins+=5;showDialog('Você coletou 5 moedas.');updateHud();}}
    function attack(){if(!enemyAlive||attackCooldown>0)return;attackCooldown=26;if(distance(player.x,player.y,enemy.x,enemy.y)<=92){enemyHp=Math.max(0,enemyHp-34);enemyHpBar.scale.x=enemyHp/100;if(enemyHp<=0){enemyAlive=false;enemy.visible=false;loot.position.copyFrom(enemy.position);loot.visible=true;showDialog('Lobo Sombrio derrotado!');updateHud();}}}
    attackBtn.addEventListener('pointerdown',attack); interactBtn.addEventListener('pointerdown',interact);
    const keys=new Set<string>(); window.addEventListener('keydown',e=>{keys.add(e.key.toLowerCase());if(e.code==='Space')attack();if(e.key.toLowerCase()==='e')interact();}); window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
    let stickX=0,stickY=0;
    function updateStick(cx:number,cy:number){const r=stick.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;let dx=cx-x,dy=cy-y;const max=42,len=Math.hypot(dx,dy);if(len>max){dx=dx/len*max;dy=dy/len*max;}stickX=dx/max;stickY=dy/max;knob.style.transform=`translate(${dx}px, ${dy}px)`;}
    const resetStick=()=>{stickX=stickY=0;knob.style.transform='translate(0, 0)';}; stick.addEventListener('pointerdown',e=>{stick.setPointerCapture(e.pointerId);updateStick(e.clientX,e.clientY);});stick.addEventListener('pointermove',e=>{if(stick.hasPointerCapture(e.pointerId))updateStick(e.clientX,e.clientY);});stick.addEventListener('pointerup',resetStick);stick.addEventListener('pointercancel',resetStick);

    app.ticker.add(t=>{const dt=t.deltaTime;attackCooldown=Math.max(0,attackCooldown-dt);enemyAttackCooldown=Math.max(0,enemyAttackCooldown-dt);let dx=stickX,dy=stickY;if(keys.has('a')||keys.has('arrowleft'))dx-=1;if(keys.has('d')||keys.has('arrowright'))dx+=1;if(keys.has('w')||keys.has('arrowup'))dy-=1;if(keys.has('s')||keys.has('arrowdown'))dy+=1;const len=Math.hypot(dx,dy),moving=len>0;if(moving){dx/=Math.max(1,len);dy/=Math.max(1,len);facing=Math.abs(dx)>Math.abs(dy)?(dx<0?'left':'right'):(dy<0?'up':'down');animClock+=dt;if(animClock>=6){animClock=0;animFrame=(animFrame+1)%WALK_FRAMES;}const speed=4.4*dt,nx=Math.max(40,Math.min(WORLD_W-40,player.x+dx*speed)),ny=Math.max(80,Math.min(WORLD_H-40,player.y+dy*speed));if(!collides(nx,player.y))player.x=nx;if(!collides(player.x,ny))player.y=ny;}else{animFrame=0;animClock=0;}renderHero(moving);if(enemyAlive){const d=distance(enemy.x,enemy.y,player.x,player.y);if(d<360&&d>68){enemy.x+=(player.x-enemy.x)/d*2.05*dt;enemy.y+=(player.y-enemy.y)/d*2.05*dt;}if(d<=72&&enemyAttackCooldown<=0){enemyAttackCooldown=58;playerHp=Math.max(0,playerHp-12);if(playerHp<=0){playerHp=100;player.position.set(970,900);showDialog('Você foi derrotado e retornou ao ponto inicial.');}updateHud();}}loot.rotation+=.025*dt;loot.scale.set(1+Math.sin(app.ticker.lastTime/220)*.08);world.x=Math.max(Math.min(0,app.screen.width-WORLD_W),Math.min(0,app.screen.width/2-player.x));world.y=Math.max(Math.min(0,app.screen.height-WORLD_H),Math.min(0,app.screen.height/2-player.y));});
    updateHud(); if(bootStatus)bootStatus.remove();
  } catch(error){const message=error instanceof Error?error.message:String(error);console.error(error);setBootMessage(`Erro ao iniciar o jogo: ${message}`);if(bootStatus){bootStatus.style.background='#2b1115';bootStatus.style.color='#ffd7dc';}}
}
void startGame();
