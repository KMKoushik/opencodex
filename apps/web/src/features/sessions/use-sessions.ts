import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export function useSessions(directory: string | undefined, connected: boolean, live: boolean) {
  return useInfiniteQuery({
    queryKey: ['sessions', directory],
    enabled: Boolean(directory && connected),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => {
      if (!directory) throw new Error('Choose a project first.');
      return api.sessions(directory, pageParam, signal);
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    // Keep existing snapshots fresh while the event source is recovering.
    refetchInterval: connected && !live ? 15_000 : false,
  });
}
