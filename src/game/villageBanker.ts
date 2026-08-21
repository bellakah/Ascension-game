import { Container, Graphics, Text } from 'pixi.js';

export type VillageBanker = {
  id: 'silas';
  name: string;
  role: string;
  npc: Container;
};

export function createVillageBanker(world: Container): VillageBanker {
  const npc = new Container();
  const shadow = new Graphics().ellipse(0, 22, 22, 9).fill({ color: 0, alpha: .2 });
  const body = new Graphics().roundRect(-18, -28, 36, 50, 9).fill(0x39495f).stroke({ width: 3, color: 0xd6c27d });
  const vest = new Graphics().roundRect(-11, -8, 22, 28, 5).fill({ color: 0x1d2632, alpha: .78 });
  const head = new Graphics().circle(0, -39, 14).fill(0xd9ad86);
  const hair = new Graphics().arc(0, -42, 13, Math.PI, Math.PI * 2).stroke({ width: 7, color: 0x3a2d27 });
  const icon = new Text({ text: '🏦', style: { fontSize: 23, stroke: { color: 0x122018, width: 5 } } });
  icon.anchor.set(.5); icon.y = -91;
  const name = new Text({ text: 'Silas', style: { fill: 0xffffff, fontSize: 13, fontWeight: 'bold', stroke: { color: 0, width: 4 } } });
  name.anchor.set(.5); name.y = -69;
  const role = new Text({ text: 'Banqueiro', style: { fill: 0xe4cf87, fontSize: 9, fontWeight: 'bold', stroke: { color: 0, width: 3 } } });
  role.anchor.set(.5); role.y = -56;
  npc.addChild(shadow, body, vest, head, hair, icon, name, role);
  npc.position.set(1110, 1390);
  world.addChild(npc);
  return { id: 'silas', name: 'Silas', role: 'Banqueiro', npc };
}
