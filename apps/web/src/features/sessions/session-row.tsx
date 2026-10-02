import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GitForkIcon } from '@hugeicons/core-free-icons';
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
  const detailsID = `${id}-details`;
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const details = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [age, setAge] = useState(() => formatAge(session.updatedAt));
  const [expanded, setExpanded] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const mark = useMutation({
    mutationKey: ['chat', session.id, 'unread'],
    mutationFn: () => api.unreadSession(session.id, { action: 'mark' }),
    retry: false,
    onSuccess: () => refreshSessionUnread(client, session.id),
  });
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
  useEffect(() => {
    if (!expanded) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target)) {
        menu.current?.hidePopover();
        setExpanded(false);
      }
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [expanded]);
  function hideDetails() {
    clearTimeout(hoverTimer.current);
    details.current?.hidePopover();
  }
  function showDetails(delay = 0) {
    hideDetails();
    if (expanded) return;
    setAge(formatAge(session.updatedAt));
    hoverTimer.current = setTimeout(() => {
      const popup = details.current;
      const row = trigger.current;
      if (!popup || !row) return;
      const rect = row.getBoundingClientRect();
      popup.showPopover();
      const { width, height } = popup.getBoundingClientRect();
      popup.style.left = `${Math.max(8, Math.min(rect.right + 8, innerWidth - width - 8))}px`;
      popup.style.top = `${Math.max(8, Math.min(rect.top, innerHeight - height - 8))}px`;
    }, delay);
  }
  function show(point?: { top: number; left: number }) {
    hideDetails();
    if (!connected || mark.isPending) return;
    const rect = trigger.current!.getBoundingClientRect();
    setPosition({
      top: Math.max(8, Math.min(point?.top ?? rect.bottom + 4, innerHeight - 60)),
      left: Math.max(8, Math.min(point?.left ?? rect.left, innerWidth - 188)),
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
          show({ top: event.clientY, left: event.clientX });
        }}
      >
        <button
          ref={trigger}
          className="nav-row session-row"
          aria-current={selected ? 'page' : undefined}
          aria-haspopup="menu"
          aria-expanded={expanded}
          aria-controls={id}
          aria-describedby={detailsID}
          onPointerEnter={(event) => {
            if (event.pointerType === 'mouse') showDetails(400);
          }}
          onPointerLeave={hideDetails}
          onFocus={() => showDetails()}
          onBlur={hideDetails}
          onClick={() => {
            hideDetails();
            onSelect();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') hideDetails();
            if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
              event.preventDefault();
              show();
            }
          }}
        >
          <span className="truncate-fade">{session.title}</span>
          {session.fork && (
            <span
              className="session-kind"
              role="img"
              aria-label="Forked thread"
              title="Forked thread"
            >
              <HugeiconsIcon icon={GitForkIcon} size={14} aria-hidden="true" />
            </span>
          )}
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
        <div
          ref={details}
          id={detailsID}
          className="session-details"
          popover="manual"
          role="tooltip"
        >
          <p>{session.title}</p>
          <p className="session-details-time">
            <time dateTime={new Date(session.updatedAt).toISOString()}>{age}</time>
          </p>
        </div>
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
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
