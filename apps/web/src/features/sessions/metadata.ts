import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import {
  SESSION_DONE_KEY,
  SESSION_PINNED_KEY,
  sessionMarker,
  sessionUnread,
  type SessionInfo,
  type SessionPage,
  type SessionListOutput,
} from '@opencodex/contracts';
import { rememberPinned } from '../threads/pins';

/** Patch metadata only, leaving native read transitions and streaming data untouched. */
export function updateSessionMetadata(
  client: QueryClient,
  sessionID: string,
  metadata: SessionInfo['metadata'],
) {
  const marked = {
    unread: sessionUnread({ metadata }),
    pinned: sessionMarker({ metadata }, SESSION_PINNED_KEY),
    done: sessionMarker({ metadata }, SESSION_DONE_KEY),
  };
  rememberPinned(sessionID, Boolean(marked.pinned));
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
              session.id === sessionID ? { ...session, ...marked } : session,
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

/** Apply a confirmed pin/done write before the broadcast metadata event arrives. */
export function patchSessionFocus(
  client: QueryClient,
  sessionID: string,
  marked: { pinned: number | null; done: number | null },
) {
  const fields = { pinned: marked.pinned ?? undefined, done: marked.done ?? undefined };
  rememberPinned(sessionID, Boolean(marked.pinned));
  client.setQueryData<SessionInfo>(['chat', sessionID, 'info'], (session) =>
    session
      ? {
          ...session,
          metadata: {
            ...session.metadata,
            [SESSION_PINNED_KEY]: marked.pinned,
            [SESSION_DONE_KEY]: marked.done,
          },
        }
      : session,
  );
  client.setQueriesData<InfiniteData<SessionPage>>({ queryKey: ['sessions'] }, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            sessions: page.sessions.map((session) =>
              session.id === sessionID ? { ...session, ...fields } : session,
            ),
          })),
        }
      : data,
  );
}

export function refreshSession(client: QueryClient, sessionID: string) {
  refreshSessions(client, [sessionID]);
}

/** One list refetch for any number of changed threads. */
export function refreshSessions(client: QueryClient, sessionIDs: readonly string[]) {
  if (!sessionIDs.length) return;
  const ids = new Set(sessionIDs);
  // Read authoritative snapshots after the mutation; a newer metadata event may already exist.
  for (const id of ids) void client.invalidateQueries({ queryKey: ['chat', id, 'info'] });
  void client.invalidateQueries({
    queryKey: ['sessions'],
    predicate: (query) =>
      (query.state.data as InfiniteData<SessionPage> | undefined)?.pages.some((page) =>
        page.sessions.some((session) => ids.has(session.id)),
      ) ?? false,
  });
}
