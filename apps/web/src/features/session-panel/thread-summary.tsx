import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { BotIcon, FileEditIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { SessionActive } from '@opencodex/contracts';
import { api } from '../../lib/api';
import { OpenInApp } from '../workbench/open-in-app';
import { noSubagents, subagentsQuery } from '../subagents/subagents-query';

const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

export function ThreadSummary({
  sessionID,
  directory,
  projectName,
  live,
  overlay,
  onOpen,
}: {
  sessionID: string;
  directory: string;
  projectName?: string;
  live: boolean;
  overlay: boolean;
  onOpen: (id: string) => void;
}) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    if (overlay) root.current?.focus({ preventScroll: true });
  }, [overlay]);
  // Reuse the full Changes reader's bounded, patch-free snapshot. This is the
  // working tree, not a claim about edits made by this chat or its subagents.
  const changes = useQuery({
    queryKey: ['workspace', 'diff', directory, 'working'],
    queryFn: ({ signal }) => api.changes(directory, 'working', signal),
    staleTime: 2_000,
    gcTime: 30_000,
    refetchInterval: live ? false : 15_000,
  });
  const totals = useMemo(
    () =>
      changes.data?.reduce(
        (sum, file) => ({
          additions: sum.additions + file.additions,
          deletions: sum.deletions + file.deletions,
        }),
        { additions: 0, deletions: 0 },
      ),
    [changes.data],
  );
  const children = useInfiniteQuery(subagentsQuery(sessionID, live));
  const items = children.data ?? noSubagents;
  const active = useQuery({
    queryKey: ['active'],
    queryFn: ({ signal }) => api.active(signal),
    refetchOnMount: false,
    select: useCallback(
      (active: Record<string, SessionActive>) =>
        items.filter((item) => Boolean(active[item.id])).map((item) => item.id),
      [items],
    ),
  });
  const status = useMemo(() => {
    const running = new Set(active.data);
    const counts = { working: 0, done: 0, failed: 0, stopped: 0, idle: 0 };
    for (const child of items) {
      if (running.has(child.id)) counts.working++;
      else if (child.outcome === 'succeeded') counts.done++;
      else if (child.outcome === 'failed') counts.failed++;
      else if (child.outcome === 'interrupted') counts.stopped++;
      else counts.idle++;
    }
    return Object.entries(counts)
      .filter(([, count]) => count)
      .map(([label, count]) => `${number.format(count)} ${label}`)
      .join(' · ');
  }, [items, active.data]);
  return (
    <section ref={root} className="thread-summary-card" tabIndex={-1} aria-label="Project summary">
      <header className="thread-summary-heading">
        <span className="truncate" title={directory}>
          {projectName || directory.split(/[\\/]/).filter(Boolean).at(-1) || 'Project'}
        </span>
        <OpenInApp directory={directory} active compact />
      </header>
      <button
        type="button"
        className="thread-summary-row"
        onClick={() => onOpen('changes')}
        title="Uncommitted working-tree changes for this project, not changes attributed to this chat"
      >
        <HugeiconsIcon icon={FileEditIcon} size={16} />
        <span>Changes</span>
        {!changes.isError && totals && (
          <span className="thread-summary-totals">
            <span className="thread-summary-added">+{number.format(totals.additions)}</span>
            <span className="text-error">−{number.format(totals.deletions)}</span>
          </span>
        )}
        {changes.isPending && <span className="thread-summary-meta">Loading…</span>}
        {changes.isError && <span className="thread-summary-meta text-error">Unavailable</span>}
      </button>
      <SummaryError label="changes" query={changes} />
      {(items.length > 0 || !children.isSuccess) && (
        <section className="thread-summary-section" aria-label="Subagents summary">
          <h2>Subagents</h2>
          {(items.length > 0 || children.isError) && (
            <button
              type="button"
              className="thread-summary-row thread-summary-subagents"
              onClick={() => onOpen('subagents')}
              title={
                children.hasNextPage
                  ? 'Outcomes for loaded subagents; open the list for more'
                  : 'Native child-session outcomes'
              }
            >
              <span className="thread-summary-avatars" aria-hidden="true">
                {items.slice(0, 3).map((child) => (
                  <HugeiconsIcon key={child.id} icon={BotIcon} size={16} />
                ))}
              </span>
              <span className="thread-summary-meta truncate">
                {children.isError || active.isError
                  ? 'Unavailable'
                  : active.isPending
                    ? 'Loading…'
                    : children.hasNextPage
                      ? `${number.format(items.length)}+ subagents · ${status}`
                      : status}
              </span>
            </button>
          )}
          {children.isPending && (
            <p className="thread-summary-note" role="status">
              Loading subagents…
            </p>
          )}
          <SummaryError label="subagents" query={children} />
          {items.length > 0 && <SummaryError label="subagent activity" query={active} />}
        </section>
      )}
    </section>
  );
}

function SummaryError({
  label,
  query,
}: {
  label: string;
  query: { isError: boolean; error: Error | null; refetch: () => unknown };
}) {
  if (!query.isError) return null;
  return (
    <div className="thread-summary-error" role="alert">
      <p>{query.error?.message}</p>
      <button type="button" onClick={() => void query.refetch()}>
        Retry loading {label}
      </button>
    </div>
  );
}
