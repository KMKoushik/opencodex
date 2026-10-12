import { useMemo, type ReactNode } from 'react';
import { colorOf, useWidth, type Color, type Tone } from './util';

/**
 * Diagrams on a character grid, in the format of the ascii-diagram skill
 * (https://ascii.kdawg.dev uses the same one): boxes, orthogonal connectors between box
 * ports, and text, all placed in whole character cells. Colors are theme names, so a
 * diagram follows the app's theme.
 */

/** A theme color: a palette name, a tone, `text`, `muted`, or `accent`. */
export type DiagramColor = Color | Tone | 'text' | 'muted' | 'accent';
type Port = 'top' | 'right' | 'bottom' | 'left';
type Direction = 'north' | 'east' | 'south' | 'west';
type Point = [x: number, y: number];
type Endpoint = Point | { box: string; port: Port };

export type DiagramBox = {
  /** Needed for connectors to refer to the box. */
  id?: string;
  /** Left column; or give `centerX`. */
  x?: number;
  centerX?: number;
  y: number;
  /** Minimum size; the box grows to fit its title and lines. */
  width?: number;
  height?: number;
  /** Shown in the top border. */
  title?: string;
  lines?: string[];
  /** Border and title color. */
  color?: DiagramColor;
  textColor?: DiagramColor;
  align?: 'left' | 'center';
  titleAlign?: 'left' | 'center';
};

export type DiagramPath = {
  /** Explicit orthogonal route; or use `from`/`to`. */
  points?: Point[];
  from?: Endpoint;
  to?: Endpoint;
  /** Bend points between `from` and `to`. */
  via?: Point[];
  /** Bend order when there are no `via` points. */
  route?: 'horizontal-first' | 'vertical-first';
  color?: DiagramColor;
};

export type DiagramConnector = DiagramPath & {
  /** Arrowhead direction; inferred from the target port or the last segment. */
  arrow?: Direction;
  arrowColor?: DiagramColor;
};

export type DiagramText = {
  /** Omit to center on the diagram. */
  x?: number;
  y: number;
  value: string;
  anchor?: 'left' | 'center' | 'right';
  color?: DiagramColor;
  /** Allow the text to sit on a line, e.g. a label on a connector. */
  overlay?: boolean;
  bold?: boolean;
};

export type DiagramSpec = {
  /** Grid size in characters. Defaults to the content's extent. */
  canvas?: { width: number; height: number };
  boxes?: DiagramBox[];
  lines?: DiagramPath[];
  connectors?: DiagramConnector[];
  arrows?: { x: number; y: number; direction: Direction; color?: DiagramColor }[];
  texts?: DiagramText[];
};

const N = 1;
const E = 2;
const S = 4;
const W = 8;
const STEP: Record<Direction, Point> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
};
const INCOMING: Record<Direction, number> = { north: S, east: W, south: N, west: E };

type Cell = {
  mask: number;
  line?: DiagramColor;
  char?: string;
  color?: DiagramColor;
  bold?: boolean;
};
type Grid = { width: number; height: number; cells: Cell[][] };
type Box = Required<Pick<DiagramBox, 'y' | 'title' | 'lines' | 'align' | 'titleAlign'>> & {
  id?: string;
  x: number;
  width: number;
  height: number;
  color?: DiagramColor;
  textColor?: DiagramColor;
};

const int = (value: unknown, name: string, min = 0) => {
  if (!Number.isInteger(value) || (value as number) < min)
    throw new Error(`${name} must be a whole number of at least ${min}.`);
  return value as number;
};
const width = (text: string) => [...text].length;

function measureBox(box: DiagramBox, index: number): Box {
  const name = box.id ?? `boxes[${index}]`;
  const lines = box.lines ?? [];
  const title = box.title ?? '';
  const needed = Math.max(4, title ? width(title) + 4 : 4, ...lines.map((line) => width(line) + 4));
  const w = Math.max(box.width ?? 0, needed);
  const h = Math.max(box.height ?? 0, lines.length + 2);
  let x: number;
  if (box.x !== undefined) x = int(box.x, `${name}.x`);
  else if (box.centerX !== undefined)
    x = int(box.centerX, `${name}.centerX`) - Math.floor((w - 1) / 2);
  else throw new Error(`${name} needs x or centerX.`);
  return {
    id: box.id,
    x,
    y: int(box.y, `${name}.y`),
    width: w,
    height: h,
    title,
    lines,
    align: box.align ?? 'center',
    titleAlign: box.titleAlign ?? 'center',
    color: box.color,
    textColor: box.textColor,
  };
}

const overlaps = (a: Box, b: Box) =>
  !(
    a.x + a.width - 1 < b.x ||
    b.x + b.width - 1 < a.x ||
    a.y + a.height - 1 < b.y ||
    b.y + b.height - 1 < a.y
  );
const contains = (outer: Box, inner: Box) =>
  outer.x <= inner.x &&
  outer.y <= inner.y &&
  outer.x + outer.width >= inner.x + inner.width &&
  outer.y + outer.height >= inner.y + inner.height;

function endpoint(value: Endpoint | undefined, boxes: Map<string, Box>, role: 'from' | 'to') {
  if (Array.isArray(value)) return { point: value, port: undefined };
  if (!value) throw new Error(`A connector needs points, or both from and to.`);
  const box = boxes.get(value.box);
  if (!box) throw new Error(`Unknown box in ${role}: ${value.box}`);
  // Arrows stop one cell short of the target so its border stays intact.
  const gap = role === 'to' ? 1 : 0;
  const cx = box.x + Math.floor((box.width - 1) / 2);
  const cy = box.y + Math.floor((box.height - 1) / 2);
  const point: Point =
    value.port === 'top'
      ? [cx, box.y - gap]
      : value.port === 'bottom'
        ? [cx, box.y + box.height - 1 + gap]
        : value.port === 'left'
          ? [box.x - gap, cy]
          : value.port === 'right'
            ? [box.x + box.width - 1 + gap, cy]
            : (() => {
                throw new Error(`Unknown port in ${role}: ${String(value.port)}`);
              })();
  return { point, port: value.port };
}

function resolvePath(path: DiagramPath, boxes: Map<string, Box>) {
  if (path.points) return { points: path.points, port: undefined };
  const from = endpoint(path.from, boxes, 'from');
  const to = endpoint(path.to, boxes, 'to');
  if (path.via?.length) return { points: [from.point, ...path.via, to.point], port: to.port };
  const [a, b] = [from.point, to.point];
  if (a[0] === b[0] || a[1] === b[1]) return { points: [a, b], port: to.port };
  if (path.route === 'horizontal-first')
    return { points: [a, [b[0], a[1]] as Point, b], port: to.port };
  if (path.route === 'vertical-first')
    return { points: [a, [a[0], b[1]] as Point, b], port: to.port };
  const vertical = (port?: Port) => port === 'top' || port === 'bottom';
  if (vertical(from.port) || vertical(to.port)) {
    const mid = Math.floor((a[1] + b[1]) / 2);
    return { points: [a, [a[0], mid] as Point, [b[0], mid] as Point, b], port: to.port };
  }
  const mid = Math.floor((a[0] + b[0]) / 2);
  return { points: [a, [mid, a[1]] as Point, [mid, b[1]] as Point, b], port: to.port };
}

function clean(points: Point[]) {
  const result: Point[] = [];
  for (const [index, point] of points.entries()) {
    if (!Array.isArray(point) || point.length !== 2)
      throw new Error(`Point ${index} must be [x, y].`);
    const previous = result[result.length - 1];
    if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) result.push(point);
  }
  if (result.length < 2) throw new Error('A path needs at least two different points.');
  return result;
}

/** Makes the last segment enter the arrowhead along its direction, adding a dogleg if needed. */
function approach(points: Point[], direction: Direction) {
  const [dx, dy] = STEP[direction];
  const ok = (list: Point[]) => {
    const [px, py] = list[list.length - 2]!;
    const [x, y] = list[list.length - 1]!;
    return dx ? y === py && Math.sign(x - px) === dx : x === px && Math.sign(y - py) === dy;
  };
  if (ok(points)) return points;
  const target = points[points.length - 1]!;
  const prefix = points.slice(0, -1);
  const previous = prefix[prefix.length - 1]!;
  if (dx === 0 ? previous[0] === target[0] : previous[1] === target[1])
    throw new Error(
      `A connector reaches its ${direction} arrow at ${target.join(',')} from the wrong side; add via points that approach it from behind.`,
    );
  const stem: Point = [target[0] - 2 * dx, target[1] - 2 * dy];
  const bend: Point = dx === 0 ? [previous[0], stem[1]] : [stem[0], previous[1]];
  return clean([...prefix, bend, stem, target]);
}

/** Lays out the spec on a grid, rejecting what wouldn't read cleanly. */
function layoutDiagram(spec: DiagramSpec): Grid {
  const boxes = (spec.boxes ?? []).map(measureBox);
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, b] = [boxes[i]!, boxes[j]!];
      if (overlaps(a, b) && !contains(a, b) && !contains(b, a))
        throw new Error(`Boxes overlap: ${a.id ?? i} and ${b.id ?? j}.`);
    }
  const byId = new Map<string, Box>();
  for (const box of boxes) {
    if (!box.id) continue;
    if (byId.has(box.id)) throw new Error(`Two boxes have the id ${box.id}.`);
    byId.set(box.id, box);
  }
  const paths = [
    ...(spec.lines ?? []).map((path) => ({ path, arrow: false })),
    ...(spec.connectors ?? []).map((path) => ({ path, arrow: true })),
  ].map(({ path, arrow }) => {
    const resolved = resolvePath(path, byId);
    let points = clean(resolved.points);
    let direction: Direction | undefined;
    if (arrow) {
      const connector = path as DiagramConnector;
      const [px, py] = points[points.length - 2]!;
      const [x, y] = points[points.length - 1]!;
      direction =
        connector.arrow ??
        (resolved.port
          ? ({ top: 'south', bottom: 'north', left: 'east', right: 'west' } as const)[resolved.port]
          : x > px
            ? 'east'
            : x < px
              ? 'west'
              : y > py
                ? 'south'
                : 'north');
      points = approach(points, direction);
    }
    return { path, points, direction };
  });

  // The grid fits the content unless the spec gives a size.
  const extent = [
    ...boxes.map((box) => [box.x + box.width, box.y + box.height]),
    ...paths.flatMap(({ points }) => points.map(([x, y]) => [x + 1, y + 1])),
    ...(spec.arrows ?? []).map((arrow) => [arrow.x + 1, arrow.y + 1]),
    ...(spec.texts ?? []).map((text) => [
      text.x === undefined ? width(text.value) : anchored(text) + width(text.value),
      text.y + 1,
    ]),
  ];
  const gridWidth = spec.canvas
    ? int(spec.canvas.width, 'canvas.width', 4)
    : Math.max(4, ...extent.map((e) => e[0]!));
  const gridHeight = spec.canvas
    ? int(spec.canvas.height, 'canvas.height', 3)
    : Math.max(3, ...extent.map((e) => e[1]!));
  const cells: Cell[][] = Array.from({ length: gridHeight }, () =>
    Array.from({ length: gridWidth }, () => ({ mask: 0 })),
  );
  const grid = { width: gridWidth, height: gridHeight, cells };
  const at = (x: number, y: number) => {
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 0 ||
      y < 0 ||
      x >= gridWidth ||
      y >= gridHeight
    )
      throw new Error(`Point ${x},${y} is outside the ${gridWidth}×${gridHeight} diagram.`);
    return cells[y]![x]!;
  };
  const segment = ([x1, y1]: Point, [x2, y2]: Point, color?: DiagramColor) => {
    if (x1 !== x2 && y1 !== y2)
      throw new Error(`Segments must be horizontal or vertical: ${x1},${y1} → ${x2},${y2}.`);
    const link = (x: number, y: number, mask: number) => {
      const cell = at(x, y);
      cell.mask |= mask;
      cell.line = color;
    };
    if (y1 === y2)
      for (let x = Math.min(x1, x2); x < Math.max(x1, x2); x++) {
        link(x, y1, E);
        link(x + 1, y1, W);
      }
    else
      for (let y = Math.min(y1, y2); y < Math.max(y1, y2); y++) {
        link(x1, y, S);
        link(x1, y + 1, N);
      }
  };
  const text = (
    x: number,
    y: number,
    value: string,
    color?: DiagramColor,
    overlay = false,
    bold = false,
  ) => {
    at(x, y);
    if (x + width(value) > gridWidth)
      throw new Error(`Text runs past the diagram's right edge: "${value}".`);
    [...value].forEach((char, offset) => {
      const cell = at(x + offset, y);
      if (cell.char !== undefined && cell.char !== char)
        throw new Error(`Text collides at ${x + offset},${y}: "${value}".`);
      if (!overlay && cell.mask)
        throw new Error(
          `Text crosses a line at ${x + offset},${y}: "${value}". Move it, or set overlay for a label on a line.`,
        );
      Object.assign(cell, { char, color, bold });
    });
  };

  for (const box of boxes) {
    const right = box.x + box.width - 1;
    const bottom = box.y + box.height - 1;
    segment([box.x, box.y], [right, box.y], box.color);
    segment([box.x, bottom], [right, bottom], box.color);
    segment([box.x, box.y], [box.x, bottom], box.color);
    segment([right, box.y], [right, bottom], box.color);
    if (box.title) {
      const caption = ` ${box.title} `;
      if (width(caption) > box.width - 2) throw new Error(`Box title is too wide: ${box.title}.`);
      const tx =
        box.titleAlign === 'left'
          ? box.x + 2
          : box.x + Math.floor((box.width - width(caption)) / 2);
      text(tx, box.y, caption, box.color, true, true);
    }
    const rows = box.height - 2;
    if (box.lines.length > rows)
      throw new Error(`Box ${box.id ?? box.title} is too short for its lines.`);
    const first = box.y + 1 + Math.floor((rows - box.lines.length) / 2);
    box.lines.forEach((line, index) => {
      if (width(line) > box.width - 4) throw new Error(`Box line is too wide: ${line}.`);
      const lx =
        box.align === 'left' ? box.x + 2 : box.x + Math.floor((box.width - width(line)) / 2);
      text(lx, first + index, line, box.textColor);
    });
  }
  for (const { path, points } of paths)
    for (let i = 1; i < points.length; i++) segment(points[i - 1]!, points[i]!, path.color);
  const arrow = (x: number, y: number, direction: Direction, color?: DiagramColor) => {
    const cell = at(x, y);
    if (cell.mask && cell.mask !== INCOMING[direction])
      throw new Error(`The ${direction} arrow at ${x},${y} doesn't end a straight line into it.`);
    text(x, y, { north: '▲', east: '▶', south: '▼', west: '◀' }[direction], color, true);
  };
  for (const { path, points, direction } of paths)
    if (direction) {
      const [x, y] = points[points.length - 1]!;
      arrow(x, y, direction, (path as DiagramConnector).arrowColor ?? path.color);
    }
  for (const item of spec.arrows ?? []) arrow(item.x, item.y, item.direction, item.color);
  for (const item of spec.texts ?? []) {
    const x =
      item.x === undefined ? Math.floor((gridWidth - width(item.value)) / 2) : anchored(item);
    text(x, int(item.y, 'text.y'), item.value, item.color, item.overlay, item.bold);
  }
  return grid;
}

function anchored(text: DiagramText) {
  const x = text.x ?? 0;
  const w = width(text.value);
  return text.anchor === 'center' ? x - Math.floor(w / 2) : text.anchor === 'right' ? x - w + 1 : x;
}

function paint(color: DiagramColor | undefined, fallback: string) {
  if (!color) return fallback;
  if (color === 'text') return 'var(--text)';
  if (color === 'muted') return 'var(--text-tertiary)';
  if (color === 'accent') return 'var(--accent)';
  return colorOf(color);
}

const CELL_W = 8.4;
const CELL_H = 18;
// Below this the text gets too small to read; narrower containers scroll instead.
const MIN_SCALE = 0.7;

/**
 * A box-and-arrow diagram drawn on a character grid, in the ascii-diagram format. Lines
 * join cleanly at any size and every color comes from the theme.
 */
export function AsciiDiagram({ spec, title }: { spec: DiagramSpec; title?: ReactNode }) {
  const grid = useMemo(() => layoutDiagram(spec), [spec]);
  const [ref, available] = useWidth<HTMLDivElement>();
  const drawn = useMemo(() => draw(grid), [grid]);
  const w = grid.width * CELL_W;
  const h = grid.height * CELL_H;
  const scale = Math.max(MIN_SCALE, Math.min(1, available / w));
  return (
    <figure className="cv-chart cv-ascii">
      {title && <figcaption className="cv-chart-title">{title}</figcaption>}
      <div ref={ref} className="cv-ascii-body">
        <svg
          width={w * scale}
          height={h * scale}
          viewBox={`0 0 ${w} ${h}`}
          role="img"
          aria-label={grid.cells
            .map((row) =>
              row
                .map((cell) => cell.char ?? ' ')
                .join('')
                .trim(),
            )
            .filter(Boolean)
            .join('\n')}
        >
          {drawn}
        </svg>
      </div>
    </figure>
  );
}

/** Lines as one path per color, arrowheads as triangles, and text in runs per color. */
function draw(grid: Grid) {
  const paths = new Map<string, string[]>();
  const arrows: ReactNode[] = [];
  const runs: ReactNode[] = [];
  const r = CELL_W / 2;
  grid.cells.forEach((row, y) => {
    const cy = y * CELL_H + CELL_H / 2;
    let run: { x: number; text: string; color: string; bold: boolean } | undefined;
    const flush = () => {
      if (!run || !run.text.trim()) return (run = undefined);
      runs.push(
        <text
          key={`${y}:${run.x}`}
          x={run.x * CELL_W}
          y={cy}
          dy="0.36em"
          fill={run.color}
          fontWeight={run.bold ? 600 : undefined}
          textLength={[...run.text].length * CELL_W}
          lengthAdjust="spacingAndGlyphs"
          xmlSpace="preserve"
        >
          {run.text}
        </text>,
      );
      run = undefined;
    };
    row.forEach((cell, x) => {
      const cx = x * CELL_W + CELL_W / 2;
      const arrow = cell.char && '▲▶▼◀'.includes(cell.char);
      if (cell.mask && (!cell.char || arrow)) {
        const color = paint(cell.line, 'var(--text-tertiary)');
        const d = paths.get(color) ?? [];
        const m = cell.mask;
        const corner = { [E | S]: [E, S], [S | W]: [S, W], [N | E]: [N, E], [N | W]: [N, W] }[m];
        if (corner) {
          // Corners are rounded, like the app's own cards.
          const edge = (dir: number): Point =>
            dir === N
              ? [cx, cy - CELL_H / 2]
              : dir === S
                ? [cx, cy + CELL_H / 2]
                : dir === E
                  ? [cx + CELL_W / 2, cy]
                  : [cx - CELL_W / 2, cy];
          const toward = (dir: number): Point =>
            dir === N
              ? [cx, cy - r]
              : dir === S
                ? [cx, cy + r]
                : dir === E
                  ? [cx + r, cy]
                  : [cx - r, cy];
          const [a, b] = corner as [number, number];
          const [ea, ta, tb, eb] = [edge(a), toward(a), toward(b), edge(b)];
          d.push(
            `M${ea[0]},${ea[1]}L${ta[0]},${ta[1]}Q${cx},${cy} ${tb[0]},${tb[1]}L${eb[0]},${eb[1]}`,
          );
        } else {
          if (m & N) d.push(`M${cx},${cy}V${cy - CELL_H / 2}`);
          if (m & S) d.push(`M${cx},${cy}V${cy + CELL_H / 2}`);
          if (m & E) d.push(`M${cx},${cy}H${cx + CELL_W / 2}`);
          if (m & W) d.push(`M${cx},${cy}H${cx - CELL_W / 2}`);
        }
        paths.set(color, d);
      }
      if (arrow) {
        const s = CELL_W * 0.55;
        const tip: Record<string, string> = {
          '▲': `${cx},${cy - s} ${cx + s},${cy + s * 0.6} ${cx - s},${cy + s * 0.6}`,
          '▼': `${cx},${cy + s} ${cx + s},${cy - s * 0.6} ${cx - s},${cy - s * 0.6}`,
          '▶': `${cx + s},${cy} ${cx - s * 0.6},${cy - s} ${cx - s * 0.6},${cy + s}`,
          '◀': `${cx - s},${cy} ${cx + s * 0.6},${cy - s} ${cx + s * 0.6},${cy + s}`,
        };
        arrows.push(
          <polygon
            key={`a${x},${y}`}
            points={tip[cell.char!]}
            fill={paint(cell.color, 'var(--text-secondary)')}
          />,
        );
      }
      if (cell.char && !arrow) {
        const color = paint(cell.color, 'var(--text)');
        const bold = Boolean(cell.bold);
        if (run && run.color === color && run.bold === bold && run.x + [...run.text].length === x)
          run.text += cell.char;
        else {
          flush();
          run = { x, text: cell.char, color, bold };
        }
      } else flush();
    });
    flush();
  });
  return [
    ...[...paths].map(([color, d]) => (
      <path
        key={color}
        d={d.join('')}
        fill="none"
        stroke={color}
        strokeWidth={1.25}
        strokeLinecap="round"
      />
    )),
    ...arrows,
    ...runs,
  ];
}
