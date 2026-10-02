import { useState, type ReactNode } from 'react';
import { createDraftStore } from './draft-store';
import { DraftContext } from './draft-context';
import { readProjectModels, storeProjectModels } from './model-preferences';

export function DraftProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() =>
    createDraftStore({ models: readProjectModels(), saveModels: storeProjectModels }),
  );
  return <DraftContext value={store}>{children}</DraftContext>;
}
