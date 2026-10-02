import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontalIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { Session } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/api';
import { refreshSessionUnread } from './unread';
import './session-row.css';

export function SessionRow({
  session,
  selected,
  responding,
  connected,
  onSelect,
}: {
  session: Session;
  selected: boolean;
  responding: boolean;
  connected: boolean;
  onSelect: () => void;
}) {
  const client = useQueryClient();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const mark = useMutation({
    mutationKey: ['chat', session.id, 'unread'],
    mutationFn: () => api.unreadSession(session.id, { action: 'mark' }),
    retry: false,
    onSuccess: () => refreshSessionUnread(client, session.id),
  });
  useEffect(() => {
    if (!expanded) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) {
        menu.current?.hidePopover();
        setExpanded(false);
      }
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [expanded]);
  function show() {
    if (!connected || mark.isPending) return;
    const rect = trigger.current!.getBoundingClientRect();
    setPosition({
      top: Math.min(rect.bottom + 4, innerHeight - 60),
      left: Math.max(8, Math.min(rect.left, innerWidth - 188)),
    });
    menu.current?.showPopover();
    setExpanded(true);
    menu.current
      ?.querySelector<HTMLButtonElement>('button:not(:disabled)')
      ?.focus({ preventScroll: true });
  }
  function dismiss() {
    menu.current?.hidePopover();
    setExpanded(false);
    trigger.current?.focus({ preventScroll: true });
  }
  return (
    <div className="session-entry" data-selected={selected || undefined}>
      <div
        className="session-entry-row"
        onContextMenu={(event) => {
          event.preventDefault();
          show();
        }}
      >
        <button
          className="nav-row session-row"
          aria-current={selected ? 'page' : undefined}
          title={session.title}
          onClick={onSelect}
        >
          <span className="truncate">{session.title}</span>
          {session.fork && <span className="session-kind">Fork</span>}
          <time dateTime={new Date(session.updatedAt).toISOString()}>
            {formatAge(session.updatedAt)}
          </time>
          {responding && (
            <span
              className="session-activity"
              role="img"
              aria-label="Responding"
              title="Responding…"
            />
          )}
          {(session.unread ||
            (!responding && (session.time.idle ?? 0) > (session.time.viewed ?? 0))) && (
            <span
              className="session-unread"
              data-responding={responding || undefined}
              role="img"
              aria-label={session.unread ? 'Unread thread' : 'Unread reply'}
              title={session.unread ? 'Unread thread' : 'Unread reply'}
            />
          )}
        </button>
        <Button
          ref={trigger}
          className="session-actions-trigger"
          variant="ghost"
          size="icon"
          aria-label={`Actions for ${session.title}`}
          title="Thread actions"
          aria-haspopup="menu"
          aria-expanded={expanded}
          aria-controls={id}
          disabled={!connected || mark.isPending}
          onClick={() => (expanded ? dismiss() : show())}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              show();
            }
          }}
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} size={16} />
        </Button>
        <div
          ref={menu}
          id={id}
          className="session-actions-menu"
          popover="manual"
          role="menu"
          aria-label={`${session.title} actions`}
          data-shortcut-boundary=""
          style={position}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              dismiss();
            }
            if (event.key === 'Tab') {
              dismiss();
            }
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
              event.preventDefault();
              menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
            }
          }}
        >
          <button
            type="button"
            role="menuitem"
            disabled={!connected || mark.isPending}
            onClick={() => {
              dismiss();
              mark.mutate();
            }}
          >
            Mark as unread
          </button>
        </div>
      </div>
      {mark.isError && (
        <div className="sidebar-note text-error" role="alert">
          <p>Could not mark this thread as unread. {mark.error.message}</p>
          <Button
            variant="secondary"
            size="sm"
            disabled={mark.isPending}
            onClick={() => mark.mutate()}
          >
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}

function formatAge(time: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60_000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 365)}y`;
}
