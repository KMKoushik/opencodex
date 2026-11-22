/* global document, getComputedStyle, NodeFilter, innerWidth, innerHeight */
// Runs in the actual Electron renderer, after capture. No layout normalisation.
export function measureAlignment() {
  const items = [];
  const colorCache = new Map();
  const pixel = document.createElement('canvas');
  pixel.width = pixel.height = 1;
  const ink = pixel.getContext('2d', { willReadFrequently: true });
  const rgba = (value) => {
    if (colorCache.has(value)) return colorCache.get(value);
    ink.clearRect(0, 0, 1, 1);
    ink.fillStyle = value;
    ink.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ink.getImageData(0, 0, 1, 1).data;
    const color = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
    colorCache.set(value, color);
    return color;
  };
  const roots = [document];
  for (let i = 0; i < roots.length; i++)
    for (const e of roots[i].querySelectorAll('*')) if (e.shadowRoot) roots.push(e.shadowRoot);
  const inScope = (e) => e.closest(scope) || e.getRootNode().host?.closest(scope);
  const box = (r) => [r.x, r.y, r.width, r.height];
  const scope =
    'button,input,textarea,header,nav,summary,[role],.toolbar,.sidebar,.composer,.settings-page,.workbench,.select-menu,.slash-menu,.model-picker,.session-panel,.find-bar,.question-dock';
  const visible = (e, r) => {
    const c = getComputedStyle(e);
    if (c.visibility !== 'visible' || c.display === 'none' || Number(c.opacity) === 0) return false;
    if (
      r.width <= 0 ||
      r.height <= 0 ||
      r.right <= 0 ||
      r.bottom <= 0 ||
      r.x >= innerWidth ||
      r.y >= innerHeight
    )
      return false;
    for (let p = e; p; p = p.parentElement) {
      const s = getComputedStyle(p),
        b = p.getBoundingClientRect();
      if (Number(s.opacity) === 0) return false;
      if (/(hidden|clip|auto|scroll)/.test(s.overflowY) && (r.bottom <= b.top || r.top >= b.bottom))
        return false;
      if (/(hidden|clip|auto|scroll)/.test(s.overflowX) && (r.right <= b.left || r.left >= b.right))
        return false;
    }
    return true;
  };
  const metadata = (e) => {
    const c = getComputedStyle(e),
      control = e.closest('button,[role],input,textarea');
    return {
      element: box(e.getBoundingClientRect()),
      class: typeof e.className === 'string' ? e.className : e.getAttribute('class'),
      label: control?.getAttribute('aria-label'),
      fontSize: parseFloat(c.fontSize),
      fontWeight: Number(c.fontWeight),
      fontFamily: c.fontFamily,
      lineHeight: c.lineHeight,
      color: rgba(c.color),
    };
  };
  const nodes = [];
  let previousParent;
  for (const root of roots) {
    const walker = document.createTreeWalker(
      root === document ? document.body : root,
      NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode()) nodes.push(walker.currentNode);
  }
  for (const node of nodes) {
    const e = node.parentElement;
    if (!node.textContent.trim() || !inScope(e) || e.closest('svg,script,style')) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()];
    if (!rects.some((r) => visible(e, r))) continue;
    // A zero-height inline-block's bottom is exactly the CSS baseline. Probe an
    // offscreen inline formatting context with the same font and glyphs: adding
    // a strut directly to a flex button would instead create another flex item.
    const sample = document.createElement('span');
    const style = getComputedStyle(e);
    sample.style.cssText =
      'position:fixed;left:-10000px;top:0;white-space:pre;pointer-events:none;';
    for (const name of [
      'fontFamily',
      'fontSize',
      'fontWeight',
      'fontStyle',
      'fontStretch',
      'fontVariant',
      'fontFeatureSettings',
      'fontVariationSettings',
      'lineHeight',
      'letterSpacing',
    ])
      sample.style[name] = style[name];
    sample.textContent = node.textContent;
    const marker = document.createElement('span');
    marker.style.cssText =
      'display:inline-block;width:0;height:0;padding:0;margin:0;border:0;vertical-align:baseline;';
    sample.append(marker);
    document.body.append(sample);
    const probe = document.createRange();
    probe.selectNodeContents(sample.firstChild);
    const baseline =
      rects.at(-1).y + marker.getBoundingClientRect().y - [...probe.getClientRects()].at(-1).y;
    sample.remove();
    const previous = items.at(-1);
    if (
      previousParent === e &&
      previous?.kind === 'text' &&
      rects.length === 1 &&
      previous.rects.length === 1 &&
      Math.abs(previous.baseline - baseline) < 0.01 &&
      Math.abs(previous.rect[0] + previous.rect[2] - rects[0].x) < 0.5
    ) {
      previous.text += node.textContent.trim();
      previous.rect[2] = rects[0].right - previous.rect[0];
      previous.rects = [previous.rect];
      continue;
    }
    previousParent = e;
    items.push({
      kind: 'text',
      text: node.textContent.trim(),
      rect: box(rects[0]),
      rects: rects.map(box),
      baseline,
      ...metadata(e),
    });
  }
  for (const e of roots.flatMap((root) => [...root.querySelectorAll('svg,img,input,textarea')])) {
    const r = e.getBoundingClientRect();
    if (
      !inScope(e) ||
      !visible(e, r) ||
      (e.closest('svg') !== null && e.tagName.toLowerCase() !== 'svg')
    )
      continue;
    const kind = /input|textarea/i.test(e.tagName)
      ? ['checkbox', 'radio', 'color'].includes(e.type)
        ? 'control'
        : 'input'
      : 'icon';
    let inputMetrics = {};
    if (kind === 'input') {
      const style = getComputedStyle(e);
      const font = getComputedStyle(e, e.value ? null : '::placeholder');
      const sample = document.createElement('span');
      sample.style.cssText = 'position:fixed;left:-10000px;top:0;white-space:pre;';
      for (const name of [
        'fontFamily',
        'fontSize',
        'fontWeight',
        'fontStyle',
        'fontStretch',
        'fontVariant',
        'fontFeatureSettings',
        'fontVariationSettings',
        'lineHeight',
        'letterSpacing',
      ])
        sample.style[name] = font[name];
      sample.textContent = e.value || e.placeholder || ' ';
      const marker = document.createElement('span');
      marker.style.cssText =
        'display:inline-block;width:0;height:0;padding:0;margin:0;border:0;vertical-align:baseline;';
      sample.append(marker);
      document.body.append(sample);
      const leading = marker.getBoundingClientRect().y - sample.getBoundingClientRect().y;
      const lineBoxHeight = sample.getBoundingClientRect().height;
      sample.remove();
      const inset = parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop);
      const verticalCenter =
        e.tagName === 'INPUT'
          ? (r.height -
              inset -
              parseFloat(style.borderBottomWidth) -
              parseFloat(style.paddingBottom) -
              lineBoxHeight) /
            2
          : 0;
      inputMetrics = {
        baseline: r.y + inset + verticalCenter + leading,
        textX: r.x + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft),
        color: rgba(font.color),
        fontSize: parseFloat(font.fontSize),
        fontWeight: Number(font.fontWeight),
      };
    }
    items.push({
      kind,
      text: kind === 'input' ? e.value || e.placeholder : undefined,
      icon:
        e.getAttribute('data-icon') ||
        e.querySelector('use')?.getAttribute('href') ||
        e.getAttribute('class') ||
        e.tagName.toLowerCase(),
      source: e.tagName === 'IMG' ? e.getAttribute('src') : e.outerHTML,
      shapes: [...e.querySelectorAll('circle')].map((c) => ({
        radius: (Number(c.getAttribute('r')) * r.width) / Number(e.viewBox.baseVal.width),
        stroke: rgba(getComputedStyle(c).stroke),
        strokeWidth:
          (parseFloat(getComputedStyle(c).strokeWidth) * r.width) / Number(e.viewBox.baseVal.width),
      })),
      rect: box(r),
      center: [r.x + r.width / 2, r.y + r.height / 2],
      ...metadata(e),
      ...inputMetrics,
    });
  }
  return { units: 'CSS points', measurementVersion: 2, items };
}
