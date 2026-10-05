import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ShellInfo } from '@opencodex/contracts';
import { api } from '../../lib/api';

export function useRunningShells(directory: string | undefined, sessionID: string, live: boolean) {
  return useQuery({
    queryKey: ['workspace', 'shells', directory, 'list'],
    queryFn: ({ signal }) => api.shells(directory!, signal),
    enabled: Boolean(directory),
    refetchInterval: live ? false : 5_000,
    select: useCallback(
      (shells: ShellInfo[]) =>
        shells.filter(
          (shell) => shell.status === 'running' && shell.metadata.sessionID === sessionID,
        ),
      [sessionID],
    ),
  });
}
