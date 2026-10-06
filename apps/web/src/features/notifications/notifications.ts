import { useEffect, useSyncExternalStore } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import {
  sessionSummary,
  sideChatParent,
  type Session,
  type SessionInfo,
} from '@opencodex/contracts';
import { api } from '../../lib/api';
import { readStorage, writeStorage } from '../../lib/storage';

export type NotificationKind = 'reply' | 'question' | 'permission';
type NotificationSettings = Record<NotificationKind, boolean>;

let settings: NotificationSettings | undefined;
const listeners = new Set<() => void>();

function getSettings(): NotificationSettings {
  if (!settings) {
    let saved: Partial<NotificationSettings> | null = null;
    try {
      saved = JSON.parse(readStorage('notifications') ?? 'null');
    } catch {
      // A malformed preference falls back to notifications off.
    }
    settings = {
      reply: saved?.reply === true,
      question: saved?.question === true,
      permission: saved?.permission === true,
    };
  }
  return settings;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function update(kind: NotificationKind, enabled: boolean) {
  settings = { ...getSettings(), [kind]: enabled };
  writeStorage('notifications', JSON.stringify(settings));
  for (const listener of listeners) listener();
}

export function useNotificationSettings() {
  return { settings: useSyncExternalStore(subscribe, getSettings), update };
}

export function notificationsSupported() {
  return typeof Notification !== 'undefined' && window.isSecureContext;
}

/** The chat on screen, and how to open a chat when its notification is clicked. */
let target: { sessionID?: string; open: (session: Session) => void } | undefined;
const shown = new Map<string, Notification>();

function clearShown() {
  for (const notification of shown.values()) notification.close();
  shown.clear();
}

export function useNotificationTarget(
  sessionID: string | undefined,
  open: (session: Session) => void,
) {
  useEffect(() => {
    target = { sessionID, open };
    return () => {
      target = undefined;
    };
  });
  useEffect(() => {
    // Returning to the app dismisses its alerts; the sidebar still shows unread and waiting chats.
    window.addEventListener('focus', clearShown);
    return () => {
      window.removeEventListener('focus', clearShown);
      clearShown();
    };
  }, []);
}

function viewing(sessionID: string) {
  return (
    document.visibilityState === 'visible' && document.hasFocus() && target?.sessionID === sessionID
  );
}

function info(client: QueryClient, sessionID: string) {
  return client.fetchQuery({
    queryKey: ['chat', sessionID, 'info'],
    queryFn: ({ signal }) => api.session(sessionID, signal),
  });
}

const titles: Record<NotificationKind, string> = {
  reply: 'Reply finished',
  question: 'Question waiting',
  permission: 'Permission needed',
};

export async function notifySession(
  client: QueryClient,
  kind: NotificationKind,
  sessionID: string,
  failed = false,
) {
  if (
    !getSettings()[kind] ||
    !notificationsSupported() ||
    Notification.permission !== 'granted' ||
    viewing(sessionID)
  )
    return;
  try {
    let session: SessionInfo = await info(client, sessionID);
    // Subagent turns end inside their thread's turn; only their requests need the user.
    if (kind === 'reply' && session.parentID) return;
    for (let depth = 0; session.parentID && depth < 8; depth++)
      session = await info(client, session.parentID);
    const main = sideChatParent(session);
    const thread = sessionSummary(main ? await info(client, main) : session);
    if (viewing(thread.id)) return;
    shown.get(thread.id)?.close();
    const notification = new Notification(failed ? 'Reply failed' : titles[kind], {
      body: thread.title,
      tag: thread.id,
    });
    shown.set(thread.id, notification);
    notification.onclick = () => {
      notification.close();
      window.focus();
      target?.open(thread);
    };
    notification.onclose = () => {
      if (shown.get(thread.id) === notification) shown.delete(thread.id);
    };
  } catch (error) {
    console.warn('Could not show a chat notification.', error);
  }
}
