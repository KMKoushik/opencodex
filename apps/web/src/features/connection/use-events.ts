import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useEvents(enabled: boolean) {
  const client = useQueryClient();
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const events = new EventSource('/api/events');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        void client.invalidateQueries({ queryKey: ['sessions'] });
      }, 250);
    };
    events.addEventListener('ready', () => {
      setLive(true);
      // Subscriptions are live-only. Refetch after every reconnect to recover missed changes.
      void client.invalidateQueries({ queryKey: ['connection'] });
      refresh();
    });
    events.addEventListener('sessions-changed', refresh);
    const unavailable = () => {
      setLive(false);
      void client.invalidateQueries({ queryKey: ['connection'] });
    };
    events.addEventListener('unavailable', unavailable);
    events.onerror = unavailable;
    return () => {
      events.close();
      clearTimeout(timer);
      setLive(false);
    };
  }, [client, enabled]);
  return enabled && live;
}
