import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SessionInfo } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/api';
import { updateSessionViewed } from './viewed';

export function SessionViewed({
  sessionID,
  time,
  ready,
}: {
  sessionID: string;
  time: SessionInfo['time'] | undefined;
  ready: boolean;
}) {
  const client = useQueryClient();
  const attempted = useRef<number>(undefined);
  const mutationKey = ['chat', sessionID, 'view'];
  const view = useMutation({
    mutationKey,
    mutationFn: (idle: number) => api.viewSession(sessionID, idle),
    retry: false,
    onSuccess: (_, idle) => updateSessionViewed(client, sessionID, idle),
  });
  const { mutate, isPending } = view;
  const idle = time?.idle;
  const viewed = time?.viewed ?? 0;
  useEffect(() => {
    if (!ready || idle === undefined || idle <= viewed) return;
    const observe = () => {
      if (
        document.visibilityState !== 'visible' ||
        !document.hasFocus() ||
        attempted.current === idle ||
        client.isMutating({ mutationKey: ['chat', sessionID, 'view'] })
      )
        return;
      // Capture the displayed transition, not whichever turn finishes during the request.
      attempted.current = idle;
      mutate(idle);
    };
    observe();
    window.addEventListener('focus', observe);
    document.addEventListener('visibilitychange', observe);
    return () => {
      window.removeEventListener('focus', observe);
      document.removeEventListener('visibilitychange', observe);
    };
  }, [client, sessionID, ready, idle, viewed, mutate, isPending]);

  return view.isError && idle !== undefined && idle > viewed && view.variables === idle ? (
    <div className="chat-error" role="alert">
      <p>Could not mark this reply as read.</p>
      <Button variant="secondary" size="sm" onClick={() => mutate(idle)}>
        Retry
      </Button>
    </div>
  ) : null;
}
