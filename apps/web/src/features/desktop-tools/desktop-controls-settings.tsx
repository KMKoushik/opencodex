import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DesktopToolsBridge } from '@opencodex/contracts/desktop-tools';
import { Button } from '../../components/ui/button';
import { SettingsGroup, SettingsRow } from '../settings/settings-layout';

export function DesktopControlsSettings() {
  const bridge = window.desktop?.tools;
  if (!bridge) return null;
  return <Controls bridge={bridge} />;
}

function Controls({ bridge }: { bridge: DesktopToolsBridge }) {
  const client = useQueryClient();
  const status = useQuery({
    queryKey: ['desktop-controls'],
    queryFn: () => bridge.status(),
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
  const refresh = () => client.invalidateQueries({ queryKey: ['desktop-controls'] });
  const action = useMutation({
    mutationFn: (operation: () => Promise<void>) => operation(),
    onSettled: refresh,
  });
  const pairing = useMutation({ mutationFn: () => bridge.copyExtensionPairing() });
  const data = status.data;
  const error = status.error ?? action.error ?? pairing.error;
  return (
    <SettingsGroup title="Desktop controls">
      <SettingsRow
        label="Browser and computer use"
        description={
          <span role="status" className={error ? 'text-error' : undefined}>
            {error?.message ??
              data?.message ??
              (data?.paused
                ? 'Paused. Agents cannot control browsers or apps until you resume.'
                : data?.available
                  ? 'Ready while this desktop app is open. Install Browser and computer tools above to give agents access.'
                  : 'Checking desktop controls…')}
          </span>
        }
      >
        <Button
          variant="secondary"
          size="sm"
          disabled={status.isFetching}
          onClick={() => void status.refetch()}
        >
          Check
        </Button>
        {data?.available && (
          <Button
            variant="secondary"
            size="sm"
            disabled={action.isPending}
            onClick={() => action.mutate(() => (data.paused ? bridge.resume() : bridge.stop()))}
          >
            {data.paused ? 'Resume controls' : 'Stop controls'}
          </Button>
        )}
      </SettingsRow>
      {data?.computer.supported && (
        <>
          <SettingsRow
            label="Accessibility"
            description={
              data.computer.accessibility
                ? 'Allowed. Apps can expose elements and receive input.'
                : 'Request access, then enable the app named by macOS. Development launches may be attributed to your terminal or IDE.'
            }
          >
            {!data.computer.accessibility && (
              <Button
                variant="secondary"
                size="sm"
                disabled={action.isPending}
                onClick={() => action.mutate(() => bridge.requestPermissions('accessibility'))}
                aria-label="Request Accessibility access"
              >
                Request access
              </Button>
            )}
            {!data.computer.accessibility && (
              <Button
                variant="ghost"
                size="sm"
                disabled={action.isPending}
                onClick={() => action.mutate(() => bridge.openPermissionSettings('accessibility'))}
              >
                Open Settings
              </Button>
            )}
          </SettingsRow>
          <SettingsRow
            label="Screen recording"
            description={
              data.computer.screenRecording
                ? 'Allowed. Agents can capture app windows.'
                : 'Request access and allow the app named by macOS. Restart that app if prompted, then check again.'
            }
          >
            {!data.computer.screenRecording && (
              <Button
                variant="secondary"
                size="sm"
                disabled={action.isPending}
                onClick={() => action.mutate(() => bridge.requestPermissions('screenRecording'))}
                aria-label="Request Screen Recording access"
              >
                Request access
              </Button>
            )}
            {!data.computer.screenRecording && (
              <Button
                variant="ghost"
                size="sm"
                disabled={action.isPending}
                onClick={() =>
                  action.mutate(() => bridge.openPermissionSettings('screenRecording'))
                }
              >
                Open Settings
              </Button>
            )}
          </SettingsRow>
        </>
      )}
      <SettingsRow
        label="Chrome / Edge extension"
        description={
          data?.extension.connected
            ? `Connected${data.extension.name ? ` · ${data.extension.name}` : ''}. Existing browser tabs and sign-ins are available.`
            : 'Load the bundled OpenCodex extension, then paste the pairing information into its Connect popup. Pairing lasts for this app launch.'
        }
      >
        <Button
          variant="ghost"
          size="sm"
          disabled={action.isPending}
          onClick={() => action.mutate(() => bridge.showExtensionFolder())}
        >
          Extension folder
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!data?.available || pairing.isPending}
          onClick={() => pairing.mutate()}
        >
          {pairing.isSuccess ? 'Pairing copied' : 'Copy pairing'}
        </Button>
        {data?.extension.connected && (
          <Button
            variant="ghost"
            size="sm"
            disabled={action.isPending}
            onClick={() => action.mutate(() => bridge.disconnectExtension())}
          >
            Disconnect
          </Button>
        )}
      </SettingsRow>
    </SettingsGroup>
  );
}
