import { useMemo, useState, type ReactNode } from 'react';
import { colorOf, cx, display, formatNumber, type Color, type Format, type Tone } from './util';

/** A small colored label. */
export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: Tone | Color;
}) {
  return (
    <span className="cv-badge" style={{ ['--cv-tone' as string]: colorOf(tone) }}>
      {children}
    </span>
  );
}

/** A highlighted message: notes, warnings, findings. */
export function Callout({
  tone = 'info',
  title,
  children,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div
      className="cv-callout"
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'note'}
      style={{ ['--cv-tone' as string]: colorOf(tone) }}
    >
      {title && <p className="cv-callout-title">{title}</p>}
      {children && <div className="cv-callout-body">{children}</div>}
    </div>
  );
}

/**
 * A headline number. `delta` shows a change (number or text); positive numbers read as good
 * unless `invert` is set (e.g. for latency or cost).
 */
export function Stat({
  label,
  value,
  format,
  delta,
  deltaFormat,
  invert,
  caption,
  tone,
}: {
  label: ReactNode;
  value: ReactNode | number;
  format?: Format;
  delta?: number | string;
  deltaFormat?: Format;
  invert?: boolean;
  caption?: ReactNode;
  tone?: Tone | Color;
}) {
  const direction = typeof delta === 'number' ? Math.sign(delta) : 0;
  const good = invert ? direction < 0 : direction > 0;
  return (
    <div className="cv-stat">
      <p className="cv-stat-label">{label}</p>
      <p className="cv-stat-value" style={tone ? { color: colorOf(tone) } : undefined}>
        {typeof value === 'number' ? formatNumber(value, format) : value}
      </p>
      {(delta !== undefined || caption) && (
        <p className="cv-stat-foot">
          {delta !== undefined && (
            <span
              className="cv-stat-delta"
              data-direction={direction === 0 ? 'flat' : good ? 'good' : 'bad'}
            >
              {typeof delta === 'number'
                ? `${delta > 0 ? '+' : ''}${formatNumber(delta, deltaFormat ?? format)}`
                : delta}
            </span>
          )}
          {caption && <span className="cv-muted">{caption}</span>}
        </p>
      )}
    </div>
  );
}

/** Label/value pairs, from an array or a plain object. */
export function KeyValue({
  items,
  columns = 1,
}: {
  items: { label: ReactNode; value: ReactNode }[] | Record<string, ReactNode>;
  columns?: 1 | 2 | 3;
}) {
  const entries = Array.isArray(items)
    ? items
    : Object.entries(items).map(([label, value]) => ({ label, value }));
  return (
    <dl className="cv-kv" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {entries.map((entry, index) => (
        <div key={index} className="cv-kv-item">
          <dt>{entry.label}</dt>
          <dd>{typeof entry.value === 'number' ? formatNumber(entry.value) : entry.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A bar showing progress toward `max`. */
export function Progress({
  value,
  max = 1,
  label,
  showValue = true,
  format = 'percent',
  tone = 'info',
}: {
  value: number;
  max?: number;
  label?: ReactNode;
  showValue?: boolean;
  /** How the value is shown; 'percent' shows value / max. */
  format?: Format;
  tone?: Tone | Color;
}) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className="cv-progress">
      {(label || showValue) && (
        <div className="cv-progress-labels">
          <span>{label}</span>
          {showValue && (
            <span className="cv-muted">
              {format === 'percent' ? formatNumber(ratio, 'percent') : formatNumber(value, format)}
            </span>
          )}
        </div>
      )}
      <div
        className="cv-progress-track"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemax={max}
      >
        <div
          className="cv-progress-fill"
          style={{ width: `${ratio * 100}%`, background: colorOf(tone) }}
        />
      </div>
    </div>
  );
}

/** A plain list of rows with optional secondary text and a trailing element. */
export function List({
  items,
}: {
  items: { title: ReactNode; description?: ReactNode; trailing?: ReactNode; icon?: ReactNode }[];
}) {
  return (
    <ul className="cv-list">
      {items.map((item, index) => (
        <li key={index} className="cv-list-item">
          {item.icon && <span className="cv-list-icon">{item.icon}</span>}
          <div className="cv-list-text">
            <p>{item.title}</p>
            {item.description && <p className="cv-muted cv-text-sm">{item.description}</p>}
          </div>
          {item.trailing && <div className="cv-list-trailing">{item.trailing}</div>}
        </li>
      ))}
    </ul>
  );
}

/** Events in order, newest last unless you sort them otherwise. */
export function Timeline({
  items,
}: {
  items: { title: ReactNode; time?: ReactNode; description?: ReactNode; tone?: Tone | Color }[];
}) {
  return (
    <ol className="cv-timeline">
      {items.map((item, index) => (
        <li key={index} style={{ ['--cv-tone' as string]: colorOf(item.tone ?? 'neutral') }}>
          <span className="cv-timeline-dot" />
          <div>
            <p className="cv-timeline-title">
              {item.title}
              {item.time && <span className="cv-muted cv-text-sm">{item.time}</span>}
            </p>
            {item.description && <div className="cv-muted cv-text-sm">{item.description}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export type TaskStatus = 'todo' | 'doing' | 'done' | 'blocked' | 'skipped';

/**
 * A checklist. Give `onToggle` to let the user check items off, e.g. with
 * `const [tasks, setTasks] = useData('tasks', [])`.
 */
export function TaskList({
  items,
  onToggle,
}: {
  items: { id: string; label: ReactNode; status?: TaskStatus; done?: boolean; note?: ReactNode }[];
  onToggle?: (id: string, done: boolean) => void;
}) {
  return (
    <ul className="cv-tasks">
      {items.map((item) => {
        const status: TaskStatus = item.status ?? (item.done ? 'done' : 'todo');
        return (
          <li key={item.id} data-status={status}>
            <button
              type="button"
              className="cv-task-mark"
              aria-label={status === 'done' ? 'Mark not done' : 'Mark done'}
              aria-pressed={status === 'done'}
              disabled={!onToggle}
              onClick={() => onToggle?.(item.id, status !== 'done')}
            >
              {status === 'done' ? '✓' : status === 'doing' ? '•' : status === 'blocked' ? '!' : ''}
            </button>
            <div>
              <p className="cv-task-label">{item.label}</p>
              {item.note && <p className="cv-muted cv-text-sm">{item.note}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export type Column<Row> =
  | (keyof Row & string)
  | {
      key: keyof Row & string;
      label?: ReactNode;
      align?: 'left' | 'right' | 'center';
      format?: Format;
      width?: number | string;
      /** Custom cell content. */
      render?: (row: Row) => ReactNode;
      /** Color the cell's number by sign, like a delta. */
      tone?: 'delta' | 'delta-inverted';
    };

/**
 * A sortable table. Columns are keys of the rows or column objects; numbers align right
 * and format automatically.
 */
export function Table<Row extends Record<string, unknown>>({
  rows,
  columns,
  sortable = true,
  maxHeight,
  dense,
  empty = 'No rows',
  onRowClick,
}: {
  rows: Row[];
  columns?: Column<Row>[];
  sortable?: boolean;
  maxHeight?: number;
  dense?: boolean;
  empty?: ReactNode;
  onRowClick?: (row: Row, index: number) => void;
}) {
  const [sort, setSort] = useState<{ key: string; descending: boolean }>();
  const resolved = useMemo(
    () =>
      (columns ?? (Object.keys(rows[0] ?? {}) as (keyof Row & string)[])).map((column) =>
        typeof column === 'string' ? { key: column } : column,
      ),
    [columns, rows],
  );
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const result = [...rows].sort((a, b) => compare(a[sort.key], b[sort.key]));
    return sort.descending ? result.reverse() : result;
  }, [rows, sort]);
  return (
    <div className={cx('cv-table-wrap', dense && 'cv-table-dense')} style={{ maxHeight }}>
      <table className="cv-table">
        <thead>
          <tr>
            {resolved.map((column) => {
              const numeric = typeof rows[0]?.[column.key] === 'number';
              const align =
                'align' in column && column.align ? column.align : numeric ? 'right' : 'left';
              const active = sort?.key === column.key;
              return (
                <th
                  key={column.key}
                  style={{ textAlign: align, width: 'width' in column ? column.width : undefined }}
                  aria-sort={active ? (sort.descending ? 'descending' : 'ascending') : undefined}
                >
                  {sortable ? (
                    <button
                      type="button"
                      className="cv-th-button"
                      onClick={() =>
                        setSort(
                          active && sort.descending
                            ? undefined
                            : { key: column.key, descending: active },
                        )
                      }
                    >
                      {'label' in column && column.label !== undefined ? column.label : column.key}
                      <span className="cv-sort" aria-hidden="true">
                        {active ? (sort.descending ? '↓' : '↑') : ''}
                      </span>
                    </button>
                  ) : 'label' in column && column.label !== undefined ? (
                    column.label
                  ) : (
                    column.key
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={resolved.length} className="cv-table-empty">
                {empty}
              </td>
            </tr>
          )}
          {sorted.map((row, index) => (
            <tr
              key={index}
              onClick={onRowClick ? () => onRowClick(row, index) : undefined}
              data-clickable={onRowClick ? '' : undefined}
            >
              {resolved.map((column) => {
                const value = row[column.key];
                const numeric = typeof value === 'number';
                const align =
                  'align' in column && column.align ? column.align : numeric ? 'right' : 'left';
                const tone = 'tone' in column ? column.tone : undefined;
                const sign = numeric ? Math.sign(value) * (tone === 'delta-inverted' ? -1 : 1) : 0;
                return (
                  <td
                    key={column.key}
                    style={{ textAlign: align }}
                    className={cx(numeric && 'cv-num')}
                    data-delta={tone && sign ? (sign > 0 ? 'good' : 'bad') : undefined}
                  >
                    {'render' in column && column.render
                      ? column.render(row)
                      : numeric
                        ? `${tone && value > 0 ? '+' : ''}${formatNumber(value, 'format' in column ? column.format : undefined)}`
                        : display(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function compare(a: unknown, b: unknown) {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/** A unified diff: pass `patch` (unified diff text) or `before` and `after`. */
export function DiffView({
  patch,
  before,
  after,
  title,
  maxHeight = 480,
}: {
  patch?: string;
  before?: string;
  after?: string;
  title?: ReactNode;
  maxHeight?: number;
}) {
  const lines = useMemo(
    () => (patch !== undefined ? parsePatch(patch) : diffLines(before ?? '', after ?? '')),
    [patch, before, after],
  );
  return (
    <figure className="cv-diff">
      {title && <figcaption>{title}</figcaption>}
      <div className="cv-diff-body" style={{ maxHeight }}>
        {lines.map((line, index) => (
          <div key={index} className="cv-diff-line" data-kind={line.kind}>
            <span className="cv-diff-sign">
              {line.kind === 'add'
                ? '+'
                : line.kind === 'remove'
                  ? '-'
                  : line.kind === 'hunk'
                    ? ''
                    : ' '}
            </span>
            <span>{line.text}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

type DiffLine = { kind: 'add' | 'remove' | 'same' | 'hunk'; text: string };

function parsePatch(patch: string): DiffLine[] {
  return patch
    .split('\n')
    .filter((line) => !/^(diff |index |--- |\+\+\+ )/.test(line))
    .map((line) =>
      line.startsWith('@@')
        ? { kind: 'hunk', text: line }
        : line.startsWith('+')
          ? { kind: 'add', text: line.slice(1) }
          : line.startsWith('-')
            ? { kind: 'remove', text: line.slice(1) }
            : { kind: 'same', text: line.slice(1) },
    );
}

/** Line diff by longest common subsequence; large inputs fall back to remove-then-add. */
function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  if (a.length * b.length > 4_000_000)
    return [
      ...a.map((text) => ({ kind: 'remove' as const, text })),
      ...b.map((text) => ({ kind: 'add' as const, text })),
    ];
  const table = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      table[i]![j] =
        a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      lines.push({ kind: 'same', text: a[i]! });
      i++;
      j++;
    } else if (j < b.length && (i >= a.length || table[i]![j + 1]! >= table[i + 1]![j]!)) {
      lines.push({ kind: 'add', text: b[j++]! });
    } else {
      lines.push({ kind: 'remove', text: a[i++]! });
    }
  }
  return lines;
}

/** Placeholder for an empty state. */
export function Empty({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="cv-empty">
      <p className="cv-empty-title">{title}</p>
      {children && <div className="cv-muted">{children}</div>}
    </div>
  );
}
