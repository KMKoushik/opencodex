import { Hono } from 'hono';
import { projectInputSchema } from '@opencodex/contracts';
import type { OpenCodeBackend } from './opencode';
import { installPlugin, pluginStatus, removePlugin, type PluginFile } from './plugin-files';
import { CANVAS_PLUGIN } from './canvas-plugin.generated';

export const CANVAS_PLUGIN_FILE: PluginFile = {
  id: 'opencodex.canvas',
  file: 'opencodex-canvas.js',
  header: '// OpenCodex canvas plugin',
  source: CANVAS_PLUGIN.source,
  feature: 'canvas plugin',
};

export function canvasPluginRoutes(backend: OpenCodeBackend) {
  const app = new Hono();
  app.get('/', async (c) => {
    const directory = projectInputSchema.safeParse({ directory: c.req.query('directory') });
    return c.json(
      await pluginStatus(
        backend,
        CANVAS_PLUGIN_FILE,
        directory.success ? directory.data.directory : undefined,
        c.req.raw.signal,
      ),
    );
  });
  app.put('/', async (c) => {
    await installPlugin(backend, CANVAS_PLUGIN_FILE);
    return c.json({ ok: true });
  });
  app.delete('/', async (c) => {
    await removePlugin(backend, CANVAS_PLUGIN_FILE);
    return c.json({ ok: true });
  });
  return app;
}
