import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app';
import { OpenCodeBackend, localEndpointResolver } from './opencode';
import { attachTerminalSockets } from './terminal-sockets';

export async function startGateway(options: { port?: number; assets?: string } = {}) {
  const shutdown = new AbortController();
  const url = process.env.OPENCODE_URL;
  if (url && !['http:', 'https:'].includes(new URL(url).protocol)) {
    throw new Error('OPENCODE_URL must use HTTP or HTTPS.');
  }
  const backend = new OpenCodeBackend(
    localEndpointResolver(
      url
        ? {
            url,
            auth: process.env.OPENCODE_PASSWORD
              ? {
                  type: 'basic',
                  username: process.env.OPENCODE_USERNAME || 'opencode',
                  password: process.env.OPENCODE_PASSWORD,
                }
              : undefined,
          }
        : undefined,
    ),
  );
  const app = createApp(backend, shutdown.signal);
  if (options.assets) {
    app.use('*', async (c, next) => {
      c.header(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src http: https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      );
      await next();
    });
    app.use('*', serveStatic({ root: options.assets }));
  }
  const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: options.port ?? 0 });
  const closeTerminals = attachTerminalSockets(server as import('node:http').Server, backend);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Gateway did not bind a TCP port.');
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      shutdown.abort();
      closeTerminals();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        if ('closeAllConnections' in server) server.closeAllConnections();
      });
    },
  };
}
