import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { LegendList } from '@legendapp/list/react';
import { Search01Icon, Folder01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { Session } from '@opencodex/contracts';
import { api } from '../../lib/api';
import { Dialog } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';

export function ThreadSearch({
  connected,
  live,
  onClose,
  onSelect,
}: {
  connected: boolean;
  live: boolean;
  onClose: () => void;
  onSelect: (session: Session) => void;
}) {
  const [search, setSearch] = useState('');
  const query = search.trim();
  const sessions = useInfiniteQuery({
    queryKey: ['sessions', 'search', query],
    queryFn: ({ pageParam, signal }) => api.searchSessions(query, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    gcTime: 0,
    enabled: connected,
    refetchInterval: connected && !live ? 15_000 : false,
  });
  const rows = useMemo(
    () => sessions.data?.pages.flatMap((page) => page.sessions) ?? [],
    [sessions.data],
  );
  return (
    <Dialog title="Search threads" onClose={onClose}>
      <div className="thread-search-input">
        <HugeiconsIcon icon={Search01Icon} size={16} aria-hidden="true" />
        <input
          type="search"
          aria-label="Search threads"
          placeholder="Search all threads…"
          autoFocus
          maxLength={256}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {!connected && (
        <p className="sidebar-note text-error" role="alert">
          Connect to OpenCode to search threads.
        </p>
      )}
      {connected && sessions.isPending && (
        <p className="sidebar-note" role="status">
          Searching…
        </p>
      )}
      {sessions.isError && (
        <div className="sidebar-note" role="alert">
          <p>{sessions.error.message}</p>
          <Button variant="secondary" size="sm" onClick={() => void sessions.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {sessions.isSuccess && !rows.length && (
        <p className="sidebar-note">No threads match your search.</p>
      )}
      {!!rows.length && (
        <LegendList
          className="scrollbar-on-hover"
          data={rows}
          keyExtractor={(session) => session.id}
          estimatedItemSize={60}
          style={{ height: 360 }}
          renderItem={({ item }) => (
            <button className="thread-search-row" onClick={() => onSelect(item)}>
              <span className="truncate">{item.title}</span>
              <small className="truncate">
                <HugeiconsIcon icon={Folder01Icon} size={12} />
                {item.directory}
              </small>
            </button>
          )}
        />
      )}
      {sessions.hasNextPage && (
        <Button
          variant="ghost"
          size="sm"
          disabled={sessions.isFetchingNextPage}
          onClick={() => void sessions.fetchNextPage()}
        >
          Show more
        </Button>
      )}
    </Dialog>
  );
}
