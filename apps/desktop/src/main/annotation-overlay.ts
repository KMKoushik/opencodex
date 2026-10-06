import type { BrowserAnnotation, BrowserAnnotationTheme } from '@opencodex/contracts/desktop';

type Rect = { x: number; y: number; width: number; height: number };
export type OverlayResult = {
  annotation: Omit<BrowserAnnotation, 'screenshot'>;
  crop: Rect | null;
};

/**
 * The comment overlay drawn inside a browser panel page, after T3 Code's preview annotations.
 * It runs in an isolated world: it shares the page's DOM but not its JavaScript, so the page
 * cannot read or call it. It is serialized with `Function.prototype.toString`, so it must not
 * reference anything outside its own body.
 *
 * Resolves with the annotation once the user attaches it, leaving the marks drawn for the
 * screenshot until `close()`, or with null when cancelled.
 */
export function annotationOverlay(theme: BrowserAnnotationTheme): Promise<OverlayResult | null> {
  type Point = { x: number; y: number };
  type Tool = 'select' | 'region' | 'draw' | 'erase';
  type Controller = { cancel(): void; close(): void };
  const scope = globalThis as unknown as { __opencodexAnnotation?: Controller };
  scope.__opencodexAnnotation?.cancel();

  const MAX_ELEMENTS = 20;
  const MAX_MARKS = 50;
  const SVG = 'http://www.w3.org/2000/svg';

  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none';
    for (const [name, value] of Object.entries(theme)) host.style.setProperty(`--${name}`, value);
    const shadow = host.attachShadow({ mode: 'closed' });
    // Constructed sheets are not inline styles, so a strict page CSP does not block them.
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(`
      :host { all: initial; }
      * { box-sizing: border-box; font-family: var(--font); }
      .box { position: fixed; left: 0; top: 0; display: none; border: 2px solid var(--primary);
        border-radius: 3px; background: color-mix(in srgb, var(--primary) 10%, transparent);
        pointer-events: none; }
      .label { position: fixed; left: 0; top: 0; max-width: 280px; padding: 2px 6px; overflow: hidden;
        border-radius: 4px; background: var(--primary); color: var(--onPrimary); font-size: 11px;
        font-weight: 600; line-height: 16px; white-space: nowrap; text-overflow: ellipsis;
        pointer-events: none; }
      svg { position: fixed; inset: 0; width: 100%; height: 100%; overflow: visible;
        pointer-events: none; }
      .toolbar, .editor { position: fixed; z-index: 1; border: 1px solid var(--border);
        background: var(--surface); color: var(--text); box-shadow: 0 8px 28px rgb(0 0 0 / 24%);
        pointer-events: auto; }
      .toolbar { top: 10px; left: 50%; display: flex; gap: 2px; padding: 4px; border-radius: 10px;
        transform: translateX(-50%); }
      button { height: 30px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent;
        color: inherit; font-size: 13px; font-weight: 500; cursor: pointer; }
      button:hover { background: color-mix(in srgb, var(--text) 8%, transparent); }
      button[aria-pressed='true'] { background: color-mix(in srgb, var(--primary) 16%, transparent);
        color: var(--primary); }
      .close { width: 30px; padding: 0; color: var(--muted); font-size: 16px; }
      .editor { display: none; left: 0; top: 0; width: min(340px, calc(100vw - 16px)); gap: 8px;
        align-items: flex-end; padding: 8px; border-radius: 12px; }
      textarea { flex: 1; min-width: 0; max-height: 96px; padding: 6px 2px; border: 0; outline: 0;
        background: transparent; color: var(--text); font-size: 13px; line-height: 18px;
        resize: none; field-sizing: content; }
      textarea::placeholder { color: var(--muted); }
      .attach { flex: none; background: var(--primary); color: var(--onPrimary); }
      .attach:hover { background: color-mix(in srgb, var(--primary) 88%, black); }
    `);
    shadow.adoptedStyleSheets = [sheet];
    const cursor = new CSSStyleSheet();
    cursor.replaceSync(
      'html[data-opencodex-annotating] body, html[data-opencodex-annotating] body * { cursor: crosshair !important; user-select: none !important; }',
    );
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, cursor];

    const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '') => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      return node;
    };
    const hover = element('div', 'box');
    const marquee = element('div', 'box');
    const svg = document.createElementNS(SVG, 'svg');
    const toolbar = element('div', 'toolbar');
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Comment tools');
    const editor = element('div', 'editor');
    const comment = element('textarea');
    comment.placeholder = 'Describe the change…';
    comment.rows = 1;
    comment.maxLength = 4000;
    comment.setAttribute('aria-label', 'Comment');
    const attach = element('button', 'attach');
    attach.type = 'button';
    attach.textContent = 'Attach';
    attach.title = 'Attach the comment and a screenshot to the chat (Enter)';
    editor.append(comment, attach);
    shadow.append(svg, hover, marquee, toolbar, editor);

    let tool: Tool = 'select';
    const toolButtons = new Map<Tool, HTMLButtonElement>();
    for (const [id, label, title] of [
      ['select', 'Select', 'Select elements; Shift-click adds more (V)'],
      ['region', 'Region', 'Mark a region (R)'],
      ['draw', 'Draw', 'Draw freehand (D)'],
      ['erase', 'Erase', 'Remove a mark (E)'],
    ] as const) {
      const button = element('button');
      button.type = 'button';
      button.textContent = label;
      button.title = title;
      button.addEventListener('click', () => setTool(id));
      toolButtons.set(id, button);
      toolbar.append(button);
    }
    const close = element('button', 'close');
    close.type = 'button';
    close.textContent = '×';
    close.title = 'Cancel (Esc)';
    close.setAttribute('aria-label', 'Cancel comment');
    close.addEventListener('click', () => finish(null));
    toolbar.append(close);

    const selected = new Map<Element, { outline: HTMLDivElement; label: HTMLDivElement }>();
    const regions: { rect: Rect; box: HTMLDivElement }[] = [];
    const strokes: { points: Point[]; bounds: Rect; path: SVGPathElement }[] = [];
    let start: Point | null = null;
    let stroke: (typeof strokes)[number] | null = null;
    let submitted = false;
    let frame = 0;

    const fromDOMRect = (rect: DOMRect): Rect => ({
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    });
    const place = (node: HTMLElement, rect: Rect) => {
      node.style.display = 'block';
      node.style.transform = `translate(${rect.x}px, ${rect.y}px)`;
      node.style.width = `${rect.width}px`;
      node.style.height = `${rect.height}px`;
    };
    const contains = (rect: Rect, x: number, y: number) =>
      x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
    const between = (a: Point, b: Point): Rect => ({
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(a.x - b.x),
      height: Math.abs(a.y - b.y),
    });
    const union = (rects: Rect[], padding: number): Rect | null => {
      if (!rects.length) return null;
      const left = Math.max(0, Math.min(...rects.map((rect) => rect.x)) - padding);
      const top = Math.max(0, Math.min(...rects.map((rect) => rect.y)) - padding);
      const right = Math.min(
        innerWidth,
        Math.max(...rects.map((rect) => rect.x + rect.width)) + padding,
      );
      const bottom = Math.min(
        innerHeight,
        Math.max(...rects.map((rect) => rect.y + rect.height)) + padding,
      );
      if (right - left < 1 || bottom - top < 1) return null;
      return { x: left, y: top, width: right - left, height: bottom - top };
    };
    const markRects = () => [
      ...[...selected.keys()].map((target) => fromDOMRect(target.getBoundingClientRect())),
      ...regions.map((region) => region.rect),
      ...strokes.map((item) => item.bounds),
    ];
    const ours = (event: Event) => event.composedPath().includes(host);
    const pick = (x: number, y: number) =>
      document
        .elementsFromPoint(x, y)
        .find(
          (node) => node !== host && node !== document.documentElement && node !== document.body,
        );
    const describe = (target: Element) => {
      const classes =
        typeof target.className === 'string'
          ? target.className
              .trim()
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((name) => `.${name}`)
              .join('')
          : '';
      return `${target.tagName.toLowerCase()}${target.id ? `#${target.id}` : ''}${classes}`;
    };
    const selector = (target: Element) => {
      const parts: string[] = [];
      for (
        let node: Element | null = target;
        node && node !== document.documentElement && parts.length < 8;
        node = node.parentElement
      ) {
        if (node.id && document.querySelectorAll(`#${CSS.escape(node.id)}`).length === 1) {
          parts.unshift(`#${CSS.escape(node.id)}`);
          break;
        }
        const tag = node.tagName;
        const siblings = node.parentElement
          ? [...node.parentElement.children].filter((sibling) => sibling.tagName === tag)
          : [];
        parts.unshift(
          `${tag.toLowerCase()}${siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(node) + 1})` : ''}`,
        );
      }
      return parts.join(' > ');
    };

    const layout = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        for (const [target, marks] of selected) {
          if (!target.isConnected) {
            marks.outline.style.display = marks.label.style.display = 'none';
            continue;
          }
          const rect = target.getBoundingClientRect();
          place(marks.outline, fromDOMRect(rect));
          marks.label.style.transform = `translate(${Math.max(4, rect.left)}px, ${Math.max(4, rect.top - 22)}px)`;
        }
        const bounds = union(markRects(), 0);
        const marked = Boolean(bounds) && !submitted;
        editor.style.display = marked ? 'flex' : 'none';
        if (!bounds || !marked) return;
        const size = editor.getBoundingClientRect();
        const gap = 8;
        const candidates = [
          { left: bounds.x + bounds.width + gap, top: bounds.y },
          { left: bounds.x - size.width - gap, top: bounds.y },
          { left: bounds.x + bounds.width - size.width, top: bounds.y + bounds.height + gap },
          { left: bounds.x + bounds.width - size.width, top: bounds.y - size.height - gap },
        ];
        const overflow = ({ left, top }: { left: number; top: number }) =>
          Math.max(0, -left) +
          Math.max(0, -top) +
          Math.max(0, left + size.width - innerWidth) +
          Math.max(0, top + size.height - innerHeight);
        const best = candidates.reduce((a, b) => (overflow(b) < overflow(a) ? b : a));
        const left = Math.min(Math.max(8, best.left), Math.max(8, innerWidth - size.width - 8));
        const top = Math.min(Math.max(8, best.top), Math.max(8, innerHeight - size.height - 8));
        editor.style.transform = `translate(${left}px, ${top}px)`;
      });
    };
    const changed = () => {
      const empty = editor.style.display === 'none';
      layout();
      if (empty) requestAnimationFrame(() => comment.focus({ preventScroll: true }));
    };
    const markCount = () => selected.size + regions.length + strokes.length;
    const setTool = (next: Tool) => {
      tool = next;
      for (const [id, button] of toolButtons)
        button.setAttribute('aria-pressed', String(id === tool));
      hover.style.display = 'none';
      marquee.style.display = 'none';
    };
    const select = (target: Element, additive: boolean) => {
      const existing = selected.get(target);
      if (existing) {
        existing.outline.remove();
        existing.label.remove();
        selected.delete(target);
        return changed();
      }
      if (!additive) {
        for (const marks of selected.values()) {
          marks.outline.remove();
          marks.label.remove();
        }
        selected.clear();
      }
      if (selected.size >= MAX_ELEMENTS) return;
      const outline = element('div', 'box');
      const label = element('div', 'label');
      label.textContent = describe(target);
      shadow.insertBefore(label, toolbar);
      shadow.insertBefore(outline, label);
      selected.set(target, { outline, label });
      changed();
    };
    const erase = (x: number, y: number) => {
      for (const [target, marks] of [...selected].reverse()) {
        if (!contains(fromDOMRect(target.getBoundingClientRect()), x, y)) continue;
        marks.outline.remove();
        marks.label.remove();
        selected.delete(target);
        return changed();
      }
      const region = regions.findLastIndex((item) => contains(item.rect, x, y));
      if (region >= 0) {
        regions.splice(region, 1)[0]!.box.remove();
        return changed();
      }
      const drawn = strokes.findLastIndex((item) => contains(item.bounds, x, y));
      if (drawn >= 0) {
        strokes.splice(drawn, 1)[0]!.path.remove();
        changed();
      }
    };
    const path = (points: Point[]) => {
      let d = `M ${points[0]!.x} ${points[0]!.y}`;
      for (let index = 1; index < points.length - 1; index++) {
        const point = points[index]!;
        const next = points[index + 1]!;
        d += ` Q ${point.x} ${point.y} ${(point.x + next.x) / 2} ${(point.y + next.y) / 2}`;
      }
      const last = points.at(-1)!;
      return `${d} L ${last.x} ${last.y}`;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (submitted || ours(event)) {
        hover.style.display = 'none';
        return;
      }
      const point = { x: event.clientX, y: event.clientY };
      if (tool === 'select') {
        const target = pick(point.x, point.y);
        if (target) place(hover, fromDOMRect(target.getBoundingClientRect()));
        else hover.style.display = 'none';
      } else if (tool === 'region' && start) {
        place(marquee, between(start, point));
      } else if (tool === 'draw' && stroke) {
        stroke.points.push(point);
        const xs = stroke.points.map((item) => item.x);
        const ys = stroke.points.map((item) => item.y);
        stroke.bounds = {
          x: Math.min(...xs) - 6,
          y: Math.min(...ys) - 6,
          width: Math.max(...xs) - Math.min(...xs) + 12,
          height: Math.max(...ys) - Math.min(...ys) + 12,
        };
        stroke.path.setAttribute('d', path(stroke.points));
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (submitted || ours(event) || event.button !== 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const point = { x: event.clientX, y: event.clientY };
      if (tool === 'select') {
        const target = pick(point.x, point.y);
        if (target) select(target, event.shiftKey);
      } else if (tool === 'erase') erase(point.x, point.y);
      else if (markCount() < MAX_MARKS) {
        start = point;
        if (tool === 'draw') {
          const line = document.createElementNS(SVG, 'path');
          for (const [name, value] of [
            ['fill', 'none'],
            ['stroke', theme.primary],
            ['stroke-width', '4'],
            ['stroke-linecap', 'round'],
            ['stroke-linejoin', 'round'],
          ] as const)
            line.setAttribute(name, value);
          svg.append(line);
          stroke = {
            points: [point],
            bounds: { x: point.x, y: point.y, width: 1, height: 1 },
            path: line,
          };
        }
      }
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!start) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (tool === 'region') {
        const rect = between(start, { x: event.clientX, y: event.clientY });
        marquee.style.display = 'none';
        if (rect.width >= 4 && rect.height >= 4) {
          const box = element('div', 'box');
          shadow.insertBefore(box, toolbar);
          place(box, rect);
          regions.push({ rect, box });
        }
      } else if (stroke) {
        if (stroke.points.length > 1) strokes.push(stroke);
        else stroke.path.remove();
        stroke = null;
      }
      start = null;
      changed();
    };
    // The page must not act on clicks, focus changes, or selections meant for the overlay.
    const block = (event: Event) => {
      if (ours(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (submitted) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        return finish(null);
      }
      // A closed shadow root hides its nodes from `composedPath()` outside it.
      const typing = shadow.activeElement === comment;
      if (typing) {
        event.stopImmediatePropagation();
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
          event.preventDefault();
          submit();
        }
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const next = ({ v: 'select', r: 'region', d: 'draw', e: 'erase' } as const)[
        event.key.toLowerCase() as 'v'
      ];
      if (!next) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setTool(next);
    };

    const listeners: [string, (event: never) => void, AddEventListenerOptions][] = [
      ['pointermove', onPointerMove, { capture: true, passive: true }],
      ['pointerdown', onPointerDown, { capture: true }],
      ['pointerup', onPointerUp, { capture: true }],
      ['mousedown', block, { capture: true }],
      ['click', block, { capture: true }],
      ['dblclick', block, { capture: true }],
      ['contextmenu', block, { capture: true }],
      ['keydown', onKeyDown, { capture: true }],
      ['scroll', layout, { capture: true, passive: true }],
      ['resize', layout, { passive: true }],
    ];
    for (const [type, listener, options] of listeners)
      addEventListener(type, listener as EventListener, options);

    const teardown = () => {
      cancelAnimationFrame(frame);
      for (const [type, listener, options] of listeners)
        removeEventListener(type, listener as EventListener, options);
      host.remove();
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((item) => item !== cursor);
      document.documentElement.removeAttribute('data-opencodex-annotating');
      if (scope.__opencodexAnnotation === controller) delete scope.__opencodexAnnotation;
    };
    let settled = false;
    const finish = (result: OverlayResult | null) => {
      if (settled) return;
      settled = true;
      if (!result) teardown();
      resolve(result);
    };
    const submit = () => {
      if (submitted || !markCount()) return;
      submitted = true;
      const annotation = {
        url: location.href,
        title: document.title.trim().slice(0, 300),
        comment: comment.value.trim(),
        elements: [...selected.keys()].map((target) => ({
          tag: target.tagName.toLowerCase(),
          selector: selector(target).slice(0, 500),
          text: (target.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200),
          html: target.outerHTML.slice(0, 500),
        })),
        regions: regions.length,
        drawings: strokes.length,
      };
      const crop = union(markRects(), 24);
      // Keep the marks in the screenshot, without the tools.
      toolbar.style.display = editor.style.display = hover.style.display = 'none';
      requestAnimationFrame(() =>
        requestAnimationFrame(() => finish({ annotation, crop: crop && roundRect(crop) })),
      );
    };
    const roundRect = (rect: Rect): Rect => ({
      x: Math.floor(rect.x),
      y: Math.floor(rect.y),
      width: Math.ceil(rect.width),
      height: Math.ceil(rect.height),
    });
    attach.addEventListener('click', submit);

    const controller: Controller = { cancel: () => finish(null), close: teardown };
    scope.__opencodexAnnotation = controller;
    document.documentElement.setAttribute('data-opencodex-annotating', '');
    document.documentElement.append(host);
    setTool('select');
  });
}
