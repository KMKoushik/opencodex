import { SettingsGroup, SettingsRow } from '../settings/settings-layout';
import { commands, shortcutLabel } from './commands';

export function ShortcutsSettings() {
  return (
    <>
      <p className="shortcuts-description">
        Shortcuts work while OpenCodex is focused. Chat actions are available in an open
        conversation. Close a menu before using app shortcuts.
      </p>
      {(['App', 'Chat'] as const).map((group) => (
        <SettingsGroup key={group} title={group}>
          {commands
            .filter((command) => command.group === group)
            .map((command) => (
              <SettingsRow key={command.id} label={command.label}>
                <kbd className="shortcut-key">{shortcutLabel(command.id)}</kbd>
              </SettingsRow>
            ))}
        </SettingsGroup>
      ))}
      <SettingsGroup title="Message input">
        <SettingsRow label="Send message">
          <kbd className="shortcut-key">Enter</kbd>
        </SettingsRow>
        <SettingsRow label="Insert a new line">
          <kbd className="shortcut-key">Shift+Enter</kbd>
        </SettingsRow>
      </SettingsGroup>
    </>
  );
}
