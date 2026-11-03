import { ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { cn } from '../../lib/utils';
import { formatDuration, useTicker } from '../chat/elapsed';
import type { RunningSubagent } from './running-subagents';
import type { SubagentAttention } from './subagent-attention';
import { RunMode } from '../shell/shell-rows';
import './subagent-tray.css';

const agentName = (agent?: string) =>
  agent ? agent.charAt(0).toUpperCase() + agent.slice(1) : 'Subagent';

export function SubagentRows({
  items,
  attention,
  foreground,
  onOpen,
  className,
}: {
  items: RunningSubagent[];
  attention: SubagentAttention[];
  /** Whether the current reply waits on this subagent; otherwise it runs in the background. */
  foreground: (id: string) => boolean;
  onOpen: (id: string) => void;
  className?: string;
}) {
  const now = useTicker(items.some((item) => item.started !== undefined));
  return (
    <ul className={cn('subagent-tray-list', className)} aria-label="Running subagents">
      {items.map((item, index) => {
        const status = attention[index] ?? null;
        const title = item.title || 'Untitled subagent';
        return (
          <li key={item.id}>
            <button
              type="button"
              className="subagent-tray-row"
              data-tooltip={`Open ${title}`}
              onClick={() => onOpen(item.id)}
            >
              {status === 'permission' || status === 'question' ? (
                <span className="subagent-tray-attention" data-kind={status} aria-hidden="true">
                  {status === 'permission' ? '!' : '?'}
                </span>
              ) : (
                <span className="session-activity" aria-hidden="true" />
              )}
              <span className="subagent-tray-agent">{agentName(item.agent)}</span>
              <span className="subagent-tray-title truncate">{title}</span>
              <RunMode foreground={foreground(item.id)} />
              <span className="subagent-tray-meta" data-status={status ?? 'running'}>
                {status === 'permission'
                  ? 'Needs approval'
                  : status === 'question'
                    ? 'Has a question'
                    : status === 'error'
                      ? 'Could not check requests'
                      : item.started === undefined
                        ? 'Working'
                        : formatDuration(now - item.started)}
              </span>
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                size={14}
                className="subagent-tray-open"
                aria-hidden="true"
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
