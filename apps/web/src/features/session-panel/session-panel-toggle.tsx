import { lazy, Suspense, useId, useRef, useState } from 'react';
import { Cancel01Icon, SlidersHorizontalIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '../../components/ui/button';
import './session-panel.css';

const SessionPanel = lazy(() =>
  import('./session-panel').then((module) => ({ default: module.SessionPanel })),
);

export function SessionPanelToggle({
  sessionID,
  projectName,
  live,
  onOpen,
}: {
  sessionID: string;
  projectName?: string;
  live: boolean;
  onOpen: (id: string) => void;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        ref={trigger}
        variant="ghost"
        size="icon"
        className="session-panel-toggle"
        aria-label="Session details"
        title="Session details"
        aria-expanded={open}
        aria-controls={id}
        popoverTarget={id}
      >
        <HugeiconsIcon icon={SlidersHorizontalIcon} size={17} />
      </Button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        role="dialog"
        aria-label="Session details"
        className="session-panel scrollbar-on-hover"
        data-shortcut-boundary=""
        onToggle={(event) => {
          if (event.target === event.currentTarget) setOpen(event.newState === 'open');
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || event.nativeEvent.isComposing) return;
          event.preventDefault();
          event.stopPropagation();
          panel.current?.hidePopover();
          trigger.current?.focus({ preventScroll: true });
        }}
      >
        {open && (
          <>
            <div className="session-panel-heading">
              <h2>Session</h2>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close session details"
                onClick={() => {
                  panel.current?.hidePopover();
                  trigger.current?.focus();
                }}
                autoFocus
              >
                <HugeiconsIcon icon={Cancel01Icon} size={16} />
              </Button>
            </div>
            <Suspense
              fallback={
                <p className="session-panel-note" role="status">
                  Loading session details…
                </p>
              }
            >
              <SessionPanel
                sessionID={sessionID}
                projectName={projectName}
                live={live}
                onOpen={(id) => {
                  panel.current?.hidePopover();
                  onOpen(id);
                }}
              />
            </Suspense>
          </>
        )}
      </div>
    </>
  );
}
