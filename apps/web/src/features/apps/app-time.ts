import type { AppInfo, AppRun } from '@opencodex/contracts/canvas';

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'short' });
/** `3 min ago`, `in 9 hr`. */
export function ago(time: number) {
  const seconds = Math.round((time - Date.now()) / 1000);
  for (const [unit, size] of [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ] as const)
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  return 'just now';
}

export function duration(run: Pick<AppRun, 'started' | 'ended'>) {
  const ms = (run.ended ?? Date.now()) - run.started;
  return ms < 1000
    ? `${ms} ms`
    : ms < 60_000
      ? `${(ms / 1000).toFixed(1)} s`
      : `${Math.round(ms / 60_000)} min`;
}

const EVERY: Record<string, string> = { '1h': 'hourly', '1d': 'daily', '7d': 'weekly' };
/** `daily` for `1d`, `every 6h` otherwise. */
export const everyLabel = (every: string) => EVERY[every] ?? `every ${every}`;
/** `daily`, `every 6h`; functions on the same schedule read once. */
export function scheduleLabel(app: AppInfo) {
  const every = new Set(Object.values(app.triggers).map((trigger) => trigger.every));
  return [...every].map(everyLabel).join(', ');
}
