import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/api';
import { activityAt } from '../threads/focus';
import { rememberPinned } from '../threads/pins';
import { withinCheckout } from '../worktrees/checkout';
import { useSessions } from './use-sessions';
import { SessionRow } from './session-row';

export function SessionList({
  connected,
  directory,
  projectID,
  live,
  selectedID,
  onSelect,
}: {
  connected: boolean;
  directory: string;
  /** A Git project also lists threads from its worktrees. */
  projectID?: string;
  live: boolean;
  selectedID: string | undefined;
  onSelect: (id: string) => void;
}) {
  const sessions = useSessions({ directory }, connected, live);
  // Older threads can carry a previous project identity, so the folder list stays primary.
  const project = useSessions(projectID ? { project: projectID } : undefined, connected, live);
  const [visibleCount, setVisibleCount] = useState(4);
  const active = useQuery({
    queryKey: ['active'],
    queryFn: ({ signal }) => api.active(signal),
    enabled: connected,
    refetchOnMount: false,
  });
  const loaded = useMemo(() => {
    const local = sessions.data?.pages.flatMap((page) => page.sessions) ?? [];
    if (!project.data) return local;
    const ids = new Set(local.map((session) => session.id));
    const worktrees = project.data.pages
      .flatMap((page) => page.sessions)
      .filter((session) => !ids.has(session.id) && !withinCheckout(session.directory, directory));
    return worktrees.length ? [...local, ...worktrees] : local;
  }, [sessions.data, project.data, directory]);
  // Pinned threads render above the project groups. Running threads stay on top; others
  // follow their last run, because metadata writes (pins, done, unread) bump `updatedAt`.
  const items = useMemo(
    () =>
      loaded
        .filter((session) => !session.pinned)
        .map((session) => ({
          session,
          order: active.data?.[session.id] ? session.updatedAt : activityAt(session),
        }))
        .sort((a, b) => b.order - a.order)
        .map((item) => item.session),
    [loaded, active.data],
  );
  useEffect(() => {
    for (const session of loaded) if (session.pinned) rememberPinned(session.id, true);
  }, [loaded]);
  const hasHidden = items.length > visibleCount;
  const fetchingMore = sessions.isFetchingNextPage || project.isFetchingNextPage;
  return (
    <nav className="session-list" aria-label="Sessions">
      {connected && sessions.isPending && <p className="sidebar-note">Loading…</p>}
      {connected && sessions.isError && (
        <div className="sidebar-note" role="alert">
          <p className="text-error">{sessions.error.message}</p>
          <Button variant="secondary" size="sm" onClick={() => void sessions.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {connected && project.isError && (
        <div className="sidebar-note" role="alert">
          <p className="text-error">Could not load worktree threads. {project.error.message}</p>
          <Button variant="secondary" size="sm" onClick={() => void project.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {connected && sessions.isSuccess && items.length === 0 && (
        <p className="sidebar-note">No threads yet</p>
      )}
      {items.slice(0, visibleCount).map((session) => (
        <SessionRow
          key={session.id}
          session={session}
          worktree={
            withinCheckout(session.directory, directory)
              ? undefined
              : session.directory.split(/[\\/]/).filter(Boolean).at(-1)
          }
          selected={selectedID === session.id}
          responding={Boolean(connected && active.data?.[session.id])}
          connected={connected}
          onSelect={() => onSelect(session.id)}
        />
      ))}
      {(hasHidden || sessions.hasNextPage || project.hasNextPage) && (
        <button
          className="nav-row session-more"
          disabled={fetchingMore || (!hasHidden && !connected)}
          onClick={async () => {
            if (!hasHidden) {
              const results = await Promise.all([
                sessions.hasNextPage ? sessions.fetchNextPage() : undefined,
                project.hasNextPage ? project.fetchNextPage() : undefined,
              ]);
              if (results.some((result) => result?.isError)) return;
            }
            setVisibleCount((count) => count + 4);
          }}
        >
          {fetchingMore ? 'Loading…' : 'Show more'}
        </button>
      )}
    </nav>
  );
}
