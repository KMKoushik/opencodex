import { useEffect, useState, type ReactNode } from 'react';
import { CommandRegistry, isMac } from './commands';
import { ShortcutContext } from './shortcut-context';

export function ShortcutsProvider({ children }: { children: ReactNode }) {
  const [registry] = useState(() => new CommandRegistry());
  useEffect(() => {
    const reset = () => registry.resetSequence();
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
    // Bubble phase lets local controls consume their keys before app commands.
    document.addEventListener('keydown', keydown);
    document.addEventListener('focusin', reset);
    document.addEventListener('pointerdown', reset);
    document.addEventListener('compositionstart', reset);
    window.addEventListener('blur', reset);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('focusin', reset);
      document.removeEventListener('pointerdown', reset);
      document.removeEventListener('compositionstart', reset);
      window.removeEventListener('blur', reset);
    };
  }, [registry]);
  return <ShortcutContext value={registry}>{children}</ShortcutContext>;
}
