import { useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight01Icon, DashboardSquare02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { api } from '../../lib/api';
import { AppIcon } from '../apps/app-icon';
import { ago } from '../apps/app-time';
import { CanvasOpenContext, canvasSourceKey } from './canvas-context';
import './canvas.css';

/**
 * The card a `[Title](canvas:<id>)` line in a reply renders as: the canvas's icon, title, and
 * when it changed. The page itself opens in the side panel, like a file the agent wrote.
 */
export function CanvasCard({ id, label }: { id: string; label: string }) {
  const open = useContext(CanvasOpenContext);
  const source = useQuery({
    queryKey: canvasSourceKey(id),
    queryFn: ({ signal }) => api.canvas(id, signal),
  });
  const title = source.data?.title ?? label;
  const kind = source.data?.server ? 'App' : 'Canvas';
  const detail = source.error
    ? 'Couldn’t load this canvas'
    : source.data
      ? `${kind} · Updated ${ago(source.data.updated)}`
      : kind;

  return (
    <button
      type="button"
      className="canvas-card"
      disabled={!open}
      aria-label={`Open ${title}`}
      onClick={() => open?.(id)}
    >
      <AppIcon id={id} title={title} icon={source.data?.icon} size={36} />
      <span className="canvas-card-body">
        <span className="canvas-card-title truncate">{title}</span>
        <span className="canvas-card-detail truncate" data-error={source.error ? '' : undefined}>
          {detail}
        </span>
      </span>
      {open && (
        <span className="canvas-card-open" aria-hidden="true">
          <span className="canvas-card-label">Open</span>
          <HugeiconsIcon icon={ArrowUpRight01Icon} size={13} />
        </span>
      )}
    </button>
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
