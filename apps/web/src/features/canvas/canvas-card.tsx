import { useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DashboardSquare02Icon, MaximizeScreenIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { CanvasFrame } from './canvas-frame';
import { CanvasOpenContext, canvasSourceKey } from './canvas-context';
import './canvas.css';

/** The card a `[Title](canvas:<id>)` line in a reply renders as. */
export function CanvasCard({ id, label }: { id: string; label: string }) {
  const open = useContext(CanvasOpenContext);
  const source = useQuery({
    queryKey: canvasSourceKey(id),
    queryFn: ({ signal }) => api.canvas(id, signal),
  });
  const title = source.data?.title ?? label;

  return (
    <figure className="canvas-card" aria-label={`Canvas: ${title}`}>
      <figcaption className="canvas-card-header">
        <HugeiconsIcon icon={DashboardSquare02Icon} size={14} aria-hidden="true" />
        <span className="canvas-card-title truncate">{title}</span>
        {open && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open canvas in panel"
            onClick={() => open(id)}
          >
            <HugeiconsIcon icon={MaximizeScreenIcon} size={14} />
          </Button>
        )}
      </figcaption>
      <CanvasFrame id={id} mode="inline" title={title} />
    </figure>
  );
}

/** An inline `canvas:` link inside a sentence: opens the canvas instead of navigating. */
export function CanvasLink({ id, children }: { id: string; children: ReactNode }) {
  const open = useContext(CanvasOpenContext);
  return (
    <a
      href={`#canvas-${id}`}
      className="file-link"
      onClick={(event) => {
        event.preventDefault();
        open?.(id);
      }}
    >
      <HugeiconsIcon icon={DashboardSquare02Icon} size={13} />
      {children}
    </a>
  );
}
