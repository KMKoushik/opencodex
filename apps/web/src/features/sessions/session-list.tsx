import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/api';
import { useSessions } from './use-sessions';

export function SessionList({
  connected,
  directory,
  live,
  selectedID,
  onSelect,
}: {
  connected: boolean;
  directory: string;
  live: boolean;
  selectedID: string | undefined;
  onSelect: (id: string) => void;
}) {
  const sessions = useSessions(directory, connected, live);
  const [visibleCount, setVisibleCount] = useState(6);
  const active = useQuery({
    queryKey: ['active'],
    queryFn: ({ signal }) => api.active(signal),
    enabled: connected,
    refetchOnMount: false,
  });
  const items = useMemo(
    () => sessions.data?.pages.flatMap((page) => page.sessions) ?? [],
    [sessions.data],
  );
  const hasHidden = items.length > visibleCount;
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
      {connected && sessions.isSuccess && items.length === 0 && (
        <p className="sidebar-note">No threads yet</p>
      )}
      {items.slice(0, visibleCount).map((session) => (
        <button
          key={session.id}
          className="nav-row session-row"
          aria-current={selectedID === session.id ? 'page' : undefined}
          title={session.title}
          onClick={() => onSelect(session.id)}
        >
          <span className="truncate">{session.title}</span>
          <time dateTime={new Date(session.updatedAt).toISOString()}>
            {formatAge(session.updatedAt)}
          </time>
          {connected && active.data?.[session.id] && (
            <span
              className="session-activity"
              role="img"
              aria-label="Responding"
              title="Responding…"
            />
          )}
        </button>
      ))}
      {(hasHidden || sessions.hasNextPage) && (
        <button
          className="nav-row session-more"
          disabled={sessions.isFetchingNextPage || (!hasHidden && !connected)}
          onClick={async () => {
            if (!hasHidden) {
              const result = await sessions.fetchNextPage();
              if (result.isError) return;
            }
            setVisibleCount((count) => count + 6);
          }}
        >
          {sessions.isFetchingNextPage ? 'Loading…' : 'Show more'}
        </button>
      )}
    </nav>
  );
}

function formatAge(time: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60_000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 365)}y`;
}
