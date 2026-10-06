import { useEffect, useId, useRef, useState, type ComponentProps, type MouseEvent } from 'react';
import { FolderGit2Icon, GitForkIcon, Tick02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { OpenCodeProject, Session } from '@opencodex/contracts';
import { ProjectIcon } from '../projects/project-icon';
import { activityAt, isSettled } from '../threads/focus';
import { isMac } from '../shortcuts/commands';
import { useCommandRegistry } from '../shortcuts/shortcut-context';
import { SessionActionsMenu, type SessionActionsHandle } from './session-actions-menu';
import './session-row.css';

export function SessionRow({
  session,
  worktree,
  selected,
  responding,
  attention,
  project,
  connected,
  checked,
  selection,
  onPick,
  onSelect,
}: {
  session: Session;
  /** The worktree name, for threads outside the project's own folder. */
  worktree?: string;
  selected: boolean;
  responding: boolean;
  /** A pending approval or question, which outranks the other indicators. */
  attention?: 'permission' | 'question';
  /** Shown when rows from several projects share a list. */
  project?: { name: string; icon?: OpenCodeProject['icon'] };
  connected: boolean;
  /** Defined while a multi-selection is active: whether this row is in it. */
  checked?: boolean;
  selection?: ComponentProps<typeof SessionActionsMenu>['selection'];
  onPick?: () => void;
  onSelect: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const id = useId();
  const commands = useCommandRegistry();
  const detailsID = `${id}-details`;
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<SessionActionsHandle>(null);
  const details = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [age, setAge] = useState(() => formatAge(activityAt(session)));
  const unread =
    session.unread || (!responding && (session.time.idle ?? 0) > (session.time.viewed ?? 0));
  const [expanded, setExpanded] = useState(false);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
  function hideDetails() {
    clearTimeout(hoverTimer.current);
    details.current?.hidePopover();
  }
  function showDetails(delay = 0) {
    hideDetails();
    if (expanded) return;
    setAge(formatAge(activityAt(session)));
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
    <div
      className="session-entry"
      data-selected={selected || undefined}
      data-checked={checked || undefined}
    >
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
          aria-pressed={checked}
          aria-haspopup="menu"
          aria-expanded={expanded}
          aria-controls={id}
          aria-describedby={detailsID}
          aria-keyshortcuts={isMac ? 'Meta+Enter' : 'Control+Enter'}
          onPointerEnter={(event) => {
            if (event.pointerType === 'mouse') showDetails(400);
          }}
          onPointerLeave={hideDetails}
          onFocus={() => showDetails()}
          onBlur={hideDetails}
          onClick={(event) => {
            hideDetails();
            menu.current?.dismiss();
            onSelect(event);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.defaultPrevented || expanded) return;
            if (
              selected &&
              event.key === 'Enter' &&
              !event.metaKey &&
              !event.ctrlKey &&
              !event.altKey &&
              !event.shiftKey
            ) {
              event.preventDefault();
              hideDetails();
              commands.execute('composer.focus');
              return;
            }
            const list = event.currentTarget.closest('.project-list');
            const navigating =
              !event.metaKey &&
              !event.ctrlKey &&
              !event.altKey &&
              !event.shiftKey &&
              ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key);
            const completing =
              (isMac ? event.metaKey : event.ctrlKey) &&
              event.key === 'Enter' &&
              !event.altKey &&
              !event.shiftKey;
            if (list && (navigating || completing)) {
              event.preventDefault();
              const rows = Array.from(
                list.querySelectorAll<HTMLButtonElement>('.session-row'),
              ).filter((row) => row.getClientRects().length > 0);
              const index = rows.indexOf(event.currentTarget);
              if (navigating) {
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? rows.length - 1
                      : Math.max(
                          0,
                          Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)),
                        );
                const target = rows[next];
                target?.focus({ preventScroll: true });
                target?.scrollIntoView({ block: 'nearest' });
                if (checked === undefined && next !== index) target?.click();
              } else if (!event.repeat) {
                const current = event.currentTarget;
                const next = rows[index + 1] ?? rows[index - 1];
                menu.current?.markDone(() => {
                  if (
                    document.activeElement !== current &&
                    document.activeElement !== document.body
                  )
                    return;
                  if (!next?.isConnected) return;
                  next.focus({ preventScroll: true });
                  next.scrollIntoView({ block: 'nearest' });
                  next.click();
                });
              }
              return;
            }
            if (event.key === 'Escape') hideDetails();
            if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
              event.preventDefault();
              show();
            }
          }}
        >
          {checked !== undefined ? (
            <span className="session-check" aria-hidden="true">
              {checked && <HugeiconsIcon icon={Tick02Icon} size={11} strokeWidth={2.5} />}
            </span>
          ) : project ? (
            <span
              className="session-project"
              role="img"
              aria-label={project.name}
              title={project.name}
            >
              <ProjectIcon name={project.name} icon={project.icon} />
            </span>
          ) : null}
          <span className="truncate-fade">{session.title}</span>
          {worktree && (
            <span
              className="session-kind"
              role="img"
              aria-label={`Worktree ${worktree}`}
              title={`Worktree · ${worktree}`}
            >
              <HugeiconsIcon icon={FolderGit2Icon} size={14} aria-hidden="true" />
            </span>
          )}
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
          {attention ? (
            <span
              className="session-attention"
              data-kind={attention}
              role="img"
              aria-label={attention === 'permission' ? 'Needs approval' : 'Has a question'}
              title={attention === 'permission' ? 'Needs approval' : 'Has a question'}
            >
              {attention === 'permission' ? '!' : '?'}
            </span>
          ) : (
            <>
              {responding && (
                <span
                  className="session-activity"
                  role="img"
                  aria-label="Responding"
                  title="Responding…"
                />
              )}
              {unread && (
                <span
                  className="session-unread"
                  data-responding={responding || undefined}
                  role="img"
                  aria-label={session.unread ? 'Unread thread' : 'Unread reply'}
                  title={session.unread ? 'Unread thread' : 'Unread reply'}
                />
              )}
            </>
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
            <time dateTime={new Date(activityAt(session)).toISOString()}>{age}</time>
          </p>
        </div>
        <SessionActionsMenu
          ref={menu}
          id={id}
          sessionID={session.id}
          title={session.title}
          connected={connected}
          pinned={Boolean(session.pinned)}
          done={isSettled(session)}
          running={responding}
          selection={checked ? selection : undefined}
          onPick={onPick}
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
