import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { readSearchPage } from './session-search';

it('searches visible message text read-only, with every title match before deduplicated message matches', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'opencodex-search-'));
  const path = join(directory, 'opencode.db');
  const database = new DatabaseSync(path);
  try {
    database.exec(`
      CREATE TABLE session (id TEXT PRIMARY KEY, title TEXT, time_created INTEGER, parent_id TEXT, metadata TEXT);
      CREATE TABLE session_message (id TEXT PRIMARY KEY, session_id TEXT, type TEXT, data TEXT);
      CREATE INDEX message_session_type ON session_message(session_id, type);
    `);
    const session = database.prepare('INSERT INTO session VALUES (?, ?, ?, ?, ?)');
    const message = database.prepare('INSERT INTO session_message VALUES (?, ?, ?, ?)');
    for (let i = 0; i < 51; i++) session.run(`title-${i}`, 'NEEDLE title', i, null, null);
    session.run('user', 'Other title', 100, null, null);
    session.run('assistant', 'Other title', 100, null, null);
    session.run('tool-only', 'Other title', 200, null, null);
    session.run('child', 'Needle title', 300, 'parent', null);
    session.run(
      'side',
      'Needle title',
      400,
      null,
      JSON.stringify({ opencodexSideChat: { parentID: 'parent' } }),
    );
    message.run(
      'u1',
      'user',
      'user',
      JSON.stringify({ text: 'A needle in user text with literal %_ symbols.' }),
    );
    message.run(
      'u2',
      'user',
      'user',
      JSON.stringify({ text: 'Another needle in the same session.' }),
    );
    message.run(
      'a1',
      'assistant',
      'assistant',
      JSON.stringify({ content: [{ type: 'text', text: 'Assistant needle reply.' }] }),
    );
    message.run(
      't1',
      'tool-only',
      'assistant',
      JSON.stringify({
        content: [
          { type: 'tool', state: { content: [{ type: 'text', text: 'needle' }] } },
          { type: 'reasoning', text: 'needle' },
        ],
      }),
    );
    message.run('s1', 'tool-only', 'system', JSON.stringify({ text: 'needle' }));
    message.run(
      'both',
      'title-0',
      'user',
      JSON.stringify({ text: 'needle in both title and text' }),
    );
    const input = { paths: [path], query: 'needle', sample: { id: 'user', created: 100 } };
    const first = await readSearchPage(input, AbortSignal.timeout(5000));
    expect(first).toHaveLength(51);
    expect(first.every((match) => match.rank === 0)).toBe(true);
    const last = first[49]!;
    const next = await readSearchPage(
      { ...input, anchor: { query: input.query, ...last } },
      AbortSignal.timeout(5000),
    );
    expect(next.map((match) => match.id)).toEqual(['title-0', 'user', 'assistant']);
    expect(next[1]?.excerpt).toContain('needle in user text');
    expect(next[2]?.excerpt).toBe('Assistant needle reply.');
    const messagePage = await readSearchPage(
      { ...input, anchor: { query: input.query, ...next[1]! } },
      AbortSignal.timeout(5000),
    );
    expect(messagePage.map((match) => match.id)).toEqual(['assistant']);
    const literal = await readSearchPage({ ...input, query: '%_' }, AbortSignal.timeout(5000));
    expect(literal.map((match) => match.id)).toEqual(['user']);
    message.run('emoji', 'user', 'user', JSON.stringify({ text: 'emoji ' + '😀'.repeat(300) }));
    const unicode = await readSearchPage({ ...input, query: 'emoji' }, AbortSignal.timeout(5000));
    expect(unicode[0]?.excerpt?.length).toBeLessThanOrEqual(220);
    expect(() => readSearchPage(input, AbortSignal.abort())).toThrow();
    expect(database.prepare('SELECT COUNT(*) AS count FROM session').get()?.count).toBe(56);
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
