import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { connect, type ClientHttp2Session } from 'node:http2';
import { join } from 'node:path';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { sessionMuted, sideChatParent } from '@opencodex/contracts';
import type { OpenCodeBackend } from './opencode';
import { remoteRequest, type DevicePush, type RemoteAccess } from './remote';

/**
 * Push notifications for the owner's paired iPhone, sent by this gateway straight to Apple
 * (APNs), so a reply, question or approval reaches the phone while the app is suspended. The
 * rules and wording are the desktop's system notifications (`features/notifications`).
 *
 * Inactive and silent until `push.json` (beside `remote.json`) names an APNs `.p8` key:
 * `{ keyPath, keyID, teamID, topic, environment? }`.
 */

const configSchema = z.object({
  keyPath: z.string().min(1),
  keyID: z.string().min(1),
  teamID: z.string().min(1),
  topic: z.string().min(1),
  /** Default for registrations that don't say which APNs environment their token belongs to. */
  environment: z.enum(['development', 'production']).default('development'),
});
type Config = z.infer<typeof configSchema> & { key: KeyObject };

export type PushKind = 'reply' | 'question' | 'permission';
export type Environment = DevicePush['environment'];
export type ApnsRequest = {
  environment: Environment;
  token: string;
  headers: Record<string, string>;
  payload: unknown;
};
export type ApnsResponse = { status: number; reason?: string };
export type ApnsSend = (request: ApnsRequest) => Promise<ApnsResponse>;

const titles: Record<PushKind, string> = {
  reply: 'Reply finished',
  question: 'Question waiting',
  permission: 'Permission needed',
};

const kindsSchema = z.object({
  reply: z.boolean(),
  question: z.boolean(),
  permission: z.boolean(),
});
const tokenSchema = z.string().regex(/^[0-9a-f]{64,200}$/i, 'That isn’t an APNs device token.');
const registrationSchema = z.object({
  token: tokenSchema,
  environment: z.enum(['development', 'production']),
  kinds: kindsSchema.default({ reply: true, question: true, permission: true }),
});
const activitySchema = z.object({
  sessionID: z.string().min(1).max(200),
  token: tokenSchema,
  environment: z.enum(['development', 'production']),
});

// Apple accepts a provider token for an hour and throttles refreshes under 20 minutes.
const JWT_AGE = 45 * 60_000;
const MAX_ACTIVITIES = 32;
/**
 * Like Slack: a push waits this long, and goes out only if the thread wasn't opened, the
 * request wasn't answered, and the computer running OpenCodex had no input meanwhile.
 */
export const PUSH_DELAY = 30_000;
const MAX_HANDLED = 512;

/** Seconds since the last keyboard, mouse or trackpad input on this Mac; unknown elsewhere. */
export function macIdleSeconds(): Promise<number | undefined> {
  if (process.platform !== 'darwin') return Promise.resolve(undefined);
  return new Promise((resolve) => {
    execFile(
      '/usr/sbin/ioreg',
      ['-c', 'IOHIDSystem', '-d', '4', '-k', 'HIDIdleTime'],
      { timeout: 5_000 },
      (error, stdout) => {
        const nanoseconds = error ? undefined : /"HIDIdleTime" = (\d+)/.exec(stdout)?.[1];
        resolve(nanoseconds === undefined ? undefined : Number(nanoseconds) / 1e9);
      },
    );
  });
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true });
  });

const base64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

/** An APNs provider token: an ES256 JWT signed with the team's `.p8` key. */
export function providerToken(
  config: { key: KeyObject; keyID: string; teamID: string },
  now = Date.now(),
) {
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: config.keyID }));
  const claims = base64url(JSON.stringify({ iss: config.teamID, iat: Math.floor(now / 1000) }));
  const input = `${header}.${claims}`;
  const signature = sign('sha256', Buffer.from(input), {
    key: config.key,
    dsaEncoding: 'ieee-p1363',
  });
  return `${input}.${base64url(signature)}`;
}

/** Sends over one HTTP/2 connection per APNs host, closed after a minute idle. */
function http2Sender(): ApnsSend {
  const sessions = new Map<string, ClientHttp2Session>();
  const session = (origin: string) => {
    const open = sessions.get(origin);
    if (open && !open.closed && !open.destroyed) return open;
    const created = connect(origin);
    created.on('error', () => undefined);
    created.on('close', () => sessions.get(origin) === created && sessions.delete(origin));
    created.setTimeout(60_000, () => created.close());
    created.unref();
    sessions.set(origin, created);
    return created;
  };
  return ({ environment, token, headers, payload }) =>
    new Promise((resolve, reject) => {
      const origin =
        environment === 'production'
          ? 'https://api.push.apple.com'
          : 'https://api.sandbox.push.apple.com';
      const stream = session(origin).request({
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        'content-type': 'application/json',
        ...headers,
      });
      let status = 0;
      let body = '';
      stream.setEncoding('utf8');
      stream.setTimeout(15_000, () => stream.close());
      stream.on('response', (response) => (status = Number(response[':status'])));
      stream.on('data', (chunk) => (body += chunk));
      stream.on('error', reject);
      stream.on('close', () => {
        if (!status) return reject(new Error('APNs closed the request.'));
        let reason: string | undefined;
        try {
          reason = (JSON.parse(body) as { reason?: string }).reason;
        } catch {
          // A success has no body.
        }
        resolve({ status, reason });
      });
      stream.end(JSON.stringify(payload));
    });
}

type Event = { type: string; data?: unknown };

/** The key an event that settles a waiting push records: a view, a reply, a cancel. */
function handledKey(type: string, data: EventData) {
  if (type === 'session.viewed') return `viewed:${data.sessionID}`;
  if (type === 'permission.replied') return `permission:${data.requestID}`;
  if (type === 'form.replied' || type === 'form.cancelled') return `form:${data.id}`;
  return undefined;
}
type EventData = {
  id?: string;
  sessionID?: string;
  requestID?: string;
  action?: string;
  resources?: string[];
  message?: string;
  form?: { id?: string; sessionID?: string; fields?: { title?: string; description?: string }[] };
};

const PREVIEW = 180;
const actions: Record<string, string> = {
  bash: 'Run',
  edit: 'Edit',
  write: 'Write',
  read: 'Read',
  webfetch: 'Fetch',
  external_directory: 'Use files outside the project',
};

/** Markdown as one plain line, cut to fit a lock screen notification. */
export function plainPreview(markdown: string, limit = PREVIEW) {
  const text = markdown
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
    .replace(/[*_~`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}
type SessionInfo = {
  id: string;
  title?: string;
  location?: { directory?: string };
  parentID?: string;
  metadata?: Record<string, unknown>;
};

export class Push {
  private readonly file: string;
  private readonly send: ApnsSend;
  private readonly delay: number;
  private readonly idleSeconds: () => Promise<number | undefined>;
  /** When each thread was last viewed and each request answered, to cancel waiting pushes. */
  private readonly handled = new Map<string, number>();
  private config?: Config;
  private jwt?: { value: string; created: number };
  private watching = false;
  /** Live Activity push tokens for running root chats the phone started, by session. */
  private activities = new Map<
    string,
    { device: string; token: string; environment: Environment }
  >();

  constructor(
    private readonly remote: RemoteAccess,
    private readonly backend: OpenCodeBackend,
    options: {
      file?: string;
      send?: ApnsSend;
      delay?: number;
      idleSeconds?: () => Promise<number | undefined>;
    } = {},
  ) {
    this.file = options.file ?? join(remote.directory, 'push.json');
    this.send = options.send ?? http2Sender();
    this.delay = options.delay ?? PUSH_DELAY;
    this.idleSeconds = options.idleSeconds ?? macIdleSeconds;
  }

  /** True once push.json names a readable key. */
  get active() {
    return Boolean(this.config);
  }

  /** Rereads push.json and starts listening if there's someone to push to. Never throws. */
  async refresh(signal: AbortSignal) {
    this.config = await this.load();
    if (!this.config || this.watching || signal.aborted || !this.wanted()) return;
    this.watching = true;
    void this.watch(signal).finally(() => (this.watching = false));
  }

  private async load(): Promise<Config | undefined> {
    const raw = await readFile(this.file, 'utf8').catch(() => undefined);
    if (raw === undefined) return undefined;
    try {
      const config = configSchema.parse(JSON.parse(raw));
      const key = createPrivateKey(await readFile(config.keyPath, 'utf8'));
      if (config.keyID !== this.config?.keyID || config.teamID !== this.config.teamID)
        this.jwt = undefined;
      return { ...config, key };
    } catch (error) {
      console.error(`Push notifications are off: ${this.file} or its key couldn’t be read.`, error);
      return undefined;
    }
  }

  private wanted() {
    return this.remote.pushDevices().length > 0 || this.activities.size > 0;
  }

  /** OpenCode's live events, like a desktop window's; reconnects while devices are registered. */
  private async watch(signal: AbortSignal) {
    let delay = 1_000;
    while (!signal.aborted && this.config && this.wanted()) {
      try {
        for await (const event of this.backend.events(signal)) {
          delay = 1_000;
          void this.handle(event as Event, signal).catch((error: unknown) =>
            console.warn('Could not send a push notification.', error),
          );
        }
      } catch {
        // OpenCode is down; try again below.
      }
      await sleep(delay, signal);
      delay = Math.min(delay * 2, 60_000);
    }
  }

  /** Same triggers as the desktop's `notifySession` calls in `use-events.ts`. */
  async handle(event: Event, signal: AbortSignal) {
    const data = (event.data ?? {}) as EventData;
    const settled = handledKey(event.type, data);
    if (settled) {
      this.handled.delete(settled);
      this.handled.set(settled, Date.now());
      if (this.handled.size > MAX_HANDLED) this.handled.delete(this.handled.keys().next().value!);
      return;
    }
    let kind: PushKind;
    let sessionID: string | undefined;
    // What opening the thread or answering the request records, which cancels the push.
    let key: string;
    const ended =
      event.type === 'session.execution.succeeded' ||
      event.type === 'session.execution.failed' ||
      event.type === 'session.execution.interrupted';
    if (ended && data.sessionID) await this.endActivity(data.sessionID, event.type);
    if (event.type === 'session.execution.succeeded' || event.type === 'session.execution.failed') {
      kind = 'reply';
      sessionID = data.sessionID;
      key = `viewed:${sessionID}`;
    } else if (event.type === 'form.created') {
      kind = 'question';
      sessionID = data.form?.sessionID;
      key = `form:${data.form?.id}`;
    } else if (event.type === 'permission.asked') {
      kind = 'permission';
      sessionID = data.sessionID;
      key = `permission:${data.id}`;
    } else return;
    if (!sessionID || !this.config) return;
    if (!this.remote.pushDevices().some((device) => device.push.kinds[kind])) return;
    if (this.delay > 0) {
      const since = Date.now();
      await sleep(this.delay, signal);
      // Opened or answered meanwhile, on the computer or the phone.
      if (signal.aborted || (this.handled.get(key) ?? 0) >= since) return;
      // Someone is at the computer, which shows its own notifications.
      const idle = await this.idleSeconds();
      if (idle !== undefined && idle * 1000 < this.delay) return;
    }
    const devices = this.remote.pushDevices().filter((device) => device.push.kinds[kind]);
    if (!devices.length || !this.config) return;
    const thread = await this.thread(kind, sessionID, signal);
    if (!thread) return;
    const failed = event.type === 'session.execution.failed';
    const body =
      (await this.preview(kind, sessionID, data, failed, signal).catch(() => undefined)) ??
      (failed ? 'Reply failed' : titles[kind]);
    await Promise.all(
      devices.map(({ push }) =>
        this.deliver(push.token, push.environment, {
          headers: {
            'apns-push-type': 'alert',
            'apns-priority': '10',
            // A newer alert for the same thread replaces the older one, like the desktop's `tag`.
            'apns-collapse-id': thread.id.slice(0, 64),
          },
          payload: {
            aps: {
              // Like Slack: who (the thread), where (the project), then what it said.
              alert: {
                title: thread.title,
                ...(thread.project ? { subtitle: thread.project } : {}),
                body,
              },
              sound: 'default',
              'thread-id': thread.id,
            },
            sessionID: thread.id,
            kind,
          },
        }),
      ),
    );
  }

  /** The root thread to attribute a notification to, or nothing if it stays quiet. */
  private async thread(kind: PushKind, sessionID: string, signal: AbortSignal) {
    const info = (id: string) =>
      this.backend.request(signal, (client, options) =>
        client.session.get({ sessionID: id }, options),
      ) as Promise<SessionInfo>;
    let session = await info(sessionID);
    // Subagent turns end inside their thread's turn; only their requests need the user.
    if (kind === 'reply' && session.parentID) return;
    for (let depth = 0; session.parentID && depth < 8; depth++)
      session = await info(session.parentID);
    const main = sideChatParent(session);
    const root = main ? await info(main) : session;
    // A muted thread stays quiet, including its subagents and side chats.
    if (sessionMuted(root)) return;
    const directory = root.location?.directory ?? session.location?.directory;
    const project = directory?.split(/[\\/]/).filter(Boolean).pop();
    return { id: root.id, title: root.title || 'Untitled session', project };
  }

  /** What happened, in a line: the reply's text, the question, or what needs approval. */
  private async preview(
    kind: PushKind,
    sessionID: string,
    data: EventData,
    failed: boolean,
    signal: AbortSignal,
  ) {
    if (kind === 'permission') {
      const what = data.message?.trim()
        ? data.message
        : [actions[data.action ?? ''] ?? data.action, data.resources?.join(', ')]
            .filter(Boolean)
            .join(' ');
      return `Needs approval: ${plainPreview(what || 'a tool', PREVIEW - 16)}`;
    }
    if (kind === 'question') {
      const fields = data.form?.fields ?? [];
      const first = fields[0]?.title || fields[0]?.description;
      const more = fields.length > 1 ? ` (+${fields.length - 1} more)` : '';
      return first ? `${plainPreview(first, PREVIEW - 12)}${more}` : titles.question;
    }
    const [last] = (
      (await this.backend.request(signal, (client, options) =>
        client.message.list({ sessionID, order: 'desc', limit: 1, type: 'assistant' }, options),
      )) as {
        data: {
          type: string;
          error?: { message?: string };
          content?: { type: string; text?: string }[];
        }[];
      }
    ).data;
    if (failed || last?.error)
      return `Reply failed${last?.error?.message ? `: ${plainPreview(last.error.message, PREVIEW - 14)}` : ''}`;
    const text = (last?.content ?? [])
      .flatMap((part) => (part.type === 'text' && part.text ? [part.text] : []))
      .join('\n');
    return plainPreview(text) || titles.reply;
  }

  private async deliver(
    token: string,
    environment: Environment,
    message: { headers: Record<string, string>; payload: unknown; topic?: string },
  ) {
    const config = this.config;
    if (!config) return;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!this.jwt || Date.now() - this.jwt.created > JWT_AGE)
        this.jwt = { value: providerToken(config), created: Date.now() };
      const response = await this.send({
        environment,
        token,
        headers: {
          authorization: `bearer ${this.jwt.value}`,
          'apns-topic': message.topic ?? config.topic,
          ...message.headers,
        },
        payload: message.payload,
      });
      if (response.status === 403 && response.reason === 'ExpiredProviderToken') {
        this.jwt = undefined;
        continue;
      }
      if (response.status === 410 || response.reason === 'BadDeviceToken') {
        await this.remote.dropPushToken(token);
        for (const [id, activity] of this.activities)
          if (activity.token === token) this.activities.delete(id);
      } else if (response.status !== 200)
        console.warn(`APNs refused a push: ${response.status} ${response.reason ?? ''}`.trim());
      return;
    }
  }

  registerActivity(device: string, input: z.infer<typeof activitySchema>) {
    this.activities.delete(input.sessionID);
    while (this.activities.size >= MAX_ACTIVITIES)
      this.activities.delete(this.activities.keys().next().value!);
    this.activities.set(input.sessionID, {
      device,
      token: input.token,
      environment: input.environment,
    });
  }

  /** Ends the phone's Live Activity for a chat whose reply ended while the app was suspended. */
  private async endActivity(sessionID: string, type: string) {
    const activity = this.activities.get(sessionID);
    if (!activity) return;
    this.activities.delete(sessionID);
    if (!this.config || !this.remote.paired(activity.device)) return;
    const now = Math.floor(Date.now() / 1000);
    const state =
      type === 'session.execution.succeeded'
        ? 'finished'
        : type === 'session.execution.failed'
          ? 'failed'
          : 'stopped';
    await this.deliver(activity.token, activity.environment, {
      topic: `${this.config.topic}.push-type.liveactivity`,
      headers: { 'apns-push-type': 'liveactivity', 'apns-priority': '10' },
      payload: {
        aps: {
          timestamp: now,
          event: 'end',
          // ReplyActivityAttributes.ContentState on the phone; its other fields are optional.
          'content-state': { state },
          'dismissal-date': now,
        },
      },
    });
  }
}

/** `/api/remote/push-token` and `/api/remote/live-activity`, for paired native devices only. */
export function pushRoutes(push: Push, remote: RemoteAccess, shutdown: AbortSignal) {
  const app = new Hono();
  const tooLarge = (c: Context) => c.json({ message: 'This request is too large.' }, 413);
  const device = (c: Context) => remoteRequest(c)?.device ?? undefined;
  const notPaired = (c: Context) =>
    c.json({ message: 'Turn on notifications from a paired iPhone.' }, 400);
  app.use('/push-token', bodyLimit({ maxSize: 2048, onError: tooLarge }));
  app.post('/push-token', async (c) => {
    const paired = device(c);
    if (!paired) return notPaired(c);
    const input = registrationSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json({ message: input.error.issues[0]?.message ?? 'Check the token.' }, 400);
    await remote.setPush(paired.id, input.data);
    await push.refresh(shutdown);
    return c.json({ ok: true, active: push.active });
  });
  app.delete('/push-token', async (c) => {
    const paired = device(c);
    if (!paired) return notPaired(c);
    await remote.setPush(paired.id, undefined);
    return c.json({ ok: true });
  });
  app.use('/live-activity', bodyLimit({ maxSize: 2048, onError: tooLarge }));
  app.post('/live-activity', async (c) => {
    const paired = device(c);
    if (!paired) return notPaired(c);
    const input = activitySchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json({ message: input.error.issues[0]?.message ?? 'Check the token.' }, 400);
    push.registerActivity(paired.id, input.data);
    await push.refresh(shutdown);
    return c.json({ ok: true, active: push.active });
  });
  return app;
}
