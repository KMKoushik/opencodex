import { OpenCode, type OpenCodeClient } from '@opencode/client';
import { Service, type Endpoint } from '@opencode/client/service';
import type { Connection, SessionPage } from '@opencodex/contracts';
import { sessionSummary, sideChatParent } from '@opencodex/contracts';
import { GatewayError } from './errors';
import { previewFetch } from './preview-fetch';

type ResolveEndpoint = (start: boolean) => Promise<Endpoint | undefined>;

export function localEndpointResolver(external?: Endpoint): ResolveEndpoint {
  return async (start) => {
    if (external) return external;
    const options = { version: (version: string) => version.startsWith('2.') };
    return start ? Service.ensure(options) : Service.discover(options);
  };
}

export class OpenCodeBackend {
  private endpoint?: Endpoint;
  private client?: OpenCodeClient;
  private resolving?: Promise<OpenCodeClient | undefined>;

  constructor(
    private readonly resolveEndpoint: ResolveEndpoint = localEndpointResolver(),
    private readonly localFiles = true,
  ) {}

  private async resolve(start = false): Promise<OpenCodeClient | undefined> {
    if (this.client) return this.client;
    if (this.resolving) {
      const client = await this.resolving;
      if (client || !start) return client;
      return this.resolve(true);
    }
    this.resolving = this.resolveEndpoint(start).then((endpoint) => {
      this.endpoint = endpoint;
      this.client = endpoint
        ? OpenCode.make({
            baseUrl: endpoint.url,
            headers: Service.headers(endpoint),
            fetch: previewFetch,
          })
        : undefined;
      return this.client;
    });
    try {
      return await this.resolving;
    } finally {
      this.resolving = undefined;
    }
  }

  async connection(start = false): Promise<Connection> {
    try {
      const client = await this.resolve(start);
      if (!client) {
        return {
          status: 'disconnected',
          message: 'Connect to start or reuse your local OpenCode service.',
        };
      }
      const info = await client.server.info({ signal: AbortSignal.timeout(5_000) });
      if (!info.version.startsWith('2.')) {
        this.client = undefined;
        return { status: 'disconnected', message: 'This app requires OpenCode 2.x.' };
      }
      return { status: 'connected', version: info.version };
    } catch {
      this.client = undefined;
      return {
        status: 'disconnected',
        message:
          'Could not reach OpenCode. Check that OpenCode 2.x is installed and available on PATH, then retry.',
      };
    }
  }

  private async requireClient() {
    const client = await this.resolve();
    if (!client) throw new GatewayError('Connect to OpenCode first.', 503);
    return client;
  }

  /** Whether OpenCode was discovered on this machine, so its files and config are local. */
  async localService() {
    await this.requireClient();
    return Boolean(
      this.localFiles &&
      this.endpoint &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(this.endpoint.url).hostname),
    );
  }

  async requireLocalFiles() {
    if (!(await this.localService()))
      throw new GatewayError(
        'Video and PDF previews and revealing files require the locally discovered OpenCode service. External connections are not supported.',
        422,
      );
  }

  async request<T>(
    signal: AbortSignal,
    operation: (client: OpenCodeClient, options: { signal: AbortSignal }) => Promise<T>,
  ): Promise<T> {
    const client = await this.requireClient();
    try {
      return await operation(client, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
      });
    } catch (error) {
      // The official client wraps errors from its custom fetch in ClientError.cause.
      let cause = error;
      for (let depth = 0; depth < 5 && cause instanceof Error; depth++) {
        if (cause instanceof GatewayError) throw cause;
        cause = cause.cause;
      }
      throw new GatewayError(
        'OpenCode could not complete this request. Check the service and retry.',
        502,
      );
    }
  }

  async sessions(
    filter: { directory?: string; project?: string },
    cursor: string | undefined,
    signal: AbortSignal,
    search?: string,
  ): Promise<SessionPage> {
    const client = await this.requireClient();
    try {
      const result = await client.session.list(
        {
          ...filter,
          cursor,
          search,
          limit: 50,
          ...(cursor ? {} : { order: 'desc' as const }),
          parentID: null,
        },
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) },
      );
      return {
        // Side chats are root sessions natively, but belong to their main chat's panel.
        sessions: result.data.filter((session) => !sideChatParent(session)).map(sessionSummary),
        nextCursor: result.cursor.next ?? null,
      };
    } catch {
      throw new GatewayError('Could not load sessions from OpenCode. Please retry.', 502);
    }
  }

  async *events(signal: AbortSignal) {
    const client = await this.requireClient();
    try {
      for await (const event of client.event.subscribe({ signal })) {
        if (
          event.type === 'server.connected' ||
          /^(session|project|worktree|permission|form|model|provider|credential|config|agent|filesystem|vcs|mcp|skill|pty|shell)\./.test(
            event.type,
          ) ||
          event.type === 'models-dev.refreshed' ||
          event.type.startsWith('rpc.opencodex.tasks.')
        )
          yield event;
      }
    } finally {
      // A failed source must rediscover the service; cancellation by one browser must not reset it.
      if (!signal.aborted && this.client === client) this.client = undefined;
    }
  }

  async terminalSocketURL(ptyID: string, directory: string, cursor: number, signal: AbortSignal) {
    return this.request(signal, async (client, options) => {
      const endpoint = this.endpoint;
      if (!endpoint) throw new GatewayError('Connect to OpenCode first.', 503);
      const result = await client.pty.connect.token(
        { ptyID, location: { directory }, 'x-opencode-ticket': '1' },
        options,
      );
      const base = new URL(endpoint.url);
      if (!base.pathname.endsWith('/')) base.pathname += '/';
      const url = new URL(`api/pty/${encodeURIComponent(ptyID)}/connect`, base);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      url.search = new URLSearchParams({
        'location[directory]': directory,
        cursor: String(cursor),
        ticket: result.data.ticket,
      }).toString();
      return url;
    });
  }
}
