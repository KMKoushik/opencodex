import { useCallback } from 'react';
import {
  useQueries,
  useQuery,
  useQueryClient,
  type Query,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { SessionActive, SessionInfo } from '@opencodex/contracts';
import { api } from '../../lib/api';

export type RunningSubagent = {
  id: string;
  title?: string;
  agent?: string;
  created: number;
  /** Start of the current run, known only for a child's first run. */
  started?: number;
};

const activeIDs = (sessions: Record<string, SessionActive>) => Object.keys(sessions);

function combine(results: UseQueryResult<RunningSubagent | null>[]) {
  return {
    items: results
      .flatMap((result) => (result.data ? [result.data] : []))
      .sort((a, b) => a.created - b.created),
    pending: results.some((result) => result.isPending),
    failed: results.some((result) => result.isError),
  };
}

/**
 * Direct children of a thread that OpenCode reports as running. The native active snapshot
 * has no parent metadata or parent filter, so each running ID's immutable parent comes from
 * its session-info Query, fetched once rather than on every tool event.
 */
export function useRunningSubagents(sessionID: string) {
  const client = useQueryClient();
  const active = useQuery({
    queryKey: ['active'],
    queryFn: ({ signal }) => api.active(signal),
    select: activeIDs,
    refetchOnMount: false,
  });
  const select = useCallback(
    (session: SessionInfo): RunningSubagent | null =>
      session.parentID === sessionID
        ? {
            id: session.id,
            title: session.title,
            agent: session.agent,
            created: session.time.created,
            // A resumed child's snapshot records an earlier idle; its new start is unknown.
            started: session.time.idle === undefined ? session.time.created : undefined,
          }
        : null,
    [sessionID],
  );
  const children = useQueries({
    queries: (active.data ?? [])
      .filter((id) => id !== sessionID)
      .map((id) => ({
        queryKey: ['chat', id, 'info'],
        queryFn: ({ signal }: { signal: AbortSignal }) => api.session(id, signal),
        select,
        // Reuse cached identity instead of refetching it on activity-driven invalidation.
        enabled: (query: Query<SessionInfo>) => query.state.data === undefined,
        staleTime: Infinity,
      })),
    combine,
  });
  const failed = active.isError || children.failed;
  return {
    items: children.items,
    pending: active.isPending || children.pending,
    failed,
    retry: () => {
      if (active.isError) void active.refetch();
      void client.refetchQueries({
        queryKey: ['chat'],
        predicate: (query) => query.queryKey[2] === 'info' && query.state.status === 'error',
      });
    },
  };
}
