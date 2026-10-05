import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { DesktopUpdateState } from '@opencodex/contracts/desktop';

export function UpdateSync() {
  const client = useQueryClient();
  useEffect(() => {
    const desktop = window.desktop;
    if (!desktop?.getUpdateState || !desktop.onUpdateStateChanged) return;
    let revision = 0;
    const unsubscribe = desktop.onUpdateStateChanged((state) => {
      revision++;
      client.setQueryData(['desktop-update'], state);
    });
    const refresh = () => {
      void client
        .fetchQuery({
          queryKey: ['desktop-update'],
          queryFn: async () => {
            const captured = revision;
            const state = await desktop.getUpdateState();
            // A live event takes precedence over an older in-flight IPC snapshot.
            return revision === captured
              ? state
              : (client.getQueryData<DesktopUpdateState>(['desktop-update']) ?? state);
          },
          staleTime: 0,
          retry: false,
        })
        .catch((error: unknown) => console.error('Could not read desktop update state.', error));
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', refresh);
      void client.cancelQueries({ queryKey: ['desktop-update'] });
    };
  }, [client]);
  return null;
}
