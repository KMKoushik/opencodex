import { memo } from 'react';
import { ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { TurnRow } from './timeline-model';
import { formatDuration, useTicker } from './elapsed';
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
