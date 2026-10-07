import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DesktopToolsPluginStatus } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/api';
import { SettingsRow } from './settings-layout';

const descriptions: Record<DesktopToolsPluginStatus['state'], string> = {
  unavailable: '',
  missing: 'Install browser and macOS computer-control tools for OpenCode.',
  outdated: 'Update the tools to match this version of OpenCodex.',
  loading: 'Installed. Waiting for OpenCode to load the tools…',
  active: 'Active. Chats can use browser and computer tools when requested.',
  failed: 'OpenCode couldn’t load the tools.',
};

export function DesktopToolsSettings({ directory }: { directory?: string }) {
  const client = useQueryClient();
  const status = useQuery({
    queryKey: ['desktop-tools-plugin', directory],
    queryFn: ({ signal }) => api.desktopToolsPlugin(directory, signal),
    refetchInterval: (query) =>
      query.state.data?.state === 'loading' && query.state.dataUpdateCount < 30 ? 2_000 : false,
  });
  const refresh = () => client.invalidateQueries({ queryKey: ['desktop-tools-plugin'] });
  const install = useMutation({ mutationFn: api.installDesktopToolsPlugin, onSettled: refresh });
  const remove = useMutation({ mutationFn: api.removeDesktopToolsPlugin, onSettled: refresh });
  const data = status.data;
  const busy = install.isPending || remove.isPending;
  const error = status.error ?? install.error ?? remove.error;
  const stalled =
    data?.state === 'loading' &&
    (client.getQueryState(['desktop-tools-plugin', directory])?.dataUpdateCount ?? 0) >= 30;
  return (
    <SettingsRow
      label="Browser and computer tools"
      description={
        <span
          role="status"
          className={error || data?.state === 'failed' ? 'text-error' : undefined}
        >
          {error?.message ??
            (!data
              ? 'Checking…'
              : [descriptions[data.state], data.message].filter(Boolean).join(' '))}{' '}
          Requires OpenCodex Desktop running on this machine. Chrome also needs its extension;
          computer control is macOS-only.
          {stalled && ' If it doesn’t load, restart OpenCode with opencode service restart.'}
        </span>
      }
    >
      {data && (data.state === 'missing' || data.state === 'outdated') && (
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => install.mutate()}>
          {install.isPending ? 'Installing…' : data.state === 'missing' ? 'Install' : 'Update'}
        </Button>
      )}
      {data && ['loading', 'active', 'failed', 'outdated'].includes(data.state) && (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => remove.mutate()}>
          {remove.isPending ? 'Removing…' : 'Remove'}
        </Button>
      )}
    </SettingsRow>
  );
}
