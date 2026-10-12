import { api } from '../../lib/api';
import { PluginSettings } from '../settings/plugin-settings';

export function CanvasPluginSettings({ directory }: { directory?: string }) {
  return (
    <PluginSettings
      label="Canvases"
      queryKey="canvas-plugin"
      directory={directory}
      load={api.canvasPlugin}
      install={api.installCanvasPlugin}
      remove={api.removeCanvasPlugin}
      descriptions={{
        missing:
          'Install a small OpenCode plugin so agents can make canvases: charts, dashboards, diagrams, and small tools shown beside the chat in your theme.',
        outdated: 'An older version is installed. Update it to match this version of OpenCodex.',
        loading: 'Installed. Waiting for OpenCode to load it…',
        active: 'Active. Agents can make canvases.',
        failed: 'OpenCode couldn’t load the plugin.',
      }}
    />
  );
}
