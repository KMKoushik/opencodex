import { useEffect, useState, type ReactNode } from 'react';
import { CommandRegistry, isMac } from './commands';
import { ShortcutContext } from './shortcut-context';

export function ShortcutsProvider({ children }: { children: ReactNode }) {
  const [registry] = useState(() => new CommandRegistry());
  useEffect(() => {
    const reset = () => registry.resetSequence();
    let hintsHeld = false;
    // CSS-only hints avoid rerendering the thread list when the modifier changes.
    const hints = (event: KeyboardEvent) => {
      const held = (isMac ? event.metaKey : event.ctrlKey) && !event.altKey && !event.shiftKey;
      if (held === hintsHeld) return;
      hintsHeld = held;
      if (held) document.documentElement.setAttribute('data-thread-shortcuts', '');
      else document.documentElement.removeAttribute('data-thread-shortcuts');
    };
    const blur = () => {
      reset();
      hintsHeld = false;
      document.documentElement.removeAttribute('data-thread-shortcuts');
    };
    const keydown = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey && event.key !== 'Escape') {
        reset();
        return;
      }
      const target = event
        .composedPath()
        .find((node): node is HTMLElement => node instanceof HTMLElement);
      registry.dispatch(event, {
        mac: isMac,
        editable: Boolean(
          target?.isContentEditable || target?.closest('input, textarea, select, [role="textbox"]'),
        ),
        blocked: Boolean(
          target?.closest(
            '[data-shortcut-boundary], [role="dialog"][aria-modal="true"], dialog[open]',
          ),
        ),
      });
    };
    // Panel toggles and thread navigation must work before editors consume keys.
    const panelKeydown = (event: KeyboardEvent) => {
      hints(event);
      if (!/^[ij1-9]$/.test(event.key.toLowerCase()) || !(isMac ? event.metaKey : event.ctrlKey))
        return;
      const target = event
        .composedPath()
        .find((node): node is HTMLElement => node instanceof HTMLElement);
      registry.dispatch(event, {
        mac: isMac,
        editable: true,
        blocked: Boolean(
          target?.closest('[role="dialog"][aria-modal="true"], dialog[open]') ||
          (/^[1-9]$/.test(event.key) && target?.closest('[role="menu"], :popover-open')),
        ),
      });
      if (event.defaultPrevented) event.stopPropagation();
    };
    document.addEventListener('keydown', panelKeydown, true);
    document.addEventListener('keyup', hints, true);
    // Bubble phase lets local controls consume their keys before app commands.
    document.addEventListener('keydown', keydown);
    document.addEventListener('focusin', reset);
    document.addEventListener('pointerdown', reset);
    document.addEventListener('compositionstart', reset);
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('keydown', panelKeydown, true);
      document.removeEventListener('keyup', hints, true);
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('focusin', reset);
      document.removeEventListener('pointerdown', reset);
      document.removeEventListener('compositionstart', reset);
      window.removeEventListener('blur', blur);
      blur();
    };
  }, [registry]);
  return <ShortcutContext value={registry}>{children}</ShortcutContext>;
}
