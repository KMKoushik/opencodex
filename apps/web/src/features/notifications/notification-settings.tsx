import { useState } from 'react';
import { SegmentedControl } from '../../components/ui/segmented-control';
import { SettingsGroup, SettingsRow } from '../settings/settings-layout';
import {
  notificationsSupported,
  useNotificationSettings,
  type NotificationKind,
} from './notifications';

const rows: { kind: NotificationKind; label: string; description: string }[] = [
  { kind: 'reply', label: 'Finished replies', description: 'When a chat finishes or fails.' },
  { kind: 'question', label: 'Questions', description: 'When a chat asks you a question.' },
  {
    kind: 'permission',
    label: 'Permission requests',
    description: 'When a chat is blocked on your approval.',
  },
];

export function NotificationSettings() {
  const { settings, update } = useNotificationSettings();
  const [error, setError] = useState<{ kind: NotificationKind; message: string }>();
  const [requesting, setRequesting] = useState(false);

  async function change(kind: NotificationKind, enabled: boolean) {
    if (requesting) return;
    setError(undefined);
    if (!enabled) return update(kind, false);
    if (!notificationsSupported()) {
      setError({ kind, message: 'This browser cannot show notifications.' });
      return;
    }
    setRequesting(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') update(kind, true);
      else
        setError({
          kind,
          message: 'Notifications are blocked. Allow them in your browser or system settings.',
        });
    } catch {
      setError({ kind, message: 'Notifications are unavailable in this browser.' });
    } finally {
      setRequesting(false);
    }
  }

  return (
    <SettingsGroup title="Notifications">
      {rows.map(({ kind, label, description }) => (
        <SettingsRow
          key={kind}
          label={label}
          description={
            error?.kind === kind ? (
              <span role="alert" className="text-error">
                {error.message}
              </span>
            ) : (
              description
            )
          }
        >
          <SegmentedControl
            label={label}
            value={settings[kind] ? 'on' : 'off'}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'on', label: 'On' },
            ]}
            onChange={(value) => void change(kind, value === 'on')}
          />
        </SettingsRow>
      ))}
    </SettingsGroup>
  );
}
