import { Button } from '../../components/ui/button';
import type { useSessions } from './use-sessions';

export function SessionList({
  connected,
  sessions,
  selectedID,
  onSelect,
}: {
  connected: boolean;
  sessions: ReturnType<typeof useSessions>;
  selectedID: string | undefined;
  onSelect: (id: string) => void;
}) {
  const items = sessions.data?.pages.flatMap((page) => page.sessions) ?? [];
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
      {items.map((session) => (
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
        </button>
      ))}
      {sessions.hasNextPage && (
        <button
          className="nav-row session-more"
          disabled={sessions.isFetchingNextPage || !connected}
          onClick={() => void sessions.fetchNextPage()}
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
