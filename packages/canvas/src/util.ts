import { useLayoutEffect, useRef, useState } from 'react';

/** Status tones for badges, callouts, stats, and nodes. */
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
/** Categorical colors that follow the host theme. */
export type Color = 'blue' | 'green' | 'orange' | 'purple' | 'pink' | 'gray' | 'red' | 'yellow';

/** Series colors in the order charts assign them. */
export const PALETTE: readonly Color[] = [
  'blue',
  'orange',
  'green',
  'purple',
  'pink',
  'yellow',
  'red',
  'gray',
];

/** A CSS color for a palette name, a tone, or any CSS color string. */
export function colorOf(value: Color | Tone | (string & {}) | undefined, index = 0): string {
  const name = value ?? PALETTE[index % PALETTE.length]!;
  if (name === 'neutral') return 'var(--text-tertiary)';
  if (name === 'info') return 'var(--cv-blue)';
  if (name === 'success') return 'var(--cv-success)';
  if (name === 'warning') return 'var(--cv-yellow)';
  if (name === 'danger') return 'var(--cv-red)';
  if ((PALETTE as readonly string[]).includes(name)) return `var(--cv-${name})`;
  return name;
}

/**
 * How numbers are shown: a preset, an Intl.NumberFormat option bag, or a function.
 * Presets: 'number' (1,234.5), 'integer', 'compact' (1.2K), 'percent' (0.25 → 25%),
 * 'currency' (USD), 'bytes' (1.5 MB), 'duration' (ms → 1.2 s).
 */
export type Format =
  | 'number'
  | 'integer'
  | 'compact'
  | 'percent'
  | 'currency'
  | 'bytes'
  | 'duration'
  | Intl.NumberFormatOptions
  | ((value: number) => string);

const formatters = new Map<string, Intl.NumberFormat>();
function intl(options: Intl.NumberFormatOptions) {
  const key = JSON.stringify(options);
  let formatter = formatters.get(key);
  if (!formatter) formatters.set(key, (formatter = new Intl.NumberFormat('en-US', options)));
  return formatter;
}

export function formatNumber(value: unknown, format: Format = 'number'): string {
  if (typeof value !== 'number' || !Number.isFinite(value))
    return value === null || value === undefined ? '' : String(value);
  if (typeof format === 'function') return format(value);
  if (typeof format === 'object') return intl(format).format(value);
  switch (format) {
    case 'integer':
      return intl({ maximumFractionDigits: 0 }).format(value);
    case 'compact':
      return intl({ notation: 'compact', maximumFractionDigits: 1 }).format(value);
    case 'percent':
      return intl({ style: 'percent', maximumFractionDigits: 1 }).format(value);
    case 'currency':
      return intl({
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2,
      }).format(value);
    case 'bytes': {
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let size = Math.abs(value);
      let unit = 0;
      while (size >= 1024 && unit < units.length - 1) {
        size /= 1024;
        unit++;
      }
      return `${value < 0 ? '-' : ''}${intl({ maximumFractionDigits: size < 10 && unit ? 1 : 0 }).format(size)} ${units[unit]}`;
    }
    case 'duration': {
      const ms = Math.abs(value);
      const sign = value < 0 ? '-' : '';
      if (ms < 1000) return `${sign}${intl({ maximumFractionDigits: 0 }).format(ms)} ms`;
      if (ms < 60_000) return `${sign}${intl({ maximumFractionDigits: 1 }).format(ms / 1000)} s`;
      if (ms < 3_600_000)
        return `${sign}${intl({ maximumFractionDigits: 1 }).format(ms / 60_000)} min`;
      return `${sign}${intl({ maximumFractionDigits: 1 }).format(ms / 3_600_000)} h`;
    }
    default:
      return intl({ maximumFractionDigits: Math.abs(value) < 10 ? 2 : 1 }).format(value);
  }
}

export function cx(...names: (string | false | null | undefined)[]) {
  return names.filter(Boolean).join(' ');
}

/** Width of an element, following resizes. Server renders assume 640px. */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(640);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const next = Math.floor(element.getBoundingClientRect().width);
      if (next > 0) setWidth(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Readable text for a cell or label value. */
export function display(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return formatNumber(value);
  if (value instanceof Date) return value.toLocaleDateString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
