import { useStore } from 'zustand';
import { useQuery } from '@tanstack/react-query';
import type { ModelRef, SessionInfo } from '@opencodex/contracts';
import { api } from '../../lib/api';
import { useDraftStore } from './draft-context';

export function useModelSelection(sessionID: string, session?: SessionInfo) {
  const store = useDraftStore();
  const draft = useStore(store, (state) => state.drafts[sessionID]?.model);
  const directory = session?.location.directory;
  const catalog = useQuery({
    queryKey: ['models', directory],
    queryFn: ({ signal }) => api.models(directory!, signal),
    enabled: Boolean(directory),
    staleTime: 5 * 60_000,
  });
  return {
    catalog,
    model: draft ?? session?.model ?? catalog.data?.defaultModel ?? undefined,
    select(model: ModelRef) {
      store.getState().selectModel(sessionID, model);
    },
  };
}
