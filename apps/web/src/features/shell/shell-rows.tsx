import { ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { ShellInfo } from '@opencodex/contracts';
import { cn } from '../../lib/utils';
import { formatDuration, useTicker } from '../chat/elapsed';
import './shell.css';

export function ShellRows({
  items,
  onOpen,
  className,
}: {
  items: ShellInfo[];
  onOpen: (id: string) => void;
  className?: string;
}) {
  const now = useTicker(true);
  return (
    <ul className={cn('shell-tray-list', className)} aria-label="Running shell commands">
      {items.map((shell) => (
        <li key={shell.id}>
          <button
            type="button"
            className="shell-tray-row"
            onClick={() => onOpen(shell.id)}
            aria-label={`View output: ${shell.command}`}
            data-tooltip={shell.command}
          >
            <span className="session-activity" aria-hidden="true" />
            <code className="truncate">{shell.command}</code>
            <span className="shell-tray-time">{formatDuration(now - shell.time.started)}</span>
            <HugeiconsIcon icon={ArrowRight01Icon} size={14} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
