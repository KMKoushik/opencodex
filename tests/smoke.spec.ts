import { test, expect } from '@playwright/test';
import { createServer, type ServerResponse } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { startGateway } from '../packages/gateway/src/server';

// A protocol fixture exercises the actual SDK and gateway without touching personal sessions.
async function fixture(directory: string) {
  await mkdir(directory, { recursive: true });
  const streams = new Set<ServerResponse>();
  const sessions = [
    {
      id: 'fixture-session',
      title: 'Explore the project',
      location: { directory },
      time: { updated: Date.now() },
      model: { id: 'fixture-model' },
    },
  ];
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/api/event') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify({ type: 'server.connected' })}\n\n`);
      streams.add(res);
      res.on('close', () => streams.delete(res));
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/api/info') {
      res.end(JSON.stringify({ version: '2.0.19', pid: 1, urls: [], paths: { tmp: directory } }));
      return;
    }
    if (url.pathname === '/api/session') {
      res.end(JSON.stringify({ data: sessions, cursor: {} }));
      return;
    }
    res.writeHead(404);
    res.end('{}');
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture port');
  return {
    url: `http://127.0.0.1:${address.port}`,
    update() {
      sessions[0]!.title = 'Updated through the event stream';
      for (const stream of streams)
        stream.write(`data: ${JSON.stringify({ type: 'session.updated' })}\n\n`);
    },
    close: () =>
      new Promise<void>((done) => {
        for (const stream of streams) stream.end();
        server.close(() => done());
        server.closeAllConnections();
      }),
  };
}

test('browser: real gateway, projects, live sessions, and mobile navigation', async ({
  page,
}, info) => {
  const directory = info.outputPath('project');
  const upstream = await fixture(directory);
  const previous = process.env.OPENCODE_URL;
  process.env.OPENCODE_URL = upstream.url;
  const gateway = await startGateway({ assets: resolve('apps/web/dist') });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(gateway.url);
    await expect(page.getByText('Connected · v2.0.19')).toBeVisible();
    await page.getByLabel('Project directory', { exact: true }).fill(directory);
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page.getByRole('button', { name: 'Explore the project' }).click();
    await expect(page.getByRole('heading', { name: 'Explore the project' })).toBeVisible();
    await expect(page.getByText('Live updates connected', { exact: true })).toBeVisible();
    upstream.update();
    await expect(
      page.getByRole('heading', { name: 'Updated through the event stream' }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Toggle sidebar' }).click();
    await page.getByRole('button', { name: 'Close project' }).click();
    await expect(page.getByRole('heading', { name: 'A place to build.' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  } finally {
    await page.close();
    await gateway.close();
    await upstream.close();
    if (previous === undefined) delete process.env.OPENCODE_URL;
    else process.env.OPENCODE_URL = previous;
  }
});

test('Electron: bundled gateway, isolated renderer, and native folder bridge', async ({
  playwright,
}, info) => {
  const directory = info.outputPath('project');
  const upstream = await fixture(directory);
  const require = createRequire(resolve('apps/desktop/package.json'));
  const executablePath: string = require('electron');
  const launch = () =>
    playwright._electron.launch({
      executablePath,
      args: [
        resolve('apps/desktop/out/main/index.js'),
        `--user-data-dir=${info.outputPath('profile')}`,
      ],
      env: { ...process.env, OPENCODE_URL: upstream.url, ELECTRON_RENDERER_URL: '' },
    });
  let application = await launch();
  try {
    expect(await application.evaluate(({ app }) => app.getPath('userData'))).toBe(
      info.outputPath('profile'),
    );
    const page = await application.firstWindow();
    await expect(page.getByText('Connected · v2.0.19')).toBeVisible();
    await expect(page.getByText('Desktop', { exact: true })).toBeVisible();
    await application.evaluate(({ dialog }, selected) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] });
    }, directory);
    await page.getByRole('button', { name: 'Browse for a project folder' }).click();
    await page.getByRole('button', { name: 'Explore the project' }).click();
    await expect(page.getByRole('heading', { name: 'Explore the project' })).toBeVisible();
    expect(await page.evaluate(() => 'require' in window || 'process' in window)).toBe(false);
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await expect
      .poll(() => page.evaluate(() => window.desktop?.getPreferences()))
      .toMatchObject({ theme: 'light' });
    await application.close();
    application = await launch();
    const reopened = await application.firstWindow();
    await expect(reopened.getByRole('heading', { name: 'Welcome to project.' })).toBeVisible();
    await expect(reopened.locator('html')).toHaveAttribute('data-theme', 'light');
  } finally {
    await application.close();
    await upstream.close();
  }
});
