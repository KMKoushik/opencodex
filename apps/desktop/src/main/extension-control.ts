import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import { z } from 'zod';
import type { DesktopToolHandler } from '@opencodex/contracts/desktop-tools';

const path = '/browser-extension';
const protocol = 'opencodex-extension-v1';
const maxPayload = 16 * 1024 * 1024;
const responseSchema = z.object({
  id: z.string().uuid(),
  result: z
    .object({
      content: z
        .array(
          z.discriminatedUnion('type', [
            z.object({ type: z.literal('text'), text: z.string().max(500_000) }),
            z.object({
              type: z.literal('file'),
              uri: z
                .string()
                .max(maxPayload)
                .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/),
              mime: z.literal('image/png'),
              name: z.string().max(200).optional(),
            }),
          ]),
        )
        .max(8),
    })
    .optional(),
  error: z.string().max(4000).optional(),
});
const methods = new Set([
  'browser.list',
  'browser.claim',
  'browser.release',
  'browser.open',
  'browser.snapshot',
  'browser.screenshot',
  'browser.navigate',
  'browser.click',
  'browser.type',
  'browser.press',
  'browser.scroll',
  'browser.close',
  'browser.console',
  'browser.network',
]);

export type ExtensionControlState = {
  connected: boolean;
  extensionID?: string;
  connectedAt?: string;
};

/** Hosts only the extension channel. The caller owns the authenticated, loopback HTTP server. */
export function createExtensionControl(
  options: {
    onStateChange?: (state: ExtensionControlState) => void;
  } = {},
) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload,
    perMessageDeflate: false,
    handleProtocols: (protocols) => (protocols.has(protocol) ? protocol : false),
  });
  let socket: WebSocket | undefined;
  let state: ExtensionControlState = { connected: false };
  let detach: (() => void) | undefined;
  let pairingInfo: { url: string; token: string } | undefined;
  let closed = false;
  const pending = new Map<
    string,
    {
      reject: (error: Error) => void;
      resolve: (result: NonNullable<z.infer<typeof responseSchema>['result']>) => void;
    }
  >();
  const publish = (next: ExtensionControlState) => {
    state = next;
    options.onStateChange?.({ ...state });
  };
  const disconnected = (connection: WebSocket) => {
    if (socket !== connection) return;
    socket = undefined;
    for (const request of [...pending.values()])
      request.reject(new Error('Browser extension disconnected. Reconnect from its popup.'));
    publish({ connected: false });
  };

  const handle: DesktopToolHandler = async (call, signal) => {
    if (!methods.has(call.method)) throw new Error(`Unsupported extension method: ${call.method}`);
    if (!call.sessionID || call.sessionID.length > 200)
      throw new Error('A valid OpenCode session is required.');
    if (signal.aborted) throw new Error('Browser request cancelled.');
    const connection = socket;
    if (!connection || connection.readyState !== WebSocket.OPEN)
      throw new Error('Connect the OpenCodex extension in Chrome or Edge first.');
    if (pending.size >= 32) throw new Error('Too many pending browser requests.');
    const id = randomUUID();
    const message = JSON.stringify({
      type: 'call',
      id,
      sessionID: call.sessionID,
      method: call.method,
      input: call.input,
    });
    if (Buffer.byteLength(message) > 256 * 1024) throw new Error('Browser request is too large.');
    return new Promise((resolve, reject) => {
      const finish = () => {
        pending.delete(id);
        clearTimeout(timer);
        signal.removeEventListener('abort', cancel);
      };
      const fail = (error: Error) => {
        finish();
        reject(error);
      };
      const cancel = () => {
        if (connection.readyState === WebSocket.OPEN)
          connection.send(JSON.stringify({ type: 'cancel', id }));
        fail(
          new Error(
            'Browser request cancelled. An already-dispatched browser action may have completed.',
          ),
        );
      };
      const timer = setTimeout(() => {
        if (connection.readyState === WebSocket.OPEN)
          connection.send(JSON.stringify({ type: 'cancel', id }));
        fail(
          new Error(
            'Browser request timed out. An already-dispatched action may have completed; inspect the tab before repeating it.',
          ),
        );
      }, 30_000);
      timer.unref();
      pending.set(id, {
        reject: fail,
        resolve: (result) => {
          finish();
          resolve(result);
        },
      });
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) {
        cancel();
        return;
      }
      connection.send(message, (error) => {
        if (error) fail(error);
      });
    });
  };

  function attach(server: Server, endpoint: { url: string; token?: string }) {
    if (closed || detach) throw new Error('Extension control can only attach once.');
    const token = endpoint.token ?? randomBytes(32).toString('base64url');
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(token))
      throw new Error('Pairing token must contain at least 32 URL-safe characters.');
    const address = server.address() as AddressInfo | null;
    if (!address || !['127.0.0.1', '::1'].includes(address.address))
      throw new Error('Extension server must already be listening on loopback.');
    const host = address.address === '::1' ? `[::1]:${address.port}` : `127.0.0.1:${address.port}`;
    if (endpoint.url !== `http://${host}`)
      throw new Error('Extension endpoint URL must match the listening server.');
    pairingInfo = { url: `ws://${host}${path}`, token };
    const onUpgrade = (
      request: import('node:http').IncomingMessage,
      stream: import('node:stream').Duplex,
      head: Buffer,
    ) => {
      if (request.url?.split('?')[0] !== path) {
        stream.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
        return;
      }
      const origin = request.headers.origin ?? '';
      const offered = (request.headers['sec-websocket-protocol'] ?? '')
        .split(',')
        .map((value) => value.trim());
      const supplied = offered.find((value) => value.startsWith('token.'))?.slice(6) ?? '';
      const authenticated =
        /^[A-Za-z0-9_-]+$/.test(supplied) &&
        supplied.length === token.length &&
        timingSafeEqual(Buffer.from(supplied), Buffer.from(token));
      if (
        request.url !== path ||
        request.headers.host !== host ||
        !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '') ||
        !/^chrome-extension:\/\/[a-p]{32}$/.test(origin) ||
        !authenticated ||
        !offered.includes(protocol)
      ) {
        stream.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        return;
      }
      if (socket) {
        stream.end('HTTP/1.1 409 Conflict\r\nConnection: close\r\n\r\n');
        return;
      }
      wss.handleUpgrade(request, stream, head, (connection) => {
        socket = connection;
        publish({
          connected: true,
          extensionID: origin.slice('chrome-extension://'.length),
          connectedAt: new Date().toISOString(),
        });
        connection.on('error', () => {
          disconnected(connection);
          connection.terminate();
        });
        connection.on('close', () => disconnected(connection));
        let alive = true;
        const heartbeat = setInterval(() => {
          if (!alive) {
            connection.terminate();
            return;
          }
          alive = false;
          connection.ping();
        }, 25_000);
        heartbeat.unref();
        connection.on('pong', () => {
          alive = true;
        });
        connection.once('close', () => clearInterval(heartbeat));
        connection.on('message', (data, binary) => {
          try {
            if (binary) throw new Error('Binary messages are not supported.');
            const value: unknown = JSON.parse(data.toString());
            if (
              typeof value === 'object' &&
              value !== null &&
              'type' in value &&
              value.type === 'ping'
            ) {
              connection.send('{"type":"pong"}');
              return;
            }
            const response = responseSchema.parse(value);
            if (Boolean(response.result) === Boolean(response.error))
              throw new Error('Invalid response.');
            const request = pending.get(response.id);
            if (response.error) request?.reject(new Error(response.error));
            else if (response.result) request?.resolve(response.result);
          } catch {
            connection.close(1008, 'Invalid extension response');
          }
        });
      });
    };
    server.on('upgrade', onUpgrade);
    detach = () => server.off('upgrade', onUpgrade);
    return { ...pairingInfo };
  }

  function disconnect() {
    if (!socket) return;
    const connection = socket;
    disconnected(connection);
    connection.close(1000, 'Disconnected by desktop');
    const timeout = setTimeout(() => connection.terminate(), 2000);
    timeout.unref();
    connection.once('close', () => clearTimeout(timeout));
  }

  return {
    handle,
    attach,
    getState: () => ({ ...state }),
    getPairingInfo: () => (pairingInfo ? { ...pairingInfo } : undefined),
    disconnect,
    close: () => {
      closed = true;
      detach?.();
      disconnect();
      for (const connection of wss.clients) connection.terminate();
      wss.close();
    },
  };
}
