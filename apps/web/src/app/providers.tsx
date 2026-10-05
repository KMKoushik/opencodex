import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ShortcutsProvider } from '../features/shortcuts/shortcuts-provider';
import { DraftProvider } from '../features/chat/draft-provider';
import { EditorDraftProvider } from '../features/workbench/editor-draft-provider';
import { UpdateSync } from '../features/updates/update-sync';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 10_000, retry: 1 }, mutations: { retry: false } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <UpdateSync />
      <DraftProvider>
        <EditorDraftProvider>
          <ShortcutsProvider>{children}</ShortcutsProvider>
        </EditorDraftProvider>
      </DraftProvider>
    </QueryClientProvider>
  );
}
