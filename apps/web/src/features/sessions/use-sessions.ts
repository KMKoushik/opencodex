import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

/** Root threads in one folder, or in every checkout of a native project. */
export function useSessions(
  scope: { directory: string } | { project: string } | undefined,
  connected: boolean,
  live: boolean,
) {
  return useInfiniteQuery({
    queryKey: [
      'sessions',
      ...(scope && 'project' in scope ? ['project', scope.project] : [scope?.directory]),
    ],
    enabled: Boolean(scope && connected),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => {
      if (!scope) throw new Error('Choose a project first.');
      return api.sessions(scope, pageParam, signal);
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    // Keep existing snapshots fresh while the event source is recovering.
    refetchInterval: connected && !live ? 15_000 : false,
  });
}
