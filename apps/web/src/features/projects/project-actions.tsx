import { useEffect, useId, useRef, useState } from 'react';
import { MoreHorizontalIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '../../components/ui/button';

export function ProjectActions({
  name,
  actions,
}: {
  name: string;
  actions: { label: string; onSelect: () => void; disabled?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  function show() {
    const rect = trigger.current!.getBoundingClientRect();
    setAbove(innerHeight - rect.bottom < 200 && rect.top > 200);
    setOpen(true);
  }
  return (
    <div
      ref={root}
      className="project-actions"
      data-shortcut-boundary={open ? '' : undefined}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <Button
        ref={trigger}
        variant="ghost"
        size="icon"
        aria-label={`Actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            show();
          }
        }}
      >
        <HugeiconsIcon icon={MoreHorizontalIcon} size={18} />
      </Button>
      {open && (
        <div
          ref={menu}
          id={id}
          role="menu"
          aria-label={`${name} actions`}
          className="project-actions-menu"
          data-above={above}
          onKeyDown={(event) => {
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
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              trigger.current?.focus();
            }
            if (event.key === 'Tab') {
              setOpen(false);
              trigger.current?.focus();
            }
          }}
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              disabled={action.disabled}
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
                action.onSelect();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
