import { useId, useState } from 'react';
import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { ArrowRight01Icon, BotIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/api';
import { formatDuration, useTicker } from '../chat/elapsed';
import { useRunningSubagents, type RunningSubagent } from './running-subagents';
import './subagent-tray.css';

type Attention = 'permission' | 'question' | 'error' | null;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
const agentName = (agent?: string) =>
  agent ? agent.charAt(0).toUpperCase() + agent.slice(1) : 'Subagent';

function combine(results: UseQueryResult<Attention>[]): Attention[] {
  return results.map((result) => (result.isError ? 'error' : (result.data ?? null)));
}

/**
 * Live summary of the thread's running child sessions, attached above the composer while
 * the parent waits on them. It owns its queries so updates never re-render the transcript.
 */
export function SubagentTray({
  sessionID,
  live,
  onOpen,
}: {
  sessionID: string;
  live: boolean;
  onOpen: (id: string) => void;
}) {
  const running = useRunningSubagents(sessionID);
  const items = running.items;
  const [open, setOpen] = useState(true);
  const list = useId();
  // Pending requests change only on permission/form events, not on each child tool event.
  const attention = useQueries({
    queries: items.map((item) => ({
      queryKey: ['subagent-attention', item.id],
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<Attention> => {
        const [permissions, forms] = await Promise.all([
          api.permissions(item.id, signal),
          api.forms(item.id, signal),
        ]);
        return permissions.length ? 'permission' : forms.length ? 'question' : null;
      },
      refetchInterval: live ? (false as const) : 5_000,
    })),
    combine,
  });
  const approvals = attention.filter((value) => value === 'permission').length;
  const questions = attention.filter((value) => value === 'question').length;
  const summary = [
    `Waiting on ${plural(items.length, 'subagent')}`,
    approvals && `${approvals} ${approvals === 1 ? 'needs' : 'need'} approval`,
    questions && `${questions} ${questions === 1 ? 'has a question' : 'have questions'}`,
  ]
    .filter(Boolean)
    .join(' · ');
  const visible = running.failed || items.length > 0;
  return (
    <section
      className="subagent-tray"
      data-active={visible}
      aria-label={visible ? 'Running subagents' : undefined}
    >
      {/* Always mounted, so count changes are announced; ticking rows stay outside it. */}
      <div className="subagent-tray-status" role="status">
        {running.failed ? (
          <div className="subagent-tray-error">
            <span>Could not check running subagents</span>
            <Button variant="ghost" size="sm" onClick={running.retry}>
              Retry
            </Button>
          </div>
        ) : (
          items.length > 0 && (
            <button
              type="button"
              className="subagent-tray-toggle"
              aria-expanded={open}
              aria-controls={open ? list : undefined}
              onClick={() => setOpen(!open)}
            >
              <HugeiconsIcon icon={BotIcon} size={14} aria-hidden="true" />
              <span className="truncate">{summary}</span>
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                size={12}
                className="subagent-tray-chevron"
                data-open={open}
                aria-hidden="true"
              />
            </button>
          )
        )}
      </div>
      {!running.failed && open && items.length > 0 && (
        <SubagentRows id={list} items={items} attention={attention} onOpen={onOpen} />
      )}
    </section>
  );
}

function SubagentRows({
  id,
  items,
  attention,
  onOpen,
}: {
  id: string;
  items: RunningSubagent[];
  attention: Attention[];
  onOpen: (id: string) => void;
}) {
  const now = useTicker(items.some((item) => item.started !== undefined));
  return (
    <ul id={id} className="subagent-tray-list">
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
