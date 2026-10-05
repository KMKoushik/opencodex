import { useId, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowDown01Icon, Copy01Icon, FolderOpenIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { api } from '../../lib/api';
import './open-in-app.css';
import './file-reveal.css';

export function FileReveal({ directory, path }: { directory: string; path: string }) {
  const id = useId();
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);
  const desktop = window.desktop;
  const canReveal = typeof desktop?.revealFile === 'function';
  const label =
    desktop?.platform === 'darwin'
      ? 'Finder'
      : desktop?.platform === 'win32'
        ? 'File Explorer'
        : 'Files';
  const action = useMutation({
    mutationFn: async (kind: 'copy' | 'reveal') => {
      if (kind === 'copy') {
        await navigator.clipboard.writeText(`${directory.replace(/\/$/, '')}/${path}`);
      } else {
        const target = await api.fileLocation(directory, path);
        await desktop!.revealFile(target.path);
      }
      return kind;
    },
    onSuccess: () => dismiss(),
    onError: () => menu.current?.showPopover(),
  });
  function dismiss() {
    menu.current?.hidePopover();
    trigger.current?.focus();
  }
  return (
    <div
      className="open-app wb-file-reveal"
      data-shortcut-boundary=""
      onKeyDown={(event) => {
        // Escape can arrive on the trigger before the native toggle event moves focus.
        if (event.key === 'Escape' && menu.current?.matches(':popover-open')) {
          event.preventDefault();
          event.stopPropagation();
          dismiss();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="open-app-trigger"
        aria-label="File actions"
        data-tooltip="File actions"
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
        <HugeiconsIcon icon={FolderOpenIcon} size={16} aria-hidden="true" />
        <HugeiconsIcon icon={ArrowDown01Icon} size={10} aria-hidden="true" />
      </button>
      <div
        ref={menu}
        id={id}
        className="open-app-menu"
        popover="auto"
        role="menu"
        aria-label={`Actions for ${path}`}
        onToggle={(event) => {
          if (event.target !== event.currentTarget) return;
          const open = event.newState === 'open';
          setExpanded(open);
          if (open)
            menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
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
          if (!items.length) return;
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
          onClick={() => action.mutate('copy')}
        >
          <HugeiconsIcon icon={Copy01Icon} size={16} />
          <span>Copy Path</span>
        </button>
        {canReveal && (
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled={action.isPending}
            onClick={() => action.mutate('reveal')}
          >
            <HugeiconsIcon icon={FolderOpenIcon} size={16} />
            <span>Show in {label}</span>
          </button>
        )}
        {action.isError && (
          <p role="alert" className="open-app-note text-error">
            {action.error.message}
          </p>
        )}
      </div>
      <span className="open-app-status" role="status">
        {action.isSuccess && action.data === 'copy' ? 'File path copied' : ''}
      </span>
    </div>
  );
}
