import { Container, Graphics, Text } from 'pixi.js';
import type { ShopId } from './shopSystem';

export type VillageMerchant = {
  id: string;
  shopId: ShopId;
  name: string;
  role: string;
  npc: Container;
  questMark: Text;
};

type MerchantVisual = {
  shopId: ShopId;
  name: string;
  role: string;
  icon: string;
  x: number;
  y: number;
  body: number;
  trim: number;
};

const MERCHANTS: MerchantVisual[] = [
  { shopId: 'rowan', name: 'Rowan', role: 'Ferreiro', icon: '⚒', x: 760, y: 1245, body: 0x7b4b37, trim: 0xd39a5d },
  { shopId: 'mira', name: 'Mira', role: 'Alquimista', icon: '⚗', x: 1180, y: 1245, body: 0x526b8f, trim: 0xb7d0ef },
  { shopId: 'silas', name: 'Silas', role: 'Banqueiro', icon: '🏦', x: 740, y: 1455, body: 0x39495f, trim: 0xd6c27d },
  { shopId: 'theo', name: 'Theo', role: 'Comerciante', icon: '🪙', x: 1200, y: 1455, body: 0x667343, trim: 0xd8d183 },
];

function createMerchant(world: Container, data: MerchantVisual): VillageMerchant {
  const npc = new Container();
  const shadow = new Graphics().ellipse(0, 22, 22, 9).fill({ color: 0, alpha: .2 });
  const body = new Graphics().roundRect(-18, -28, 36, 50, 9).fill(data.body).stroke({ width: 3, color: data.trim });
  const apron = new Graphics().roundRect(-11, -8, 22, 28, 5).fill({ color: 0x332d27, alpha: .5 });
  const head = new Graphics().circle(0, -39, 14).fill(0xe1b58d);
  const hair = new Graphics().arc(0, -42, 13, Math.PI, Math.PI * 2).stroke({ width: 7, color: data.shopId === 'mira' ? 0x3d2b2b : 0x4c3428 });
  const questMark = new Text({ text: '', style: { fill: 0xffdd57, fontSize: 29, fontWeight: 'bold', stroke: { color: 0x122018, width: 5 } } });
  questMark.anchor.set(.5); questMark.y = -116;
  const icon = new Text({ text: data.icon, style: { fill: 0xffdf79, fontSize: 24, fontWeight: 'bold', stroke: { color: 0x122018, width: 5 } } });
  icon.anchor.set(.5); icon.y = -91;
  const name = new Text({ text: data.name, style: { fill: 0xffffff, fontSize: 13, fontWeight: 'bold', stroke: { color: 0, width: 4 } } });
  name.anchor.set(.5); name.y = -69;
  const role = new Text({ text: data.role, style: { fill: 0xd9c77d, fontSize: 9, fontWeight: 'bold', stroke: { color: 0, width: 3 } } });
  role.anchor.set(.5); role.y = -56;
  npc.addChild(shadow, body, apron, head, hair, questMark, icon, name, role);
  npc.position.set(data.x, data.y);
  world.addChild(npc);
  return { id: data.shopId, shopId: data.shopId, name: data.name, role: data.role, npc, questMark };
}

export function createVillageMerchants(world: Container) {
  return MERCHANTS.map((data) => createMerchant(world, data));
}
