import { createServer, type Server } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { afterEach, expect, test, vi } from 'vitest';
import { OpenCode } from '@opencode/client';
import { Service } from '@opencode/client/service';
import type { DesktopToolEndpoint } from '@opencodex/contracts/desktop-tools';
import plugin, { authorize, callEndpoint, discoverEndpoint } from './plugin';

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function runtime() {
  const calls: Record<string, unknown>[] = [];
  const token = 'private-desktop-token-for-tests';
  const onCall = () => ({
    content: [{ type: 'file', uri: 'data:image/png;base64,aGVsbG8=', mime: 'image/png' }],
  });
  const server = createServer(async (request, response) => {
    if (request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(401).end();
      return;
    }
    response.setHeader('content-type', 'application/json');
    if (request.url === '/health') {
      response.end(JSON.stringify({ version: 1, label: 'Test desktop' }));
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>;
    calls.push(body);
    response.end(JSON.stringify(onCall()));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  cleanups.push(() => close(server));
  const endpoint: DesktopToolEndpoint = {
    version: 1,
    pid: process.pid,
    label: 'Test desktop',
    url: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    token,
  };
  return { endpoint, calls };
}

async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function discovery(endpoints: DesktopToolEndpoint[]) {
  const directory = await mkdtemp(join(tmpdir(), 'opencodex-plugin-'));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const folder = join(directory, 'opencode', 'opencodex-desktop');
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const files = await Promise.all(
    endpoints.map(async (endpoint, i) => {
      const file = join(folder, `${i}.json`);
      await writeFile(file, JSON.stringify(endpoint), { mode: 0o600 });
      return file;
    }),
  );
  vi.stubEnv('XDG_CONFIG_HOME', directory);
  vi.stubEnv('OPENCODEX_DESKTOP_ENDPOINT', '');
  return files;
}

test('discovery refuses ambiguous instances and external endpoints; explicit selection stays isolated', async () => {
  const first = await runtime();
  const second = await runtime();
  const files = await discovery([first.endpoint, second.endpoint]);
  await expect(discoverEndpoint(new AbortController().signal)).rejects.toThrow('Multiple');
  vi.stubEnv('OPENCODEX_DESKTOP_ENDPOINT', files[1]!);
  expect(await discoverEndpoint(new AbortController().signal)).toEqual(second.endpoint);
  await writeFile(files[1]!, JSON.stringify({ ...second.endpoint, url: 'https://example.com' }));
  await expect(discoverEndpoint(new AbortController().signal)).rejects.toThrow('unavailable');
  expect(first.calls).toHaveLength(0);
  expect(second.calls).toHaveLength(0);
});

type PermissionClient = Parameters<typeof authorize>[0];
type Event = { type: string; data?: Record<string, unknown> };
function permissionClient(effect: 'allow' | 'deny' | 'ask') {
  const queue: Event[] = [];
  let wake: (() => void) | undefined;
  const push = (event: Event) => {
    queue.push(event);
    wake?.();
  };
  const create = vi.fn(async (input: { id: string }) => ({ id: input.id, effect }));
  const reply = vi.fn(async () => undefined);
  const client = {
    permission: { create, reply },
    event: {
      async *subscribe({ signal }: { signal: AbortSignal }) {
        yield { type: 'server.connected' };
        try {
          while (!signal.aborted) {
            const event = queue.shift();
            if (event) {
              yield event;
              continue;
            }
            await new Promise<void>((resolve) => {
              wake = resolve;
              signal.addEventListener('abort', resolve as () => void, { once: true });
            });
          }
        } finally {
          wake = undefined;
        }
      },
    },
  } as unknown as PermissionClient;
  return { client, create, reply, push };
}

const invocation = () => ({
  sessionID: 'ses_invoking_chat',
  agent: 'build',
  messageID: 'msg_invocation',
  id: 'call_1',
  signal: new AbortController().signal,
});

test('native permissions block execution; trusted invocation identity and file content cross the transport', async () => {
  const host = await runtime();
  await discovery([host.endpoint]);
  const permission = permissionClient('deny');
  vi.spyOn(Service, 'discover').mockResolvedValue({ url: 'http://127.0.0.1:1', auth: undefined });
  vi.spyOn(OpenCode, 'make').mockReturnValue({
    ...permission.client,
    server: { info: async () => ({ pid: process.pid }) },
  } as unknown as ReturnType<typeof OpenCode.make>);
  type Context = Parameters<typeof plugin.setup>[0];
  type Editor = Parameters<Parameters<Context['tool']['transform']>[0]>[0];
  const tools = new Map<string, Parameters<Editor['add']>[0]>();
  await plugin.setup({
    tool: {
      transform: async (callback) => callback({ add: (tool) => tools.set(tool.name, tool) }),
    },
    skill: { transform: async () => undefined },
    session: { hook: async () => undefined },
  });
  const context = invocation();
  const screenshot = tools.get('browser_screenshot')!;
  const input = { tabID: 'tab_owned', origin: 'https://example.com' };
  await expect(screenshot.execute(input, context)).rejects.toThrow('browser_enable');
  await tools.get('browser_enable')!.execute({}, context);
  await expect(screenshot.execute({ ...input, sessionID: 'ses_other' }, context)).rejects.toThrow(
    'Unexpected field',
  );
  await expect(screenshot.execute(input, context)).rejects.toThrow('denied');
  expect(host.calls).toHaveLength(0);
  permission.create.mockImplementation(async (request) => ({ id: request.id, effect: 'allow' }));
  const result = await screenshot.execute(input, context);
  expect(permission.create).toHaveBeenLastCalledWith(
    expect.objectContaining({
      sessionID: context.sessionID,
      action: 'browser.screenshot',
      resources: ['embedded:https://example.com'],
      source: { type: 'tool', messageID: context.messageID, id: context.id },
    }),
    expect.anything(),
  );
  expect(host.calls).toEqual([
    {
      sessionID: context.sessionID,
      method: 'browser.screenshot',
      input: { tabID: 'tab_owned', expectedOrigin: 'https://example.com' },
    },
  ]);
  expect(result.content[0]).toEqual({
    type: 'file',
    uri: 'data:image/png;base64,aGVsbG8=',
    mime: 'image/png',
  });
});

test('permission waiting ignores another chat’s reply and abort rejects the outstanding native prompt', async () => {
  const permission = permissionClient('ask');
  const context = invocation();
  const abort = new AbortController();
  context.signal = abort.signal;
  const pending = authorize(permission.client, 'computer.click', ['com.apple.TextEdit'], context);
  await vi.waitFor(() => expect(permission.create).toHaveBeenCalledOnce());
  const requestID = permission.create.mock.calls[0]![0].id;
  permission.push({
    type: 'permission.replied',
    data: { sessionID: 'ses_other', requestID, reply: 'once' },
  });
  const rejected = expect(pending).rejects.toThrow();
  abort.abort();
  await rejected;
  expect(permission.reply).toHaveBeenCalledWith(
    { sessionID: context.sessionID, requestID, decision: 'reject' },
    expect.anything(),
  );
  const next = authorize(permission.client, 'computer.click', ['com.apple.TextEdit'], invocation());
  await vi.waitFor(() => expect(permission.create).toHaveBeenCalledTimes(2));
  permission.push({
    type: 'permission.replied',
    data: {
      sessionID: context.sessionID,
      requestID: permission.create.mock.calls[1]![0].id,
      reply: 'once',
    },
  });
  await next;
});

test('an aborted desktop invocation cannot reach the host', async () => {
  const host = await runtime();
  const abort = new AbortController();
  abort.abort();
  await expect(
    callEndpoint(
      host.endpoint,
      {
        sessionID: 'ses_test',
        method: 'computer.click',
        input: { app: 'com.apple.TextEdit', x: 1, y: 2 },
      },
      abort.signal,
    ),
  ).rejects.toThrow();
  expect(host.calls).toHaveLength(0);
});
