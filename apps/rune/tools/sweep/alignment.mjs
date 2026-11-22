import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const norm = (s) =>
  (s ?? '')
    .replace(/[\u200b\u2060\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const center = (r) => [r[0] + r[2] / 2, r[1] + r[3] / 2];
function labelMismatch(e, n) {
  const alias = (s) => norm(s).replace(/^OpenCodex menu$/, 'App menu');
  return e.label && n.label && alias(e.label) !== alias(n.label) && shape(e.source) !== n.signature;
}
function nearShape(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const numbers = /-?\d*\.?\d+/g;
  if (a.replace(numbers, '#') !== b.replace(numbers, '#')) return false;
  const x = a.match(numbers).map(Number),
    y = b.match(numbers).map(Number);
  return x.length === y.length && x.every((v, i) => Math.abs(v - y[i]) < 0.001);
}
function rgba(s) {
  if (!s) return null;
  if (s.startsWith('#')) {
    const bytes = s
      .slice(1)
      .match(/../g)
      .map((x) => parseInt(x, 16));
    return bytes.length === 3 ? [...bytes, 255] : bytes;
  }
  const n = s.match(/-?\d*\.?\d+/g)?.map(Number);
  // Old captures retained CSS Color 4 color-mix output. Lab coordinates are
  // not byte RGB; normalize these too when comparing saved before evidence.
  if (s.startsWith('oklab(')) {
    const [L, a, b, alpha = 1] = n;
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const q = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const rgb = [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * q,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * q,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * q,
    ];
    return [
      ...rgb.map((v) =>
        Math.round(
          Math.max(0, Math.min(1, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)) *
            255,
        ),
      ),
      Math.round(alpha * 255),
    ];
  }
  return n ? [...n.slice(0, 3), Math.round((n[3] ?? 1) * 255)] : null;
}
function shape(svg = '') {
  // Compare actual vector geometry, not arbitrary framework-local icon names.
  return [...svg.matchAll(/<(path|circle|ellipse|rect|line|polyline|polygon)\b([^>]*)/g)]
    .map(([, tag, attrs]) => {
      const values = [
        ...attrs.matchAll(
          /(?:^|\s)(d|points|cx|cy|r|rx|ry|x|y|x1|x2|y1|y2|width|height)="([^"]*)"/g,
        ),
      ]
        .map(([, k, v]) => [
          k,
          v
            .replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi, (n) => Number(Number(n).toFixed(4)))
            .replace(/[\s,]+/g, ' ')
            .trim(),
        ])
        .sort();
      const stroke =
        attrs.match(/stroke-width="([^"]+)"/)?.[1] ?? svg.match(/stroke-width="([^"]+)"/)?.[1];
      if (stroke) values.push(['stroke-width', Number(stroke)]);
      return [tag, values];
    })
    .map(JSON.stringify)
    .join('|');
}

export function compareAlignment(stem) {
  const electron = JSON.parse(readFileSync(stem + '.electron-alignment.json'));
  // Older raw evidence included Range bounds behind zero-width `.truncate`
  // elements. This known overflow-hidden class paints none of those glyphs.
  if (!electron.measurementVersion)
    electron.items = electron.items.filter(
      (e) =>
        !(e.kind === 'text' && e.class?.split(/\s+/).includes('truncate') && e.element?.[2] === 0),
    );
  for (const e of electron.items)
    if (e.kind === 'input' && /type="(color|checkbox|radio)"/.test(e.source ?? ''))
      e.kind = 'control';
  const tree = JSON.parse(readFileSync(stem + '.tree.json'));
  const all = tree.elements;
  for (const e of all) {
    if (e.spanColor) e.color = e.spanColor;
    if (
      e.path.includes('/workspace-tree/') &&
      e.radius === 3 &&
      e.rect[2] === 6 &&
      e.rect[3] === 6 &&
      e.fill !== '#00000000'
    ) {
      e.icon = 'file-tree-icon-dot';
      e.color = e.fill;
    }
    if (e.placeholder) {
      e.text = e.placeholder.text;
      e.textOrigin = e.placeholder.origin;
      e.lines = e.placeholder.baselines.map((baseline) => ({ baseline }));
      for (const key of ['color', 'fontSize', 'fontWeight', 'lineHeight'])
        e[key] = e.placeholder[key];
    }
    if (e.borderWidth && Math.abs(e.radius - e.rect[2] / 2) < 0.1 && e.rect[2] === e.rect[3]) {
      const parent = all.find(
        (p) => e.path.startsWith(p.path + '/') && p.key === 'context-indicator',
      );
      if (parent) {
        e.circle = { radius: (e.rect[2] - e.borderWidth) / 2, strokeWidth: e.borderWidth };
        const c = center(e.rect);
        e.rect = [c[0] - 10, c[1] - 10, 20, 20];
        e.color = e.borderColor;
      }
    }
  }
  const visible = (e) => {
    const r = e.visible ?? e.rect;
    return (
      e.opacity > 0 &&
      r[2] > 0 &&
      r[3] > 0 &&
      r[0] < tree.viewport[0] &&
      r[1] < tree.viewport[1] &&
      r[0] + r[2] > 0 &&
      r[1] + r[3] > 0
    );
  };
  const native = all
    .filter((e) => visible(e) && (e.text || e.icon || e.image || e.circle || e.role === 'textbox'))
    .map((e) => {
      const parent = all
        .filter((p) => e.path.startsWith(p.path + '/') && p.label)
        .sort((a, b) => b.path.length - a.path.length)[0];
      return {
        ...e,
        kind:
          ['textbox', 'combobox'].includes(e.role) && e.text ? 'input' : e.text ? 'text' : 'icon',
        label: e.label ?? parent?.label,
        baseline: (e.role === 'textbox' ? e.lines?.[0] : e.lines?.at(-1))?.baseline,
        text: norm(e.text),
        center: center(e.rect),
        signature: shape(e.iconBody),
      };
    });
  const matched = new Set(),
    pairs = [],
    unmatched = [];
  for (const e of electron.items) {
    const text = norm(e.text);
    const candidates = native.filter(
      (n) =>
        !matched.has(n.path) &&
        (e.kind === 'text'
          ? n.kind === 'text' && n.text === text
          : e.kind === 'icon'
            ? n.kind === 'icon' && !labelMismatch(e, n)
            : e.kind === 'input'
              ? ['textbox', 'combobox'].includes(n.role) && n.text === text
              : n.role === 'checkbox'),
    );
    const label = norm(e.label);
    const sig = shape(e.source);
    const point = center(e.rect);
    const isText = e.kind === 'text' || e.kind === 'input';
    // Text elements can fill the entire row while DOM ranges hug glyphs.
    // Match their painted origins, never the centers of those unlike boxes.
    const anchor = (n) =>
      isText ? [n.textOrigin?.[0] ?? n.rect[0], n.baseline ?? n.rect[1]] : n.center;
    const reference = isText ? [e.textX ?? e.rect[0], e.baseline ?? e.rect[1]] : point;
    const cost = (n) =>
      Math.abs(reference[0] - anchor(n)[0]) +
      Math.abs(reference[1] - anchor(n)[1]) * 2 +
      (label && label === norm(n.label) ? -100 : 0) +
      (sig && sig === n.signature ? -50 : 0);
    candidates.sort((a, b) => cost(a) - cost(b));
    const n = candidates[0];
    if (
      !n ||
      Math.abs(anchor(n)[1] - reference[1]) > 100 ||
      Math.abs(anchor(n)[0] - reference[0]) > 200 ||
      (e.kind === 'icon' &&
        !nearShape(sig, n.signature) &&
        norm(e.label) !== norm(n.label) &&
        (Math.abs(n.center[1] - point[1]) > 12 || Math.abs(n.center[0] - point[0]) > 24))
    ) {
      unmatched.push(e);
      continue;
    }
    matched.add(n.path);
    const dx =
      (isText ? (n.textOrigin?.[0] ?? n.rect[0]) : n.center[0]) -
      (isText ? (e.textX ?? e.rect[0]) : point[0]);
    const dy = (isText ? n.baseline : n.center[1]) - (isText ? e.baseline : point[1]);
    const issues = [];
    if (Math.abs(dx) > 1) issues.push('x');
    if (Number.isFinite(dy) && Math.abs(dy) > 0.5) issues.push(isText ? 'baseline' : 'center y');
    if (isText && !Number.isFinite(dy)) issues.push('missing native baseline');
    const lineOffsets = [];
    if (e.kind === 'text' && e.rects?.length > 1 && n.lines?.length > 1) {
      const tops = [...new Set(e.rects.map((r) => r[1]))];
      if (tops.length === n.lines.length) {
        const leading = e.baseline - tops.at(-1);
        for (let i = 0; i < tops.length; i++)
          lineOffsets.push(n.lines[i].baseline - tops[i] - leading);
        if (lineOffsets.some((offset) => Math.abs(offset) > 0.5)) issues.push('line baselines');
      }
    }
    const a = rgba(n.circle ? e.shapes?.[0]?.stroke : e.color),
      b = rgba(n.color);
    // Compare painted (premultiplied) channels: canonicalizing translucent CSS
    // through an 8-bit canvas loses precision on unpremultiplication.
    if (
      a &&
      b &&
      (Math.abs(a[3] - b[3]) > 1 ||
        a.slice(0, 3).some((v, i) => Math.abs((v * a[3]) / 255 - (b[i] * b[3]) / 255) > 1))
    )
      issues.push('color');
    if (isText && n.fontWeight !== undefined && e.fontWeight !== n.fontWeight)
      issues.push('weight');
    if (
      isText &&
      ['Sans', 'Mono'].includes(n.fontFamily) &&
      /monospace|Menlo|Consolas/i.test(e.fontFamily ?? '') !== (n.fontFamily === 'Mono')
    )
      issues.push('font family');
    if (isText && n.fontSize !== undefined && Math.abs(e.fontSize - n.fontSize) > 0.01)
      issues.push('font size');
    if (e.kind === 'icon' && sig && n.signature && !nearShape(sig, n.signature))
      issues.push('icon geometry');
    const nativeIcon = n.icon
      ?.replace(/^kit-diff-line-info-(up|down)$/, 'diffs-icon-expand')
      .replace(/^kit-diff-line-info-all$/, 'diffs-icon-expand-all');
    if (
      e.kind === 'icon' &&
      e.icon?.startsWith('#') &&
      nativeIcon &&
      e.icon.slice(1) !== nativeIcon
    )
      issues.push('icon name');
    if (
      n.circle &&
      e.shapes?.[0] &&
      (Math.abs(n.circle.radius - e.shapes[0].radius) > 0.1 ||
        Math.abs(n.circle.strokeWidth - e.shapes[0].strokeWidth) > 0.1)
    )
      issues.push('ring radius/stroke');
    if (
      e.kind === 'icon' &&
      (Math.abs(e.rect[2] - n.rect[2]) > 0.5 || Math.abs(e.rect[3] - n.rect[3]) > 0.5)
    )
      issues.push('icon size');
    pairs.push({
      name: text || label || n.icon || e.icon,
      kind: e.kind,
      dx,
      dy,
      issues,
      ...(lineOffsets.length ? { lineOffsets } : {}),
      electron: e,
      rune: n,
    });
  }
  const result = {
    units: 'logical points; Rune minus Electron',
    thresholds: { x: 1, y: 0.5 },
    matched: pairs.length,
    flagged: pairs.filter((p) => p.issues.length).length,
    pairs: pairs.sort(
      (a, b) =>
        Math.max(Math.abs(b.dx), Math.abs(b.dy ?? 0)) -
        Math.max(Math.abs(a.dx), Math.abs(a.dy ?? 0)),
    ),
    unmatchedElectron: unmatched,
    unmatchedRune: native.filter((n) => !matched.has(n.path)),
  };
  writeFileSync(stem + '.alignment.json', JSON.stringify(result, null, 2));
  return { matched: result.matched, flagged: result.flagged, unmatched: unmatched.length };
}

export function alignmentReport(out, rows) {
  const lines = [
    '# Electron / Rune alignment',
    '',
    'All positions are logical points, Rune minus Electron. Thresholds: |x| > 1, |baseline / icon center y| > 0.5. Native baselines are read from Rune’s already-shaped text layout, not inferred from element height. Electron baselines use a zero-height baseline strut inserted only after the screenshot. Vector geometry, font size/weight, system-versus-monospace family and colors are compared independently of whole-image MAE. Colors use premultiplied RGBA with a one-byte tolerance, avoiding translucent CSS canvas quantization artifacts. No pixel realignment or masks.',
    '',
    'The measurement-only build copies the pinned Rune checkout into the isolated sweep directory and adds inspector fields; it does not modify the dependency checkout, app lockfile, layout or painter. Missing matches are explicit coverage gaps, never passes.',
    '',
  ];
  let matched = 0,
    flagged = 0,
    uncovered = 0,
    uncoveredRune = 0;
  const records = [];
  for (const row of rows) {
    const path = out + '/' + row.stem + '.alignment.json';
    if (row.reason || !existsSync(path)) continue;
    const data = JSON.parse(readFileSync(path));
    matched += data.matched;
    flagged += data.flagged;
    uncovered += data.unmatchedElectron.length;
    uncoveredRune += data.unmatchedRune.length;
    records.push([row, data]);
  }
  lines.push(
    `**${records.length} screens; ${matched} matched items; ${flagged} flagged pairs; ${uncovered} unmatched Electron / ${uncoveredRune} unmatched Rune items.**`,
    '',
  );
  const esc = (s) =>
    String(s ?? '')
      .replaceAll('|', '/')
      .replaceAll('\n', ' ')
      .replaceAll('`', "'")
      .slice(0, 140);
  const num = (n) => (Number.isFinite(n) ? n.toFixed(2) : '—');
  for (const [row, data] of records.sort((a, b) => b[1].flagged - a[1].flagged)) {
    lines.push(
      `## ${row.stem}`,
      '',
      `${data.matched} matched; ${data.flagged} flagged; ${data.unmatchedElectron.length} Electron / ${data.unmatchedRune.length} Rune unmatched.`,
      '',
      '| Item | Δx | Δy | Difference |',
      '|---|---:|---:|---|',
    );
    for (const p of data.pairs.filter((p) => p.issues.length))
      lines.push(
        `| ${esc(p.name)} | ${num(p.dx)} | ${num(p.dy)} | ${p.issues.join(', ')}${p.issues.includes('color') ? ': ' + esc(p.electron.color) + ' → ' + esc(p.rune.color) : ''}${p.issues.includes('font size') ? '; size ' + num(p.electron.fontSize) + ' → ' + num(p.rune.fontSize) : ''}${p.issues.includes('weight') ? '; weight ' + p.electron.fontWeight + ' → ' + p.rune.fontWeight : ''}${p.issues.includes('font family') ? '; family ' + esc(p.electron.fontFamily) + ' → ' + esc(p.rune.fontFamily) : ''}${p.issues.includes('line baselines') ? '; lines Δy ' + p.lineOffsets.map(num).join(', ') : ''} |`,
      );
    if (data.unmatchedElectron.length || data.unmatchedRune.length) {
      lines.push(
        '',
        'Unmatched (not validated):',
        '',
        ...data.unmatchedElectron.map(
          (e) =>
            `- Electron ${e.kind}: ${esc(e.text || e.label || e.icon)} at ${e.rect.map(num).join(', ')}`,
        ),
        ...data.unmatchedRune.map(
          (e) =>
            `- Rune ${e.kind}: ${esc(e.text || e.label || e.icon || 'raster image')} at ${e.rect.map(num).join(', ')}`,
        ),
      );
    }
    lines.push('');
  }
  writeFileSync(out + '/ALIGNMENT.md', lines.join('\n'));
}
