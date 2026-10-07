import { Hono } from 'hono';
import { projectInputSchema } from '@opencodex/contracts';
import type { OpenCodeBackend } from './opencode';
import { installPlugin, pluginStatus, removePlugin, type PluginFile } from './plugin-files';
import { DESKTOP_TOOLS_PLUGIN } from './desktop-tools-plugin.generated';

const PLUGIN: PluginFile = {
  id: 'opencodex.desktop-tools',
  file: 'opencodex-desktop-tools.js',
  header: '// OpenCodex desktop-tools plugin',
  source: DESKTOP_TOOLS_PLUGIN.source,
  feature: 'desktop tools plugin',
};

export function desktopToolsRoutes(backend: OpenCodeBackend) {
  const app = new Hono();
  app.get('/desktop-tools-plugin', async (c) => {
    const directory = projectInputSchema.safeParse({ directory: c.req.query('directory') });
    return c.json(
      await pluginStatus(
        backend,
        PLUGIN,
        directory.success ? directory.data.directory : undefined,
        c.req.raw.signal,
      ),
    );
  });
  app.put('/desktop-tools-plugin', async (c) => {
    await installPlugin(backend, PLUGIN);
    return c.json({ ok: true });
  });
  app.delete('/desktop-tools-plugin', async (c) => {
    await removePlugin(backend, PLUGIN);
    return c.json({ ok: true });
  });
  return app;
}
