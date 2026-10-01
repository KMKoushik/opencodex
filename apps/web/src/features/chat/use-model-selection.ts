import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ModelRef, SessionInfo } from '@opencodex/contracts';
import { api } from '../../lib/api';

export function useModelSelection(sessionID: string, session?: SessionInfo) {
  const client = useQueryClient();
  const directory = session?.location.directory;
  const catalog = useQuery({
    queryKey: ['models', directory],
    queryFn: ({ signal }) => api.models(directory!, signal),
    enabled: Boolean(directory),
    staleTime: 5 * 60_000,
  });
  const selection = useMutation({
    mutationFn: (model: ModelRef) => api.selectModel(sessionID, model),
    retry: false,
    onSuccess: async (_result, model) => {
      const key = ['chat', sessionID, 'info'];
      await client.cancelQueries({ queryKey: key });
      client.setQueryData<SessionInfo>(key, (info) => (info ? { ...info, model } : info));
      void client.invalidateQueries({ queryKey: ['sessions'] });
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['chat', sessionID, 'info'] }),
  });
  return {
    catalog,
    selection,
    model: selection.isPending
      ? selection.variables
      : (session?.model ?? catalog.data?.defaultModel ?? undefined),
  };
}
