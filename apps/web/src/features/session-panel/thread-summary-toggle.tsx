import { lazy, Suspense, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { SlidersHorizontalIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '../../components/ui/button';
import './thread-summary.css';

const ThreadSummary = lazy(() =>
  import('./thread-summary').then((module) => ({ default: module.ThreadSummary })),
);
type Mode = 'overlay' | 'shift' | 'gutter';

export function ThreadSummaryToggle({
  sessionID,
  directory,
  projectName,
  live,
  onOpen,
}: {
  sessionID: string;
  directory: string;
  projectName?: string;
  live: boolean;
  onOpen: (id: string) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>('overlay');
  const [pinned, setPinned] = useState(true);
  const [open, setOpen] = useState(false);
  // Codex's compact summary uses the spare conversation gutter, not a second
  // permanent workspace column. Observe only breakpoint changes, never scroll.
  useLayoutEffect(() => {
    const column = trigger.current!.closest<HTMLElement>('.chat-column')!;
    const update = (width: number) => {
      const next = width < 1096 ? 'overlay' : width < 1536 ? 'shift' : 'gutter';
      setMode(next);
    };
    update(column.clientWidth);
    const observer = new ResizeObserver(([entry]) => update(entry!.contentRect.width));
    observer.observe(column);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const column = trigger.current!.closest<HTMLElement>('.chat-column')!;
    column.dataset.summary = pinned && mode !== 'overlay' ? mode : 'closed';
    if (mode !== 'overlay') popover.current?.hidePopover();
    return () => {
      delete column.dataset.summary;
    };
  }, [mode, pinned]);
  useEffect(() => {
    popover.current?.hidePopover();
  }, [sessionID]);
  const inline = pinned && mode !== 'overlay';
  const content = (overlay: boolean) => (
    <Suspense
      fallback={
        <p className="thread-summary-note" role="status">
          Loading thread summary…
        </p>
      }
    >
      <ThreadSummary
        sessionID={sessionID}
        directory={directory}
        projectName={projectName}
        live={live}
        overlay={overlay}
        onOpen={(id) => {
          popover.current?.hidePopover();
          onOpen(id);
        }}
      />
    </Suspense>
  );
  return (
    <>
      <Button
        ref={trigger}
        variant="ghost"
        size="icon"
        className="thread-summary-toggle"
        aria-label="Thread summary"
        title="Thread summary"
        aria-expanded={inline || open}
        aria-controls={id}
        aria-haspopup={mode === 'overlay' ? 'dialog' : undefined}
        onClick={() => {
          if (mode === 'overlay') popover.current?.togglePopover();
          else setPinned((value) => !value);
        }}
      >
        <HugeiconsIcon icon={SlidersHorizontalIcon} size={17} />
      </Button>
      {inline && (
        <aside
          id={id}
          className="thread-summary-inline scrollbar-on-hover"
          aria-label="Thread summary"
        >
          {content(false)}
        </aside>
      )}
      <div
        ref={popover}
        id={inline ? undefined : id}
        className="thread-summary-popover scrollbar-on-hover"
        popover="auto"
        role="dialog"
        aria-label="Thread summary"
        data-shortcut-boundary=""
        onToggle={(event) => {
          if (event.target === event.currentTarget) setOpen(event.newState === 'open');
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !event.defaultPrevented) {
            // Toggle events (and menu focus) are queued by the browser. Let the
            // topmost nested native popover dismiss before closing its parent.
            if (event.currentTarget.querySelector(':popover-open')) return;
            event.preventDefault();
            event.stopPropagation();
            popover.current?.hidePopover();
            trigger.current?.focus({ preventScroll: true });
          }
        }}
      >
        {open && mode === 'overlay' && content(true)}
      </div>
    </>
  );
}
