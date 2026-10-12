import { useMemo, useState, type ReactNode } from 'react';
import {
  colorOf,
  display,
  formatNumber,
  useWidth,
  type Color,
  type Format,
  type Tone,
} from './util';

type Row = Record<string, unknown>;
/** A numeric column to plot: its key, or `{ key, label, color }`. */
export type Series<R extends Row = Row> =
  | (keyof R & string)
  | { key: keyof R & string; label?: string; color?: Color | Tone | (string & {}) };

type ResolvedSeries = { key: string; label: string; color: string };

function resolveSeries(series: readonly Series[] | Series | undefined, data: Row[], x: string) {
  const list: Series[] = series
    ? Array.isArray(series)
      ? [...series]
      : [series as Series]
    : Object.keys(data[0] ?? {}).filter((key) => key !== x && typeof data[0]?.[key] === 'number');
  return list.map((item, index): ResolvedSeries =>
    typeof item === 'string'
      ? { key: item, label: item, color: colorOf(undefined, index) }
      : { key: item.key, label: item.label ?? item.key, color: colorOf(item.color, index) },
  );
}

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/** Round tick values covering [min, max]. */
function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const pad = Math.abs(min) || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / Math.max(1, count);
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? 10 * power;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= max + step * 1e-9; value += step)
    ticks.push(Number(value.toPrecision(12)));
  if (ticks[ticks.length - 1]! < max)
    ticks.push(Number((start + ticks.length * step).toPrecision(12)));
  return ticks;
}

const linear = (domain: [number, number], range: [number, number]) => (value: number) =>
  domain[1] === domain[0]
    ? (range[0] + range[1]) / 2
    : range[0] + ((value - domain[0]) / (domain[1] - domain[0])) * (range[1] - range[0]);

function Legend({ items }: { items: { label: ReactNode; color: string; value?: ReactNode }[] }) {
  return (
    <ul className="cv-legend">
      {items.map((item, index) => (
        <li key={index}>
          <span className="cv-legend-swatch" style={{ background: item.color }} />
          {item.label}
          {item.value !== undefined && (
            <span className="cv-muted cv-legend-value">{item.value}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Tooltip({
  left,
  top,
  above,
  title,
  rows,
}: {
  left: number;
  top: number;
  /** Open upward from `top`, for points in the lower half of a chart. */
  above?: boolean;
  title: ReactNode;
  rows: { label: ReactNode; value: ReactNode; color?: string }[];
}) {
  return (
    <div
      className="cv-tooltip"
      style={{ left: Math.max(0, left), top, transform: above ? 'translateY(-100%)' : undefined }}
    >
      <p className="cv-tooltip-title">{title}</p>
      {rows.map((row, index) => (
        <p key={index} className="cv-tooltip-row">
          {row.color && <span className="cv-legend-swatch" style={{ background: row.color }} />}
          <span>{row.label}</span>
          <strong>{row.value}</strong>
        </p>
      ))}
    </div>
  );
}

type ChartBase<R extends Row> = {
  data: R[];
  /** Column with the category or x value. */
  x: keyof R & string;
  /** Numeric columns to plot. Defaults to every numeric column. */
  series?: Series<R>[] | Series<R>;
  height?: number;
  /** Value format for the axis, tooltips, and labels. */
  format?: Format;
  /** Formats x values for labels. */
  xFormat?: (value: unknown) => string;
  title?: ReactNode;
  legend?: boolean;
};

function ChartFrame({
  title,
  children,
  legend,
}: {
  title?: ReactNode;
  children: ReactNode;
  legend?: ReactNode;
}) {
  return (
    <figure className="cv-chart">
      {title && <figcaption className="cv-chart-title">{title}</figcaption>}
      {children}
      {legend}
    </figure>
  );
}

/**
 * A bar with rounded corners only at its outer end (away from the baseline), so stacked
 * segments meet flat and only the top of a stack is rounded.
 */
function barPath(
  x: number,
  y: number,
  width: number,
  height: number,
  end: 'top' | 'bottom' | 'left' | 'right' | undefined,
) {
  const r = end ? Math.min(3, width / 2, height / 2) : 0;
  const right = x + width;
  const bottom = y + height;
  if (!r) return `M${x},${y}H${right}V${bottom}H${x}Z`;
  const arc = (toX: number, toY: number) => `A${r},${r} 0 0 1 ${toX},${toY}`;
  switch (end) {
    case 'top':
      return `M${x},${bottom}V${y + r}${arc(x + r, y)}H${right - r}${arc(right, y + r)}V${bottom}Z`;
    case 'bottom':
      return `M${x},${y}H${right}V${bottom - r}${arc(right - r, bottom)}H${x + r}${arc(x, bottom - r)}Z`;
    case 'right':
      return `M${x},${y}H${right - r}${arc(right, y + r)}V${bottom - r}${arc(right - r, bottom)}H${x}Z`;
    case 'left':
      return `M${right},${y}V${bottom}H${x + r}${arc(x, bottom - r)}V${y + r}${arc(x + r, y)}Z`;
  }
}

/** For each row, the stacked segment at the outer end of the positive and negative stacks. */
function outerSegments(row: Row, series: ResolvedSeries[]) {
  let positive = -1;
  let negative = -1;
  series.forEach((item, index) => {
    const value = num(row[item.key]);
    if (value > 0) positive = index;
    if (value < 0) negative = index;
  });
  return { positive, negative };
}

const MARGIN = { top: 12, right: 12, bottom: 28 };

function yAxisWidth(ticks: number[], format: Format | undefined) {
  return Math.min(
    80,
    Math.max(28, ...ticks.map((tick) => formatNumber(tick, format).length * 6.5 + 10)),
  );
}

/** Bars per category. `stacked` stacks series; `horizontal` lays categories down the side. */
export function BarChart<R extends Row>({
  data,
  x,
  series,
  height,
  format,
  xFormat = display,
  title,
  legend,
  stacked,
  horizontal,
  showValues,
}: ChartBase<R> & { stacked?: boolean; horizontal?: boolean; showValues?: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number>();
  const resolved = useMemo(() => resolveSeries(series as Series[], data, x), [series, data, x]);
  const totals = data.map((row) =>
    stacked
      ? resolved.reduce(
          (sum, item) => {
            const value = num(row[item.key]);
            return value >= 0 ? [sum[0]!, sum[1]! + value] : [sum[0]! + value, sum[1]!];
          },
          [0, 0],
        )
      : [
          Math.min(0, ...resolved.map((item) => num(row[item.key]))),
          Math.max(0, ...resolved.map((item) => num(row[item.key]))),
        ],
  );
  const low = Math.min(0, ...totals.map((t) => t[0]!));
  const high = Math.max(0, ...totals.map((t) => t[1]!));
  const ticks = niceTicks(low, high, 5);
  const domain: [number, number] = [ticks[0]!, ticks[ticks.length - 1]!];
  const labels = data.map((row) => xFormat(row[x]));

  if (horizontal) {
    const labelWidth = Math.min(
      160,
      width * 0.4,
      Math.max(40, ...labels.map((label) => label.length * 6.5 + 12)),
    );
    // Thin bars with room between rows read better than bars that fill the row.
    const band = resolved.length > 1 && !stacked ? 12 : 18;
    const rowHeight = (stacked ? band : band * resolved.length) + 14;
    const bottom = showValues ? 4 : MARGIN.bottom;
    const chartHeight = height ?? data.length * rowHeight + MARGIN.top + bottom;
    const plotLeft = labelWidth;
    // Value labels sit after the longest bar, so keep a gutter for the widest one.
    const gutter = showValues
      ? Math.max(
          ...data.flatMap((row) =>
            resolved.map((item) => formatNumber(num(row[item.key]), format).length * 6.5 + 10),
          ),
          MARGIN.right,
        )
      : MARGIN.right;
    const plotRight = Math.max(plotLeft + 40, width - gutter);
    // The value axis runs across the width here: one tick label per ~80px. Bars that show
    // their values don't need the axis labels at all.
    const axis = niceTicks(low, high, Math.max(2, Math.floor((plotRight - plotLeft) / 80)));
    const scale = linear([axis[0]!, axis[axis.length - 1]!], [plotLeft, plotRight]);
    const step = (chartHeight - MARGIN.top - bottom) / Math.max(1, data.length);
    return (
      <ChartFrame
        title={title}
        legend={(legend ?? resolved.length > 1) && <Legend items={resolved} />}
      >
        <div ref={ref} className="cv-chart-body" onMouseLeave={() => setHover(undefined)}>
          <svg width={width} height={chartHeight} role="img">
            {axis.map((tick) => (
              <g key={tick}>
                <line
                  className="cv-grid-line"
                  x1={scale(tick)}
                  x2={scale(tick)}
                  y1={MARGIN.top}
                  y2={chartHeight - bottom}
                />
                {!showValues && (
                  <text
                    className="cv-axis-label cv-number"
                    x={scale(tick)}
                    y={chartHeight - MARGIN.bottom + 16}
                    textAnchor="middle"
                  >
                    {formatNumber(tick, format)}
                  </text>
                )}
              </g>
            ))}
            {data.map((row, index) => {
              const y0 = MARGIN.top + index * step;
              const inner = Math.min(step - 8, stacked ? band : band * resolved.length);
              const top = y0 + (step - inner) / 2;
              const outer = outerSegments(row, resolved);
              let positive = 0;
              let negative = 0;
              return (
                <g key={index} onMouseEnter={() => setHover(index)}>
                  <rect x={0} y={y0} width={width} height={step} fill="transparent" />
                  <text
                    className="cv-axis-label"
                    x={plotLeft - 8}
                    y={y0 + step / 2}
                    dy="0.35em"
                    textAnchor="end"
                  >
                    {truncate(labels[index]!, labelWidth / 6.5)}
                  </text>
                  {resolved.map((item, s) => {
                    const value = num(row[item.key]);
                    const base = stacked ? (value >= 0 ? positive : negative) : 0;
                    if (stacked) {
                      if (value >= 0) positive += value;
                      else negative += value;
                    }
                    const a = scale(base);
                    const b = scale(base + value);
                    const h = stacked ? inner : inner / resolved.length;
                    const y = stacked ? top : top + s * h;
                    return (
                      <g key={item.key}>
                        <path
                          className="cv-bar"
                          d={barPath(
                            Math.min(a, b),
                            y + 1,
                            Math.max(1, Math.abs(b - a)),
                            Math.max(1, h - 2),
                            !stacked || s === (value < 0 ? outer.negative : outer.positive)
                              ? value < 0
                                ? 'left'
                                : 'right'
                              : undefined,
                          )}
                          fill={item.color}
                          opacity={hover === undefined || hover === index ? 1 : 0.55}
                        />
                        {showValues && !stacked && (
                          <text
                            className="cv-value-label"
                            x={Math.max(a, b) + 4}
                            y={y + h / 2}
                            dy="0.35em"
                          >
                            {formatNumber(value, format)}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
          {hover !== undefined && (
            <Tooltip
              left={Math.min(width - 160, plotLeft + 12)}
              top={MARGIN.top + (hover > data.length / 2 - 1 ? hover : hover + 1) * step}
              above={hover > data.length / 2 - 1}
              title={labels[hover]}
              rows={resolved.map((item) => ({
                label: item.label,
                value: formatNumber(num(data[hover]![item.key]), format),
                color: item.color,
              }))}
            />
          )}
        </div>
      </ChartFrame>
    );
  }

  const chartHeight = height ?? 260;
  const left = yAxisWidth(ticks, format);
  const scale = linear(domain, [chartHeight - MARGIN.bottom, MARGIN.top]);
  const step = (width - left - MARGIN.right) / Math.max(1, data.length);
  const inner = Math.min(step * 0.72, stacked ? 56 : 28 * resolved.length);
  const every = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor((width - left) / 64))));
  return (
    <ChartFrame
      title={title}
      legend={(legend ?? resolved.length > 1) && <Legend items={resolved} />}
    >
      <div ref={ref} className="cv-chart-body" onMouseLeave={() => setHover(undefined)}>
        <svg width={width} height={chartHeight} role="img">
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                className="cv-grid-line"
                x1={left}
                x2={width - MARGIN.right}
                y1={scale(tick)}
                y2={scale(tick)}
              />
              <text
                className="cv-axis-label cv-number"
                x={left - 6}
                y={scale(tick)}
                dy="0.35em"
                textAnchor="end"
              >
                {formatNumber(tick, format)}
              </text>
            </g>
          ))}
          {data.map((row, index) => {
            const x0 = left + index * step;
            const start = x0 + (step - inner) / 2;
            const outer = outerSegments(row, resolved);
            let positive = 0;
            let negative = 0;
            return (
              <g key={index} onMouseEnter={() => setHover(index)}>
                <rect
                  x={x0}
                  y={MARGIN.top}
                  width={step}
                  height={chartHeight - MARGIN.top - MARGIN.bottom}
                  fill={hover === index ? 'var(--hover)' : 'transparent'}
                />
                {resolved.map((item, s) => {
                  const value = num(row[item.key]);
                  const base = stacked ? (value >= 0 ? positive : negative) : 0;
                  if (stacked) {
                    if (value >= 0) positive += value;
                    else negative += value;
                  }
                  const a = scale(base);
                  const b = scale(base + value);
                  const w = stacked ? inner : inner / resolved.length;
                  const bx = stacked ? start : start + s * w;
                  return (
                    <g key={item.key}>
                      <path
                        className="cv-bar"
                        d={barPath(
                          bx + 1,
                          Math.min(a, b),
                          Math.max(1, w - 2),
                          Math.max(1, Math.abs(b - a)),
                          !stacked || s === (value < 0 ? outer.negative : outer.positive)
                            ? value < 0
                              ? 'bottom'
                              : 'top'
                            : undefined,
                        )}
                        fill={item.color}
                      />
                      {showValues && !stacked && w > 18 && (
                        <text
                          className="cv-value-label"
                          x={bx + w / 2}
                          y={Math.min(a, b) - 4}
                          textAnchor="middle"
                        >
                          {formatNumber(value, format)}
                        </text>
                      )}
                    </g>
                  );
                })}
                {index % every === 0 && (
                  <text
                    className="cv-axis-label"
                    x={x0 + step / 2}
                    y={chartHeight - MARGIN.bottom + 16}
                    textAnchor="middle"
                  >
                    {truncate(labels[index]!, (step * every) / 6.5)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hover !== undefined && (
          <Tooltip
            left={Math.min(width - 168, Math.max(0, left + (hover + 1) * step + 6))}
            top={MARGIN.top}
            title={labels[hover]}
            rows={resolved.map((item) => ({
              label: item.label,
              value: formatNumber(num(data[hover]![item.key]), format),
              color: item.color,
            }))}
          />
        )}
      </div>
    </ChartFrame>
  );
}

/**
 * Lines over x. Numeric x values are spaced by value; anything else (dates, labels) is
 * spaced evenly in data order. `area` fills under the lines.
 */
export function LineChart<R extends Row>({
  data,
  x,
  series,
  height = 260,
  format,
  xFormat = display,
  title,
  legend,
  area,
  curve = 'smooth',
  dots,
  zero,
  yDomain,
}: ChartBase<R> & {
  area?: boolean;
  curve?: 'smooth' | 'linear' | 'step';
  dots?: boolean;
  /** Start the y axis at zero. Defaults to true for areas. */
  zero?: boolean;
  yDomain?: [number, number];
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number>();
  const resolved = useMemo(() => resolveSeries(series as Series[], data, x), [series, data, x]);
  const values = data.flatMap((row) =>
    resolved.map((item) => row[item.key]).filter((v): v is number => typeof v === 'number'),
  );
  const includeZero = zero ?? Boolean(area);
  const ticks = niceTicks(
    yDomain?.[0] ?? Math.min(includeZero ? 0 : Infinity, ...values),
    yDomain?.[1] ?? Math.max(includeZero ? 0 : -Infinity, ...values),
    5,
  );
  const domain: [number, number] = [ticks[0]!, ticks[ticks.length - 1]!];
  const left = yAxisWidth(ticks, format);
  const right = width - MARGIN.right - 4;
  const y = linear(domain, [height - MARGIN.bottom, MARGIN.top]);
  const numericX = data.length > 0 && data.every((row) => typeof row[x] === 'number');
  const xs = numericX ? data.map((row) => row[x] as number) : data.map((_, index) => index);
  const xScale = linear([Math.min(...xs), Math.max(...xs)], [left + 4, right]);
  const px = xs.map(xScale);
  const labels = data.map((row) => xFormat(row[x]));
  const every = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor((width - left) / 72))));
  const nearest = (clientX: number) => {
    let best = 0;
    for (let i = 1; i < px.length; i++)
      if (Math.abs(px[i]! - clientX) < Math.abs(px[best]! - clientX)) best = i;
    return best;
  };
  return (
    <ChartFrame
      title={title}
      legend={(legend ?? resolved.length > 1) && <Legend items={resolved} />}
    >
      <div
        ref={ref}
        className="cv-chart-body"
        onMouseMove={(event) => {
          if (!data.length) return;
          const box = event.currentTarget.getBoundingClientRect();
          setHover(nearest(event.clientX - box.left));
        }}
        onMouseLeave={() => setHover(undefined)}
      >
        <svg width={width} height={height} role="img">
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                className="cv-grid-line"
                x1={left}
                x2={width - MARGIN.right}
                y1={y(tick)}
                y2={y(tick)}
              />
              <text
                className="cv-axis-label cv-number"
                x={left - 6}
                y={y(tick)}
                dy="0.35em"
                textAnchor="end"
              >
                {formatNumber(tick, format)}
              </text>
            </g>
          ))}
          {labels.map((label, index) =>
            index % every === 0 ? (
              <text
                key={index}
                className="cv-axis-label"
                x={px[index]}
                y={height - MARGIN.bottom + 16}
                textAnchor="middle"
              >
                {truncate(label, 14)}
              </text>
            ) : null,
          )}
          {resolved.map((item) => {
            const points = data
              .map((row, index) => [px[index]!, row[item.key]] as const)
              .filter((point): point is readonly [number, number] => typeof point[1] === 'number')
              .map(([px, value]) => [px, y(value)] as [number, number]);
            const line = path(points, curve);
            return (
              <g key={item.key}>
                {area && points.length > 1 && (
                  <path
                    d={`${line} L${points[points.length - 1]![0]},${y(Math.max(domain[0], 0))} L${points[0]![0]},${y(Math.max(domain[0], 0))} Z`}
                    fill={item.color}
                    opacity={0.16}
                  />
                )}
                <path
                  d={line}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {(dots || points.length === 1) &&
                  points.map(([cx, cy], index) => (
                    <circle key={index} cx={cx} cy={cy} r={3} fill={item.color} />
                  ))}
              </g>
            );
          })}
          {hover !== undefined && (
            <g>
              <line
                className="cv-guide"
                x1={px[hover]}
                x2={px[hover]}
                y1={MARGIN.top}
                y2={height - MARGIN.bottom}
              />
              {resolved.map((item) =>
                typeof data[hover]![item.key] === 'number' ? (
                  <circle
                    key={item.key}
                    cx={px[hover]}
                    cy={y(data[hover]![item.key] as number)}
                    r={4}
                    fill={item.color}
                    stroke="var(--surface)"
                    strokeWidth={2}
                  />
                ) : null,
              )}
            </g>
          )}
        </svg>
        {hover !== undefined && (
          <Tooltip
            left={px[hover]! > width / 2 ? px[hover]! - 172 : px[hover]! + 12}
            top={MARGIN.top}
            title={labels[hover]}
            rows={resolved.map((item) => ({
              label: item.label,
              value: formatNumber(data[hover]![item.key], format),
              color: item.color,
            }))}
          />
        )}
      </div>
    </ChartFrame>
  );
}

/** A LineChart filled underneath. */
export function AreaChart<R extends Row>(props: Parameters<typeof LineChart<R>>[0]) {
  return <LineChart {...props} area />;
}

function path(points: [number, number][], curve: 'smooth' | 'linear' | 'step') {
  if (!points.length) return '';
  let d = `M${points[0]![0]},${points[0]![1]}`;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]!;
    const [x1, y1] = points[i]!;
    if (curve === 'step') d += ` H${(x0 + x1) / 2} V${y1} H${x1}`;
    else if (curve === 'linear') d += ` L${x1},${y1}`;
    else {
      // Horizontal tangents at every point keep the curve between neighbouring values.
      const dx = (x1 - x0) / 3;
      d += ` C${x0 + dx},${y0} ${x1 - dx},${y1} ${x1},${y1}`;
    }
  }
  return d;
}

function truncate(text: string, chars: number) {
  const max = Math.max(3, Math.floor(chars));
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

type PieSlice = { label: string; value: number; color?: Color | Tone | (string & {}) };

/** Shares of a whole. Shows as a donut unless `donut` is false. */
export function PieChart({
  data,
  format,
  title,
  donut = true,
  center,
  size = 180,
  legend = true,
}: {
  data: PieSlice[];
  format?: Format;
  title?: ReactNode;
  donut?: boolean;
  /** Text in the donut's hole. Defaults to the total. */
  center?: ReactNode;
  size?: number;
  legend?: boolean;
}) {
  const [hover, setHover] = useState<number>();
  const total = data.reduce((sum, item) => sum + Math.max(0, num(item.value)), 0);
  const radius = size / 2;
  const inner = donut ? radius * 0.62 : 0;
  const slices: (PieSlice & { share: number; start: number; end: number; color: string })[] = [];
  for (const [index, item] of data.entries()) {
    const share = total ? Math.max(0, num(item.value)) / total : 0;
    const start = slices[index - 1]?.end ?? -Math.PI / 2;
    slices.push({
      ...item,
      share,
      start,
      end: start + share * Math.PI * 2,
      color: colorOf(item.color, index),
    });
  }
  const active = hover === undefined ? undefined : slices[hover];
  return (
    <ChartFrame title={title}>
      <div className="cv-pie">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          onMouseLeave={() => setHover(undefined)}
        >
          {slices.map((slice, index) =>
            slice.share >= 0.9999 ? (
              <g key={index} onMouseEnter={() => setHover(index)}>
                <circle
                  cx={radius}
                  cy={radius}
                  r={(radius + inner) / 2}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth={radius - inner}
                />
              </g>
            ) : slice.share > 0 ? (
              <path
                key={index}
                d={arc(radius, inner, slice.start, slice.end)}
                fill={slice.color}
                stroke="var(--surface)"
                strokeWidth={1.5}
                opacity={hover === undefined || hover === index ? 1 : 0.5}
                onMouseEnter={() => setHover(index)}
              />
            ) : null,
          )}
          {donut && (
            <text className="cv-pie-center" x={radius} y={radius} dy="0.35em" textAnchor="middle">
              {active
                ? formatNumber(active.share, 'percent')
                : (center ?? formatNumber(total, format))}
            </text>
          )}
        </svg>
        {legend && (
          <Legend
            items={slices.map((slice) => ({
              label: slice.label,
              color: slice.color,
              value: `${formatNumber(slice.value, format)} · ${formatNumber(slice.share, 'percent')}`,
            }))}
          />
        )}
      </div>
    </ChartFrame>
  );
}

function arc(radius: number, inner: number, start: number, end: number) {
  const point = (r: number, a: number) => `${radius + r * Math.cos(a)},${radius + r * Math.sin(a)}`;
  const large = end - start > Math.PI ? 1 : 0;
  return inner
    ? `M${point(radius, start)} A${radius},${radius} 0 ${large} 1 ${point(radius, end)} L${point(inner, end)} A${inner},${inner} 0 ${large} 0 ${point(inner, start)} Z`
    : `M${radius},${radius} L${point(radius, start)} A${radius},${radius} 0 ${large} 1 ${point(radius, end)} Z`;
}

/** A tiny inline trend line, e.g. inside a Stat caption or table cell. */
export function Sparkline({
  values,
  width = 120,
  height = 32,
  color,
  area = true,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: Color | Tone | (string & {});
  area?: boolean;
}) {
  const finite = values.filter(Number.isFinite);
  if (finite.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const x = linear([0, values.length - 1], [1, width - 1]);
  const y = linear([min, max], [height - 2, 2]);
  const points = values.map((value, index) => [x(index), y(value)] as [number, number]);
  const line = path(points, 'linear');
  const stroke = colorOf(color ?? 'blue');
  return (
    <svg width={width} height={height} className="cv-sparkline" role="img">
      {area && (
        <path d={`${line} L${width - 1},${height} L1,${height} Z`} fill={stroke} opacity={0.15} />
      )}
      <path d={line} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

/** Points by two numeric columns. `group` colors points by a category column. */
export function ScatterChart<R extends Row>({
  data,
  x,
  y,
  group,
  size,
  label,
  height = 280,
  xFormat,
  yFormat,
  title,
}: {
  data: R[];
  x: keyof R & string;
  y: keyof R & string;
  group?: keyof R & string;
  /** Numeric column scaling the point radius. */
  size?: keyof R & string;
  /** Column shown as the tooltip title. */
  label?: keyof R & string;
  height?: number;
  xFormat?: Format;
  yFormat?: Format;
  title?: ReactNode;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number>();
  const xs = data.map((row) => num(row[x]));
  const ys = data.map((row) => num(row[y]));
  const xTicks = niceTicks(Math.min(...xs), Math.max(...xs), Math.max(2, Math.floor(width / 90)));
  const yTicks = niceTicks(Math.min(...ys), Math.max(...ys), 5);
  const left = yAxisWidth(yTicks, yFormat);
  const sx = linear([xTicks[0]!, xTicks[xTicks.length - 1]!], [left + 6, width - MARGIN.right - 6]);
  const sy = linear([yTicks[0]!, yTicks[yTicks.length - 1]!], [height - MARGIN.bottom, MARGIN.top]);
  const groups = group ? [...new Set(data.map((row) => display(row[group])))] : [];
  const sizes = size ? data.map((row) => num(row[size])) : [];
  const maxSize = Math.max(1, ...sizes);
  return (
    <ChartFrame
      title={title}
      legend={
        groups.length > 1 && (
          <Legend
            items={groups.map((name, index) => ({ label: name, color: colorOf(undefined, index) }))}
          />
        )
      }
    >
      <div ref={ref} className="cv-chart-body" onMouseLeave={() => setHover(undefined)}>
        <svg width={width} height={height} role="img">
          {yTicks.map((tick) => (
            <g key={`y${tick}`}>
              <line
                className="cv-grid-line"
                x1={left}
                x2={width - MARGIN.right}
                y1={sy(tick)}
                y2={sy(tick)}
              />
              <text
                className="cv-axis-label cv-number"
                x={left - 6}
                y={sy(tick)}
                dy="0.35em"
                textAnchor="end"
              >
                {formatNumber(tick, yFormat)}
              </text>
            </g>
          ))}
          {xTicks.map((tick) => (
            <text
              key={`x${tick}`}
              className="cv-axis-label cv-number"
              x={sx(tick)}
              y={height - MARGIN.bottom + 16}
              textAnchor="middle"
            >
              {formatNumber(tick, xFormat)}
            </text>
          ))}
          {data.map((row, index) => (
            <circle
              key={index}
              cx={sx(xs[index]!)}
              cy={sy(ys[index]!)}
              r={size ? 3 + 9 * Math.sqrt(Math.max(0, sizes[index]!) / maxSize) : 4.5}
              fill={colorOf(undefined, group ? groups.indexOf(display(row[group])) : 0)}
              fillOpacity={hover === index ? 1 : 0.72}
              stroke="var(--surface)"
              onMouseEnter={() => setHover(index)}
            />
          ))}
        </svg>
        {hover !== undefined && (
          <Tooltip
            left={sx(xs[hover]!) > width / 2 ? sx(xs[hover]!) - 172 : sx(xs[hover]!) + 12}
            top={Math.max(0, sy(ys[hover]!) - 20)}
            title={
              label
                ? display(data[hover]![label])
                : group
                  ? display(data[hover]![group])
                  : `#${hover + 1}`
            }
            rows={[
              { label: x, value: formatNumber(xs[hover], xFormat) },
              { label: y, value: formatNumber(ys[hover], yFormat) },
              ...(size ? [{ label: size, value: formatNumber(sizes[hover], undefined) }] : []),
            ]}
          />
        )}
      </div>
    </ChartFrame>
  );
}

/** A grid of values shaded by size: `values[row][column]`. */
export function Heatmap({
  rows,
  columns,
  values,
  format,
  color = 'blue',
  showValues,
  title,
}: {
  rows: string[];
  columns: string[];
  values: number[][];
  format?: Format;
  color?: Color | Tone | (string & {});
  showValues?: boolean;
  title?: ReactNode;
}) {
  const [hover, setHover] = useState<[number, number]>();
  const flat = values.flat().filter(Number.isFinite);
  const min = Math.min(...flat);
  const max = Math.max(...flat);
  const fill = colorOf(color);
  return (
    <ChartFrame title={title}>
      <div className="cv-heatmap-wrap">
        <table className="cv-heatmap" onMouseLeave={() => setHover(undefined)}>
          <thead>
            <tr>
              <th />
              {columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={row}>
                <th scope="row">{row}</th>
                {columns.map((column, c) => {
                  const value = values[r]?.[c];
                  const ratio =
                    typeof value === 'number' && max > min
                      ? (value - min) / (max - min)
                      : value === undefined
                        ? 0
                        : 1;
                  return (
                    <td
                      key={column}
                      onMouseEnter={() => setHover([r, c])}
                      title={`${row} · ${column}: ${formatNumber(value, format)}`}
                      style={{
                        background: `color-mix(in srgb, ${fill} ${Math.round(8 + ratio * 84)}%, transparent)`,
                        outline:
                          hover?.[0] === r && hover[1] === c ? '2px solid var(--text)' : undefined,
                        color: ratio > 0.55 ? 'var(--on-project)' : undefined,
                      }}
                    >
                      {showValues ? formatNumber(value, format) : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartFrame>
  );
}
