import { PassThrough } from 'node:stream';
import { expect, it } from 'vitest';
import { parentUpdates } from './parent-updates';
import { hostUpdateRoutes } from './host-updates';

it('relays native update state and explicit phone commands over the private parent pipe', async () => {
  const input = new PassThrough();
  const output: string[] = [];
  const updates = parentUpdates(input, (line) => output.push(line));
  const app = hostUpdateRoutes(updates);
  input.write('{"update":{"status":"rea');
  input.write('dy","currentVersion":"1.0.0","version":"1.1.0"}}\n');
  expect(await (await app.request('/update')).json()).toMatchObject({
    status: 'ready',
    version: '1.1.0',
  });
  await app.request('/update/install', { method: 'POST' });
  expect(output).toEqual(['OPENCODEX_HOST_UPDATE {"action":"install"}']);
  input.write('{"update":{"status":"arbitrary","currentVersion":"1.0.0"}}\n');
  expect(updates.getState().status).toBe('ready');
  expect((await hostUpdateRoutes(undefined).request('/update')).status).toBe(404);
  input.end();
});
