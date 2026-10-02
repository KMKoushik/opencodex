import { useQueries, useQuery, type Query } from '@tanstack/react-query';
import type { SessionActive, SessionInfo } from '@opencodex/contracts';
import { api } from '../../lib/api';

const activeIDs = (sessions: Record<string, SessionActive>) => Object.keys(sessions);
const parentID = (session: SessionInfo) => session.parentID ?? null;

export function RunningSubagentsBadge({ sessionID }: { sessionID: string }) {
  const active = useQuery({
    queryKey: ['active'],
    queryFn: ({ signal }) => api.active(signal),
    select: activeIDs,
    refetchOnMount: false,
  });
  const sessions = useQueries({
    queries: (active.data ?? [])
      .filter((id) => id !== sessionID)
      .map((id) => ({
        queryKey: ['chat', id, 'info'],
        queryFn: ({ signal }: { signal: AbortSignal }) => api.session(id, signal),
        select: parentID,
        // Native parent identity is immutable. Reuse cached session info rather than
        // refetching it on tool activity, or walking every page of child history.
        enabled: (query: Query<SessionInfo>) => query.state.data === undefined,
        staleTime: Infinity,
      })),
  });
  const failed = active.isError || sessions.some((session) => session.isError);
  if (failed)
    return (
      <span
        id={`running-subagents-${sessionID}`}
        className="wb-rail-badge"
        data-error="true"
        role="img"
        aria-label="Could not load running subagent count"
        title="Could not load running subagent count"
      >
        !
      </span>
    );
  if (active.isPending || sessions.some((session) => session.isPending)) return null;
  const count = sessions.filter((session) => session.data === sessionID).length;
  if (!count) return null;
  const label = `${count} ${count === 1 ? 'subagent' : 'subagents'} running`;
  return (
    <span
      id={`running-subagents-${sessionID}`}
      className="wb-rail-badge"
      role="img"
      aria-label={label}
      title={label}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
