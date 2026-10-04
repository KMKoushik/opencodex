import { useEffect, useState } from 'react';

/** Wall-clock time for a live elapsed label, ticking only while enabled. */
export function useTicker(enabled: boolean) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [enabled]);
  return now;
}

/** 45s, 2m 13s, 2m, 1h 5m: whole units, dropping zero parts. */
export function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1_000));
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  if (hours) return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  return `${seconds}s`;
}
