import { Worker, type MessagePort } from 'node:worker_threads';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { sessionSummary, sideChatParent, type SessionPage } from '@opencodex/contracts';
import type { OpenCodeBackend } from './opencode';
import { opencodeDatabases } from './opencode-databases';
import { GatewayError } from './errors';

const anchorSchema = z.object({
  query: z.string().max(256),
  rank: z.union([z.literal(0), z.literal(1)]),
  created: z.number().nonnegative(),
  id: z.string().min(1).max(256),
});
type Anchor = z.infer<typeof anchorSchema>;
type Match = { id: string; created: number; rank: 0 | 1; excerpt?: string };
type SearchInput = {
  paths: string[];
  query: string;
  anchor?: Anchor;
  sample: { id: string; created: number };
};
let activeSearches = 0;

export async function searchSessions(
  backend: OpenCodeBackend,
  query: string,
  cursor: string | undefined,
  signal: AbortSignal,
): Promise<SessionPage> {
  if (!query) return backend.sessions({}, cursor, signal);
  if (!(await backend.localService()))
    return {
      ...(await backend.sessions({}, cursor, signal, query)),
      searchNotice: 'Searching titles only. Message search requires a local OpenCode service.',
    };
  let anchor: Anchor | undefined;
  if (cursor) {
    try {
      if (cursor.length > 2048) throw new Error('Invalid cursor');
      anchor = anchorSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString()));
      if (anchor.query !== query) throw new Error('Different query');
    } catch {
      throw new GatewayError('This search page has expired. Search again.', 400);
    }
  }
  signal = AbortSignal.any([signal, AbortSignal.timeout(10_000)]);
  // Match the local database to a session from the connected service, not an old release channel.
  const sample = await backend.request(signal, (client, options) =>
    client.session.list({ parentID: null, limit: 1, order: 'desc' }, options),
  );
  const session = sample.data[0];
  if (!session) return { sessions: [], nextCursor: null };
  const matches = await readSearchPage(
    {
      paths: await opencodeDatabases(),
      query,
      anchor,
      sample: { id: session.id, created: session.time.created },
    },
    signal,
  );
  const page = matches.slice(0, 50);
  // Native records remain authoritative. Only hydrate this page, with bounded concurrency.
  const sessions: SessionPage['sessions'] = [];
  for (let start = 0; start < page.length; start += 5) {
    signal.throwIfAborted();
    const batch = await Promise.all(
      page.slice(start, start + 5).map(async (match) => {
        const info = await backend.request(signal, (client, options) =>
          client.session.get({ sessionID: match.id }, options),
        );
        if (info.parentID || sideChatParent(info)) return [];
        return [
          {
            ...sessionSummary(info),
            ...(match.excerpt ? { match: { excerpt: match.excerpt } } : {}),
          },
        ];
      }),
    );
    sessions.push(...batch.flat());
  }
  const last = page.at(-1);
  return {
    sessions,
    nextCursor:
      matches.length > 50 && last
        ? Buffer.from(
            JSON.stringify({ query, rank: last.rank, created: last.created, id: last.id }),
          ).toString('base64url')
        : null,
  };
}

/** Synchronous SQLite scans must never block Electron main or the gateway's event stream. */
export function readSearchPage(input: SearchInput, signal: AbortSignal): Promise<Match[]> {
  signal.throwIfAborted();
  if (activeSearches >= 2) throw new GatewayError('Message search is busy. Please retry.', 503);
  const worker = new Worker(
    `
    const { workerData, parentPort } = require('node:worker_threads');
    const { DatabaseSync } = require('node:sqlite');
    (${searchWorker.toString()})(workerData, parentPort, DatabaseSync);
  `,
    { eval: true, workerData: input, execArgv: [] },
  );
  activeSearches++;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, result?: Match[]) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      // A native SQLite call may finish before V8 can terminate; keep its slot until exit.
      void worker.terminate().finally(() => activeSearches--);
      if (error) reject(error);
      else resolve(result!);
    };
    const abort = () => finish(new GatewayError('Search cancelled. Please try again.', 503));
    signal.addEventListener('abort', abort, { once: true });
    worker.once('message', (result: Match[]) => finish(undefined, result));
    worker.once('error', (cause) =>
      finish(
        Object.assign(
          new GatewayError(
            'Could not search local messages. Check your OpenCode database and retry.',
            502,
          ),
          { cause },
        ),
      ),
    );
    worker.once('exit', () =>
      finish(new GatewayError('Message search stopped. Please retry.', 502)),
    );
    if (signal.aborted) abort();
  });
}

// Self-contained so it works in both the source gateway and Electron's bundled main process.
function searchWorker(input: SearchInput, parentPort: MessagePort, Database: typeof DatabaseSync) {
  const { paths, query, anchor, sample } = input;
  let database: InstanceType<typeof DatabaseSync> | undefined;
  for (const path of paths) {
    try {
      const candidate = new Database(path, { readOnly: true, timeout: 1000 });
      try {
        const found = candidate
          .prepare('SELECT time_created FROM session WHERE id = ?')
          .get(sample.id);
        if (found?.time_created === sample.created) {
          database = candidate;
          break;
        }
      } finally {
        if (database !== candidate) candidate.close();
      }
    } catch {
      // Other release channels may not contain this service's session/schema.
    }
  }
  if (!database) throw new Error('No database for the connected service');
  try {
    database.exec('BEGIN');
    const root = `s.parent_id IS NULL
      AND json_extract(s.metadata, '$.opencodexSideChat.parentID') IS NULL`;
    const after = anchor
      ? 'AND (s.time_created < $created OR (s.time_created = $created AND s.id < $id))'
      : '';
    const parameters = { query, ...(anchor ? { created: anchor.created, id: anchor.id } : {}) };
    const rows: Match[] = [];
    if (!anchor || anchor.rank === 0) {
      rows.push(
        ...(database
          .prepare(
            `
        SELECT s.id, s.time_created AS created, 0 AS rank FROM session s
        WHERE ${root} AND instr(lower(s.title), lower($query)) > 0 ${after}
        ORDER BY s.time_created DESC, s.id DESC LIMIT 51
      `,
          )
          .all(parameters) as Match[]),
      );
    }
    if (rows.length < 51) {
      // Search only visible user/assistant text, not reasoning, system prompts, or tool payloads.
      const text = `
        SELECT json_extract(m.data, '$.text') AS text
        FROM session_message m WHERE m.session_id = s.id AND m.type = 'user'
        UNION ALL
        SELECT json_extract(c.value, '$.text') AS text
        FROM session_message m, json_each(m.data, '$.content') c
        WHERE m.session_id = s.id AND m.type = 'assistant'
          AND json_extract(c.value, '$.type') = 'text'
      `;
      rows.push(
        ...(database
          .prepare(
            `
        SELECT * FROM (
          SELECT s.id, s.time_created AS created, 1 AS rank,
            (SELECT substr(text, max(1, instr(lower(text), lower($query)) - 60), 220)
             FROM (${text}) WHERE instr(lower(text), lower($query)) > 0 LIMIT 1) AS excerpt
          FROM session s WHERE ${root} AND instr(lower(s.title), lower($query)) = 0
            ${anchor?.rank === 1 ? after : ''}
        ) WHERE excerpt IS NOT NULL
        ORDER BY created DESC, id DESC LIMIT $limit
      `,
          )
          .all({
            query,
            limit: 51 - rows.length,
            ...(anchor?.rank === 1 ? { created: anchor.created, id: anchor.id } : {}),
          }) as Match[]),
      );
    }
    parentPort.postMessage(
      rows.map((row) => ({
        ...row,
        ...(row.excerpt ? { excerpt: row.excerpt.replace(/\s+/g, ' ').trim().slice(0, 220) } : {}),
      })),
    );
  } finally {
    database.close();
  }
}
