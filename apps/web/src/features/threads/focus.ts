import type { Session, SessionActive, SessionAttention } from '@opencodex/contracts';

export const ACTIVE_WINDOW = 3 * 24 * 60 * 60_000;

/** Approval, question, running, or an unread reply; at most one icon per row. */
export type ThreadStatus = 'permission' | 'question' | 'running' | 'unread' | undefined;
export type ThreadRow = { session: Session; status: ThreadStatus };

/** When the last run ended. Unlike `updatedAt`, metadata writes such as pins never move it. */
export function activityAt(session: Session) {
  return session.time.idle ?? session.time.created;
}

/** Marked done with no newer activity. Pending requests and runs still surface it. */
export function isSettled(session: Session) {
  return session.done !== undefined && activityAt(session) <= session.done;
}

export function threadStatus(
  session: Session,
  running: Record<string, SessionActive> | undefined,
  attention: SessionAttention | undefined,
): ThreadStatus {
  const request = attention?.[session.id];
  if (request) return request;
  if (running?.[session.id]) return 'running';
  if (session.unread || (session.time.idle ?? 0) > (session.time.viewed ?? 0)) return 'unread';
}

const rank = { permission: 0, question: 0, unread: 0, running: 1 } as const;

/**
 * Places each unpinned thread once: Active holds pending requests, runs, and recent activity
 * (needs-you first); Inactive holds older threads and those marked done with nothing new since.
 */
export function deriveFocus(
  sessions: readonly Session[],
  running: Record<string, SessionActive> | undefined,
  attention: SessionAttention | undefined,
  now: number,
  /** Project directories hidden from Focus; their approvals and questions still show. */
  excluded: ReadonlySet<string>,
) {
  const active: ThreadRow[] = [];
  const inactive: ThreadRow[] = [];
  const seen = new Set<string>();
  for (const session of sessions) {
    // Native pages can shift while threads update; never show one twice.
    if (seen.has(session.id) || session.pinned) continue;
    seen.add(session.id);
    const status = threadStatus(session, running, attention);
    if (excluded.has(session.directory) && status !== 'permission' && status !== 'question')
      continue;
    const settled = isSettled(session) && (status === undefined || status === 'unread');
    const row = { session, status };
    // Requests and runs always surface. Unread replies only rank first within the window, so
    // never-opened history does not flood Active.
    const waiting = status !== undefined && status !== 'unread';
    if (!settled && (waiting || activityAt(session) >= now - ACTIVE_WINDOW)) active.push(row);
    else inactive.push(row);
  }
  active.sort(
    (a, b) =>
      (a.status ? rank[a.status] : 2) - (b.status ? rank[b.status] : 2) ||
      activityAt(b.session) - activityAt(a.session),
  );
  inactive.sort((a, b) => activityAt(b.session) - activityAt(a.session));
  return { active, inactive };
}
