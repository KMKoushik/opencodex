import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { SessionInfo, SessionListOutput, SessionPage } from '@opencodex/contracts';

/** Apply the native acknowledgment without clearing a newer idle transition. */
export function updateSessionViewed(client: QueryClient, sessionID: string, idle: number) {
  function update<T extends { id: string; time: { viewed?: number } }>(session: T): T {
    return session.id === sessionID && idle > (session.time.viewed ?? 0)
      ? { ...session, time: { ...session.time, viewed: idle } }
      : session;
  }
  client.setQueryData<SessionInfo>(['chat', sessionID, 'info'], (session) =>
    session ? update(session) : session,
  );
  client.setQueriesData<InfiniteData<SessionPage>>({ queryKey: ['sessions'] }, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({ ...page, sessions: page.sessions.map(update) })),
        }
      : data,
  );
  client.setQueriesData<InfiniteData<SessionListOutput>>({ queryKey: ['subagents'] }, (data) =>
    data
      ? { ...data, pages: data.pages.map((page) => ({ ...page, data: page.data.map(update) })) }
      : data,
  );
}
