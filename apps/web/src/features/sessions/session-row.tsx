import { useEffect, useId, useRef, useState } from 'react';
import { GitForkIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { Session } from '@opencodex/contracts';
import { SessionActionsMenu, type SessionActionsHandle } from './session-actions-menu';
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
  const id = useId();
  const detailsID = `${id}-details`;
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<SessionActionsHandle>(null);
  const details = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [age, setAge] = useState(() => formatAge(session.updatedAt));
  const [expanded, setExpanded] = useState(false);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
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
    menu.current?.show(point);
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
        <SessionActionsMenu
          ref={menu}
          id={id}
          sessionID={session.id}
          title={session.title}
          connected={connected}
          anchor={trigger}
          onOpenChange={setExpanded}
        />
      </div>
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
