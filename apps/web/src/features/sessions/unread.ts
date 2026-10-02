import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import {
  SESSION_UNREAD_KEY,
  type SessionInfo,
  type SessionPage,
  type SessionListOutput,
} from '@opencodex/contracts';

/** Patch metadata only, leaving native read transitions and streaming data untouched. */
export function updateSessionUnread(
  client: QueryClient,
  sessionID: string,
  metadata: SessionInfo['metadata'],
) {
  const value = metadata?.[SESSION_UNREAD_KEY];
  const unread = typeof value === 'string' && value ? value : undefined;
  client.setQueryData<SessionInfo>(['chat', sessionID, 'info'], (session) =>
    session ? { ...session, metadata } : session,
  );
  client.setQueriesData<InfiniteData<SessionPage>>({ queryKey: ['sessions'] }, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            sessions: page.sessions.map((session) =>
              session.id === sessionID ? { ...session, unread } : session,
            ),
          })),
        }
      : data,
  );
  client.setQueriesData<InfiniteData<SessionListOutput>>({ queryKey: ['subagents'] }, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            data: page.data.map((session) =>
              session.id === sessionID ? { ...session, metadata } : session,
            ),
          })),
        }
      : data,
  );
}

export function refreshSessionUnread(client: QueryClient, sessionID: string) {
  // Read authoritative snapshots after the mutation; a newer metadata event may already exist.
  void client.invalidateQueries({ queryKey: ['chat', sessionID, 'info'] });
  void client.invalidateQueries({
    queryKey: ['sessions'],
    predicate: (query) =>
      (query.state.data as InfiniteData<SessionPage> | undefined)?.pages.some((page) =>
        page.sessions.some((session) => session.id === sessionID),
      ) ?? false,
  });
}
