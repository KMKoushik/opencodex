import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { projectInputSchema } from '@opencodex/contracts';
import type { OpenCodeBackend } from './opencode';

// Keep credentials and one-use OpenCode tickets inside the gateway. The browser uses /api only.
export function attachTerminalSockets(server: Server, backend: OpenCodeBackend) {
  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: 1024 * 1024,
    perMessageDeflate: false,
  });
  const upstreams = new Set<WebSocket>();
  const shutdown = new AbortController();
  server.on('upgrade', (request, socket, head) => {
    const reject = (status: number) =>
      socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    const url = URL.parse(request.url ?? '/', `http://${request.headers.host ?? 'invalid'}`);
    if (!url) {
      reject(400);
      return;
    }
    const match = /^\/api\/terminals\/([a-zA-Z0-9_-]+)\/connect$/.exec(url.pathname);
    if (!match) {
      reject(404);
      return;
    }
    if (
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      request.headers.origin !== url.origin ||
      request.headers['sec-fetch-site'] === 'cross-site'
    ) {
      reject(403);
      return;
    }
    const input = projectInputSchema.safeParse({ directory: url.searchParams.get('directory') });
    const cursor = Number(url.searchParams.get('cursor') ?? 0);
    if (!input.success || !Number.isSafeInteger(cursor) || cursor < 0) {
      reject(400);
      return;
    }
    const abort = new AbortController();
    socket.on('error', () => abort.abort());
    socket.on('close', () => abort.abort());
    const signal = AbortSignal.any([abort.signal, shutdown.signal]);
    void backend
      .terminalSocketURL(match[1]!, input.data.directory, cursor, signal)
      .then((target) => {
        if (signal.aborted || socket.destroyed) return;
        const upstream = new WebSocket(target, {
          handshakeTimeout: 10_000,
          maxPayload: 4 * 1024 * 1024,
          perMessageDeflate: false,
        });
        let upgraded = false;
        upstreams.add(upstream);
        const stop = () => upstream.terminate();
        signal.addEventListener('abort', stop, { once: true });
        upstream.once('close', () => {
          upstreams.delete(upstream);
          signal.removeEventListener('abort', stop);
        });
        upstream.on('error', () => {
          if (!upgraded && !socket.destroyed) reject(502);
        });
        upstream.once('open', () => {
          if (signal.aborted || socket.destroyed) {
            upstream.terminate();
            return;
          }
          sockets.handleUpgrade(request, socket, head, (downstream) => {
            upgraded = true;
            // Bound both queues; a slow client reconnects using the native replay cursor.
            upstream.on('message', (data, binary) => {
              if (downstream.readyState !== WebSocket.OPEN) return;
              if (downstream.bufferedAmount > 4 * 1024 * 1024) {
                downstream.close(1013, 'Terminal output backlog');
                return;
              }
              downstream.send(data, { binary });
            });
            downstream.on('message', (data, binary) => {
              if (
                binary ||
                upstream.readyState !== WebSocket.OPEN ||
                upstream.bufferedAmount > 1024 * 1024
              ) {
                downstream.close(1013, 'Terminal input backlog');
                return;
              }
              upstream.send(data, { binary: false });
            });
            upstream.on('close', (code) =>
              downstream.close(
                code === 1000 ? 1000 : 1011,
                code === 1000 ? 'Terminal exited' : 'Terminal disconnected',
              ),
            );
            downstream.on('close', () => upstream.terminate());
            downstream.on('error', () => upstream.terminate());
          });
        });
      })
      .catch(() => {
        if (!socket.destroyed) reject(502);
      });
  });
  return () => {
    shutdown.abort();
    for (const socket of upstreams) socket.terminate();
    for (const socket of sockets.clients) socket.terminate();
    sockets.close();
  };
}
