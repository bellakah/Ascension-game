import { drawObjectAsset, getMapAssetImage, type DrawObjectOptions } from './mapAssetRenderer';
import { getAssetPreset, objectVisualBounds, visualSizeInTiles } from './mapAssetPresets';
import type { MapObject, MapPaletteEntry } from './mapEditorTypes';

export type DrawConfiguredObjectOptions = DrawObjectOptions & {
  object: MapObject;
  showHitbox?: boolean;
  showLight?: boolean;
};

function drawShadow(ctx: CanvasRenderingContext2D, entry: MapPaletteEntry, options: DrawConfiguredObjectOptions) {
  const preset = getAssetPreset(entry);
  if (!preset.shadow) return;
  const size = visualSizeInTiles(entry, options.object);
  ctx.save();
  ctx.globalAlpha = .24 * (options.alpha ?? 1);
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(options.x, options.y - options.tilePixels * .04, Math.max(5, size.width * options.tilePixels * .32), Math.max(2, options.tilePixels * .1), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLight(ctx: CanvasRenderingContext2D, entry: MapPaletteEntry, options: DrawConfiguredObjectOptions) {
  const preset = getAssetPreset(entry);
  if (!preset.light.enabled || options.showLight === false) return;
  const bounds = objectVisualBounds(entry, options.object);
  const centerX = options.x + (preset.light.x - (entry.sprite?.anchorX ?? .5)) * bounds.width * options.tilePixels;
  const centerY = options.y + (preset.light.y - (entry.sprite?.anchorY ?? 1)) * bounds.height * options.tilePixels;
  const radius = Math.max(10, preset.light.radius * options.tilePixels);
  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
  gradient.addColorStop(0, `rgba(255,224,145,${Math.min(.5, .36 * preset.light.intensity)})`);
  gradient.addColorStop(.45, `rgba(255,195,94,${Math.min(.25, .16 * preset.light.intensity)})`);
  gradient.addColorStop(1, 'rgba(255,190,80,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = gradient;
  ctx.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
  ctx.restore();
}

function drawStretchImage(ctx: CanvasRenderingContext2D, entry: MapPaletteEntry, options: DrawConfiguredObjectOptions) {
  const preset = getAssetPreset(entry);
  if (!preset.stretch.enabled || !entry.sprite) return false;
  const image = getMapAssetImage(entry, options.onReady);
  if (!image?.complete || image.naturalWidth <= 0) return false;
  const source = entry.sprite.sourceRect ?? { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
  const size = visualSizeInTiles(entry, options.object);
  const targetW = Math.max(2, size.width * options.tilePixels);
  const targetH = Math.max(2, size.height * options.tilePixels);
  const anchorX = entry.sprite.anchorX ?? .5;
  const anchorY = entry.sprite.anchorY ?? 1;
  const left = options.x - targetW * anchorX;
  const top = options.y - targetH * anchorY;
  const cap = Math.max(1, Math.min(preset.stretch.cap, .45));

  ctx.save();
  ctx.globalAlpha = options.alpha ?? 1;
  ctx.imageSmoothingEnabled = !entry.sprite.pixelated;

  if (preset.stretch.axis === 'horizontal') {
    const srcCap = Math.max(1, Math.floor(source.width * cap));
    const dstCap = Math.min(targetW / 2, Math.max(2, options.tilePixels * cap));
    ctx.drawImage(image, source.x, source.y, srcCap, source.height, left, top, dstCap, targetH);
    ctx.drawImage(image, source.x + source.width - srcCap, source.y, srcCap, source.height, left + targetW - dstCap, top, dstCap, targetH);
    const srcCenterW = Math.max(1, source.width - srcCap * 2);
    const dstCenterW = Math.max(0, targetW - dstCap * 2);
    if (dstCenterW > 0) ctx.drawImage(image, source.x + srcCap, source.y, srcCenterW, source.height, left + dstCap, top, dstCenterW, targetH);
  } else {
    const srcCap = Math.max(1, Math.floor(source.height * cap));
    const dstCap = Math.min(targetH / 2, Math.max(2, options.tilePixels * cap));
    ctx.drawImage(image, source.x, source.y, source.width, srcCap, left, top, targetW, dstCap);
    ctx.drawImage(image, source.x, source.y + source.height - srcCap, source.width, srcCap, left, top + targetH - dstCap, targetW, dstCap);
    const srcCenterH = Math.max(1, source.height - srcCap * 2);
    const dstCenterH = Math.max(0, targetH - dstCap * 2);
    if (dstCenterH > 0) ctx.drawImage(image, source.x, source.y + srcCap, source.width, srcCenterH, left, top + dstCap, targetW, dstCenterH);
  }

  if (options.selected) {
    ctx.strokeStyle = '#e9fbff';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(left - 3, top - 3, targetW + 6, targetH + 6);
  }
  ctx.restore();
  return true;
}

function drawHitbox(ctx: CanvasRenderingContext2D, entry: MapPaletteEntry, options: DrawConfiguredObjectOptions) {
  if (!options.showHitbox) return;
  const preset = getAssetPreset(entry);
  const hitbox = preset.hitbox;
  if (!hitbox) return;
  const bounds = objectVisualBounds(entry, options.object);
  const width = bounds.width * options.tilePixels;
  const height = bounds.height * options.tilePixels;
  const left = options.x - width * (entry.sprite?.anchorX ?? .5);
  const top = options.y - height * (entry.sprite?.anchorY ?? 1);
  ctx.save();
  ctx.fillStyle = 'rgba(239,76,76,.2)';
  ctx.strokeStyle = '#ff7474';
  ctx.lineWidth = 1.5;
  if (hitbox.type === 'rectangle') {
    const x = left + hitbox.x * width, y = top + hitbox.y * height, w = hitbox.width * width, h = hitbox.height * height;
    ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
  } else if (hitbox.type === 'circle') {
    ctx.beginPath(); ctx.arc(left + hitbox.x * width, top + hitbox.y * height, hitbox.radius * Math.min(width, height), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else if (hitbox.points.length >= 2) {
    ctx.beginPath();
    hitbox.points.forEach((point, index) => { const x = left + point.x * width, y = top + point.y * height; if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

export function drawConfiguredObject(ctx: CanvasRenderingContext2D, entry: MapPaletteEntry, options: DrawConfiguredObjectOptions) {
  drawShadow(ctx, entry, options);
  const stretched = drawStretchImage(ctx, entry, options);
  if (!stretched) drawObjectAsset(ctx, entry, options);
  drawLight(ctx, entry, options);
  drawHitbox(ctx, entry, options);
}
