import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app';
import { OpenCodeBackend, localEndpointResolver } from './opencode';
import { attachTerminalSockets } from './terminal-sockets';
import { registerGateway } from './canvases';
import { CANVAS_PLUGIN_FILE } from './canvas-plugin';
import { refreshClaudeCodePlugin } from './claude-code';
import { refreshPlugin } from './plugin-files';
import { SIDE_CHAT_PLUGIN_FILE } from './side-chats';
import { TASKS_PLUGIN_FILE } from './tasks';
import { RemoteAccess, remoteRequest } from './remote';

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
    !url,
  );
  const remote = new RemoteAccess({ served: Boolean(options.assets) });
  const app = createApp(backend, shutdown.signal, { triggers: true, remote });
  if (options.assets) {
    app.use('*', async (c, next) => {
      c.header(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http: https:; connect-src 'self'; frame-src http: https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      );
      await next();
    });
    app.use('*', serveStatic({ root: options.assets }));
  } else {
    // Development serves the UI from Vite, which the tunnel doesn't reach.
    app.get('*', (c) =>
      remoteRequest(c)
        ? c.text('This OpenCodex is a development build and can’t serve the app remotely.', 503)
        : c.notFound(),
    );
  }
  const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: options.port ?? 0 });
  const closeTerminals = attachTerminalSockets(server as import('node:http').Server, backend);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  remote.serve(app.fetch, (remoteServer, admit) =>
    attachTerminalSockets(remoteServer, backend, admit),
  );
  const remoteStarted = remote
    .start()
    .catch((error: unknown) => console.error('Remote access could not start.', error));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Gateway did not bind a TCP port.');
  const origin = `http://127.0.0.1:${address.port}`;
  // Installed plugins from an older OpenCodex would teach agents tools this gateway changed.
  void Promise.allSettled([
    ...[CANVAS_PLUGIN_FILE, TASKS_PLUGIN_FILE, SIDE_CHAT_PLUGIN_FILE].map(refreshPlugin),
    refreshClaudeCodePlugin(),
  ]);
  let unregister: (() => void) | undefined;
  try {
    unregister = registerGateway(origin);
  } catch {
    // Canvases still work in the app; only the canvas plugin can't find this gateway.
  }
  return {
    url: origin,
    close: async () => {
      shutdown.abort();
      await remoteStarted;
      await remote.close();
      closeTerminals();
      unregister?.();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        if ('closeAllConnections' in server) server.closeAllConnections();
      });
    },
  };
}
