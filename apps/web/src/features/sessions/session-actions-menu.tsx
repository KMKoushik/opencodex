import { useImperativeHandle, useRef, type Ref, type RefObject } from 'react';
import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';
import { refreshSessionUnread } from './unread';
import './session-row.css';

export type SessionActionsHandle = {
  show: (point?: { top: number; left: number }) => void;
  dismiss: () => void;
};

export function SessionActionsMenu({
  ref,
  id,
  sessionID,
  title,
  connected,
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
      refreshSessionUnread(client, sessionID);
      dismiss();
    },
  });
  function dismiss() {
    if (!menu.current?.matches(':popover-open')) return;
    menu.current.hidePopover();
    anchor.current?.focus({ preventScroll: true });
  }
  useImperativeHandle(ref, () => ({
    dismiss,
    show(point) {
      if (!connected || !menu.current || !anchor.current) return;
      const rect = anchor.current.getBoundingClientRect();
      menu.current.showPopover();
      const { width, height } = menu.current.getBoundingClientRect();
      menu.current.style.top = `${Math.max(8, Math.min(point?.top ?? rect.bottom + 4, innerHeight - height - 8))}px`;
      menu.current.style.left = `${Math.max(8, Math.min(point?.left ?? (align === 'end' ? rect.right - width : rect.left), innerWidth - width - 8))}px`;
    },
  }));
  return (
    <div
      ref={menu}
      id={id}
      className={cn('session-actions-menu', className)}
      popover="auto"
      role="menu"
      aria-label={`${title} actions`}
      data-shortcut-boundary=""
      onToggle={(event) => {
        if (event.target !== event.currentTarget) return;
        const open = event.newState === 'open';
        onOpenChange(open);
        if (open) menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
      }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          dismiss();
        }
        if (event.key === 'Tab') dismiss();
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
        }
      }}
    >
      <button
        type="button"
        role="menuitem"
        disabled={!connected || pending}
        onClick={() => mark.mutate()}
      >
        {pending ? 'Marking as unread…' : 'Mark as unread'}
      </button>
      {mark.isError && (
        <p className="session-actions-error" role="alert">
          Could not mark this thread as unread. {mark.error.message}
        </p>
      )}
    </div>
  );
}
