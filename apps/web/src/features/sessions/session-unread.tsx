import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/api';
import { refreshSession } from './metadata';

export function SessionUnread({
  sessionID,
  unread,
  ready,
}: {
  sessionID: string;
  unread: string | null | undefined;
  ready: boolean;
}) {
  const client = useQueryClient();
  const initial = useRef<string | null>(undefined);
  const attempted = useRef<string>(undefined);
  const clear = useMutation({
    mutationKey: ['chat', sessionID, 'unread'],
    mutationFn: (marker: string) => api.unreadSession(sessionID, { action: 'clear', marker }),
    retry: false,
    onSuccess: () => refreshSession(client, sessionID),
  });
  const { mutate, isPending } = clear;
  useEffect(() => {
    if (unread === undefined) return;
    // Only acknowledge the mark present on opening, not one made while already reading.
    if (initial.current === undefined) {
      if (!ready) return;
      initial.current = unread;
    }
    if (!ready || !unread || initial.current !== unread) return;
    const observe = () => {
      if (
        document.visibilityState !== 'visible' ||
        !document.hasFocus() ||
        attempted.current === unread ||
        client.isMutating({ mutationKey: ['chat', sessionID, 'unread'] })
      )
        return;
      attempted.current = unread;
      mutate(unread);
    };
    observe();
    window.addEventListener('focus', observe);
    document.addEventListener('visibilitychange', observe);
    return () => {
      window.removeEventListener('focus', observe);
      document.removeEventListener('visibilitychange', observe);
    };
  }, [client, sessionID, unread, ready, mutate, isPending]);
  return clear.isError && unread === clear.variables ? (
    <div className="chat-error" role="alert">
      <p>Could not mark this thread as read. {clear.error.message}</p>
      <Button variant="secondary" size="sm" onClick={() => mutate(clear.variables!)}>
        Retry
      </Button>
    </div>
  ) : null;
}
