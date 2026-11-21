import { Hono } from 'hono';
import type { DesktopUpdateState } from '@opencodex/contracts/desktop';

/**
 * The desktop app's updater, which the Electron main process hands to the gateway it hosts,
 * so a paired phone can update the computer's app too. A standalone gateway has none.
 */
export type HostUpdates = {
  getState(): DesktopUpdateState;
  check(): Promise<void>;
  download(): Promise<void>;
  install(): void;
};

export function hostUpdateRoutes(updates: HostUpdates | undefined) {
  const app = new Hono();
  const missing = { message: 'Updates are available from the OpenCodex desktop app only.' };
  app.get('/update', (c) => (updates ? c.json(updates.getState()) : c.json(missing, 404)));
  for (const action of ['check', 'download', 'install'] as const) {
    app.post(`/update/${action}`, (c) => {
      if (!updates) return c.json(missing, 404);
      // Actions run in the background; the state reports their progress and errors.
      void Promise.resolve(updates[action]()).catch(() => undefined);
      return c.json(updates.getState());
    });
  }
  return app;
}
