import { createContext, useContext } from 'react';
import type { createDraftStore } from './draft-store';

export const DraftContext = createContext<ReturnType<typeof createDraftStore> | null>(null);

export function useDraftStore() {
  const store = useContext(DraftContext);
  if (!store) throw new Error('DraftProvider is required');
  return store;
}
