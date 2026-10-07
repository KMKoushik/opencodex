import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ShellInfo, ShellOutputOutput } from '@opencodex/contracts';
import { Dialog } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/api';
import { formatDuration, useTicker } from '../chat/elapsed';

type Output = ShellOutputOutput['data'];
const LIMIT = 65_536;

export function ShellOutput({
  directory,
  id,
  live,
  onClose,
}: {
  directory: string;
  id: string;
  live: boolean;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const shell = useQuery({
    queryKey: ['workspace', 'shells', directory, id],
    queryFn: ({ signal }) => api.shell(directory, id, signal),
    refetchInterval: live ? false : 5_000,
  });
  const key = ['workspace', 'shells', directory, id, 'output'];
  const output = useQuery({
    queryKey: key,
    queryFn: async ({ signal }): Promise<Output> => {
      const previous = client.getQueryData<Output>(key);
      const next = await api.shellOutput(directory, id, previous?.cursor, signal);
      // Catch up with noisy processes without replaying their entire log into React.
      if (next.size > next.cursor) {
        const tail = await api.shellOutput(directory, id, Math.max(0, next.size - LIMIT), signal);
        return { ...tail, output: tail.output.slice(-LIMIT), truncated: true };
      }
      const text = (previous?.output ?? '') + next.output;
      return {
        ...next,
        output: text.slice(-LIMIT),
        truncated: Boolean(previous?.truncated || next.truncated || text.length > LIMIT),
      };
    },
    enabled: shell.isSuccess,
    refetchInterval: shell.data?.status === 'running' ? 1_000 : false,
    gcTime: 0,
  });
  const stop = useMutation({
    mutationFn: () => api.stopShell(directory, id),
    retry: false,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['workspace', 'shells', directory] });
      onClose();
    },
  });
  const ref = useRef<HTMLPreElement>(null);
  const following = useRef(true);
  useEffect(() => {
    if (following.current && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [output.data]);
  return (
    <Dialog
      title="Shell output"
      className="shell-output-dialog"
      busy={stop.isPending}
      onClose={onClose}
    >
      <div className="shell-output-view ink">
        {shell.isError ? (
          <ShellError message={shell.error.message} retry={() => void shell.refetch()} />
        ) : shell.data ? (
          <>
            <code className="shell-command">{shell.data.command}</code>
            <p className="shell-cwd">{shell.data.cwd}</p>
            <ShellStatus shell={shell.data} />
          </>
        ) : (
          <p role="status">Loading command…</p>
        )}
        {output.isError && (
          <ShellError message={output.error.message} retry={() => void output.refetch()} />
        )}
        {output.data?.truncated && (
          <p className="shell-output-note">Showing recent output. Earlier output is omitted.</p>
        )}
        <pre
          ref={ref}
          className="shell-log"
          tabIndex={0}
          aria-label="Command output"
          onScroll={(event) => {
            const el = event.currentTarget;
            following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
          }}
        >
          {output.data?.output || (output.isPending ? 'Loading output…' : 'No output yet.')}
        </pre>
      </div>
      {stop.isError && (
        <p className="text-error" role="alert">
          {stop.error.message}
        </p>
      )}
      {shell.data?.status === 'running' && (
        <div className="shell-stop-actions">
          {confirm ? (
            <>
              <span>Stop this command?</span>
              <Button
                variant="ghost"
                size="sm"
                disabled={stop.isPending}
                onClick={() => setConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={stop.isPending}
                onClick={() => stop.mutate()}
              >
                {stop.isPending ? 'Stopping…' : 'Stop command'}
              </Button>
            </>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setConfirm(true)}>
              Stop command…
            </Button>
          )}
        </div>
      )}
    </Dialog>
  );
}

function ShellStatus({ shell }: { shell: ShellInfo }) {
  const now = useTicker(shell.status === 'running');
  return (
    <p className="shell-output-note">
      {shell.status === 'running'
        ? 'Running'
        : shell.status === 'killed'
          ? 'Stopped'
          : shell.status === 'timeout'
            ? 'Timed out'
            : `Exited${shell.exit === undefined ? '' : ` with code ${shell.exit}`}`}
      {' · '}
      {formatDuration((shell.time.completed ?? now) - shell.time.started)}
    </p>
  );
}

function ShellError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="shell-tray-error" role="alert">
      <span>{message}</span>
      <Button variant="ghost" size="sm" onClick={retry}>
        Retry
      </Button>
    </div>
  );
}
