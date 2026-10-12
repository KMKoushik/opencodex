import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SideChatPluginStatus } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { SettingsRow } from './settings-layout';

type State = Exclude<SideChatPluginStatus['state'], 'unavailable'>;

/** Install state and actions for one of the single-file plugins OpenCodex adds to OpenCode. */
export function PluginSettings({
  label,
  queryKey,
  directory,
  load,
  install,
  remove,
  descriptions,
}: {
  label: string;
  queryKey: string;
  directory?: string;
  load: (directory: string | undefined, signal: AbortSignal) => Promise<SideChatPluginStatus>;
  install: () => Promise<unknown>;
  remove: () => Promise<unknown>;
  descriptions: Record<State, string>;
}) {
  const client = useQueryClient();
  const status = useQuery({
    queryKey: [queryKey, directory],
    queryFn: ({ signal }) => load(directory, signal),
    // OpenCode reloads its plugins folder on change; follow that briefly, not indefinitely.
    refetchInterval: (query) =>
      query.state.data?.state === 'loading' && query.state.dataUpdateCount < 30 ? 2_000 : false,
  });
  const refresh = () => client.invalidateQueries({ queryKey: [queryKey] });
  const installing = useMutation({ mutationFn: install, onSettled: refresh });
  const removing = useMutation({ mutationFn: remove, onSettled: refresh });
  const data = status.data;
  const busy = installing.isPending || removing.isPending;
  const error = status.error ?? installing.error ?? removing.error;
  const stalled =
    data?.state === 'loading' &&
    (client.getQueryState([queryKey, directory])?.dataUpdateCount ?? 0) >= 30;
  return (
    <SettingsRow
      label={label}
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
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => installing.mutate()}>
          {installing.isPending ? 'Installing…' : data.state === 'missing' ? 'Install' : 'Update'}
        </Button>
      )}
      {data && ['loading', 'active', 'failed', 'outdated'].includes(data.state) && (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => removing.mutate()}>
          {removing.isPending ? 'Removing…' : 'Remove'}
        </Button>
      )}
    </SettingsRow>
  );
}
