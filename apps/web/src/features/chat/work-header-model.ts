import type { SessionMessageInfo } from '@opencodex/contracts';
import type { TimelineRow } from './timeline-model';

type Header = Extract<TimelineRow, { type: 'work-header' }>;

// Native assistant/idle timestamps describe work, not time spent waiting in
// the inbox. This projection runs on snapshots, never on clock or token ticks.
export function createWorkHeaderProjector() {
  let previous = new Map<string, Header>();
  let previousWorkIDs = new Map<string, string>();
  return (messages: SessionMessageInfo[], content: TimelineRow[]) => {
    const workForMessage = new Map<string, Header>();
    const workIDs = new Map<string, string>();
    let work: Header | undefined;
    let pendingSkills: string[] = [];
    let restoredID = false;
    const claimed = new Set<string>();
    for (const message of messages) {
      if (message.type === 'user' || message.type === 'idle') {
        if (work && message.type === 'idle') {
          work.completedAt = message.time.created;
          work.outcome = message.outcome;
        }
        work = undefined;
        pendingSkills = [];
        restoredID = false;
      }
      if (message.type === 'skill') {
        if (work) workForMessage.set(message.id, work);
        else pendingSkills.push(message.id);
      }
      if (message.type !== 'assistant') continue;
      if (!work) {
        work = {
          id: `work:${message.id}`,
          type: 'work-header',
          startedAt: message.time.created,
          errors: 0,
          hasActivity: false,
        };
        for (const id of pendingSkills) workForMessage.set(id, work);
        pendingSkills = [];
      }
      const oldID = previousWorkIDs.get(message.id);
      // Prepending a partial turn retains its disclosure identity.
      if (!restoredID && oldID && !claimed.has(oldID)) {
        work.id = oldID;
        claimed.add(oldID);
        restoredID = true;
      }
      work.completedAt = message.time.completed;
      if (message.error) work.errors++;
      workForMessage.set(message.id, work);
    }
    const scopes = new Map<string, string>();
    const headers = new Map<string, Header>();
    const rows: TimelineRow[] = [];
    for (const row of content) {
      const messageID =
        row.type === 'activity'
          ? row.entries[0]?.messageID
          : row.type === 'text' || row.type === 'message'
            ? row.message.id
            : undefined;
      const header = messageID ? workForMessage.get(messageID) : undefined;
      if (header) {
        if (!headers.has(header.id)) {
          headers.set(header.id, header);
          rows.push(header);
        }
        if (row.type === 'activity') {
          header.hasActivity = true;
          header.errors += row.errors;
          scopes.set(row.id, header.id);
        }
      }
      rows.push(row);
    }
    for (const [messageID, header] of workForMessage) workIDs.set(messageID, header.id);
    // Preserve ordinary row identities and settled header identities as live
    // snapshots arrive. The list does not receive one-second clock updates.
    const stable = rows.map((row) => {
      if (row.type !== 'work-header') return row;
      const old = previous.get(row.id);
      return old &&
        old.startedAt === row.startedAt &&
        old.completedAt === row.completedAt &&
        old.outcome === row.outcome &&
        old.hasActivity === row.hasActivity &&
        old.errors === row.errors
        ? old
        : row;
    });
    previous = new Map(
      stable.filter((row): row is Header => row.type === 'work-header').map((row) => [row.id, row]),
    );
    previousWorkIDs = workIDs;
    const latest = messages.at(-1);
    return {
      rows: stable,
      scopes,
      latestWorkID: latest?.type === 'assistant' ? workIDs.get(latest.id) : undefined,
    };
  };
}
