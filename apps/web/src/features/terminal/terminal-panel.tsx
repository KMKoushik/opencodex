import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Add01Icon, Cancel01Icon, CommandLineIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { Pty } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/api';
import type { PanelContext } from '../workbench/panels';
import { TerminalView } from './terminal-view';
import './terminal.css';

export function TerminalPanel({
  directory,
  active,
  live,
  headerElement,
}: Pick<PanelContext, 'directory' | 'active' | 'live' | 'headerElement'>) {
  const client = useQueryClient();
  const key = ['workspace', 'terminals', directory];
  const [selected, setSelected] = useState<string>();
  const terminals = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => api.terminals(directory, signal),
    enabled: active,
    refetchInterval: active && !live ? 5000 : false,
  });
  const items = terminals.data ?? [];
  const current = items.find((item) => item.id === selected) ?? items[0];
  const create = useMutation({
    mutationKey: [...key, 'create'],
    mutationFn: () => api.createTerminal(directory),
    onSuccess: (terminal) => {
      client.setQueryData<Pty[]>(key, (previous = []) => [
        ...previous.filter((item) => item.id !== terminal.id),
        terminal,
      ]);
      setSelected(terminal.id);
      void client.invalidateQueries({ queryKey: key });
    },
  });
  const autoCreated = useRef(false);
  const { mutate: createTerminal } = create;
  useEffect(() => {
    if (!active) {
      autoCreated.current = false;
      return;
    }
    if (!terminals.isSuccess || terminals.isFetching || autoCreated.current) return;
    autoCreated.current = true;
    if (!items.length) createTerminal();
  }, [active, terminals.isSuccess, terminals.isFetching, items.length, createTerminal]);
  const remove = useMutation({
    mutationFn: (id: string) => api.removeTerminal(directory, id),
    onSuccess: (_, id) => {
      const index = items.findIndex((item) => item.id === id);
      if (current?.id === id) setSelected(items[index + 1]?.id ?? items[index - 1]?.id);
      client.setQueryData<Pty[]>(key, (previous = []) => previous.filter((item) => item.id !== id));
      void client.invalidateQueries({ queryKey: key });
    },
  });
  const error = create.error ?? remove.error ?? terminals.error;
  return (
    <div className="terminal-panel">
      {active &&
        headerElement &&
        createPortal(
          <>
            <div className="wb-document-tabs terminal-tabs" role="tablist" aria-label="Terminals">
              {items.map((terminal, index) => (
                <div
                  className="wb-document-tab"
                  key={terminal.id}
                  data-active={current?.id === terminal.id}
                >
                  <button
                    role="tab"
                    id={`terminal-tab-${terminal.id}`}
                    aria-controls={`terminal-${terminal.id}`}
                    aria-selected={current?.id === terminal.id}
                    tabIndex={current?.id === terminal.id ? 0 : -1}
                    onClick={() => setSelected(terminal.id)}
                    onKeyDown={(event) => {
                      const index = items.indexOf(terminal);
                      const next =
                        event.key === 'ArrowRight'
                          ? (index + 1) % items.length
                          : event.key === 'ArrowLeft'
                            ? (index + items.length - 1) % items.length
                            : event.key === 'Home'
                              ? 0
                              : event.key === 'End'
                                ? items.length - 1
                                : undefined;
                      if (next === undefined) return;
                      event.preventDefault();
                      setSelected(items[next]!.id);
                      document.getElementById(`terminal-tab-${items[next]!.id}`)?.focus();
                    }}
                  >
                    <HugeiconsIcon icon={CommandLineIcon} size={14} />
                    <span>Terminal {index + 1}</span>
                    {terminal.status === 'exited' && (
                      <span className="terminal-exited">Exited</span>
                    )}
                  </button>
                  <button
                    aria-label={`Close Terminal ${index + 1}`}
                    title="Close terminal and end shell"
                    disabled={remove.isPending && remove.variables === terminal.id}
                    onClick={() => remove.mutate(terminal.id)}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={12} />
                  </button>
                </div>
              ))}
            </div>
            <Button
              className="terminal-add"
              variant="ghost"
              size="icon"
              aria-label="New terminal"
              title="New terminal"
              disabled={create.isPending}
              onClick={() => create.mutate()}
            >
              <HugeiconsIcon icon={Add01Icon} size={16} />
            </Button>
          </>,
          headerElement,
        )}
      {error && (
        <div className="wb-notice text-error" role="alert">
          {error.message}{' '}
          {terminals.isError && (
            <Button variant="ghost" size="sm" onClick={() => void terminals.refetch()}>
              Retry
            </Button>
          )}
        </div>
      )}
      {!current && (
        <div className="wb-empty">
          <HugeiconsIcon icon={CommandLineIcon} size={28} />
          <h3>{terminals.isPending ? 'Loading terminals…' : 'Your project terminal'}</h3>
          <p>Open a shell in this project. Add tabs to run commands side by side.</p>
          <Button
            variant="secondary"
            disabled={create.isPending || terminals.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'Opening…' : 'New terminal'}
          </Button>
        </div>
      )}
      {current && active && (
        <div
          className="terminal-tabpanel"
          role="tabpanel"
          id={`terminal-${current.id}`}
          aria-labelledby={`terminal-tab-${current.id}`}
        >
          <TerminalView
            key={current.id}
            directory={directory}
            terminal={current}
            onDisconnect={() => void client.invalidateQueries({ queryKey: key })}
          />
        </div>
      )}
    </div>
  );
}
