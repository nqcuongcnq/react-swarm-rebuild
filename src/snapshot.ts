export interface Layer {
  id: number;
  kind: 'box' | 'text' | 'media' | 'line';
  x: number; y: number; width: number; height: number;
  element: HTMLElement;
  text?: { node: HTMLElement; value: string }[];
  signature: string;
  master?: Layer;
  parent?: Layer;
  done: boolean;
  started: boolean;
  opacity: string;
}
export interface Snapshot { layers: Layer[]; background: string; }
const boxProps = ['background', 'background-image', 'background-size', 'background-position', 'background-repeat', 'background-origin', 'background-clip', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-radius', 'box-shadow', 'opacity', 'filter', 'backdrop-filter', 'mix-blend-mode', 'outline', 'outline-offset', 'clip-path'];
const textProps = ['color', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch', 'font-variant', 'line-height', 'letter-spacing', 'word-spacing', 'text-decoration', 'text-transform', 'text-shadow', '-webkit-text-fill-color', '-webkit-text-stroke'];
const transparent = (value: string) => value === 'transparent' || value === 'rgba(0, 0, 0, 0)' || !value;
const ignoredTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'LINK', 'META', 'OPTION']);
const mediaTags = new Set(['IMG', 'SVG', 'VIDEO', 'CANVAS', 'IFRAME', 'INPUT', 'TEXTAREA', 'SELECT']);
function copyStyles(from: Element, to: Element) {
  if (!(to instanceof HTMLElement || to instanceof SVGElement)) return;
  const css = getComputedStyle(from);
  for (const property of css) to.style.setProperty(property, css.getPropertyValue(property));
  to.style.animation = 'none';
  to.style.transition = 'none';
  to.removeAttribute('id');
  // Snapshot content is inert. Never mount executable/custom-element DOM.
  for (const attr of Array.from(to.attributes)) {
    if (/^on/i.test(attr.name) || ['autofocus', 'autoplay', 'srcdoc'].includes(attr.name)) to.removeAttribute(attr.name);
  }
  Array.from(from.children).forEach((child, i) => {
    if (to.children[i]) copyStyles(child, to.children[i]);
  });
}

/** A flat visual display list. The application DOM is read, never rewritten. */
export function snapshot(target: HTMLElement, stage: HTMLElement, maxLayers: number, viewport?: DOMRect): Snapshot {
  const layers: Layer[] = [];
  const masters = new Map<string, Layer>();
  const scrollX = window.scrollX, scrollY = window.scrollY;
  const rootStyle = getComputedStyle(target);
  let background = rootStyle.backgroundColor;
  if (transparent(background)) background = getComputedStyle(document.documentElement).backgroundColor;
  if (transparent(background)) background = '#ffffff';
  const visible = (rect: DOMRect, clip?: DOMRect) => !clip ||
    (rect.bottom > clip.top && rect.top < clip.bottom && rect.right > clip.left && rect.left < clip.right);
  const add = (kind: Layer['kind'], rect: DOMRect, visual: HTMLElement, parent?: Layer, signature = '') => {
    const element = document.createElement('div');
    const x = rect.left + scrollX, y = rect.top + scrollY;
    element.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${rect.width}px;height:${rect.height}px;visibility:hidden;pointer-events:none;box-sizing:border-box;`;
    element.append(visual);
    stage.append(element);
    const layer: Layer = { id: layers.length, kind, x, y, width: rect.width, height: rect.height, element, parent, signature, done: false, started: false, opacity: visual.style.opacity };
    if (kind === 'box' && signature) {
      layer.master = masters.get(signature);
      if (!layer.master) masters.set(signature, layer);
    }
    layers.push(layer);
    return layer;
  };

  const walk = (el: Element, parent?: Layer, opacity = 1, clip?: DOMRect) => {
    if (layers.length >= maxLayers || ignoredTags.has(el.tagName.toUpperCase()) || el.hasAttribute('data-swarm-ignore') || el.hasAttribute('data-swarm-overlay')) return;
    const css = getComputedStyle(el);
    if (css.display === 'none' || css.visibility === 'hidden' || css.contentVisibility === 'hidden') return;
    opacity *= Number(css.opacity);
    if (opacity < .01) return;
    const rect = el.getBoundingClientRect();
    if (rect.top + scrollY > 40000 || rect.bottom + scrollY < 0) return;
    let own = parent;
    const withClip = (layer: Layer) => {
      if (!clip) return;
      const top = Math.max(0, clip.top - rect.top), right = Math.max(0, rect.right - clip.right);
      const bottom = Math.max(0, rect.bottom - clip.bottom), left = Math.max(0, clip.left - rect.left);
      layer.element.style.clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px)`;
    };
    if (rect.width > 0 && rect.height > 0 && visible(rect, clip)) {
      if (mediaTags.has(el.tagName.toUpperCase())) {
        const visual = document.createElement('div');
        visual.style.cssText = 'width:100%;height:100%;overflow:hidden;';
        let clone: Element;
        if (el instanceof HTMLCanvasElement) {
          const canvas = document.createElement('canvas');
          canvas.width = el.width; canvas.height = el.height;
          try { canvas.getContext('2d')?.drawImage(el, 0, 0); } catch { /* A protected drawing surface stays blank. */ }
          clone = canvas;
        } else if (el instanceof HTMLVideoElement) {
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, el.videoWidth); canvas.height = Math.max(1, el.videoHeight);
          try { canvas.getContext('2d')?.drawImage(el, 0, 0); } catch { /* Poster is used if the video cannot be read. */ }
          if (el.poster && el.readyState < 2) { const image = document.createElement('img'); image.src = el.poster; clone = image; } else clone = canvas;
        } else if (el instanceof HTMLIFrameElement) {
          clone = document.createElement('div');
          clone.textContent = 'Embedded content';
        } else {
          clone = el.cloneNode(true) as Element;
        }
        copyStyles(el, clone);
        if (clone instanceof HTMLElement || clone instanceof SVGElement) {
          clone.style.cssText += ';position:relative!important;inset:auto!important;margin:0!important;transform:none!important;width:100%!important;height:100%!important;box-sizing:border-box!important;';
          if (el instanceof HTMLInputElement && clone instanceof HTMLInputElement) {
            clone.value = el.type === 'password' ? '••••••' : el.value;
            clone.name = ''; clone.disabled = true;
          }
          if (el instanceof HTMLTextAreaElement && clone instanceof HTMLTextAreaElement) clone.value = el.value;
          if (el instanceof HTMLSelectElement && clone instanceof HTMLSelectElement) clone.selectedIndex = el.selectedIndex;
        }
        visual.append(clone);
        withClip(add('media', rect, visual, parent));
        return;
      }
      const hasBorder = ['Top', 'Right', 'Bottom', 'Left'].some(s => parseFloat(css.getPropertyValue(`border-${s.toLowerCase()}-width`)) > 0 && css.getPropertyValue(`border-${s.toLowerCase()}-style`) !== 'none');
      if (!transparent(css.backgroundColor) || css.backgroundImage !== 'none' || hasBorder || css.boxShadow !== 'none') {
        const visual = document.createElement('div');
        visual.style.cssText = 'width:100%;height:100%;box-sizing:border-box;';
        for (const property of boxProps) visual.style.setProperty(property, css.getPropertyValue(property));
        visual.style.opacity = String(opacity);
        const signature = `${Math.round(rect.width)}:${Math.round(rect.height)}:${css.background}:${css.border}:${css.borderRadius}`;
        own = add(rect.height <= 3 || rect.width <= 3 ? 'line' : 'box', rect, visual, parent, signature);
        withClip(own);
      }
    }
    // Range geometry preserves wrapping, inline links and mixed font styles.
    for (const node of Array.from(el.childNodes)) {
      if (layers.length >= maxLayers) break;
      if (node.nodeType === Node.ELEMENT_NODE) { walk(node as Element, own, opacity, nextClip()); continue; }
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const bounds = range.getBoundingClientRect();
      if (!bounds.width || !bounds.height || !visible(bounds, nextClip())) continue;
      const visual = document.createElement('div');
      const runs: { node: HTMLElement; value: string }[] = [];
      let lastY = -Infinity, lastX = -Infinity;
      let current: HTMLElement | undefined;
      // Cap character geometry work on pathological text nodes.
      const raw = node.textContent.slice(0, 12000);
      for (let index = 0; index < raw.length; index++) {
        range.setStart(node, index); range.setEnd(node, index + 1);
        const char = range.getBoundingClientRect();
        if (!char.width && /\s/.test(raw[index])) continue;
        if (!current || Math.abs(char.top - lastY) > 2 || char.left < lastX - 2) {
          current = document.createElement('span');
          for (const property of textProps) current.style.setProperty(property, css.getPropertyValue(property));
          current.style.cssText += `;position:absolute;left:${char.left - bounds.left}px;top:${char.top - bounds.top}px;white-space:pre;line-height:${char.height}px;opacity:${opacity};`;
          visual.append(current); runs.push({ node: current, value: '' });
        }
        runs[runs.length - 1].value += raw[index];
        lastY = char.top; lastX = char.left;
      }
      const layer = add('text', bounds, visual, own);
      layer.text = runs;
      // Apply the clipping ancestor to the text's own geometry.
      if (clip) layer.element.style.clipPath = `inset(${Math.max(0, clip.top - bounds.top)}px ${Math.max(0, bounds.right - clip.right)}px ${Math.max(0, bounds.bottom - clip.bottom)}px ${Math.max(0, clip.left - bounds.left)}px)`;
    }
    function nextClip() {
      if (!['hidden', 'clip', 'auto', 'scroll'].some(v => css.overflowX === v || css.overflowY === v)) return clip;
      if (el === document.body || el === document.documentElement) return clip;
      if (!clip) return rect;
      return new DOMRect(Math.max(clip.left, rect.left), Math.max(clip.top, rect.top), Math.max(0, Math.min(clip.right, rect.right) - Math.max(clip.left, rect.left)), Math.max(0, Math.min(clip.bottom, rect.bottom) - Math.max(clip.top, rect.top)));
    }
    if (el.shadowRoot) for (const child of Array.from(el.shadowRoot.children)) walk(child, own, opacity, nextClip());
  };
  walk(target, undefined, 1, viewport);
  return { layers, background };
}
