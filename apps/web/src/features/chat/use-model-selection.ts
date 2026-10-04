import { useStore } from 'zustand';
import { useQuery } from '@tanstack/react-query';
import type { ModelRef, SessionInfo } from '@opencodex/contracts';
import { api } from '../../lib/api';
import { useDraftStore } from './draft-context';
import { modelKey } from './model-usage';

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
  const model = draft ?? session?.model ?? catalog.data?.defaultModel ?? undefined;
  return {
    catalog,
    model,
    select(next: ModelRef) {
      const actions = store.getState();
      const switching = !model || modelKey(model) !== modelKey(next);
      if (switching && model) actions.rememberVariant(model);
      const saved = actions.modelVariants[modelKey(next)];
      const available = catalog.data?.data.find(
        (item) => item.id === next.id && item.providerID === next.providerID,
      );
      const selected =
        switching && !next.variant && saved && available?.variants.some((item) => item.id === saved)
          ? { ...next, variant: saved }
          : next;
      actions.selectModel(sessionID, selected);
      actions.rememberVariant(selected);
      if (directory) actions.rememberModel(directory, selected);
    },
  };
}
