import { Hono } from 'hono';
import { projectInputSchema } from '@opencodex/contracts';
import type { OpenCodeBackend } from './opencode';
import { installPlugin, pluginStatus, removePlugin, type PluginFile } from './plugin-files';
import { CANVAS_PLUGIN } from './canvas-plugin.generated';

const PLUGIN: PluginFile = {
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
        PLUGIN,
        directory.success ? directory.data.directory : undefined,
        c.req.raw.signal,
      ),
    );
  });
  app.put('/', async (c) => {
    await installPlugin(backend, PLUGIN);
    return c.json({ ok: true });
  });
  app.delete('/', async (c) => {
    await removePlugin(backend, PLUGIN);
    return c.json({ ok: true });
  });
  return app;
}
