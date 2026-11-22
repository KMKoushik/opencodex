import type { DesktopUpdateState } from '@opencodex/contracts/desktop';
import type { HostUpdates } from './host-updates';

/** Private stdio protocol for a native parent; never exposed on the HTTP listener. */
export function parentUpdates(
  input: NodeJS.ReadableStream,
  send: (line: string) => void,
): HostUpdates {
  let state: DesktopUpdateState = {
    status: 'disabled',
    currentVersion: '',
    disabledReason: 'The native host is starting.',
  };
  let buffer = '';
  input.setEncoding('utf8');
  input.on('data', (chunk: string) => {
    buffer += chunk;
    if (buffer.length > 65_536) {
      buffer = '';
      return;
    }
    for (;;) {
      const end = buffer.indexOf('\n');
      if (end < 0) break;
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      try {
        const message: unknown = JSON.parse(line);
        if (!message || typeof message !== 'object' || !('update' in message)) continue;
        const next = message.update as DesktopUpdateState;
        if (
          next &&
          typeof next.currentVersion === 'string' &&
          [
            'disabled',
            'idle',
            'up-to-date',
            'checking',
            'available',
            'downloading',
            'ready',
            'installing',
            'error',
          ].includes(next.status)
        )
          state = next;
      } catch {
        // Other parent control records may be added without breaking this channel.
      }
    }
  });
  const command = (action: string) => send(`OPENCODEX_HOST_UPDATE ${JSON.stringify({ action })}`);
  return {
    getState: () => state,
    check: async () => command('check'),
    download: async () => command('download'),
    install: () => command('install'),
  };
}
