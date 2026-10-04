import { useSyncExternalStore } from 'react';
import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SessionFocusAction } from '@opencodex/contracts';
import { api } from '../../lib/api';
import { patchSessionFocus, refreshSessions } from '../sessions/metadata';

export function useThreadFocus(sessionID: string) {
  const client = useQueryClient();
  const mutationKey = ['chat', sessionID, 'focus'];
  const pending = useIsMutating({ mutationKey, exact: true }) > 0;
  const mutation = useMutation({
    mutationKey,
    mutationFn: (action: SessionFocusAction) => api.focusSession(sessionID, action),
    retry: false,
    onSuccess: (marked, action) => {
      patchSessionFocus(client, sessionID, marked);
      refreshSessions(client, [sessionID]);
      if (action === 'done') offerUndo({ ids: [sessionID] });
      else if (undo?.ids.includes(sessionID)) dismissUndo();
    },
  });
  return { ...mutation, pending };
}

/** Applies one action to several threads; each write still uses its session's queue. */
export function useFocusMany() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, action }: { ids: string[]; action: SessionFocusAction }) => {
      const results = await Promise.allSettled(ids.map((id) => api.focusSession(id, action)));
      return results.map((result, index) => ({ id: ids[index]!, result }));
    },
    retry: false,
    onSuccess: (results, { action }) => {
      const changed: string[] = [];
      for (const { id, result } of results) {
        if (result.status !== 'fulfilled') continue;
        patchSessionFocus(client, id, result.value);
        changed.push(id);
      }
      refreshSessions(client, changed);
      if (action === 'done' && changed.length) offerUndo({ ids: changed });
      else if (action === 'undone') dismissUndo();
    },
  });
}

type Undo = { ids: string[] };
let undo: Undo | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function setUndo(next: Undo | null) {
  undo = next;
  clearTimeout(timer);
  if (next) timer = setTimeout(() => setUndo(null), 6_000);
  for (const listener of listeners) listener();
}
const offerUndo = (next: Undo) => setUndo(next);
export const dismissUndo = () => setUndo(null);

export function useUndo() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => undo,
  );
}
