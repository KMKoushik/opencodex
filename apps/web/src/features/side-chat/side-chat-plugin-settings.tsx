import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SideChatPluginStatus } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/api';
import { SettingsRow } from '../settings/settings-layout';

const descriptions: Record<SideChatPluginStatus['state'], string> = {
  unavailable: '',
  missing:
    'Side chats start from a snapshot of the main chat. Install a small read-only OpenCode plugin so they can also check its latest progress. It’s hidden in all other sessions.',
  outdated: 'An older version is installed. Update it to match this version of OpenCodex.',
  loading: 'Installed. Waiting for OpenCode to load it…',
  active: 'Active. Side chats can read the main chat’s latest progress.',
  failed: 'OpenCode couldn’t load the plugin.',
};

export function SideChatPluginSettings({ directory }: { directory?: string }) {
  const client = useQueryClient();
  const status = useQuery({
    queryKey: ['side-chat-plugin', directory],
    queryFn: ({ signal }) => api.sideChatPlugin(directory, signal),
    // OpenCode reloads its plugins folder on change; follow that briefly, not indefinitely.
    refetchInterval: (query) =>
      query.state.data?.state === 'loading' && query.state.dataUpdateCount < 30 ? 2_000 : false,
  });
  const refresh = () => client.invalidateQueries({ queryKey: ['side-chat-plugin'] });
  const install = useMutation({ mutationFn: api.installSideChatPlugin, onSettled: refresh });
  const remove = useMutation({ mutationFn: api.removeSideChatPlugin, onSettled: refresh });
  const data = status.data;
  const busy = install.isPending || remove.isPending;
  const error = status.error ?? install.error ?? remove.error;
  const stalled =
    data?.state === 'loading' &&
    (client.getQueryState(['side-chat-plugin', directory])?.dataUpdateCount ?? 0) >= 30;
  return (
    <SettingsRow
      label="Side chat live context"
      description={
        <span
          role="status"
          className={error || data?.state === 'failed' ? 'text-error' : undefined}
        >
          {error
            ? error.message
            : !data
              ? 'Checking…'
              : data.state === 'unavailable'
                ? data.message
                : [
                    descriptions[data.state],
                    data.message,
                    stalled
                      ? 'If it doesn’t load, restart OpenCode with opencode service restart.'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
          {data?.path && (
            <>
              {' '}
              <code>{data.path}</code>
            </>
          )}
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
