import type { SessionInfo } from '@opencodex/contracts';
import { api } from '../../lib/api';

export type SubagentCost = Pick<SessionInfo, 'id' | 'parentID' | 'cost'>;

export async function loadSubagentCosts(
  sessionID: string,
  signal: AbortSignal,
  list = api.subagents,
): Promise<SubagentCost[]> {
  const sessions = new Map<string, SubagentCost>();
  const seen = new Set([sessionID]);
  const pending = [sessionID];
  // Metadata only, with bounded concurrency and memory even for large session trees.
  while (pending.length) {
    signal.throwIfAborted();
    await Promise.all(
      pending.splice(0, 4).map(async (parentID) => {
        const cursors = new Set<string>();
        let cursor: string | undefined;
        do {
          signal.throwIfAborted();
          const page = await list(parentID, cursor, signal);
          for (const session of page.data) {
            if (seen.has(session.id)) continue;
            if (sessions.size >= 5000)
              throw new Error('This session has too many subagents to load the complete cost.');
            seen.add(session.id);
            sessions.set(session.id, {
              id: session.id,
              parentID: session.parentID,
              cost: session.cost,
            });
            pending.push(session.id);
          }
          cursor = page.cursor.next ?? undefined;
          if (cursor && cursors.has(cursor))
            throw new Error('OpenCode repeated a subagent page. Retry to load the complete cost.');
          if (cursor) cursors.add(cursor);
        } while (cursor);
      }),
    );
  }
  return [...sessions.values()];
}
