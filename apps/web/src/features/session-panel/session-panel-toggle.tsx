import { lazy, Suspense, useId, useRef, useState } from 'react';
import { Cancel01Icon, MoreHorizontalIcon } from '@hugeicons/core-free-icons';
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
}: {
  sessionID: string;
  projectName?: string;
  live: boolean;
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
        <HugeiconsIcon icon={MoreHorizontalIcon} size={16} />
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
              <SessionPanel sessionID={sessionID} projectName={projectName} live={live} />
            </Suspense>
          </>
        )}
      </div>
    </>
  );
}
