// Talks to the shared OpenCode V2 service through the same official client the gateway uses.
// The service is externally owned: the bench never starts or stops it.
import { Service } from '../../packages/gateway/node_modules/@opencode/client/dist/promise/service.js';
import { OpenCode } from '../../packages/gateway/node_modules/@opencode/client/dist/promise/index.js';

export async function connect() {
  const endpoint = await Service.discover({ version: (v: string) => v.startsWith('2.') });
  if (!endpoint)
    throw new Error('No running OpenCode 2.x service was found. Start OpenCode first.');
  const client = OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) });
  const port = new URL(endpoint.url).port;
  const lsof = Bun.spawnSync([
    'lsof',
    '-nP',
    `-iTCP:${port}`,
    '-sTCP:LISTEN',
    '-t',
  ]).stdout.toString();
  return { client, url: endpoint.url, serverPid: Number(lsof.trim().split('\n')[0]) || undefined };
}

type Client = Awaited<ReturnType<typeof connect>>['client'];

/** The top-level session in `directory` with the most stored message data. */
export async function longestSession(client: Client, directory: string) {
  const sessions = await client.session.list({
    directory,
    limit: 50,
    order: 'desc',
    parentID: null,
  });
  let best: { id: string; title: string; messages: number; mb: number } | undefined;
  for (const session of sessions.data) {
    let messages = 0;
    let bytes = 0;
    let cursor: string | undefined;
    for (let page = 0; page < 100; page++) {
      const result = await client.message.list({ sessionID: session.id, limit: 50, cursor });
      messages += result.data.length;
      bytes += JSON.stringify(result.data).length;
      cursor = result.cursor.next ?? undefined;
      if (!cursor || !result.data.length) break;
    }
    if (!best || bytes > best.mb * 1e6)
      best = { id: session.id, title: session.title, messages, mb: Math.round(bytes / 1e4) / 100 };
  }
  if (!best) throw new Error(`No sessions found for ${directory}.`);
  return best;
}

export async function forkForBench(client: Client, sessionID: string, title: string) {
  const fork = await client.session.fork({ sessionID });
  try {
    await client.session.update({ sessionID: fork.id, title });
  } catch (error) {
    await client.session.remove({ sessionID: fork.id });
    throw error;
  }
  return fork.id;
}

/** Sends a prompt and resolves when the session is idle again, with output size stats. */
export async function streamPrompt(client: Client, sessionID: string, model: string, text: string) {
  const [providerID, ...rest] = model.split('/');
  await client.session.switchModel({
    sessionID,
    model: { providerID: providerID!, id: rest.join('/') },
  });
  const started = Date.now();
  await client.session.prompt({ sessionID, text });
  await client.session.wait({ sessionID }, { signal: AbortSignal.timeout(300_000) });
  const finished = Date.now();
  const latest = await client.message.list({ sessionID, limit: 10 });
  const replies = (latest.data as unknown as Reply[]).filter(
    (m) => m.type === 'assistant' && (m.time?.created ?? 0) >= started,
  );
  const textChars = replies
    .flatMap((m) => m.content ?? [])
    .reduce((sum, part) => sum + (part.type === 'text' ? (part.text?.length ?? 0) : 0), 0);
  const outputTokens = replies.reduce((sum, m) => sum + (m.tokens?.output ?? 0), 0);
  return {
    started,
    replyIDs: replies.map((m) => m.id),
    finished,
    durationMs: finished - started,
    textChars,
    outputTokens,
  };
}

type Reply = {
  id: string;
  type: string;
  time?: { created?: number };
  content?: { type: string; text?: string }[];
  tokens?: { output?: number };
};

export async function removeSession(client: Client, sessionID: string) {
  await client.session.remove({ sessionID });
}
