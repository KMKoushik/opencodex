import { infiniteQueryOptions } from '@tanstack/react-query';
import { api } from '../../lib/api';

export function messageQuery(sessionID: string) {
  return infiniteQueryOptions({
    queryKey: ['chat', sessionID, 'messages'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => api.messages(sessionID, pageParam, signal),
    getNextPageParam: (page) => page.cursor.next ?? undefined,
  });
}
