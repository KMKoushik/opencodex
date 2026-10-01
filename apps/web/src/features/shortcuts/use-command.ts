import { useLayoutEffect, useRef } from 'react';
import type { CommandHandler, CommandID } from './commands';
import { useCommandRegistry } from './shortcut-context';

/** A mounted feature owns its handler. Updating it never rerenders other consumers. */
export function useCommand(id: CommandID, handler: CommandHandler | undefined) {
  const registry = useCommandRegistry();
  const latest = useRef(handler);
  useLayoutEffect(() => {
    latest.current = handler;
  });
  const enabled = handler !== undefined;
  useLayoutEffect(
    () =>
      enabled
        ? registry.register(id, () => (latest.current ? latest.current() : false))
        : undefined,
    [registry, id, enabled],
  );
}
