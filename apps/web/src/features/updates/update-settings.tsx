import { SettingsGroup, SettingsRow } from '../settings/settings-layout';
import { UpdateControl } from './update-control';
import { useUpdates } from './use-updates';
import { appName } from '../brand/identity';

export function UpdateSettings() {
  const { state } = useUpdates();
  if (!window.desktop) return null;
  const description = !window.desktop.getUpdateState
    ? 'Install the latest desktop release to enable in-app updates.'
    : (state.data?.disabledReason ??
      (state.data
        ? `${state.data.status === 'up-to-date' ? 'You’re up to date. ' : ''}Installed v${state.data.currentVersion}. Updates download only when you choose.`
        : 'Reading update status…'));
  return (
    <SettingsGroup title={appName}>
      <SettingsRow label="Updates" description={description}>
        <UpdateControl />
      </SettingsRow>
    </SettingsGroup>
  );
}
