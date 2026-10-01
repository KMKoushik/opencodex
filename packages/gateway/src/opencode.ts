import { OpenCode, type OpenCodeClient } from '@opencode/client';
import { Service, type Endpoint } from '@opencode/client/service';
import type { Connection, SessionPage } from '@opencodex/contracts';
import { GatewayError } from './errors';

type ResolveEndpoint = (start: boolean) => Promise<Endpoint | undefined>;

export function localEndpointResolver(external?: Endpoint): ResolveEndpoint {
  return async (start) => {
    if (external) return external;
    const options = { version: (version: string) => version.startsWith('2.') };
    return start ? Service.ensure(options) : Service.discover(options);
  };
}

export class OpenCodeBackend {
  private client?: OpenCodeClient;
  private resolving?: Promise<OpenCodeClient | undefined>;

  constructor(private readonly resolveEndpoint: ResolveEndpoint = localEndpointResolver()) {}

  private async resolve(start = false): Promise<OpenCodeClient | undefined> {
    if (this.client) return this.client;
    if (this.resolving) {
      const client = await this.resolving;
      if (client || !start) return client;
      return this.resolve(true);
    }
    this.resolving = this.resolveEndpoint(start).then((endpoint) => {
      this.client = endpoint
        ? OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) })
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

  async request<T>(
    signal: AbortSignal,
    operation: (client: OpenCodeClient, options: { signal: AbortSignal }) => Promise<T>,
  ): Promise<T> {
    const client = await this.requireClient();
    try {
      return await operation(client, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
      });
    } catch {
      throw new GatewayError(
        'OpenCode could not complete this request. Check the service and retry.',
        502,
      );
    }
  }

  async sessions(
    directory: string,
    cursor: string | undefined,
    signal: AbortSignal,
  ): Promise<SessionPage> {
    const client = await this.requireClient();
    try {
      const result = await client.session.list(
        {
          directory,
          cursor,
          limit: 50,
          ...(cursor ? {} : { order: 'desc' as const }),
          parentID: null,
        },
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) },
      );
      return {
        sessions: result.data.map((session) => ({
          id: session.id,
          title: session.title || 'Untitled session',
          directory: session.location.directory,
          updatedAt: session.time.updated,
          model: session.model?.id,
        })),
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
          /^(session|project|permission|form|model|provider|credential|config|agent)\./.test(
            event.type,
          ) ||
          event.type === 'models-dev.refreshed'
        )
          yield event;
      }
    } finally {
      // A failed source must rediscover the service; cancellation by one browser must not reset it.
      if (!signal.aborted && this.client === client) this.client = undefined;
    }
  }
}
