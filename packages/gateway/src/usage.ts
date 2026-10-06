import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';
import { Hono } from 'hono';
import type { ConnectionInfo } from '@opencode/client';
import type { UsageLimits, UsageProvider, UsageWindow } from '@opencodex/contracts';
import type { OpenCodeBackend } from './opencode';
import { GatewayError } from './errors';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MAX_BODY = 1024 * 1024;

type StoredCredential =
  | { type: 'oauth'; access: string; expires?: number; metadata?: Record<string, unknown> }
  | { type: 'key'; key: string };
type Upstream = { name: string; url: string; headers: Record<string, string>; signIn: string };

class UsageError extends Error {}

/**
 * Plan limits for the subscriptions OpenCodex agents run on. OpenCode names each integration's
 * active credential; the secret comes from OpenCode's local store (Claude Code's for Claude).
 * Tokens stay in the gateway and are never refreshed here, since their owners rotate them.
 */
export function usageRoutes(backend: OpenCodeBackend) {
  const app = new Hono();
  app.get('/limits', async (c) => {
    if (!(await backend.localService()))
      throw new GatewayError(
        'Plan limits require the locally discovered OpenCode service. External connections are not supported.',
        422,
      );
    const signal = AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(20_000)]);
    const [openai, go] = await Promise.all(
      ['openai', 'opencode-go'].map((integrationID) =>
        backend
          .request(signal, (client, options) => client.integration.get({ integrationID }, options))
          .then((result) => result.data.connections[0])
          .catch(() => undefined),
      ),
    );
    const providers = await Promise.all([
      codex(openai, signal),
      claude(signal),
      opencodeGo(go, signal),
    ]);
    return c.json({
      providers: providers.filter((provider) => provider !== undefined),
    } satisfies UsageLimits);
  });
  return app;
}

async function codex(connection: ConnectionInfo | undefined, signal: AbortSignal) {
  // API keys have no ChatGPT plan windows.
  if (connection?.type !== 'credential' || connection.method !== 'oauth') return;
  return provider('codex', 'Codex', async () => {
    const credential = await storedCredential(connection.id);
    if (credential?.type !== 'oauth')
      throw new UsageError('OpenCode’s ChatGPT sign-in was not found.');
    if (credential.expires && credential.expires < Date.now())
      throw new UsageError(
        'OpenCode refreshes this ChatGPT sign-in the next time you use an OpenAI model.',
      );
    const account =
      text(credential.metadata?.accountID) ??
      text(
        record(jwtClaims(credential.access)?.['https://api.openai.com/auth'])?.chatgpt_account_id,
      );
    const body = await upstream(
      {
        name: 'ChatGPT',
        url: 'https://chatgpt.com/backend-api/wham/usage',
        headers: {
          Authorization: `Bearer ${credential.access}`,
          ...(account ? { 'ChatGPT-Account-Id': account } : {}),
        },
        signIn: 'Sign in to OpenAI again in OpenCode.',
      },
      signal,
    );
    const windows = codexWindows('codex', '', body.rate_limit);
    for (const [index, extra] of array(body.additional_rate_limits).entries()) {
      const limit = record(extra);
      const name = text(limit?.limit_name) ?? text(limit?.metered_feature);
      windows.push(...codexWindows(`extra-${index}`, name ? `${name} · ` : '', limit?.rate_limit));
    }
    return windows;
  });
}

function codexWindows(id: string, prefix: string, value: unknown): UsageWindow[] {
  const limit = record(value);
  return (['primary', 'secondary'] as const).flatMap((key) => {
    const window = record(limit?.[`${key}_window`]);
    const used = number(window?.used_percent);
    if (!window || used === undefined) return [];
    const seconds = number(window.limit_window_seconds);
    const reset = number(window.reset_at);
    return [
      {
        id: `${id}-${key}`,
        label: prefix + windowLabel(seconds ? seconds * 1000 : undefined),
        usedPercent: percent(used),
        resetsAt: reset ? reset * 1000 : undefined,
        durationMs: seconds ? seconds * 1000 : undefined,
        limited: limit?.limit_reached === true || used >= 100,
      },
    ];
  });
}

async function claude(signal: AbortSignal) {
  const credential = await claudeCredential();
  if (!credential) return;
  return provider('claude', 'Claude', async () => {
    if (credential.expiresAt && credential.expiresAt < Date.now())
      throw new UsageError('Claude Code refreshes its sign-in the next time it runs.');
    const body = await upstream(
      {
        name: 'Claude',
        url: 'https://api.anthropic.com/api/oauth/usage',
        headers: {
          Authorization: `Bearer ${credential.accessToken}`,
          'anthropic-beta': 'oauth-2025-04-20',
        },
        signIn: 'Run claude auth login to sign in again.',
      },
      signal,
    );
    return [
      ['five_hour', 'Session', 5 * HOUR],
      ['seven_day', 'Weekly', 7 * DAY],
      ['seven_day_opus', 'Weekly · Opus', 7 * DAY],
      ['seven_day_sonnet', 'Weekly · Sonnet', 7 * DAY],
    ].flatMap(([key, label, duration]) => {
      const window = record(body[key as string]);
      const used = number(window?.utilization);
      if (used === undefined) return [];
      return [
        {
          id: key as string,
          label: label as string,
          usedPercent: percent(used),
          resetsAt: time(window?.resets_at),
          durationMs: duration as number,
          limited: used >= 100,
        },
      ];
    });
  });
}

async function opencodeGo(connection: ConnectionInfo | undefined, signal: AbortSignal) {
  if (!connection) return;
  return provider('opencode-go', 'OpenCode Go', async () => {
    const credential =
      connection.type === 'env'
        ? process.env[connection.name] && {
            type: 'key' as const,
            key: process.env[connection.name]!,
          }
        : await storedCredential(connection.id);
    if (!credential || credential.type !== 'key')
      throw new UsageError('OpenCode’s Go API key was not found.');
    const body = await upstream(
      {
        name: 'OpenCode Go',
        url: 'https://opencode.ai/zen/go/v1/usage',
        headers: { Authorization: `Bearer ${credential.key}` },
        signIn: 'Update your OpenCode Go API key in OpenCode.',
      },
      signal,
    );
    const usage = record(body.usage);
    return [
      ['rolling', 'Session'],
      ['weekly', 'Weekly'],
      ['monthly', 'Monthly'],
    ].flatMap(([key, label]) => {
      const window = record(usage?.[key!]);
      const used = number(window?.percent);
      if (used === undefined) return [];
      const resetsAt = time(window?.resetsAt);
      return [
        {
          id: key!,
          label: label!,
          usedPercent: percent(used),
          resetsAt,
          durationMs: key === 'rolling' ? 5 * HOUR : key === 'weekly' ? 7 * DAY : month(resetsAt),
          limited: window?.status === 'rate-limited',
        },
      ];
    });
  });
}

async function provider(
  id: UsageProvider['id'],
  name: string,
  read: () => Promise<UsageWindow[]>,
): Promise<UsageProvider> {
  try {
    return { id, name, windows: await read() };
  } catch (error) {
    return {
      id,
      name,
      windows: [],
      error: error instanceof UsageError ? error.message : `Could not load ${name} limits.`,
    };
  }
}

async function upstream(target: Upstream, signal: AbortSignal) {
  let response: Response;
  try {
    response = await fetch(target.url, {
      headers: { Accept: 'application/json', 'User-Agent': 'OpenCodex', ...target.headers },
      signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      redirect: 'error',
    });
  } catch {
    throw new UsageError(`Could not reach ${target.name}. Check your connection and retry.`);
  }
  if (response.status === 401 || response.status === 403)
    throw new UsageError(`${target.name} rejected the sign-in. ${target.signIn}`);
  if (response.status === 429)
    throw new UsageError(`${target.name} is rate limiting usage checks. Retry shortly.`);
  if (!response.ok) throw new UsageError(`${target.name} returned an error (${response.status}).`);
  const body = await response.text();
  const parsed = body.length <= MAX_BODY ? record(safeJSON(body)) : undefined;
  if (!parsed) throw new UsageError(`${target.name} returned an unexpected response.`);
  return parsed;
}

/** Reads one credential by the ID OpenCode reports as active, from OpenCode's local database. */
async function storedCredential(id: string): Promise<StoredCredential | undefined> {
  const { DatabaseSync } = await import('node:sqlite').catch(() => {
    throw new UsageError('Reading OpenCode credentials requires Node.js 22.13 or newer.');
  });
  for (const path of await databases()) {
    let database: InstanceType<typeof DatabaseSync> | undefined;
    try {
      database = new DatabaseSync(path, { readOnly: true, timeout: 2_000 });
      const row = database.prepare('SELECT value FROM credential WHERE id = ?').get(id);
      if (typeof row?.value !== 'string') continue;
      const value = record(safeJSON(row.value));
      if (value?.type === 'oauth' && typeof value.access === 'string')
        return {
          type: 'oauth',
          access: value.access,
          expires: number(value.expires),
          metadata: record(value.metadata),
        };
      if (value?.type === 'key' && typeof value.key === 'string')
        return { type: 'key', key: value.key };
      return undefined;
    } catch {
      // Older databases lack the table; a locked or unreadable one falls through to the next.
    } finally {
      database?.close();
    }
  }
  return undefined;
}

/** OpenCode names its database per release channel; try the most recently written first. */
async function databases() {
  const directory = join(
    process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'),
    'opencode',
  );
  const override = process.env.OPENCODE_DB;
  if (override && override !== ':memory:')
    return [isAbsolute(override) ? override : join(directory, override)];
  const names = await readdir(directory).catch(() => []);
  const candidates = await Promise.all(
    names
      .filter((name) => /^opencode(-[a-zA-Z0-9._-]+)?\.db$/.test(name))
      .map(async (name) => {
        const path = join(directory, name);
        const times = await Promise.all(
          [path, `${path}-wal`].map((file) =>
            stat(file).then(
              (info) => info.mtimeMs,
              () => 0,
            ),
          ),
        );
        return { path, modified: Math.max(...times) };
      }),
  );
  return candidates.sort((a, b) => b.modified - a.modified).map(({ path }) => path);
}

/** Claude Code keeps its sign-in in the macOS Keychain, else in its config directory. */
async function claudeCredential() {
  const directory = process.env.CLAUDE_CONFIG_DIR;
  let raw: string | undefined;
  if (process.platform === 'darwin') {
    const service = directory
      ? `Claude Code-credentials-${createHash('sha256').update(directory).digest('hex').slice(0, 8)}`
      : 'Claude Code-credentials';
    raw = await promisify(execFile)(
      '/usr/bin/security',
      ['find-generic-password', '-s', service, '-w'],
      {
        timeout: 10_000,
        maxBuffer: MAX_BODY,
      },
    ).then(
      (result) => result.stdout,
      () => undefined,
    );
  }
  raw ??= await readFile(join(directory || join(homedir(), '.claude'), '.credentials.json'), 'utf8')
    .then((text) => (text.length <= MAX_BODY ? text : undefined))
    .catch(() => undefined);
  const oauth = record(record(safeJSON(raw ?? ''))?.claudeAiOauth);
  const accessToken = text(oauth?.accessToken);
  return accessToken ? { accessToken, expiresAt: number(oauth?.expiresAt) } : undefined;
}

function windowLabel(duration: number | undefined) {
  if (!duration) return 'Limit';
  const hours = Math.round(duration / HOUR);
  if (hours <= 5) return 'Session';
  if (hours === 24) return 'Daily';
  if (hours === 7 * 24) return 'Weekly';
  if (hours >= 28 * 24 && hours <= 31 * 24) return 'Monthly';
  return hours < 48 ? `${hours}-hour` : `${Math.round(hours / 24)}-day`;
}

/** A monthly plan resets on its subscription day, so the window is the preceding calendar month. */
function month(resetsAt: number | undefined) {
  if (!resetsAt) return undefined;
  const start = new Date(resetsAt);
  start.setUTCMonth(start.getUTCMonth() - 1);
  return resetsAt - start.getTime();
}

function jwtClaims(token: string) {
  return record(safeJSON(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')));
}

function safeJSON(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown) {
  return typeof value === 'string' && value ? value : undefined;
}

function number(value: unknown) {
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : undefined;
}

function percent(value: number) {
  return Math.min(100, Math.max(0, value));
}

function time(value: unknown) {
  const parsed = typeof value === 'string' ? Date.parse(value) : number(value);
  return parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined;
}
