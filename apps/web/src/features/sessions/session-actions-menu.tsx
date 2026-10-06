import { useEffect, useImperativeHandle, useRef, type Ref, type RefObject } from 'react';
import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';
import { useThreadFocus } from '../threads/use-thread-focus';
import { refreshSession } from './metadata';
import { isMac } from '../shortcuts/commands';
import './session-row.css';

export type SessionActionsHandle = {
  show: (point?: { top: number; left: number }) => void;
  dismiss: () => void;
  markDone: (onSuccess: () => void) => void;
};

export function SessionActionsMenu({
  ref,
  id,
  sessionID,
  title,
  connected,
  pinned,
  done,
  running,
  selection,
  onPick,
  anchor,
  align = 'start',
  onOpenChange,
  className,
}: {
  ref: Ref<SessionActionsHandle>;
  id: string;
  sessionID: string;
  title: string;
  connected: boolean;
  pinned: boolean;
  done: boolean;
  running: boolean;
  /** Set when this row is part of a multi-selection; the menu acts on the whole selection. */
  selection?: { count: number; ready: number; onDone: () => void; onClear: () => void };
  /** Starts or extends a multi-selection with this thread. */
  onPick?: () => void;
  anchor: RefObject<HTMLButtonElement | null>;
  align?: 'start' | 'end';
  onOpenChange: (open: boolean) => void;
  className?: string;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const client = useQueryClient();
  const mutationKey = ['chat', sessionID, 'unread'];
  const pending = useIsMutating({ mutationKey, exact: true }) > 0;
  const mark = useMutation({
    mutationKey,
    mutationFn: () => api.unreadSession(sessionID, { action: 'mark' }),
    retry: false,
    onSuccess: () => {
      refreshSession(client, sessionID);
      dismiss();
    },
  });
  const focus = useThreadFocus(sessionID);
  const unlisten = useRef<() => void>(undefined);
  useEffect(() => () => unlisten.current?.(), []);
  function close() {
    unlisten.current?.();
    if (menu.current?.matches(':popover-open')) menu.current.hidePopover();
  }
  // A right-click opens the menu on press; native light dismiss can then close it on the
  // release. Dismiss only on a new press outside the menu and its trigger. Listen from the
  // moment it opens, not after the async toggle event.
  function listen() {
    unlisten.current?.();
    const press = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !anchor.current?.contains(target)) close();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    };
    document.addEventListener('pointerdown', press, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('blur', close);
    unlisten.current = () => {
      document.removeEventListener('pointerdown', press, true);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', close);
      unlisten.current = undefined;
    };
  }
  function dismiss() {
    if (!menu.current?.matches(':popover-open')) return;
    close();
    anchor.current?.focus({ preventScroll: true });
  }
  function show(point?: { top: number; left: number }) {
    if (!connected || !menu.current || !anchor.current) return;
    const rect = anchor.current.getBoundingClientRect();
    if (!menu.current.matches(':popover-open')) {
      menu.current.showPopover();
      listen();
    }
    const { width, height } = menu.current.getBoundingClientRect();
    menu.current.style.top = `${Math.max(8, Math.min(point?.top ?? rect.bottom + 4, innerHeight - height - 8))}px`;
    menu.current.style.left = `${Math.max(8, Math.min(point?.left ?? (align === 'end' ? rect.right - width : rect.left), innerWidth - width - 8))}px`;
  }
  useImperativeHandle(ref, () => ({
    dismiss,
    markDone(onSuccess) {
      if (!connected || focus.pending) return;
      if (selection) {
        if (selection.ready) selection.onDone();
        return;
      }
      if (running || done) return;
      focus.mutate('done', {
        onSuccess,
        onError: () => show(),
      });
    },
    show,
  }));
  return (
    <div
      ref={menu}
      id={id}
      className={cn('session-actions-menu', className)}
      popover="manual"
      role="menu"
      aria-label={`${title} actions`}
      data-shortcut-boundary=""
      onContextMenu={(event) => event.preventDefault()}
      onToggle={(event) => {
        if (event.target !== event.currentTarget) return;
        const open = event.newState === 'open';
        if (!open) unlisten.current?.();
        onOpenChange(open);
        if (open) menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
      }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Tab') dismiss();
        const items = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
        );
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = {
          ArrowDown: (index + 1) % items.length,
          ArrowUp: (index - 1 + items.length) % items.length,
          Home: 0,
          End: items.length - 1,
        }[event.key];
        if (next !== undefined) {
          event.preventDefault();
          items[next]?.focus();
        }
      }}
    >
      {selection ? (
        <>
          <button
            type="button"
            role="menuitem"
            disabled={!connected || !selection.ready}
            title={selection.ready ? undefined : 'Available when the threads finish'}
            onClick={() => {
              selection.onDone();
              dismiss();
            }}
          >
            {selection.ready === selection.count
              ? `Mark ${selection.count} threads as done`
              : `Mark ${selection.ready} of ${selection.count} as done`}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              selection.onClear();
              dismiss();
            }}
          >
            Clear selection
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            role="menuitem"
            disabled={!connected || focus.pending}
            onClick={() => focus.mutate(pinned ? 'unpin' : 'pin', { onSuccess: dismiss })}
          >
            {pinned ? 'Unpin thread' : 'Pin thread'}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!connected || focus.pending || (!done && running)}
            title={!done && running ? 'Available when the thread finishes' : undefined}
            aria-keyshortcuts={
              !done && onPick ? (isMac ? 'Meta+Enter' : 'Control+Enter') : undefined
            }
            onClick={() => focus.mutate(done ? 'undone' : 'done', { onSuccess: dismiss })}
          >
            {done ? 'Mark as not done' : 'Mark as done'}
            {!done && onPick && <kbd aria-hidden>{isMac ? '⌘↵' : 'Ctrl+Enter'}</kbd>}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!connected || pending}
            onClick={() => mark.mutate()}
          >
            {pending ? 'Marking as unread…' : 'Mark as unread'}
          </button>
          {onPick && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onPick();
                dismiss();
              }}
            >
              Select
            </button>
          )}
          {mark.isError && (
            <p className="session-actions-error" role="alert">
              Could not mark this thread as unread. {mark.error.message}
            </p>
          )}
          {focus.isError && (
            <p className="session-actions-error" role="alert">
              Could not update this thread. {focus.error.message}
            </p>
          )}
        </>
      )}
    </div>
  );
}
