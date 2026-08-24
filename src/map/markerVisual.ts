import { ensureFontAwesome, svgDataUrl } from './markerStore';
import type { MarkerStyle } from './markerTypes';

export function applyMarkerStyle(node: HTMLElement, style: MarkerStyle) {
  node.style.setProperty('--marker-size', `${style.size}px`);
  node.style.setProperty('--marker-color', style.color);
  node.style.setProperty('--marker-opacity', String(style.opacity));
  node.style.setProperty('--marker-bg', style.background ? style.backgroundColor : 'transparent');
  node.style.setProperty('--marker-border', style.background ? style.borderColor : 'transparent');
  node.style.setProperty('--marker-border-width', style.background ? `${style.borderWidth}px` : '0px');
  node.style.setProperty('--marker-label-size', `${style.labelSize}px`);
  node.dataset.labelMode = style.labelMode;
  node.classList.toggle('marker-has-background', style.background);
  node.classList.toggle('marker-shadow', style.shadow);
  node.classList.toggle('marker-glow', style.glow);
}

export function renderMarkerSource(node: HTMLElement, style: MarkerStyle) {
  const source = style.source;
  const signature = `${source.kind}|${source.value}|${source.fallback ?? ''}|${style.color}`;
  if (node.dataset.markerSourceSignature === signature) return;
  node.dataset.markerSourceSignature = signature;
  node.replaceChildren();
  node.className = 'marker-source';

  if (source.kind === 'image') {
    const image = document.createElement('img');
    image.alt = '';
    image.draggable = false;
    image.src = source.value;
    node.appendChild(image);
    return;
  }

  if (source.kind === 'svg') {
    const image = document.createElement('img');
    image.alt = '';
    image.draggable = false;
    image.src = svgDataUrl(source.value.replaceAll('currentColor', style.color));
    node.appendChild(image);
    return;
  }

  if (source.kind === 'fa') {
    ensureFontAwesome();
    const icon = document.createElement('i');
    icon.className = source.value || 'fa-solid fa-location-dot';
    icon.setAttribute('aria-hidden', 'true');
    node.appendChild(icon);
    return;
  }

  const symbol = document.createElement('span');
  symbol.textContent = source.value || source.fallback || '◆';
  node.appendChild(symbol);
}
