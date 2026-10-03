import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/api';
import { useSessions } from './use-sessions';
import { SessionRow } from './session-row';

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
  const [visibleCount, setVisibleCount] = useState(4);
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
        <SessionRow
          key={session.id}
          session={session}
          selected={selectedID === session.id}
          responding={Boolean(connected && active.data?.[session.id])}
          connected={connected}
          onSelect={() => onSelect(session.id)}
        />
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
            setVisibleCount((count) => count + 4);
          }}
        >
          {sessions.isFetchingNextPage ? 'Loading…' : 'Show more'}
        </button>
      )}
    </nav>
  );
}
