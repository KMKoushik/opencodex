import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, link, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import type { Duplex } from 'node:stream';
import { promisify } from 'node:util';
import { getRequestListener, type HttpBindings } from '@hono/node-server';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import {
  REMOTE_DEFAULT_PORT,
  remoteConfigSchema,
  remotePairSchema,
  remoteTunnelSchema,
  type RemoteConfig,
  type RemotePairCode,
  type RemoteStatus,
} from '@opencodex/contracts/remote';
import { GatewayError } from './errors';

const COOKIE = '__Host-opencodex';
const COOKIE_AGE = 365 * 24 * 60 * 60;
// 32 symbols without 0/O or 1/I, so a code read off the screen types back unambiguously.
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LENGTH = 10;
const CODE_TTL = 5 * 60_000;
// Wrong guesses across all codes before every pending code is dropped: 20 tries at 50 bits.
const MAX_FAILURES = 20;
const SEEN_INTERVAL = 10 * 60_000;

const deviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  hash: z.string(),
  created: z.number(),
  seen: z.number().nullable(),
});
const storedSchema = z.object({
  enabled: z.boolean(),
  hostname: z.string().nullable(),
  port: z.number().int(),
  tunnel: remoteTunnelSchema,
  token: z.string().nullable(),
  devices: z.array(deviceSchema),
});
type Device = z.infer<typeof deviceSchema>;
type Stored = Omit<z.infer<typeof storedSchema>, 'devices'>;

/** Set on every request that arrived through the remote listener. */
export type RemoteRequest = { origin: string; device: Device | null };
type Admit = (request: IncomingMessage, socket: Duplex, url: URL) => number | undefined;

export function remoteRequest(c: Context): RemoteRequest | undefined {
  return (c.env as { remote?: RemoteRequest } | undefined)?.remote;
}

/** The app shell and the canvas runtime are public; everything else needs a paired device. */
export function remoteDenial(c: Context, remote: RemoteRequest) {
  const path = c.req.path;
  const api = /^\/api(\/|$)/.test(path);
  if (['GET', 'HEAD'].includes(c.req.method) && (!api || path.startsWith('/api/canvas-runtime/')))
    return;
  const origin = c.req.header('origin');
  const site = c.req.header('sec-fetch-site');
  if ((origin && origin !== remote.origin) || site === 'cross-site' || site === 'same-site')
    return c.json({ message: 'Cross-origin requests are not allowed.' }, 403);
  if (!remote.device && path !== '/api/remote/pair' && path !== '/api/remote/session')
    return c.json({ message: 'Pair this device to use OpenCodex.' }, 401);
}

function hash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function cookie(header: string | undefined) {
  for (const part of header?.split(';') ?? []) {
    const [name, ...value] = part.trim().split('=');
    if (name === COOKIE) return value.join('=');
  }
}

function deviceName(agent: string) {
  const system = /iPhone/.test(agent)
    ? 'iPhone'
    : /iPad/.test(agent)
      ? 'iPad'
      : /Android/.test(agent)
        ? 'Android'
        : /Macintosh/.test(agent)
          ? 'Mac'
          : /Windows/.test(agent)
            ? 'Windows'
            : /Linux/.test(agent)
              ? 'Linux'
              : 'Device';
  const browser = /Edg\//.test(agent)
    ? 'Edge'
    : /Firefox\/|FxiOS/.test(agent)
      ? 'Firefox'
      : /Chrome\/|CriOS/.test(agent)
        ? 'Chrome'
        : /Safari\//.test(agent)
          ? 'Safari'
          : undefined;
  return browser ? `${system} · ${browser}` : system;
}

function checkToken(token: string) {
  try {
    const value = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    if (
      typeof value?.a === 'string' &&
      typeof value?.t === 'string' &&
      typeof value?.s === 'string'
    )
      return;
  } catch {
    // Reported below.
  }
  throw new GatewayError(
    'That isn’t a Cloudflare tunnel token. Copy it from the tunnel’s install command, or run cloudflared tunnel token <name>.',
    400,
  );
}

async function findCloudflared() {
  const name = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  const directories = [
    ...(process.env.PATH ?? '').split(delimiter),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ];
  for (const directory of directories) {
    if (!directory) continue;
    const path = join(directory, name);
    if (
      await access(path, constants.X_OK).then(
        () => true,
        () => false,
      )
    )
      return path;
  }
}

const CONNECTOR_ARGS = ['tunnel', '--no-autoupdate', '--grace-period', '1s', 'run', '--url'];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function running(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function signal(pid: number, name: NodeJS.Signals) {
  try {
    process.kill(pid, name);
  } catch {
    // It already exited.
  }
}

/** Start time of a process running this gateway's connector command, else NaN. */
async function connectorStartedAt(pid: number) {
  const output = await promisify(execFile)(
    'ps',
    ['-p', String(pid), '-o', 'lstart=', '-o', 'command='],
    {
      env: { ...process.env, LC_ALL: 'C' },
    },
  ).then(
    (result) => result.stdout.trim(),
    () => '',
  );
  // lstart is a fixed 24 characters: `Tue Oct 20 20:54:32 2026`.
  const command = output.slice(24);
  if (!/cloudflared\S* /.test(command) || !command.includes(CONNECTOR_ARGS.join(' '))) return NaN;
  return Date.parse(output.slice(0, 24));
}

/** Runs one cloudflared connector for a tunnel token and restarts it when it exits. */
class Connector {
  state: RemoteStatus['connector']['state'] = 'off';
  message?: string;
  private connections = new Set<string>();
  private child?: ChildProcess;
  private target?: { token: string; port: number };
  private timer?: ReturnType<typeof setTimeout>;
  private delay = 2_000;
  // Writes and removals of the pid file, in order; shutdown waits for them before releasing the lock.
  private files = Promise.resolve();

  constructor(private readonly pidFile: string) {}

  status(): RemoteStatus['connector'] {
    return { state: this.state, connections: this.connections.size, message: this.message };
  }

  async set(target: { token: string; port: number } | undefined) {
    if (target?.token === this.target?.token && target?.port === this.target?.port) return;
    await this.stop();
    this.target = target;
    if (target) await this.launch(target);
  }

  async stop() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.target = undefined;
    this.delay = 2_000;
    this.state = 'off';
    this.message = undefined;
    this.connections.clear();
    const child = this.child;
    this.child = undefined;
    if (!child) return this.files;
    if (child.pid !== undefined && child.exitCode === null && child.signalCode === null) {
      await new Promise<void>((resolve) => {
        const kill = setTimeout(() => child.kill('SIGKILL'), 3_000);
        child.once('exit', () => {
          clearTimeout(kill);
          resolve();
        });
        child.kill('SIGTERM');
      });
    }
    await this.removePidFile();
  }

  private pidFileTask(task: () => Promise<unknown>) {
    this.files = this.files.then(task).then(
      () => undefined,
      () => undefined,
    );
    return this.files;
  }

  private removePidFile() {
    return this.pidFileTask(() => rm(this.pidFile, { force: true }));
  }

  /**
   * A gateway that crashed leaves its connector running. Only the owner of remote access calls
   * this, so a connector recorded here with this gateway's arguments has no other live owner.
   */
  async reapOrphan() {
    const [pid, started] = (await readFile(this.pidFile, 'utf8').catch(() => ''))
      .split(' ')
      .map(Number);
    // A recycled pid belongs to another process: check identity before every signal.
    const orphan = async () =>
      process.platform !== 'win32' &&
      Number.isSafeInteger(pid) &&
      pid! > 0 &&
      Number.isFinite(started) &&
      (await connectorStartedAt(pid!)) === started;
    if (await orphan()) {
      signal(pid!, 'SIGTERM');
      for (let wait = 0; wait < 30 && running(pid!); wait++) await sleep(100);
      if (await orphan()) signal(pid!, 'SIGKILL');
    }
    await this.removePidFile();
  }

  private async launch(target: { token: string; port: number }) {
    await this.files;
    const binary = await findCloudflared();
    if (this.target !== target) return;
    if (!binary) {
      this.state = 'missing';
      this.message = 'Install cloudflared, for example with brew install cloudflared.';
      this.retry(target);
      return;
    }
    this.state = 'starting';
    this.message = undefined;
    this.connections.clear();
    // The token travels in the environment, not argv, so other users can't read it from ps.
    const child = spawn(binary, [...CONNECTOR_ARGS, `http://127.0.0.1:${target.port}`], {
      env: { ...process.env, TUNNEL_TOKEN: target.token },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    this.child = child;
    const pid = child.pid;
    if (pid)
      void this.pidFileTask(async () => {
        const started = await connectorStartedAt(pid);
        if (Number.isFinite(started))
          await writeFile(this.pidFile, `${pid} ${started}`, { mode: 0o600 });
      });
    child.stderr?.on('error', () => undefined);
    if (child.stderr) createInterface({ input: child.stderr }).on('line', (line) => this.log(line));
    let finished = false;
    const finish = (message: string) => {
      if (finished || this.child !== child) return;
      finished = true;
      this.child = undefined;
      this.connections.clear();
      void this.removePidFile();
      this.state = 'failed';
      this.message ??= message;
      this.retry(target);
    };
    child.once('error', (error) => {
      this.message = error.message;
      // Spawn failures emit no exit event.
      if (child.pid === undefined) finish(error.message);
    });
    child.once('exit', (code, signal) =>
      finish(`cloudflared stopped (${signal ?? `exit code ${code}`}).`),
    );
  }

  private log(line: string) {
    const index = /connIndex=(\d+)/.exec(line)?.[1];
    if (index && line.includes('Registered tunnel connection')) {
      this.connections.add(index);
      this.state = 'connected';
      this.message = undefined;
      this.delay = 2_000;
      return;
    }
    const error = / (?:ERR|FTL) (.*)$/.exec(line)?.[1];
    if (index && (error || /Unregistered tunnel connection|Connection terminated/.test(line)))
      this.connections.delete(index);
    if (error) this.message = error.replace(/\s(?:event|ip|connIndex)=\S+/g, '').slice(0, 300);
    if (!this.connections.size && this.state === 'connected') this.state = 'starting';
  }

  private retry(target: { token: string; port: number }) {
    if (this.target !== target || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (this.target === target) void this.launch(target);
    }, this.delay);
    this.delay = Math.min(this.delay * 2, 60_000);
  }
}

/** Process start time, to tell a live lock holder from a recycled pid. */
async function startedAt(pid: number) {
  const output = await promisify(execFile)('ps', ['-p', String(pid), '-o', 'lstart='], {
    env: { ...process.env, LC_ALL: 'C' },
  }).then(
    (result) => result.stdout.trim(),
    () => '',
  );
  return Date.parse(output);
}

/** The pid of the live process that wrote a lock record, if it is still running. */
async function holder(record: string) {
  const [pid, started] = record.split(' ').map(Number);
  if (!pid || !Number.isSafeInteger(pid) || !running(pid)) return undefined;
  if (process.platform === 'win32' || pid === process.pid) return pid;
  const actual = await startedAt(pid);
  return Number.isNaN(actual) || !started || Math.abs(actual - started) < 5_000 ? pid : undefined;
}

/**
 * One gateway at a time owns remote access: its settings file, devices, listener, and
 * connector. Others would otherwise save stale device lists over each other.
 */
class OwnerLock {
  private readonly id = `${process.pid} ${Math.round(Date.now() - process.uptime() * 1000)} ${randomUUID()}`;

  constructor(private readonly file: string) {}

  /** Takes the lock, or returns the pid of the live process that holds it. */
  async acquire(): Promise<number | undefined> {
    await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
    const nonce = randomUUID();
    for (let attempt = 0; attempt < 5; attempt++) {
      // link() publishes a complete file or fails; another gateway never reads a partial lock.
      const temp = `${this.file}.${nonce}.tmp`;
      await writeFile(temp, this.id, { mode: 0o600 });
      const created = await link(temp, this.file).then(
        () => true,
        (error: NodeJS.ErrnoException) => {
          if (error.code === 'EEXIST') return false;
          throw error;
        },
      );
      await rm(temp, { force: true });
      if (created) return;
      const held = await readFile(this.file, 'utf8').catch(() => '');
      if (!held) continue;
      if (held === this.id) return;
      const pid = await holder(held);
      if (pid !== undefined) return pid;
      // Takeover tickets, numbered per stale record: a gateway may replace that record only while
      // it holds the lowest ticket whose earlier holders have all exited. A process that exited
      // can't resume, so two gateways never both swap in a lock. rename() replaces it in place.
      const prefix = `${this.file}.${createHash('sha256').update(held).digest('hex').slice(0, 16)}`;
      let ticket: string | undefined;
      let waiting = false;
      // Each dead ticket costs one link; a crash leaves at most one, so this stays short.
      for (let n = 0; !ticket && !waiting; n++) {
        const name = `${prefix}.${n}.takeover`;
        await writeFile(temp, this.id, { mode: 0o600 });
        if (
          await link(temp, name).then(
            () => true,
            (error: NodeJS.ErrnoException) => {
              if (error.code === 'EEXIST') return false;
              throw error;
            },
          )
        )
          ticket = name;
        else waiting = (await holder(await readFile(name, 'utf8').catch(() => ''))) !== undefined;
      }
      await rm(temp, { force: true });
      if (!ticket) {
        await sleep(200);
        continue;
      }
      try {
        if ((await readFile(this.file, 'utf8').catch(() => '')) !== held) continue;
        await writeFile(temp, this.id, { mode: 0o600 });
        await rename(temp, this.file);
        return;
      } finally {
        await rm(temp, { force: true });
        const last = Number(ticket.slice(prefix.length + 1, -'.takeover'.length));
        for (let n = 0; n <= last; n++) await rm(`${prefix}.${n}.takeover`, { force: true });
      }
    }
    throw new GatewayError('Remote access couldn’t be claimed. Try again.', 409);
  }

  /** Whether this gateway still holds the lock. */
  async held() {
    return (await readFile(this.file, 'utf8').catch(() => '')) === this.id;
  }

  async release() {
    if (await this.held()) await rm(this.file, { force: true });
  }
}

/**
 * Remote access: a second listener that only paired devices can use, reached through a
 * Cloudflare tunnel. The desktop window keeps the loopback listener, which has no pairing.
 */
export class RemoteAccess {
  private config: Stored = {
    enabled: false,
    hostname: null,
    port: REMOTE_DEFAULT_PORT,
    tunnel: 'token',
    token: null,
  };
  private devices = new Map<string, Device>();
  private codes = new Map<string, number>();
  private failures = 0;
  private sockets = new Map<string, Set<Duplex>>();
  private seenSaved = new Map<string, number>();
  private context = new WeakMap<IncomingMessage, RemoteRequest>();
  private server?: Server;
  private port?: number;
  private closeTerminals?: () => void;
  private listener: RemoteStatus['listener'] = { state: 'off' };
  private connector: Connector;
  private handler?: (request: IncomingMessage, response: ServerResponse) => void;
  private attach?: (server: Server, admit: Admit) => () => void;
  private writes = Promise.resolve();
  private queue: Promise<unknown> = Promise.resolve();
  private owner = false;
  private holder?: number;
  private closed = false;
  private readonly lock: OwnerLock;
  private readonly file: string;
  private readonly served: boolean;

  constructor(options: { file?: string; served: boolean }) {
    this.file = options.file ?? join(homedir(), '.opencodex', 'remote.json');
    this.served = options.served;
    this.connector = new Connector(join(dirname(this.file), 'remote-cloudflared.pid'));
    this.lock = new OwnerLock(join(dirname(this.file), 'remote.lock'));
  }

  /** Requests and WebSocket upgrades on the remote listener go to the same app as loopback. */
  serve(
    fetch: (request: Request, env: HttpBindings & { remote?: RemoteRequest }) => unknown,
    attach: (server: Server, admit: Admit) => () => void,
  ) {
    this.handler = getRequestListener((request, env) =>
      fetch(request, {
        ...(env as HttpBindings),
        remote: this.context.get(env.incoming as IncomingMessage),
      }),
    );
    this.attach = attach;
  }

  start() {
    return this.run(() => this.claim());
  }

  /** Takes over remote access if the gateway that owned it has quit. */
  async refresh() {
    if (!this.owner) await this.start().catch(() => undefined);
  }

  async close() {
    // Settings changes that arrive from now on are refused; the ones already queued finish first.
    this.closed = true;
    await this.queue.catch(() => undefined);
    await this.connector.stop();
    await this.stopListener();
    await this.writes.catch(() => undefined);
    if (this.owner) await this.lock.release();
  }

  /** Serializes settings changes with startup and shutdown. */
  private run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue
      .catch(() => undefined)
      .then(() => {
        if (this.closed) throw new GatewayError('OpenCodex is shutting down.', 503);
        return task();
      });
    this.queue = result;
    return result;
  }

  private async claim() {
    if (this.owner) return true;
    this.holder = await this.lock.acquire();
    if (this.holder !== undefined) {
      // Show the owner's settings, but never save or serve them from here.
      await this.load();
      this.listener = { state: 'failed', message: this.notOwner() };
      return false;
    }
    this.owner = true;
    if (await this.load()) {
      await this.connector.reapOrphan();
      await this.apply();
    }
    return true;
  }

  private notOwner() {
    return `Another OpenCodex (process ${this.holder}) is serving remote access. Quit it to manage remote access here.`;
  }

  private async owned() {
    if (!(await this.claim())) throw new GatewayError(this.notOwner(), 409);
  }

  private async load() {
    const raw = await readFile(this.file, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (raw === undefined) return true;
    try {
      const { devices, ...config } = storedSchema.parse(JSON.parse(raw));
      this.config = config;
      this.devices = new Map(devices.map((device) => [device.hash, device]));
      return true;
    } catch {
      this.listener = { state: 'failed', message: `${this.file} couldn’t be read.` };
      return false;
    }
  }

  status(): RemoteStatus {
    const { token, ...config } = this.config;
    return {
      ...config,
      tokenSet: Boolean(token),
      served: this.served,
      listener: this.listener,
      connector: this.connector.status(),
      devices: [...this.devices.values()]
        .sort((a, b) => b.created - a.created)
        .map(({ id, name, created, seen }) => ({ id, name, created, seen })),
    };
  }

  configure(input: RemoteConfig) {
    return this.run(async () => {
      await this.owned();
      return this.update(input);
    });
  }

  private async update(input: RemoteConfig) {
    const token = input.token || this.config.token;
    if (input.token) checkToken(input.token);
    if (input.enabled && !input.hostname)
      throw new GatewayError('Enter the hostname your tunnel serves.', 400);
    if (input.enabled && input.tunnel === 'token' && !token)
      throw new GatewayError('Paste the tunnel token, or choose to run cloudflared yourself.', 400);
    this.config = {
      enabled: input.enabled,
      hostname: input.hostname,
      port: input.port,
      tunnel: input.tunnel,
      token,
    };
    await this.save();
    await this.apply();
    return this.status();
  }

  async createCode(): Promise<RemotePairCode> {
    await this.run(() => this.owned());
    const hostname = this.config.hostname;
    if (!this.config.enabled || !hostname)
      throw new GatewayError('Turn on remote access before adding a device.', 409);
    const now = Date.now();
    for (const [code, expires] of this.codes) if (expires <= now) this.codes.delete(code);
    if (this.codes.size >= 5) this.codes.delete(this.codes.keys().next().value!);
    const code = [...randomBytes(CODE_LENGTH)].map((byte) => CODE_ALPHABET[byte & 31]).join('');
    this.codes.set(code, now + CODE_TTL);
    return {
      code: `${code.slice(0, 5)}-${code.slice(5)}`,
      url: `https://${hostname}/#pair=${code}`,
      expires: now + CODE_TTL,
    };
  }

  /** Spends a pairing code and returns the new device's cookie token. */
  async pair(input: string, agent: string) {
    const code = input.toUpperCase().replace(/[^0-9A-Z]/g, '');
    const expires = this.codes.get(code);
    if (!expires || expires <= Date.now()) {
      if (++this.failures >= MAX_FAILURES) {
        this.codes.clear();
        this.failures = 0;
      }
      return;
    }
    this.codes.delete(code);
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    const device = {
      id: randomUUID(),
      name: deviceName(agent),
      hash: hash(token),
      created: now,
      seen: now,
    };
    this.devices.set(device.hash, device);
    this.seenSaved.set(device.id, now);
    await this.save();
    return token;
  }

  async revoke(id: string) {
    await this.run(() => this.owned());
    const device = [...this.devices.values()].find((item) => item.id === id);
    if (!device) throw new GatewayError('That device is no longer paired.', 404);
    this.devices.delete(device.hash);
    await this.save();
    // Close its live event streams and terminals now, not on their next request.
    for (const socket of this.sockets.get(id) ?? []) socket.destroy();
    this.sockets.delete(id);
  }

  admitUpgrade: Admit = (request, socket) => {
    const hostname = this.config.hostname;
    if (!hostname || request.headers.host?.toLowerCase() !== hostname) return 421;
    const site = request.headers['sec-fetch-site'];
    if (
      request.headers.origin !== `https://${hostname}` ||
      site === 'cross-site' ||
      site === 'same-site'
    )
      return 403;
    const device = this.device(request.headers.cookie);
    if (!device) return 401;
    this.track(device, socket, socket);
  };

  private onRequest = (request: IncomingMessage, response: ServerResponse) => {
    const hostname = this.config.hostname;
    if (!hostname || request.headers.host?.toLowerCase() !== hostname) {
      response.writeHead(421, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ message: 'This hostname isn’t set up for remote access.' }));
      return;
    }
    if (!request.url?.startsWith('/')) {
      response.writeHead(400).end();
      return;
    }
    // Cloudflare terminates TLS; the app should see the address the device used.
    request.url = `https://${hostname}${request.url}`;
    const device = this.device(request.headers.cookie);
    if (device) this.track(device, request.socket, response);
    this.context.set(request, { origin: `https://${hostname}`, device });
    this.handler!(request, response);
  };

  private device(header: string | undefined) {
    const token = cookie(header);
    const device = token ? this.devices.get(hash(token)) : undefined;
    if (!device) return null;
    const now = Date.now();
    device.seen = now;
    if (now - (this.seenSaved.get(device.id) ?? 0) > SEEN_INTERVAL) {
      this.seenSaved.set(device.id, now);
      void this.save().catch(() => undefined);
    }
    return device;
  }

  private track(
    device: Device,
    socket: Duplex,
    done: { once(event: 'close', listener: () => void): unknown },
  ) {
    let sockets = this.sockets.get(device.id);
    if (!sockets) this.sockets.set(device.id, (sockets = new Set()));
    sockets.add(socket);
    done.once('close', () => sockets.delete(socket));
  }

  private async apply() {
    const { enabled, hostname, port, tunnel, token } = this.config;
    const wanted = enabled && hostname ? port : undefined;
    if (this.server && this.port !== wanted) await this.stopListener();
    if (wanted === undefined) this.listener = { state: 'off' };
    else if (!this.server) await this.startListener(wanted);
    await this.connector.set(
      this.server && tunnel === 'token' && token ? { token, port: this.port! } : undefined,
    );
  }

  private async startListener(port: number) {
    const server = createServer(this.onRequest);
    const closeTerminals = this.attach!(server, this.admitUpgrade);
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
          server.off('error', reject);
          resolve();
        });
      });
    } catch (error) {
      closeTerminals();
      this.listener = {
        state: 'failed',
        message:
          (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
            ? `Port ${port} is in use. Another OpenCodex may already be serving remote access.`
            : (error as Error).message,
      };
      return;
    }
    this.server = server;
    this.port = port;
    this.closeTerminals = closeTerminals;
    this.listener = { state: 'listening' };
  }

  private async stopListener() {
    const server = this.server;
    this.listener = { state: 'off' };
    if (!server) return;
    this.server = undefined;
    this.port = undefined;
    this.closeTerminals?.();
    this.closeTerminals = undefined;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
    this.sockets.clear();
  }

  private save() {
    if (!this.owner) return Promise.reject(new GatewayError(this.notOwner(), 409));
    const data = `${JSON.stringify({ ...this.config, devices: [...this.devices.values()] }, null, 2)}\n`;
    this.writes = this.writes
      .catch(() => undefined)
      .then(async () => {
        // Never write over a newer owner's devices, even after losing the lock unexpectedly.
        if (!(await this.lock.held())) {
          this.owner = false;
          throw new GatewayError('Remote access is now managed by another OpenCodex.', 409);
        }
        await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
        const temp = `${this.file}.${process.pid}.tmp`;
        // Holds the tunnel token and device hashes.
        await writeFile(temp, data, { mode: 0o600 });
        await rename(temp, this.file);
      });
    return this.writes;
  }
}

export function remoteRoutes(remote: RemoteAccess) {
  const app = new Hono();
  const tooLarge = (c: Context) => c.json({ message: 'This request is too large.' }, 413);
  const local: MiddlewareHandler = async (c, next) => {
    if (remoteRequest(c))
      return c.json({ message: 'Manage remote access on the computer running OpenCodex.' }, 403);
    await next();
  };
  app.get('/session', (c) => {
    const request = remoteRequest(c);
    return c.json({ remote: Boolean(request), paired: !request || Boolean(request.device) });
  });
  app.use('/pair', bodyLimit({ maxSize: 1024, onError: tooLarge }));
  app.post('/pair', async (c) => {
    if (!remoteRequest(c))
      return c.json({ message: 'Open the pairing link on the device you’re adding.' }, 400);
    const input = remotePairSchema.safeParse(await c.req.json().catch(() => null));
    const token = input.success
      ? await remote.pair(input.data.code, c.req.header('user-agent') ?? '')
      : undefined;
    if (!token)
      return c.json(
        { message: 'That code is wrong or has expired. Make a new one on your computer.' },
        400,
      );
    c.header(
      'Set-Cookie',
      `${COOKIE}=${token}; Path=/; Max-Age=${COOKIE_AGE}; Secure; HttpOnly; SameSite=Strict`,
    );
    return c.json({ ok: true });
  });
  app.get('/', local, async (c) => {
    await remote.refresh();
    return c.json(remote.status());
  });
  app.use('/', bodyLimit({ maxSize: 16 * 1024, onError: tooLarge }));
  app.put('/', local, async (c) => {
    const input = remoteConfigSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json({ message: input.error.issues[0]?.message ?? 'Check the settings.' }, 400);
    return c.json(await remote.configure(input.data));
  });
  app.post('/codes', local, async (c) => c.json(await remote.createCode()));
  app.delete('/devices/:id', local, async (c) => {
    await remote.revoke(c.req.param('id'));
    return c.json({ ok: true });
  });
  return app;
}
