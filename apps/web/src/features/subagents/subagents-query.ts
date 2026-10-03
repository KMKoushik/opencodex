import type { InfiniteData } from '@tanstack/react-query';
import type { SessionInfo, SessionListOutput } from '@opencodex/contracts';
import { api } from '../../lib/api';

export const noSubagents: SessionInfo[] = [];

export function subagentsQuery(sessionID: string, live: boolean) {
  return {
    queryKey: ['subagents', sessionID],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }: { pageParam: string | undefined; signal: AbortSignal }) =>
      api.subagents(sessionID, pageParam, signal),
    getNextPageParam: (page: SessionListOutput) => page.cursor.next ?? undefined,
    select: subagentItems,
    staleTime: 5_000,
    gcTime: 60_000,
    refetchInterval: live ? (false as const) : 5_000,
  };
}

function subagentItems(data: InfiniteData<SessionListOutput>) {
  const seen = new Set<string>();
  return data.pages
    .flatMap((page) => page.data)
    .filter((session) => {
      if (seen.has(session.id)) return false;
      seen.add(session.id);
      return true;
    });
}
