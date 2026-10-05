import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useRunningSubagents } from './running-subagents';

export type SubagentAttention = 'permission' | 'question' | 'error' | null;

function combine(results: UseQueryResult<SubagentAttention>[]): SubagentAttention[] {
  return results.map((result) => (result.isError ? 'error' : (result.data ?? null)));
}

/** Keep request indicators current even when the Shell tab or collapsed header is shown. */
export function useSubagentActivity(sessionID: string, live: boolean) {
  const running = useRunningSubagents(sessionID);
  const attention = useQueries({
    queries: running.items.map((item) => ({
      queryKey: ['subagent-attention', item.id],
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<SubagentAttention> => {
        const [permissions, forms] = await Promise.all([
          api.permissions(item.id, signal),
          api.forms(item.id, signal),
        ]);
        return permissions.length ? 'permission' : forms.length ? 'question' : null;
      },
      refetchInterval: live ? (false as const) : 5_000,
    })),
    combine,
  });
  return { ...running, attention };
}
