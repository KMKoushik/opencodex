import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from 'zustand';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Add01Icon,
  Cancel01Icon,
  DashboardSquare02Icon,
  Delete02Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { CanvasInfo } from '@opencodex/contracts/canvas';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import type { PanelContext } from '../workbench/panels';
import { useWorkbenchStore, workbenchKey } from '../workbench/workbench-context';
import { defaultCanvasTabs, type CanvasTabs } from '../workbench/workbench-store';
import { CanvasFrame } from './canvas-frame';
import './canvas.css';

const updated = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** Open canvases as tabs, like the browser panel; the + tab lists this chat's canvases. */
export function CanvasPanel({ sessionID, directory, active, headerElement }: PanelContext) {
  const store = useWorkbenchStore();
  const key = workbenchKey(sessionID, directory);
  const state = useStore(store, (value) => value.entries[key]?.canvas ?? defaultCanvasTabs);
  const update = (change: (state: CanvasTabs) => CanvasTabs) =>
    store.getState().canvas(key, change);
  const list = useQuery({
    queryKey: ['canvases'],
    queryFn: ({ signal }) => api.canvases(signal),
    enabled: active,
  });
  const titles = new Map(list.data?.map((canvas) => [canvas.id, canvas.title]));
  const selected = state.tabs.includes(state.selected) ? state.selected : '';
  const open = (id: string) => store.getState().openCanvas(key, id);
  const close = (id: string) =>
    update((current) => {
      const index = current.tabs.indexOf(id);
      const tabs = current.tabs.filter((tab) => tab !== id);
      return {
        tabs,
        selected:
          current.selected === id
            ? (tabs[Math.min(index, tabs.length - 1)] ?? '')
            : current.selected,
      };
    });

  return (
    <div className="canvas-panel">
      {active &&
        headerElement &&
        createPortal(
          <>
            <div className="wb-document-tabs canvas-tabs" role="tablist" aria-label="Canvases">
              {state.tabs.map((id, index) => (
                <div className="wb-document-tab" key={id} data-active={id === selected}>
                  <button
                    role="tab"
                    id={`canvas-tab-${id}`}
                    aria-selected={id === selected}
                    tabIndex={id === selected ? 0 : -1}
                    title={titles.get(id) ?? id}
                    onClick={() => update((current) => ({ ...current, selected: id }))}
                    onKeyDown={(event) => {
                      const next =
                        event.key === 'ArrowRight'
                          ? (index + 1) % state.tabs.length
                          : event.key === 'ArrowLeft'
                            ? (index + state.tabs.length - 1) % state.tabs.length
                            : undefined;
                      if (next === undefined) return;
                      event.preventDefault();
                      const target = state.tabs[next]!;
                      update((current) => ({ ...current, selected: target }));
                      document.getElementById(`canvas-tab-${target}`)?.focus();
                    }}
                  >
                    <HugeiconsIcon icon={DashboardSquare02Icon} size={14} />
                    <span>{titles.get(id) ?? 'Canvas'}</span>
                  </button>
                  <button
                    aria-label={`Close ${titles.get(id) ?? 'canvas'}`}
                    title="Close tab"
                    onClick={() => close(id)}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={12} />
                  </button>
                </div>
              ))}
            </div>
            <Button
              className="canvas-add"
              variant="ghost"
              size="icon"
              aria-label="Canvases in this chat"
              aria-pressed={!selected}
              onClick={() => update((current) => ({ ...current, selected: '' }))}
            >
              <HugeiconsIcon icon={Add01Icon} size={16} />
            </Button>
          </>,
          headerElement,
        )}
      {!active ? null : selected ? (
        <CanvasFrame
          key={selected}
          id={selected}
          mode="panel"
          title={titles.get(selected) ?? 'Canvas'}
        />
      ) : (
        <CanvasList
          canvases={list.data}
          error={list.error}
          sessionID={sessionID}
          onOpen={open}
          onDeleted={close}
        />
      )}
    </div>
  );
}

function CanvasList({
  canvases,
  error,
  sessionID,
  onOpen,
  onDeleted,
}: {
  canvases?: CanvasInfo[];
  error: Error | null;
  sessionID: string;
  onOpen: (id: string) => void;
  onDeleted: (id: string) => void;
}) {
  const client = useQueryClient();
  const [deleting, setDeleting] = useState<CanvasInfo>();
  const cancel = useRef<HTMLButtonElement>(null);
  const remove = useMutation({
    mutationFn: api.deleteCanvas,
    onSuccess: (_, id) => {
      onDeleted(id);
      setDeleting(undefined);
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['canvases'] }),
  });
  if (error)
    return (
      <p className="wb-empty text-error" role="alert">
        {error.message}
      </p>
    );
  if (!canvases)
    return (
      <p className="wb-empty" role="status">
        Loading canvases…
      </p>
    );
  // Like the other panels, this one shows only the current chat's canvases, newest first.
  const own = canvases.filter((canvas) => canvas.sessionID === sessionID);
  if (!own.length)
    return (
      <div className="wb-empty">
        <HugeiconsIcon icon={DashboardSquare02Icon} size={28} />
        <h3>No canvases in this chat</h3>
        <p>Ask the agent for a dashboard, chart, diagram, or report and it can make one.</p>
      </div>
    );
  return (
    <div className="canvas-list scrollbar-on-hover">
      <ul aria-label="Canvases in this chat">
        {own.map((canvas) => (
          <li key={canvas.id} className="canvas-list-item">
            <button type="button" className="canvas-list-open" onClick={() => onOpen(canvas.id)}>
              <HugeiconsIcon icon={DashboardSquare02Icon} size={16} />
              <span className="canvas-list-text">
                <span className="canvas-list-title truncate">{canvas.title}</span>
                <span className="canvas-list-meta">{updated.format(canvas.updated)}</span>
              </span>
            </button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${canvas.title}`}
              onClick={() => setDeleting(canvas)}
            >
              <HugeiconsIcon icon={Delete02Icon} size={15} />
            </Button>
          </li>
        ))}
      </ul>
      {deleting && (
        <Dialog
          title="Delete canvas?"
          busy={remove.isPending}
          onClose={() => setDeleting(undefined)}
          initialFocus={cancel}
        >
          <p>
            “{deleting.title}” and its data files will be deleted. Links to it in chats will stop
            working.
          </p>
          {remove.error && (
            <p className="text-error" role="alert">
              {remove.error.message}
            </p>
          )}
          <div className="dialog-actions">
            <Button ref={cancel} variant="secondary" onClick={() => setDeleting(undefined)}>
              Cancel
            </Button>
            <Button disabled={remove.isPending} onClick={() => remove.mutate(deleting.id)}>
              {remove.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
