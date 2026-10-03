import { Suspense, useEffect, useRef, useState } from 'react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '../../components/ui/button';
import type { PanelDefinition } from './panels';
import type { FileRequest } from './file-link';
import './workbench.css';

export function WorkbenchPanel({
  directory,
  sessionID,
  live,
  open,
  panel,
  fileRequest,
  onClose,
  onSelectPanel,
}: {
  directory: string;
  sessionID: string;
  live: boolean;
  open: boolean;
  panel: PanelDefinition;
  fileRequest?: FileRequest;
  onClose: () => void;
  onSelectPanel?: (id: string) => void;
}) {
  const [width, setWidth] = useState(820);
  const [headerElement, setHeaderElement] = useState<HTMLDivElement | null>(null);
  const [visited, setVisited] = useState([panel]);
  const stateKey = panel.stateKey ?? panel.id;
  if (!visited.includes(panel)) {
    setVisited([...visited.filter((entry) => (entry.stateKey ?? entry.id) !== stateKey), panel]);
  }
  const ref = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const limitWidth = (value: number) =>
    Math.max(340, Math.min(value, (ref.current?.parentElement?.clientWidth ?? 1000) - 320));
  const resize = (value: number) => {
    if (ref.current) ref.current.style.width = `${limitWidth(value)}px`;
  };
  return (
    <aside
      ref={ref}
      id="workbench"
      // Code sits on ink: themes with a review panel palette render this subtree dark.
      className="workbench ink scrollbar-on-hover"
      hidden={!open}
      aria-label="Workspace panel"
      style={{ width }}
      data-shortcut-boundary=""
      onKeyDown={(event) => {
        if (
          event.key === 'Escape' &&
          !event.defaultPrevented &&
          !(event.target instanceof HTMLTextAreaElement) &&
          !(event.target as HTMLElement).closest('.cm-editor')
        ) {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div
        className="wb-resize"
        role="separator"
        aria-label="Resize workspace panel"
        aria-orientation="vertical"
        aria-valuemin={340}
        aria-valuemax={1200}
        aria-valuenow={width}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            setWidth(limitWidth(width + (event.key === 'ArrowLeft' ? 32 : -32)));
          }
        }}
        onPointerDown={(event) => {
          drag.current = { x: event.clientX, width: ref.current!.getBoundingClientRect().width };
          event.currentTarget.setPointerCapture(event.pointerId);
          ref.current!.dataset.resizing = 'true';
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start) return;
          cancelAnimationFrame(frame.current);
          frame.current = requestAnimationFrame(() =>
            resize(start.width + start.x - event.clientX),
          );
        }}
        onLostPointerCapture={() => {
          cancelAnimationFrame(frame.current);
          drag.current = null;
          setWidth(ref.current!.getBoundingClientRect().width);
          delete ref.current!.dataset.resizing;
        }}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
      />
      <header className="wb-header">
        <div className="wb-header-content" ref={setHeaderElement} />
        <span className="wb-heading">{panel.label}</span>
        <Button variant="ghost" size="icon" aria-label="Close workspace panel" onClick={onClose}>
          <HugeiconsIcon icon={Cancel01Icon} size={16} />
        </Button>
      </header>
      <div className="wb-content" id="wb-content" role="region" aria-label={panel.label}>
        {visited.map((entry) => (
          <div
            className="wb-surface"
            key={entry.stateKey ?? entry.id}
            hidden={entry.id !== panel.id}
          >
            <Suspense
              fallback={
                <p className="wb-empty" role="status">
                  Loading {entry.label.toLowerCase()}…
                </p>
              }
            >
              {entry.render({
                directory,
                sessionID,
                live,
                active: open && entry.id === panel.id,
                headerElement,
                selectView: onSelectPanel,
                fileRequest,
              })}
            </Suspense>
          </div>
        ))}
      </div>
    </aside>
  );
}
