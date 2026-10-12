import { api } from '../../lib/api';
import { PluginSettings } from '../settings/plugin-settings';

export function SideChatPluginSettings({ directory }: { directory?: string }) {
  return (
    <PluginSettings
      label="Side chat live context"
      queryKey="side-chat-plugin"
      directory={directory}
      load={api.sideChatPlugin}
      install={api.installSideChatPlugin}
      remove={api.removeSideChatPlugin}
      descriptions={{
        missing:
          'Side chats start from a snapshot of the main chat. Install a small read-only OpenCode plugin so they can also check its latest progress. It’s hidden in all other sessions.',
        outdated: 'An older version is installed. Update it to match this version of OpenCodex.',
        loading: 'Installed. Waiting for OpenCode to load it…',
        active: 'Active. Side chats can read the main chat’s latest progress.',
        failed: 'OpenCode couldn’t load the plugin.',
      }}
    />
  );
}
