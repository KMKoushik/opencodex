import { useCallback, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Cancel01Icon, SlidersHorizontalIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '../../components/ui/button';
import { SessionPanel } from './session-panel';
import './session-panel.css';

export function SessionPanelToggle({
  sessionID,
  projectName,
  live,
  column,
  workspaceOpen,
  onOpen,
}: {
  sessionID: string;
  projectName?: string;
  live: boolean;
  column: RefObject<HTMLDivElement | null>;
  workspaceOpen: boolean;
  onOpen: (id: string) => void;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [wide, setWide] = useState(false);
  const [cardVisible, setCardVisible] = useState(true);
  const inline = wide && !workspaceOpen;
  useLayoutEffect(() => {
    const element = column.current;
    if (!element) return;
    // Fit the card into the existing gutter of the centered 768px transcript.
    // Never resize or shift the chat when the card appears or is dismissed.
    // Publish breakpoint crossings only, never streaming or scroll updates.
    const measure = (width: number) => {
      const available = Math.floor((width - 768) / 2) - 24;
      // Adapt to the real gutter instead of requiring the maximum card width.
      // Resizing changes geometry directly; React sees only mode crossings.
      element.style.setProperty(
        '--session-card-width',
        `${Math.min(288, Math.max(240, available))}px`,
      );
      setWide(available >= 240);
    };
    measure(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => measure(entry!.contentRect.width));
    observer.observe(element);
    return () => {
      observer.disconnect();
      element.style.removeProperty('--session-card-width');
    };
  }, [column]);
  useLayoutEffect(() => {
    // A workspace panel or layout transition must not leave a floating card
    // covering the newly available chat area. The same content stays mounted.
    if (panel.current?.matches(':popover-open')) panel.current.hidePopover();
  }, [inline, workspaceOpen]);
  function dismiss() {
    if (inline) setCardVisible(false);
    else panel.current?.hidePopover();
    trigger.current?.focus({ preventScroll: true });
  }
  const openWorkspace = useCallback(
    (id: string) => {
      if (panel.current?.matches(':popover-open')) panel.current.hidePopover();
      onOpen(id);
    },
    [onOpen],
  );
  return (
    <>
      <Button
        ref={trigger}
        variant="ghost"
        size="icon"
        className="session-panel-toggle"
        aria-label="Session details"
        title="Session details"
        aria-expanded={inline ? cardVisible : open}
        aria-controls={id}
        popoverTarget={inline ? undefined : id}
        onClick={inline ? () => setCardVisible((visible) => !visible) : undefined}
      >
        <HugeiconsIcon icon={SlidersHorizontalIcon} size={17} />
      </Button>
      <div
        ref={panel}
        id={id}
        popover={inline ? undefined : 'auto'}
        role={inline ? 'region' : 'dialog'}
        hidden={inline && !cardVisible}
        data-layout={inline ? 'inline' : 'popover'}
        aria-label="Session details"
        className="session-panel scrollbar-on-hover"
        data-shortcut-boundary=""
        onToggle={(event) => {
          if (event.target !== event.currentTarget) return;
          const open = event.newState === 'open';
          setOpen(open);
          if (open && !inline) close.current?.focus({ preventScroll: true });
        }}
        onKeyDown={(event) => {
          // The wide card is pinned, not a dismissible overlay. Only its explicit
          // close/toggle controls or opening the workspace should hide it.
          if (inline || event.key !== 'Escape' || event.nativeEvent.isComposing) return;
          event.preventDefault();
          event.stopPropagation();
          dismiss();
        }}
      >
        <div className="session-panel-heading">
          <h2>Session</h2>
          <Button
            ref={close}
            variant="ghost"
            size="icon"
            aria-label="Close session details"
            onClick={dismiss}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={16} />
          </Button>
        </div>
        <SessionPanel
          sessionID={sessionID}
          projectName={projectName}
          live={live}
          onOpen={openWorkspace}
        />
      </div>
    </>
  );
}
