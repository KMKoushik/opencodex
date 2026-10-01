import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { LivePart } from './stream';
import { messageQuery } from './message-query';

export function useChat(sessionID: string, live: boolean) {
  const key = ['chat', sessionID];
  const refetchInterval = live ? false : 5_000;
  const info = useQuery({
    queryKey: [...key, 'info'],
    queryFn: ({ signal }) => api.session(sessionID, signal),
    refetchInterval,
  });
  const messages = useInfiniteQuery({
    ...messageQuery(sessionID),
    refetchInterval,
  });
  const active = useQuery({
    queryKey: ['active'],
    queryFn: ({ signal }) => api.active(signal),
    // The event subscription owns recovery polling for this shared snapshot.
  });
  const inbox = useQuery({
    queryKey: [...key, 'inbox'],
    queryFn: ({ signal }) => api.inbox(sessionID, signal),
    refetchInterval,
  });
  const permissions = useQuery({
    queryKey: [...key, 'permissions'],
    queryFn: ({ signal }) => api.permissions(sessionID, signal),
    refetchInterval,
  });
  const forms = useQuery({
    queryKey: [...key, 'forms'],
    queryFn: ({ signal }) => api.forms(sessionID, signal),
    refetchInterval,
  });
  useQuery<LivePart[], Error, null>({
    queryKey: [...key, 'stream'],
    queryFn: () => [],
    initialData: [],
    enabled: false,
    gcTime: 0,
    // Keep receiving live parts while the reader is in history, without rendering
    // the whole chat on each token. Visible text rows select their own part.
    select: () => null,
    notifyOnChangeProps: [],
  });
  const executionError = useQuery<string | null>({
    queryKey: [...key, 'execution-error'],
    queryFn: () => null,
    initialData: null,
    enabled: false,
    gcTime: 0,
  });
  return { info, messages, active, inbox, permissions, forms, executionError };
}
