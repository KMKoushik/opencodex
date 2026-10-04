import { memo, useEffect, useState } from 'react';
import { ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { TurnRow } from './timeline-model';
import './turn-header.css';

export const TurnHeader = memo(function TurnHeader({
  row,
  onToggle,
}: {
  row: TurnRow;
  onToggle: (id: string, open: boolean) => void;
}) {
  const now = useTicker(row.status === 'working');
  const elapsed = (row.end ?? now) - row.start;
  const label =
    row.status === 'working'
      ? elapsed < 1_000
        ? 'Working'
        : `Working for ${formatDuration(elapsed)}`
      : row.end === undefined
        ? row.status === 'stopped'
          ? 'Stopped'
          : 'Worked'
        : `${row.status === 'stopped' ? 'Stopped after' : 'Worked for'} ${formatDuration(elapsed)}`;
  return (
    <button
      type="button"
      className="turn-work"
      data-status={row.status}
      aria-expanded={row.open}
      onClick={() => onToggle(row.id, !row.open)}
    >
      <span className="turn-work-label">{label}</span>
      <HugeiconsIcon
        icon={ArrowRight01Icon}
        size={12}
        className="turn-work-chevron"
        data-open={row.open}
      />
    </button>
  );
});

/** Wall-clock time for a live elapsed label, ticking only while enabled. */
function useTicker(enabled: boolean) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [enabled]);
  return now;
}

/** 45s, 2m 13s, 2m, 1h 5m: whole units, dropping zero parts. */
function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1_000));
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  if (hours) return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  return `${seconds}s`;
}
