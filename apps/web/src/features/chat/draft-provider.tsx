import { useState, type ReactNode } from 'react';
import { createDraftStore } from './draft-store';
import { DraftContext } from './draft-context';

export function DraftProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createDraftStore);
  return <DraftContext value={store}>{children}</DraftContext>;
}
