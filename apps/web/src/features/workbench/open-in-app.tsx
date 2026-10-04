import { useId, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Copy01Icon, Folder01Icon, FolderOpenIcon, Tick02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { OpenApp, OpenAppID } from '@opencodex/contracts/desktop';
import { readStorage, writeStorage } from '../../lib/storage';
import './open-in-app.css';

export function OpenInApp({ directory, active }: { directory: string; active: boolean }) {
  const id = useId();
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [selectedID, setSelectedID] = useState(() => readStorage('openInApp'));
  const desktop = window.desktop;
  const canOpenApps = Boolean(
    desktop &&
    typeof desktop.listOpenApps === 'function' &&
    typeof desktop.openInApp === 'function',
  );
  const apps = useQuery({
    queryKey: ['desktop', 'open-apps'],
    queryFn: () => desktop!.listOpenApps(),
    enabled: canOpenApps && active,
    staleTime: 5 * 60_000,
  });
  const selected = apps.data?.find((entry) => entry.id === selectedID) ?? apps.data?.[0];
  const action = useMutation({
    mutationFn: async (request: { kind: 'copy' } | { kind: 'open'; id: OpenAppID }) => {
      if (request.kind === 'copy') await navigator.clipboard.writeText(directory);
      else {
        if (!desktop || !canOpenApps) throw new Error('Restart the desktop app to enable Open in…');
        await desktop.openInApp(directory, request.id);
      }
      return request;
    },
    onSuccess: (request) => {
      if (request.kind === 'open') {
        setSelectedID(request.id);
        writeStorage('openInApp', request.id);
      }
      menu.current?.hidePopover();
    },
    onError: () => menu.current?.showPopover(),
  });
  function dismiss() {
    menu.current?.hidePopover();
    trigger.current?.focus();
  }
  return (
    <div className="open-app" data-shortcut-boundary="">
      <button
        ref={trigger}
        type="button"
        className="open-app-trigger"
        aria-label="Open in…"
        data-tooltip="Open in…"
        aria-haspopup="menu"
        aria-expanded={expanded}
        aria-controls={id}
        popoverTarget={id}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            menu.current?.showPopover();
          }
        }}
      >
        {selected ? (
          <AppIcon key={selected.id} app={selected} />
        ) : (
          <HugeiconsIcon icon={FolderOpenIcon} size={18} />
        )}
      </button>
      <div
        ref={menu}
        id={id}
        className="open-app-menu scrollbar-on-hover"
        popover="auto"
        role="menu"
        aria-label="Open project in application"
        onToggle={(event) => {
          if (event.target !== event.currentTarget) return;
          const open = event.newState === 'open';
          setExpanded(open);
          if (open) menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Escape' || event.key === 'Tab') {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
            }
            dismiss();
            return;
          }
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const items = [
            ...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
          ];
          const index = items.findIndex((item) => item === document.activeElement);
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? items.length - 1
                : (index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
          items[next]?.focus();
        }}
      >
        <button
          type="button"
          role="menuitem"
          tabIndex={-1}
          disabled={action.isPending}
          onClick={() => action.mutate({ kind: 'copy' })}
        >
          <HugeiconsIcon icon={Copy01Icon} size={16} />
          <span>Copy Path</span>
        </button>
        <div role="separator" />
        {apps.data?.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="menuitemradio"
            tabIndex={-1}
            aria-checked={selected?.id === entry.id}
            disabled={action.isPending}
            onClick={() => action.mutate({ kind: 'open', id: entry.id })}
          >
            <AppIcon app={entry} />
            <span>{entry.label}</span>
            {selected?.id === entry.id && (
              <HugeiconsIcon icon={Tick02Icon} size={16} className="open-app-check" />
            )}
          </button>
        ))}
        {!desktop && (
          <p className="open-app-note">Open in installed apps is available on desktop.</p>
        )}
        {desktop && !canOpenApps && (
          <p className="open-app-note">Restart the desktop app to enable Open in…</p>
        )}
        {canOpenApps && apps.isPending && (
          <p className="open-app-note" role="status">
            Finding installed apps…
          </p>
        )}
        {apps.isError && (
          <div className="open-app-note" role="alert">
            <p>{apps.error.message}</p>
            <button type="button" role="menuitem" onClick={() => void apps.refetch()}>
              Retry
            </button>
          </div>
        )}
        {action.isError && (
          <p className="open-app-note text-error" role="alert">
            {action.error.message}
          </p>
        )}
      </div>
      <span className="open-app-status" role="status">
        {action.isSuccess && action.data.kind === 'copy' ? 'Project path copied' : ''}
      </span>
    </div>
  );
}

function AppIcon({ app }: { app: OpenApp }) {
  const [failed, setFailed] = useState(false);
  return app.icon && !failed ? (
    <img src={app.icon} alt="" width={16} height={16} onError={() => setFailed(true)} />
  ) : (
    <HugeiconsIcon icon={Folder01Icon} size={16} />
  );
}
