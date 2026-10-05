import { useMutation, useQuery } from '@tanstack/react-query';
import type { DesktopUpdateState } from '@opencodex/contracts/desktop';

export function useUpdates() {
  const state = useQuery<DesktopUpdateState>({
    queryKey: ['desktop-update'],
    enabled: false,
    staleTime: Infinity,
  });
  const action = useMutation({
    mutationKey: ['desktop-update-action'],
    mutationFn: async (action: 'check' | 'download' | 'install') => {
      const desktop = window.desktop;
      if (!desktop?.getUpdateState)
        throw new Error('Restart with the latest desktop release to enable updates.');
      if (action === 'check') await desktop.checkForUpdates();
      else if (action === 'download') await desktop.downloadUpdate();
      else await desktop.installUpdate();
    },
  });
  return { state, action };
}
