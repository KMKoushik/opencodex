import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/api';
import { SettingsRow } from './settings-layout';

export function ClaudeCodeSettings({ directory }: { directory?: string }) {
  const client = useQueryClient();
  const status = useQuery({
    queryKey: ['claude-code', directory],
    queryFn: ({ signal }) => api.claudeCode(directory, signal),
    refetchInterval: (query) =>
      query.state.data?.state === 'loading' && query.state.dataUpdateCount < 30 ? 2_000 : false,
  });
  const refresh = () => client.resetQueries({ queryKey: ['claude-code'] });
  const install = useMutation({ mutationFn: api.installClaudeCode, onSettled: refresh });
  const remove = useMutation({ mutationFn: api.removeClaudeCode, onSettled: refresh });
  const data = status.data;
  const busy = install.isPending || remove.isPending;
  const error = status.error ?? install.error ?? remove.error;
  const message =
    data?.message ??
    (data?.state === 'active'
      ? 'Provider loaded. Choose a Claude Code model in the composer. Authentication and usage follow your Claude CLI login.'
      : data?.state === 'outdated'
        ? 'Update the installed Claude Code bridge to the version included with this app.'
        : data?.state === 'loading'
          ? 'Waiting for OpenCode to install and load the plugin. Check again if it takes more than a minute.'
          : 'Use your installed Claude Code through an OpenCode provider plugin. First run claude auth login in your terminal. This enables it across your OpenCode projects.');
  return (
    <SettingsRow
      label="Claude Code · Experimental"
      description={
        <span
          role="status"
          className={error || data?.state === 'failed' ? 'text-error' : undefined}
        >
          {error?.message ?? (data ? message : 'Checking…')}
        </span>
      }
    >
      {data && ['missing', 'outdated'].includes(data.state) && (
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => install.mutate()}>
          {install.isPending ? 'Installing…' : data.state === 'outdated' ? 'Update' : 'Enable'}
        </Button>
      )}
      {data && ['loading', 'failed', 'external'].includes(data.state) && (
        <Button
          variant="secondary"
          size="sm"
          disabled={busy || status.isFetching}
          onClick={() => void status.refetch()}
        >
          Check
        </Button>
      )}
      {data?.removable && (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => remove.mutate()}>
          {remove.isPending ? 'Removing…' : 'Remove'}
        </Button>
      )}
    </SettingsRow>
  );
}
