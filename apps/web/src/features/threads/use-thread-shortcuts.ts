import { useLayoutEffect, useRef } from 'react';
import type { Session } from '@opencodex/contracts';
import { threadCommands } from '../shortcuts/commands';
import { useCommandRegistry } from '../shortcuts/shortcut-context';

/** The first nine pinned / Focus rows share one bounded, visual-order mapping. */
export function useThreadShortcuts(
  sessions: Session[],
  onSelect: (session: Session) => void,
  enabled: boolean,
) {
  const registry = useCommandRegistry();
  const latest = useRef({ sessions, onSelect });
  useLayoutEffect(() => {
    latest.current = { sessions, onSelect };
  });
  useLayoutEffect(() => {
    if (!enabled) return;
    const unregister = threadCommands.map((command, index) =>
      registry.register(command.id, () => {
        const session = latest.current.sessions[index];
        if (!session) return false;
        latest.current.onSelect(session);
      }),
    );
    return () => unregister.forEach((remove) => remove());
  }, [registry, enabled]);
}
