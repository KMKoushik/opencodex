import { test, expect } from '@playwright/test';
import { createServer, type ServerResponse } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { startGateway } from '../packages/gateway/src/server';
import { SESSION_UNREAD_KEY } from '../packages/contracts/src';
import type {
  SessionMessageInfo,
  SessionMessageAssistantTool,
  SessionInfo,
  PermissionRequest,
  FormInfo,
  PromptFileAttachment,
  OpenCodeProject,
  FileDiffInfo,
} from '../packages/contracts/src';

const pngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAeElEQVR4nO3PUQkAIBTAwNfJunbVEH4cwmABbrP2+brhgga0oAEtaEALGtCCBrSgAS1oQAsa0IIGtKABLWhACxrQgga0oAEtaEALGtCCBrSgAS1oQAsa0IIGtKABLWhACxrQgga0oAEtaEALGtCCBrSgAS1oQAseu0MI4aWmCN4rAAAAAElFTkSuQmCC';

// A protocol fixture exercises the actual SDK and gateway without touching personal sessions.
async function fixture(directory: string) {
  await mkdir(directory, { recursive: true });
  await mkdir(`${directory}-other`, { recursive: true });
  const streams = new Set<ServerResponse>();
  const projects: OpenCodeProject[] = [
    {
      id: 'project-1',
      canonical: directory,
      name: 'Fixture project',
      time: { created: 1, updated: 1, active: 1 },
      sandboxes: [],
    },
    {
      id: 'project-before-git-init',
      canonical: directory,
      name: 'Old project name',
      time: { created: 0, updated: 0, active: 0 },
      sandboxes: [],
    },
    {
      id: 'different-folder-same-name',
      canonical: `${directory}-other`,
      name: 'Fixture project',
      time: { created: 0, updated: 0, active: 0 },
      sandboxes: [],
    },
  ];
  const sessions: SessionInfo[] = [
    {
      id: 'fixture-session',
      title: 'Explore the project',
      location: { directory },
      time: { created: Date.now(), updated: Date.now() },
      projectID: 'project-1',
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      model: { id: 'fixture-model', providerID: 'fixture' },
      agent: 'plan',
    },
  ];
  const messages: SessionMessageInfo[] = [];
  const diffs: FileDiffInfo[] = [];
  const models = [
    {
      id: 'fixture-model',
      providerID: 'fixture',
      name: 'Fixture Reasoner',
      variants: [{ id: 'low' }, { id: 'high' }],
    },
    {
      id: 'fixture-model',
      providerID: 'other',
      name: 'Other Reasoner',
      variants: [{ id: 'medium' }],
    },
    { id: 'fast', providerID: 'fixture', name: 'Fast Model', variants: [] },
  ];
  const messageRequests: string[] = [];
  let running = false;
  let permissions: PermissionRequest[] = [];
  let forms: FormInfo[] = [];
  let decision: string | undefined;
  let answer: unknown;
  let sentText = '';
  let sentFiles: Array<{ name: string; uri: string }> = [];
  let sessionID = 'fixture-session';
  const emit = (event: object) => {
    for (const stream of streams) stream.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  const changed = () =>
    emit({
      type: 'session.status',
      data: { sessionID, status: { type: running ? 'busy' : 'idle' } },
    });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/api/event') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify({ type: 'server.connected' })}\n\n`);
      streams.add(res);
      res.on('close', () => streams.delete(res));
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/api/provider')
      return res.end(
        JSON.stringify({
          location: { directory },
          data: [
            { id: 'fixture', name: 'Fixture Provider', canonical: 'openai' },
            { id: 'other', name: 'Other Provider', canonical: 'anthropic' },
          ],
        }),
      );
    if (url.pathname === '/api/agent/build')
      return res.end(
        JSON.stringify({
          location: { directory },
          data: { id: 'build', model: { id: 'fixture-model', providerID: 'fixture' } },
        }),
      );
    if (url.pathname === '/api/model/default')
      return res.end(JSON.stringify({ location: { directory }, data: models[2] }));
    if (url.pathname === '/api/model')
      return res.end(
        JSON.stringify({
          location: { directory },
          data: models.map((model) => ({ ...model, enabled: true, limit: { context: 200_000 } })),
        }),
      );
    if (url.pathname === '/api/project') return res.end(JSON.stringify(projects));
    if (url.pathname === '/api/location') {
      const location = { directory: url.searchParams.get('location[directory]')! };
      let project = projects.find((project) => project.canonical === location.directory);
      if (!project) {
        project = {
          id: `project-${projects.length + 1}`,
          canonical: location.directory,
          time: { created: 1, updated: 1, active: 1 },
          sandboxes: [],
        };
        projects.push(project);
      }
      return res.end(
        JSON.stringify({
          directory: location.directory,
          project: { id: project.id, canonical: project.canonical, directory: project.canonical },
        }),
      );
    }
    if (req.method === 'PATCH' && url.pathname.startsWith('/api/project/')) {
      let body = '';
      for await (const chunk of req) body += chunk;
      const project = projects.find((project) => url.pathname === `/api/project/${project.id}`)!;
      Object.assign(project, JSON.parse(body));
      emit({ type: 'project.updated', data: project });
      return res.end(JSON.stringify(project));
    }
    if (url.pathname === '/api/info') {
      res.end(JSON.stringify({ version: '2.0.19', pid: 1, urls: [], paths: { tmp: directory } }));
      return;
    }
    if (url.pathname === '/api/vcs/diff')
      return res.end(JSON.stringify({ location: { directory }, data: diffs }));
    if (url.pathname === '/api/vcs')
      return res.end(
        JSON.stringify({
          location: { directory },
          data: { provider: 'git', branch: { current: 'main' } },
        }),
      );
    if (url.pathname === '/api/vcs/status')
      return res.end(JSON.stringify({ location: { directory }, data: diffs }));
    if (url.pathname === '/api/mcp' || url.pathname === '/api/skill')
      return res.end(JSON.stringify({ location: { directory }, data: [] }));
    if (url.pathname === '/api/session') {
      if (req.method === 'POST') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const input = JSON.parse(body);
        sessionID = 'fixture-new';
        const session = {
          ...sessions[0]!,
          id: sessionID,
          title: 'New chat',
          agent: input.agent,
          model: undefined,
        };
        sessions.unshift(session);
        return res.end(JSON.stringify({ data: session }));
      }
      const search = url.searchParams.get('search')?.toLowerCase();
      const parentID = url.searchParams.get('parentID');
      const items = sessions
        .filter((session) =>
          parentID && parentID !== 'null' ? session.parentID === parentID : !session.parentID,
        )
        .filter((session) => !search || session.title?.toLowerCase().includes(search));
      const cursor = url.searchParams.get('cursor');
      const start = cursor ? items.findIndex((session) => session.id === cursor) : 0;
      const limit = Number(url.searchParams.get('limit') ?? items.length);
      res.end(
        JSON.stringify({
          data: items.slice(start, start + limit),
          cursor: { next: items[start + limit]?.id },
        }),
      );
      return;
    }
    if (url.pathname === '/api/session/active')
      return res.end(JSON.stringify({ data: running ? { [sessionID]: { type: 'running' } } : {} }));
    const session = sessions.find((item) => url.pathname === `/api/session/${item.id}`);
    if (session) {
      if (req.method === 'PATCH') {
        let body = '';
        for await (const chunk of req) body += chunk;
        Object.assign(session, JSON.parse(body));
        emit({
          type: 'session.metadata.updated',
          data: { sessionID: session.id, metadata: session.metadata },
        });
        return res.writeHead(204).end();
      }
      return res.end(
        JSON.stringify({
          data: {
            ...session,
            // Native snapshots normalize an omitted variant to this sentinel.
            model: session.model
              ? { ...session.model, variant: session.model.variant ?? 'default' }
              : undefined,
          },
        }),
      );
    }
    if (url.pathname.endsWith('/message')) {
      const cursor = url.searchParams.get('cursor') ?? '';
      messageRequests.push(cursor);
      const descending = messages.toReversed();
      const start = cursor ? descending.findIndex((message) => message.id === cursor) : 0;
      const data = descending.slice(start, start + 50);
      return res.end(JSON.stringify({ data, cursor: { next: descending[start + 50]?.id } }));
    }
    if (url.pathname.endsWith('/inbox')) return res.end('{"data":[]}');
    if (url.pathname.endsWith('/permission')) return res.end(JSON.stringify({ data: permissions }));
    if (url.pathname.endsWith('/form')) return res.end(JSON.stringify({ data: forms }));
    if (req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const input = JSON.parse(body || '{}');
      if (url.pathname.endsWith('/model') || url.pathname.endsWith('/agent')) {
        const target = sessions.find((item) =>
          url.pathname.startsWith(`/api/session/${item.id}/`),
        )!;
        if (input.model) target.model = input.model;
        if (input.agent) target.agent = input.agent;
        res.writeHead(204).end();
        emit({
          type: input.model ? 'session.model.selected' : 'session.agent.selected',
          data: { sessionID: target.id, ...input },
        });
        return;
      }
      if (url.pathname.endsWith('/prompt')) {
        sentText = input.text;
        sentFiles = input.files ?? [];
        const files: PromptFileAttachment[] = sentFiles.map((file) => ({
          name: file.name,
          mime: file.uri.slice(5, file.uri.indexOf(';')),
          data: file.uri.slice(file.uri.indexOf(',') + 1),
          source: { type: 'inline' },
        }));
        running = true;
        messages.push({
          type: 'user',
          id: `user-${messages.length}`,
          text: sentText,
          files,
          time: { created: Date.now() },
        });
        res.end(
          JSON.stringify({
            data: {
              type: 'user',
              id: messages.at(-1)!.id,
              sessionID,
              time: { created: Date.now() },
              payload: { text: sentText, files },
              delivery: 'steer',
            },
          }),
        );
        changed();
        return;
      }
      if (url.pathname.endsWith('/permission/permission-1/reply')) {
        decision = input.decision;
        permissions = [];
        emit({ type: 'permission.replied', data: { sessionID } });
        res.statusCode = 204;
        return res.end();
      }
      if (url.pathname.endsWith('/form/form-1/reply')) {
        answer = input.answer;
        forms = [];
        emit({ type: 'form.replied', data: { sessionID } });
        res.statusCode = 204;
        return res.end();
      }
      if (url.pathname.endsWith('/interrupt')) {
        running = false;
        messages.push({
          id: `idle-${messages.length}`,
          type: 'idle',
          outcome: 'interrupted',
          time: { created: Date.now() },
        });
        changed();
        return res.end(JSON.stringify({ interrupted: true }));
      }
    }
    res.writeHead(404);
    res.end('{}');
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture port');
  return {
    url: `http://127.0.0.1:${address.port}`,
    messageRequests,
    sessions,
    projects,
    diffs,
    emit,
    seedLink(url: string) {
      messages.push({
        id: 'link-message',
        type: 'assistant',
        agent: 'build',
        model: { id: 'fixture-model', providerID: 'fixture' },
        time: { created: 1, completed: 2 },
        content: [{ type: 'text', text: `[Fixture link](${url})\n\n${url}` }],
      });
    },
    seedHistory(turns: number) {
      for (let i = 0; i < turns; i++) {
        const created = i * 60_000;
        messages.push({
          id: `history-user-${i}`,
          type: 'user',
          text: `Review change ${i}`,
          time: { created },
        });
        for (let step = 0; step < 2; step++)
          messages.push({
            id: `history-work-${i}-${step}`,
            type: 'assistant',
            agent: 'build',
            model: { id: 'fixture-model', providerID: 'fixture' },
            time: { created: created + step * 13_000, completed: created + (step + 1) * 13_000 },
            content: [
              { type: 'reasoning', text: 'Inspect the relevant files and verify the change.' },
              ...Array.from({ length: 3 }, (_, j): SessionMessageAssistantTool => ({
                type: 'tool' as const,
                id: `history-tool-${i}-${step}-${j}`,
                name: 'read',
                time: {
                  created: created + step * 13_000,
                  completed: created + (step + 1) * 13_000,
                },
                state: {
                  status: 'completed' as const,
                  input: { path: `src/feature-${step}-${j}.ts` },
                  content: [{ type: 'text' as const, text: 'Detailed tool output.\n'.repeat(300) }],
                },
              })),
            ],
          });
        messages.push({
          id: `history-answer-${i}`,
          type: 'assistant',
          agent: 'build',
          model: { id: 'fixture-model', providerID: 'fixture' },
          time: { created: created + 26_000, completed: created + 27_000 },
          content: [
            {
              type: 'text',
              text: `### Change ${i}\n\nThe implementation is ready.\n\n- Preserved the existing behavior.\n- Verified the gateway boundary.\n- Kept rendering scoped to the active row.`,
            },
          ],
        });
      }
    },
    update() {
      sessions[0]!.title = 'Updated through the event stream';
      for (const stream of streams)
        stream.write(
          `data: ${JSON.stringify({ type: 'session.renamed', data: { sessionID, title: sessions[0]!.title } })}\n\n`,
        );
    },
    work(
      content: Extract<SessionMessageInfo, { type: 'assistant' }>['content'],
      created = Date.now(),
    ) {
      let message = messages.find((item) => item.id === 'activity-assistant');
      if (!message || message.type !== 'assistant') {
        message = {
          type: 'assistant',
          id: 'activity-assistant',
          agent: 'build',
          model: { id: 'fixture-model', providerID: 'fixture' },
          time: { created },
          content,
        };
        messages.push(message);
      }
      message.content = content;
      running = true;
      changed();
    },
    startText() {
      messages.push({
        type: 'assistant',
        id: 'assistant-1',
        agent: 'build',
        model: { id: 'fixture-model', providerID: 'fixture' },
        time: { created: Date.now() },
        content: [{ type: 'text', text: '' }],
      });
      emit({
        type: 'session.step.started',
        data: { sessionID, assistantMessageID: 'assistant-1' },
      });
      emit({
        type: 'session.text.started',
        data: { sessionID, assistantMessageID: 'assistant-1', ordinal: 0 },
      });
    },
    delta(text: string) {
      emit({
        type: 'session.text.delta',
        data: { sessionID, assistantMessageID: 'assistant-1', ordinal: 0, delta: text },
      });
    },
    finishText(text: string) {
      const message = messages.find((item) => item.id === 'assistant-1');
      if (message?.type !== 'assistant') throw new Error('Missing assistant message');
      message.content = [
        { type: 'text', text },
        {
          type: 'tool',
          id: 'tool-1',
          name: 'read',
          time: { created: Date.now(), completed: Date.now() },
          state: {
            status: 'completed',
            input: { path: 'README.md' },
            content: [{ type: 'text', text: 'Project README contents' }],
          },
        },
      ];
      message.time.completed = Date.now();
      running = false;
      messages.push({
        id: `idle-${messages.length}`,
        type: 'idle',
        outcome: 'succeeded',
        time: { created: Date.now() },
      });
      emit({
        type: 'session.text.ended',
        data: { sessionID, assistantMessageID: message.id, ordinal: 0, text },
      });
      changed();
    },
    ask() {
      permissions = [
        {
          id: 'permission-1',
          sessionID,
          action: 'shell',
          resources: ['git status'],
          save: ['git *'],
        },
      ];
      forms = [
        {
          id: 'form-1',
          sessionID,
          title: 'Choose scope',
          fields: [
            {
              key: 'scope',
              title: 'Scope',
              type: 'string',
              required: true,
              options: [{ value: 'all', label: 'Whole project' }],
            },
          ],
        },
      ];
      emit({ type: 'permission.asked', data: permissions[0] });
      emit({ type: 'form.created', data: { form: forms[0] } });
    },
    reconnect() {
      for (const stream of streams) stream.end();
      const message = messages.find((item) => item.id === 'assistant-1');
      if (message?.type === 'assistant')
        message.content.push({ type: 'text', text: 'Recovered after reconnect.' });
    },
    get decision() {
      return decision;
    },
    get answer() {
      return answer;
    },
    get sentText() {
      return sentText;
    },
    get running() {
      return running;
    },
    get sentFiles() {
      return sentFiles;
    },
    close: () =>
      new Promise<void>((done) => {
        for (const stream of streams) stream.end();
        server.close(() => done());
        server.closeAllConnections();
      }),
  };
}

test('projects: native metadata, icons, search, add and sidebar persistence', async ({
  page,
}, info) => {
  const directory = info.outputPath('project');
  const upstream = await fixture(directory);
  for (const [index, name] of [
    'opencodex',
    'home',
    'ronto',
    'useSend',
    'dawn',
    'zenletter',
    'opencode',
    'notes',
  ].entries()) {
    upstream.projects.push({
      id: `sample-${index}`,
      canonical: `/projects/${name}`,
      name,
      icon: { color: ['gray', 'orange', 'gray', 'green', 'pink', 'purple'][index % 6] },
      time: { created: 1, updated: 1, active: 1 },
      sandboxes: [],
    });
  }
  const previous = process.env.OPENCODE_URL;
  process.env.OPENCODE_URL = upstream.url;
  const gateway = await startGateway({ assets: resolve('apps/web/dist') });
  try {
    await page.goto(gateway.url);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Projects', exact: true }).click();
    const list = page.getByRole('list', { name: 'Project settings' });
    await expect(list.getByRole('listitem')).toHaveCount(10);
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.screenshot({ path: info.outputPath('projects-dark.png'), animations: 'disabled' });
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.screenshot({ path: info.outputPath('projects-light.png'), animations: 'disabled' });
    const search = page.getByRole('searchbox', { name: 'Search projects' });
    await search.fill('does-not-exist');
    await expect(page.getByText('No projects match your search.')).toBeVisible();
    await search.fill(`${directory}-other`);
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await search.fill('');
    await list.getByRole('button', { name: 'Actions for Fixture project' }).first().click();
    await page.getByRole('menuitem', { name: 'Edit project', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Edit project', exact: true });
    await editor.getByRole('textbox', { name: 'Project name' }).fill('Design workspace');
    await editor.getByRole('radio', { name: 'Purple icon' }).check();
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(list.getByRole('button', { name: 'Design workspace', exact: true })).toBeVisible();
    expect(upstream.projects[0]?.icon?.color).toBe('purple');
    await list.getByRole('button', { name: 'Design workspace', exact: true }).click();
    await editor.getByLabel('Project icon', { exact: true }).setInputFiles({
      name: 'icon.png',
      mimeType: 'image/png',
      buffer: Buffer.from(pngBase64, 'base64'),
    });
    await expect(editor.locator('.project-editor-icon img')).toBeVisible();
    await page.screenshot({ path: info.outputPath('project-editor.png') });
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(editor).toHaveCount(0);
    expect(upstream.projects[0]?.icon?.override).toMatch(/^data:image\/png;base64,/);
    await page.reload();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Projects', exact: true }).click();
    await expect(
      list.getByRole('button', { name: 'Design workspace', exact: true }).locator('img'),
    ).toBeVisible();
    await list.getByRole('button', { name: 'Actions for Design workspace' }).click();
    await page.keyboard.press('Escape');
    await expect(list.getByRole('button', { name: 'Actions for Design workspace' })).toBeFocused();
    const added = `${directory}/new-project`;
    await mkdir(added, { recursive: true });
    await page.getByRole('button', { name: 'Add project', exact: true }).click();
    const add = page.getByRole('dialog', { name: 'Add project', exact: true });
    await add.getByRole('textbox', { name: 'Project directory' }).fill(added);
    await add.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(add).toHaveCount(0);
    await expect(list.getByRole('button', { name: 'new-project', exact: true })).toBeVisible();
    expect(upstream.sessions).toHaveLength(1);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.sidebar')).toBeHidden();
    await page.locator('.main').evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.screenshot({ path: info.outputPath('projects-mobile.png'), animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await list.getByRole('button', { name: 'Actions for Design workspace' }).click();
    await page.getByRole('menuitem', { name: 'Open project', exact: true }).click();
    await page.getByRole('button', { name: 'Toggle sidebar' }).click();
    await expect(
      page
        .getByRole('navigation', { name: 'Projects', exact: true })
        .getByRole('button', { name: 'Design workspace', exact: true })
        .locator('img'),
    ).toBeVisible();
  } finally {
    await gateway.close();
    await upstream.close();
    if (previous === undefined) delete process.env.OPENCODE_URL;
    else process.env.OPENCODE_URL = previous;
  }
});

for (const development of [false, true]) {
  test(`composer${development ? ' (development)' : ''}: paste, drop, file picking, navigation and attachment-only retry`, async ({
    page,
  }, info) => {
    const directory = info.outputPath('project');
    const upstream = await fixture(directory);
    const previous = process.env.OPENCODE_URL;
    process.env.OPENCODE_URL = upstream.url;
    const gateway = await startGateway({ assets: resolve('apps/web/dist') });
    const require = createRequire(resolve('apps/web/package.json'));
    const { createServer: createViteServer } = await import(require.resolve('vite'));
    const dev = development
      ? await createViteServer({
          cacheDir: info.outputPath('vite-cache'),
          root: resolve('apps/web'),
          configFile: resolve('apps/web/vite.config.ts'),
          server: { port: 0, strictPort: false, proxy: { '/api': { target: gateway.url } } },
        })
      : undefined;
    try {
      await dev?.listen();
      await page.goto(dev?.resolvedUrls?.local[0] ?? gateway.url);
      await page.getByLabel('Project directory', { exact: true }).fill(directory);
      await page.getByRole('button', { name: 'Open', exact: true }).click();
      await page.getByRole('button', { name: 'Explore the project' }).click();
      const input = page.getByRole('textbox', { name: 'Message', exact: true });
      const send = page.getByRole('button', { name: 'Send message' });
      await expect(send).toBeDisabled();
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: 'Attach files', exact: true }).click();
      await (
        await chooser
      ).setFiles({
        name: 'notes.ts',
        mimeType: '',
        buffer: Buffer.from('export const answer = 42;'),
      });
      await expect(send).toBeEnabled();
      const draftDownload = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download notes.ts', exact: true }).click();
      const draftFile = await draftDownload;
      expect(draftFile.suggestedFilename()).toBe('notes.ts');
      expect(await readFile((await draftFile.path())!, 'utf8')).toBe('export const answer = 42;');
      await input.evaluate((element, base64) => {
        const clipboardData = new DataTransfer();
        clipboardData.items.add(
          new File([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], 'pasted.png', {
            type: 'image/png',
          }),
        );
        element.dispatchEvent(
          new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }),
        );
      }, pngBase64);
      await expect(
        page.locator('.composer').getByRole('img', { name: 'pasted.png' }),
      ).toBeVisible();
      await expect
        .poll(() =>
          page
            .locator('.composer-attachments img')
            .evaluate((image: HTMLImageElement) => image.naturalWidth),
        )
        .toBe(64);
      const previewTrigger = page.getByRole('button', { name: 'Preview pasted.png', exact: true });
      await previewTrigger.focus();
      await page.keyboard.press('Enter');
      const preview = page.getByRole('dialog', { name: 'Image preview: pasted.png', exact: true });
      await expect(preview).toBeVisible();
      await expect(preview.getByRole('img', { name: 'pasted.png', exact: true })).toHaveJSProperty(
        'naturalWidth',
        64,
      );
      await expect(preview.getByRole('button', { name: 'Close image preview' })).toBeFocused();
      await page.screenshot({ path: info.outputPath('image-preview-desktop.png') });
      await page.keyboard.press('Escape');
      await expect(preview).toHaveCount(0);
      await expect(previewTrigger).toBeFocused();
      expect(upstream.sentFiles).toEqual([]);
      const drop = await page.evaluateHandle(() => {
        const data = new DataTransfer();
        data.items.add(new File(['%PDF-1.7\nfixture'], 'spec.pdf', { type: 'application/pdf' }));
        return data;
      });
      await page.locator('.composer').dispatchEvent('dragenter', { dataTransfer: drop });
      await expect(page.getByText('Drop files to attach')).toBeVisible();
      await page.locator('.composer').dispatchEvent('drop', { dataTransfer: drop });
      await drop.dispose();
      await expect(page.getByText('Drop files to attach')).toBeHidden();
      await expect(page.getByRole('button', { name: 'Remove spec.pdf' })).toBeVisible();
      await page.keyboard.press('ControlOrMeta+n');
      await expect(page.getByRole('list', { name: 'Attachments', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Explore the project' }).click();
      await expect(
        page.getByRole('list', { name: 'Attachments', exact: true }).getByRole('listitem'),
      ).toHaveCount(3);
      await page.getByRole('button', { name: 'Remove spec.pdf' }).click();
      await page.locator('input[type=file]').setInputFiles({
        name: 'binary.bin',
        mimeType: 'application/octet-stream',
        buffer: Buffer.from([0, 255, 0]),
      });
      await send.click();
      await expect(page.getByRole('alert')).toContainText('binary.bin is not a supported file');
      expect(upstream.sentFiles).toEqual([]);
      await page.getByRole('button', { name: 'Remove binary.bin' }).click();
      await page.route('**/api/sessions/*/prompt', (route) =>
        route.fulfill({
          status: 502,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Fixture admission failed.' }),
        }),
      );
      await send.click();
      await expect(page.getByRole('alert')).toContainText('Fixture admission failed.');
      await expect(
        page.getByRole('list', { name: 'Attachments', exact: true }).getByRole('listitem'),
      ).toHaveCount(2);
      await page.screenshot({ path: info.outputPath('attachments-desktop.png') });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.locator('.sidebar')).toBeHidden();
      await expect(send).toBeInViewport();
      await page.screenshot({ path: info.outputPath('attachments-mobile.png') });
      await page.unroute('**/api/sessions/*/prompt');
      await send.click();
      await expect(page.getByRole('list', { name: 'Attachments', exact: true })).toHaveCount(0);
      expect(upstream.sentText).toBe('');
      expect(upstream.sentFiles).toEqual([
        {
          name: 'notes.ts',
          uri: `data:text/plain;base64,${Buffer.from('export const answer = 42;').toString('base64')}`,
        },
        { name: 'pasted.png', uri: `data:image/png;base64,${pngBase64}` },
      ]);
      await expect(
        page
          .getByRole('article', { name: 'You', exact: true })
          .getByRole('img', { name: 'pasted.png' }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Preview pasted.png', exact: true }).click();
      await expect(preview).toBeVisible();
      await page.screenshot({ path: info.outputPath('image-preview-mobile.png') });
      await page.getByRole('button', { name: 'Close image preview' }).click();
      await expect(preview).toHaveCount(0);
      await page.getByRole('button', { name: 'Preview pasted.png', exact: true }).click();
      await page.mouse.click(2, 2);
      await expect(preview).toHaveCount(0);
      expect(upstream.running).toBe(true);
      const sentDownload = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download notes.ts', exact: true }).click();
      const sentFile = await sentDownload;
      expect(sentFile.suggestedFilename()).toBe('notes.ts');
      expect(await readFile((await sentFile.path())!, 'utf8')).toBe('export const answer = 42;');
    } finally {
      await dev?.close();
      await gateway.close();
      await upstream.close();
      if (previous === undefined) delete process.env.OPENCODE_URL;
      else process.env.OPENCODE_URL = previous;
    }
  });
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
    const projects = page.getByRole('navigation', { name: 'Projects', exact: true });
    await expect(projects.getByText('Open a project to get started.')).toBeVisible();
    await expect(projects.locator('.project-row')).toHaveCount(0);
    await page.getByLabel('Project directory', { exact: true }).fill(directory);
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(
      projects.getByRole('button', { name: 'Fixture project', exact: true }),
    ).toHaveCount(1);
    await page.getByRole('button', { name: 'Open project', exact: true }).click();
    await expect(projects.locator('.project-row')).toHaveCount(1);
    await page.getByLabel('Project directory', { exact: true }).fill(`${directory}-other`);
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(
      projects.getByRole('button', { name: 'Fixture project', exact: true }),
    ).toHaveCount(2);
    await page.reload();
    await expect(projects.locator('.project-row')).toHaveCount(2);
    await projects.getByTitle(directory, { exact: true }).click();
    await projects
      .locator('.project-group')
      .filter({ has: page.getByTitle(`${directory}-other`, { exact: true }) })
      .getByRole('button', { name: 'Close project Fixture project', exact: true })
      .click();
    await expect(projects.locator('.project-row')).toHaveCount(1);
    await page.reload();
    await expect(projects.locator('.project-row')).toHaveCount(1);
    await page.getByRole('button', { name: 'Explore the project' }).click();
    await expect(page.getByRole('heading', { name: 'Explore the project' })).toBeVisible();
    await expect(page.locator('.sidebar-rail')).toHaveCount(0);
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Keep my draft');
    await page.getByRole('button', { name: 'Search threads', exact: true }).click();
    const search = page.getByRole('dialog', { name: 'Search threads', exact: true });
    await search
      .getByRole('searchbox', { name: 'Search threads', exact: true })
      .fill('no matching title');
    await expect(search.getByText('No threads match your search.')).toBeVisible();
    await search.getByRole('searchbox', { name: 'Search threads', exact: true }).fill('Explore');
    await search.getByRole('button', { name: /^Explore the project/ }).click();
    await expect(search).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(
      'Keep my draft',
    );
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByText('Connected · v2.0.19')).toBeVisible();
    await expect(page.getByText('Connected', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Go back', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Explore the project' })).toBeVisible();
    await page.getByRole('button', { name: 'Go forward', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'General', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Back to app' }).click();
    upstream.update();
    await expect(
      page.getByRole('heading', { name: 'Updated through the event stream' }),
    ).toBeVisible();

    await expect(
      projects.getByRole('button', { name: 'Fixture project', exact: true }),
    ).toHaveCount(1);
    await expect(projects.getByTitle(directory, { exact: true })).toHaveCount(1);
    await expect(
      projects.getByRole('button', { name: 'Old project name', exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+n');
    await expect(
      page.getByRole('heading', { name: 'Rename conversation: New chat', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What should we build?' })).toBeVisible();
    expect(upstream.sessions[0]?.agent).toBe('build');
    await expect(page.locator('.composer')).not.toContainText(/\b(build|plan)\b/i);
    const selectionRequests: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/model'))
        selectionRequests.push(request.url());
    });
    const thinkingLevel = page.getByRole('button', { name: 'Thinking level', exact: true });
    const messageInput = page.getByRole('textbox', { name: 'Message', exact: true });
    await messageInput.focus();
    for (const label of Array.from({ length: 3 }, () => ['Low', 'High', 'Default']).flat()) {
      await expect(thinkingLevel).toBeEnabled();
      await page.keyboard.press('Control+t');
      await expect(thinkingLevel).toHaveText(label);
      await expect(messageInput).toBeFocused();
    }
    await page.getByRole('button', { name: 'Thinking level', exact: true }).click();
    await page.getByRole('option', { name: 'High', exact: true }).click();
    expect(upstream.sessions[0]?.model).toBeUndefined();
    await page.keyboard.press('ControlOrMeta+Shift+m');
    await page.keyboard.press('ControlOrMeta+b');
    await expect(page.locator('.sidebar')).toBeVisible();
    const providerGroup = page.getByRole('treeitem', { name: 'Fixture Provider', exact: true });
    await providerGroup.click();
    await expect(providerGroup).toHaveAttribute('aria-expanded', 'false');
    await expect(
      page.getByRole('treeitem', { name: 'Fast Model, Fixture Provider', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Search model', exact: true }).fill('fast');
    await expect(providerGroup).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Thinking level', exact: true })).toBeDisabled();
    expect(upstream.sessions[0]?.model).toBeUndefined();
    await page.getByRole('button', { name: 'Model', exact: true }).click();
    await page.getByRole('combobox', { name: 'Search model', exact: true }).fill('other');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Thinking level', exact: true })).toHaveText(
      'Default',
    );
    await page.getByRole('button', { name: 'Thinking level', exact: true }).click();
    await expect(page.getByRole('option', { name: 'High', exact: true })).toHaveCount(0);
    await page.getByRole('option', { name: 'Medium', exact: true }).click();
    expect(upstream.sessions[0]?.model).toBeUndefined();
    expect(selectionRequests).toEqual([]);
    await page.getByRole('button', { name: /^Updated through/ }).click();
    await page
      .getByRole('navigation', { name: 'Sessions', exact: true })
      .getByRole('button', { name: /^New chat/ })
      .click();
    await expect(page.getByRole('button', { name: 'Model', exact: true })).toHaveText(
      'Other Reasoner',
    );
    await expect(page.getByRole('button', { name: 'Thinking level', exact: true })).toHaveText(
      'Medium',
    );
    await page.screenshot({ path: info.outputPath('new-thread.png') });
    await page.getByRole('button', { name: 'Hide sidebar' }).click();
    await expect(page.locator('.sidebar')).toBeHidden();
    await page.getByRole('button', { name: 'Show sidebar' }).click();
    await expect(page.locator('.sidebar')).toBeVisible();
    await page.keyboard.press('ControlOrMeta+Shift+l');
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeFocused();
    await page.keyboard.press('ControlOrMeta+b');
    await expect(page.locator('.sidebar')).toBeHidden();
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeFocused();
    await page.keyboard.press('ControlOrMeta+b');
    await page.keyboard.press('ControlOrMeta+/');
    await expect(page.getByRole('heading', { name: 'Shortcuts', exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('shortcuts-desktop.png') });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Review the project');
    const admitted = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    await page.route('**/api/sessions/*/prompt', async (route) => {
      admitted.resolve();
      await release.promise;
      await route.continue();
    });
    await page.getByRole('button', { name: 'Send message' }).click();
    await admitted.promise;
    await messageInput.fill('Newer draft');
    await page.getByRole('button', { name: /^Updated through/ }).click();
    await page
      .getByRole('navigation', { name: 'Sessions', exact: true })
      .getByRole('button', { name: /^New chat/ })
      .click();
    await expect(messageInput).toHaveValue('Newer draft');
    await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();
    release.resolve();
    await expect.poll(() => upstream.sentText).toBe('Review the project');
    expect(upstream.sessions[0]?.model).toEqual({
      id: 'fixture-model',
      providerID: 'other',
      variant: 'medium',
    });
    await expect(page.getByRole('button', { name: 'Send message' })).toBeEnabled();
    await expect(messageInput).toHaveValue('Newer draft');
    await messageInput.fill('');
    await page.unroute('**/api/sessions/*/prompt');
    await expect(page.getByRole('article', { name: 'You', exact: true })).toHaveText(
      'Review the project',
    );
    upstream.startText();
    upstream.delta('Here is the **streaming');
    await expect(page.getByRole('article', { name: 'Assistant' })).toContainText('streaming');
    upstream.delta(' response**.');
    await expect(page.getByRole('article', { name: 'Assistant' }).locator('strong')).toHaveText(
      'streaming response',
    );
    upstream.ask();
    await expect(page.getByRole('form', { name: 'Choose scope' })).toBeVisible();
    await page.screenshot({ path: info.outputPath('chat-requests.png') });
    await page.getByRole('button', { name: 'Allow once' }).click();
    await expect.poll(() => upstream.decision).toBe('once');
    await page.getByRole('radio', { name: 'Whole project', exact: true }).check();
    await page.getByRole('button', { name: 'Review answers', exact: true }).click();
    await page.getByRole('button', { name: 'Send answers ↵', exact: true }).click();
    await expect.poll(() => upstream.answer).toEqual({ scope: 'all' });
    upstream.finishText('Here is the **streaming response**.');
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).not.toBeVisible();
    await page.getByRole('button', { name: 'Read 1 file', exact: true }).click();
    await page.getByRole('button', { name: /Read README.md/ }).click();
    await expect(page.getByText('Project README contents')).toBeVisible();
    upstream.reconnect();
    await expect(page.getByText('Recovered after reconnect.', { exact: true })).toBeVisible();
    await page.reload();
    await page
      .getByRole('navigation', { name: 'Sessions', exact: true })
      .getByRole('button', { name: /^New chat/ })
      .click();
    await expect(page.getByRole('article', { name: 'Assistant' }).locator('strong')).toHaveText(
      'streaming response',
    );
    await expect(page.getByText('Recovered after reconnect.', { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('One more thing');
    await page
      .getByRole('navigation', { name: 'Sessions', exact: true })
      .getByRole('button', { name: /^Updated through/ })
      .click();
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('');
    await page
      .getByRole('navigation', { name: 'Sessions', exact: true })
      .getByRole('button', { name: /^New chat/ })
      .click();
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(
      'One more thing',
    );
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeEnabled();
    await page.keyboard.press('ControlOrMeta+Shift+m');
    await expect(page.getByRole('combobox', { name: 'Search model', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    expect(upstream.running).toBe(true);
    await page.keyboard.press('Escape');
    await expect.poll(() => upstream.running).toBe(false);
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).not.toBeVisible();
    await page.screenshot({ path: info.outputPath('chat-desktop.png') });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.sidebar')).toBeHidden();
    await page.keyboard.press('ControlOrMeta+b');
    await expect(page.locator('.sidebar')).toBeVisible();
    await page.keyboard.press('ControlOrMeta+b');
    await expect(page.locator('.sidebar')).toBeHidden();
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({ path: info.outputPath('chat-mobile.png') });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.getByRole('button', { name: 'Toggle sidebar' }).click();
    await page.getByRole('button', { name: 'Open project' }).click();
    await expect(page.getByRole('heading', { name: 'Open a project' })).toBeVisible();

    await page.getByRole('button', { name: 'Toggle sidebar' }).click();
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Toggle sidebar' }).click();
    await page.getByRole('button', { name: 'Appearance' }).click();
    await expect(page.getByRole('radio', { name: 'System' })).toBeChecked();
    await page.getByRole('button', { name: 'Light theme' }).click();
    await page.getByRole('option', { name: 'Catppuccin Latte' }).click();
    await page.getByRole('button', { name: 'Dark theme' }).focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Dark theme' })).toHaveText(/Catppuccin Mocha/);
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(239, 241, 245)');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(30, 30, 46)');
    await page.reload();
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(30, 30, 46)');
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

test('workspace: combined session details, shared thread actions and native scrollbars', async ({
  page,
}, info) => {
  const directory = info.outputPath('project');
  const upstream = await fixture(directory);
  upstream.seedHistory(60);
  const parent = upstream.sessions[0]!;
  const child = (index: number): SessionInfo => ({
    ...parent,
    id: `summary-child-${index}`,
    title: `Review task ${index}`,
    parentID: parent.id,
    outcome: 'succeeded',
  });
  upstream.sessions.push(...Array.from({ length: 13 }, (_, index) => child(index)));
  parent.cost = 0.25;
  upstream.diffs.push({
    file: 'src/summary.tsx',
    patch: '@@ -1 +1 @@\n-old\n+new\n',
    additions: 258,
    deletions: 35,
    status: 'modified',
  });
  const previous = process.env.OPENCODE_URL;
  process.env.OPENCODE_URL = upstream.url;
  const gateway = await startGateway({ assets: resolve('apps/web/dist') });
  const reads: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (/\/workspace\/vcs|\/subagents/.test(request.url())) reads.push(request.url());
  });
  try {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(gateway.url);
    await page.getByLabel('Project directory', { exact: true }).fill(directory);
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page.getByRole('button', { name: 'Explore the project' }).click();
    await expect(page.getByRole('heading', { name: 'Change 59', exact: true })).toBeVisible();
    expect(reads).toEqual([]);

    const panel = page.getByRole('dialog', { name: 'Session details', exact: true });
    const toggle = page.getByRole('button', { name: 'Session details', exact: true });
    await page.setViewportSize({ width: 1444, height: 1000 });
    await expect(panel).toBeHidden();
    await expect(page.getByRole('button', { name: 'Thread summary', exact: true })).toHaveCount(0);
    await expect(page.locator('.composer-area')).toHaveCSS('transform', 'none');
    await toggle.click();
    await expect(panel.getByRole('button', { name: /1 file changed/ })).toHaveText(
      '1 file changed+258 / −35',
    );
    const subagents = panel.getByRole('button', { name: /^Subagents/ });
    await expect(subagents).toHaveAttribute('aria-label', 'Subagents: 13 subagents');
    await expect(subagents.locator('.session-subagent-avatar')).toHaveCount(3);
    await expect(subagents.locator('.session-subagents-more')).toHaveText('+10 more');
    expect(
      await subagents
        .locator('.session-subagent-avatar')
        .evaluateAll((nodes) => new Set(nodes.map((node) => getComputedStyle(node).color)).size),
    ).toBe(3);
    await subagents.hover();
    await expect(subagents).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    for (const label of ['Usage', 'MCP', 'Skills'])
      await expect(panel.getByText(label, { exact: true })).toBeVisible();
    await panel.getByText('Usage', { exact: true }).click();
    await expect(panel.getByText('Total cost', { exact: true })).toBeVisible();
    expect(
      reads.filter((url) => new URL(url).pathname === `/api/sessions/${parent.id}/subagents`),
    ).toHaveLength(1);
    await page.screenshot({ path: info.outputPath('session-details-light.png') });
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(toggle).toBeFocused();
    await page.setViewportSize({ width: 2000, height: 1000 });
    await expect(panel).toBeHidden();
    await expect(page.locator('.composer-area')).toHaveCSS('transform', 'none');

    const scroll = page.locator('.timeline-scroll');
    await page.getByRole('button', { name: 'Hide sidebar', exact: true }).focus();
    await page.mouse.move(0, 0);
    await expect(scroll).toHaveCSS('scrollbar-gutter', 'stable both-edges');
    await expect(scroll).toHaveCSS('scrollbar-color', 'rgba(0, 0, 0, 0) rgba(0, 0, 0, 0)');
    await scroll.hover();
    await expect(scroll).not.toHaveCSS('scrollbar-color', 'rgba(0, 0, 0, 0) rgba(0, 0, 0, 0)');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.emulateMedia({ forcedColors: 'active' });
    await expect(scroll).toHaveCSS('scrollbar-color', 'auto');
    await expect(scroll).toHaveCSS('scrollbar-width', 'auto');
    await page.emulateMedia({ forcedColors: 'none' });
    await toggle.click();
    await panel.getByRole('button', { name: /1 file changed/ }).click();
    await expect(panel).toBeHidden();
    await expect(page.getByRole('combobox', { name: 'Changes comparison' })).toBeVisible();
    await page.getByRole('button', { name: 'Close workspace panel' }).click();

    upstream.sessions.find((session) => session.id === 'summary-child-0')!.outcome = 'failed';
    upstream.emit({
      type: 'session.status',
      data: { sessionID: 'summary-child-0', status: { type: 'idle' } },
    });
    await toggle.click();
    await expect(subagents).toHaveAttribute('aria-label', 'Subagents: 13 subagents');
    await page.screenshot({ path: info.outputPath('session-details-dark.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(panel).toBeVisible();
    await page.screenshot({ path: info.outputPath('session-details-mobile.png') });
    await subagents.click();
    await expect(panel).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Delegated sessions' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Review task 0.*Failed/ })).toBeVisible();
    await page.getByRole('button', { name: 'Close workspace panel' }).click();

    upstream.sessions.push(...Array.from({ length: 88 }, (_, index) => child(index + 13)));
    upstream.emit({ type: 'session.created', data: upstream.sessions.at(-1)! });
    await toggle.click();
    await expect(subagents).toHaveAttribute('aria-label', 'Subagents: 100+ subagents');
    await expect(subagents.locator('.session-subagents-more')).toHaveText('+97 more');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1444, height: 1000 });
    const actions = page.getByRole('button', { name: 'Thread actions', exact: true });
    await actions.click();
    const menu = page.getByRole('menu', { name: 'Explore the project actions', exact: true });
    const labels = await menu.getByRole('menuitem').allTextContents();
    expect(labels).toEqual(['Mark as unread']);
    await page.keyboard.press('Escape');
    await expect(actions).toBeFocused();
    await actions.click();
    await menu.getByRole('menuitem', { name: 'Mark as unread' }).click();
    await expect(menu).toBeHidden();
    await expect.poll(() => parent.metadata?.[SESSION_UNREAD_KEY]).toEqual(expect.any(String));
    const marker = parent.metadata![SESSION_UNREAD_KEY];
    const thread = page.getByRole('button', { name: /Explore the project/ }).first();
    await expect(thread.getByRole('img', { name: 'Unread thread', exact: true })).toBeVisible();
    await thread.click({ button: 'right' });
    expect(await menu.getByRole('menuitem').allTextContents()).toEqual(labels);
    await menu.getByRole('menuitem', { name: 'Mark as unread' }).click();
    await expect.poll(() => parent.metadata?.[SESSION_UNREAD_KEY]).not.toBe(marker);
    await expect(menu).toBeHidden();
    expect(errors).toEqual([]);
  } finally {
    await page.close();
    await gateway.close();
    await upstream.close();
    if (previous === undefined) delete process.env.OPENCODE_URL;
    else process.env.OPENCODE_URL = previous;
  }
});

test('conversation: tool activity keeps its input, output and status visible', async ({
  page,
}, info) => {
  const directory = info.outputPath('project');
  const upstream = await fixture(directory);
  const previous = process.env.OPENCODE_URL;
  process.env.OPENCODE_URL = upstream.url;
  const gateway = await startGateway({ assets: resolve('apps/web/dist') });
  try {
    await page.goto(gateway.url);
    await page.getByLabel('Project directory', { exact: true }).fill(directory);
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page.getByRole('button', { name: 'Explore the project' }).click();
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Inspect the project');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.locator('.chat-status')).toBeEmpty();
    const tool: SessionMessageAssistantTool = {
      type: 'tool',
      id: 'activity-tool',
      name: 'read',
      time: { created: 2 },
      state: { status: 'streaming', input: '' },
    };
    upstream.work([tool]);
    const group = page.locator('.activity-group').last();
    const summary = group.locator(':scope > .disclosure-trigger');
    await expect(summary).toContainText('Working');
    await expect(summary).toContainText('Read 1 file');
    await summary.click();
    const details = group.locator('.activity-item > .disclosure-trigger');
    await expect(details).toContainText('Preparing…');
    upstream.work([
      { ...tool, state: { status: 'running', input: { path: 'README.md' }, metadata: {} } },
    ]);
    await expect(details).toContainText('README.md');
    await expect(details).toContainText('Running…');
    await details.click();
    await expect(group.locator('.tool-details')).toContainText('"path": "README.md"');
    upstream.ask();
    await expect(page.locator('.chat-status')).toHaveText('Waiting for permission');
    await page.getByRole('button', { name: 'Allow once' }).click();
    await page.getByRole('radio', { name: 'Whole project', exact: true }).check();
    await page.getByRole('button', { name: 'Review answers', exact: true }).click();
    await page.getByRole('button', { name: 'Send answers ↵', exact: true }).click();
    upstream.work([
      {
        ...tool,
        state: {
          status: 'completed',
          input: { path: 'README.md' },
          content: [{ type: 'text', text: 'Project README contents' }],
        },
      },
    ]);
    await expect(summary).toHaveText('Read 1 file');
    await expect(details.locator('[aria-label="Completed"]')).toBeVisible();
    await expect(group.locator('.tool-details')).toContainText('Project README contents');
    await expect(page.locator('.work-header')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('tool-activity.png') });
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).not.toBeVisible();
    await expect(summary).toHaveText('Read 1 file');
  } finally {
    await gateway.close();
    await upstream.close();
    if (previous === undefined) delete process.env.OPENCODE_URL;
    else process.env.OPENCODE_URL = previous;
  }
});

test('conversation: grouped activity and anchored automatic history', async ({ page }, info) => {
  const directory = info.outputPath('project');
  const upstream = await fixture(directory);
  upstream.seedHistory(600);
  const previous = process.env.OPENCODE_URL;
  process.env.OPENCODE_URL = upstream.url;
  const gateway = await startGateway({ assets: resolve('apps/web/dist') });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(gateway.url);
    await page.getByLabel('Project directory', { exact: true }).fill(directory);
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page.getByRole('button', { name: 'Explore the project' }).click();
    await expect(page.getByRole('heading', { name: 'Change 599', exact: true })).toBeVisible();
    expect(await page.locator('.timeline-row').count()).toBeLessThan(40);
    await expect(page.locator('.tool-details')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Load earlier messages' })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('activity-collapsed.png') });
    const latestGroup = page.locator('.activity-group > .disclosure-trigger').last();
    await expect(latestGroup).toHaveText('Read 6 files');
    await latestGroup.click();
    await expect
      .poll(async () => {
        const group = await page.locator('.activity-group').last().boundingBox();
        const answer = await page
          .locator('[data-row-id="history-answer-599:text:0"]')
          .boundingBox();
        return (answer?.y ?? 0) - ((group?.y ?? 0) + (group?.height ?? 0));
      })
      .toBeGreaterThanOrEqual(0);
    const tool = page.getByRole('button', { name: /Read src\/feature-0-0.ts/ }).last();
    await tool.click();
    await expect(page.locator('.tool-details')).toHaveCount(1);
    await page.screenshot({ path: info.outputPath('activity-expanded.png') });

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/sessions/*/messages?cursor=*', async (route) => {
      await gate;
      await route.continue();
    });
    const requested = page.waitForRequest((request) => request.url().includes('/messages?cursor='));
    const scroll = page.locator('.timeline-scroll');
    await scroll.evaluate((node) => {
      node.scrollTop = 180;
    });
    await requested;
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const anchor = await page.locator('.timeline-row').evaluateAll((nodes) => {
      const viewport = document.querySelector('.timeline-scroll')!.getBoundingClientRect();
      const node = nodes
        .filter((element) => {
          const box = element.getBoundingClientRect();
          return box.top > viewport.top + 20 && box.top < viewport.bottom;
        })
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0]!;
      return { id: node.getAttribute('data-row-id')!, top: node.getBoundingClientRect().top };
    });
    release();
    await expect.poll(() => upstream.messageRequests.filter(Boolean).length).toBeGreaterThan(0);
    await expect(page.getByText('Loading earlier messages…')).not.toBeVisible();
    await expect
      .poll(async () => {
        const box = await page.locator(`[data-row-id="${anchor.id}"]`).boundingBox();
        return Math.abs((box?.y ?? -1000) - anchor.top);
      })
      .toBeLessThan(3);
    expect(await page.locator('.timeline-row').count()).toBeLessThan(40);
    await page.getByRole('button', { name: 'Jump to latest' }).click();
    await expect(page.getByRole('heading', { name: 'Change 599', exact: true })).toBeVisible();
    await expect(page.locator('.activity-group > .disclosure-trigger').last()).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(page.locator('.tool-details')).toHaveCount(1);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.sidebar')).toBeHidden();
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({ path: info.outputPath('activity-mobile.png') });
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
  const linkURL = 'https://example.com/session?org=fixture&view=chat';
  upstream.seedLink(linkURL);
  // The previous custom writer used this exact JSON shape and filename.
  const savedProject = { directory, name: 'project' };
  const savedPreferences = {
    project: JSON.stringify(savedProject),
    projects: JSON.stringify([savedProject]),
    theme: JSON.stringify({
      mode: 'dark',
      light: { preset: 'catppuccin-latte' },
      dark: { preset: 'catppuccin-mocha' },
    }),
  };
  const preferencesFile = info.outputPath('profile/preferences.json');
  await mkdir(info.outputPath('profile'), { recursive: true });
  await writeFile(preferencesFile, JSON.stringify(savedPreferences));
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
    expect(await page.evaluate(() => window.desktop!.getPreferences())).toEqual(savedPreferences);
    const openApps = await page.evaluate(() => window.desktop!.listOpenApps());
    expect(openApps.some((entry) => entry.id === 'finder')).toBe(true);
    if (process.platform === 'darwin') {
      expect(openApps.find((entry) => entry.id === 'finder')?.icon).toMatch(
        /^data:image\/png;base64,/,
      );
      expect(openApps.some((entry) => entry.id === 'terminal')).toBe(true);
    }
    await expect(
      page.evaluate(() => window.desktop!.openInApp('relative/path', 'finder')),
    ).rejects.toThrow('Expected an absolute directory');
    await expect(
      page.evaluate((path) => window.desktop!.openInApp(path, 'finder'), preferencesFile),
    ).rejects.toThrow('Choose a project directory');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(30, 30, 46)');
    await expect(page.locator('.toolbar-project')).toHaveText('Fixture project');
    if (process.platform === 'darwin') {
      const toolbar = (await page.locator('.toolbar').boundingBox())!;
      const brand = (await page.locator('.sidebar-brand').boundingBox())!;
      const toggle = (await page.getByRole('button', { name: 'Hide sidebar' }).boundingBox())!;
      expect(brand.y).toBeGreaterThanOrEqual(toolbar.height);
      expect(toggle.y + toggle.height).toBeLessThanOrEqual(toolbar.height);
      await page.screenshot({ path: info.outputPath('mac-header-expanded.png') });
      await expect(page.locator('.sidebar-header')).toHaveCSS('padding-left', '88px');
      await application.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]!.setFullScreen(true);
      });
      await expect(page.locator('html')).toHaveAttribute('data-fullscreen', 'true');
      await expect(page.locator('.sidebar-header')).toHaveCSS('padding-left', '8px');
      await page.keyboard.press('ControlOrMeta+b');
      await expect(page.locator('.sidebar')).toBeHidden();
      await expect(page.locator('.toolbar')).toHaveCSS('padding-left', '20px');
      // Reloading while already fullscreen must recover the native snapshot.
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-fullscreen', 'true');
      await expect(page.locator('.sidebar-header')).toHaveCSS('padding-left', '8px');
      await page.screenshot({ path: info.outputPath('mac-header-fullscreen.png') });
      await application.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]!.setFullScreen(false);
      });
      await expect(page.locator('html')).toHaveAttribute('data-fullscreen', 'false');
      await expect(page.locator('.sidebar-header')).toHaveCSS('padding-left', '88px');
    }
    await page.keyboard.press('ControlOrMeta+b');
    await expect(page.locator('.sidebar')).toBeHidden();
    if (process.platform === 'darwin') {
      const brand = (await page.locator('.toolbar-brand').boundingBox())!;
      expect(brand.x).toBeGreaterThanOrEqual(96);
      await page.screenshot({ path: info.outputPath('mac-header-collapsed.png') });
    }
    await page.keyboard.press('ControlOrMeta+b');
    await expect(page.locator('.sidebar')).toBeVisible();
    await page.keyboard.press('ControlOrMeta+,');
    await expect(page.getByRole('heading', { name: 'General', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Open project', exact: true })).toBeVisible();
    type LinkState = {
      opened: string[];
      copied: string[];
      replacements: string[];
      menu?: Electron.Menu;
      params?: Electron.ContextMenuParams;
    };
    await application.evaluate(({ shell, clipboard, Menu, BrowserWindow }) => {
      const state: LinkState = { opened: [], copied: [], replacements: [] };
      (globalThis as typeof globalThis & { linkTest: LinkState }).linkTest = state;
      shell.openExternal = async (url) => {
        state.opened.push(url);
      };
      clipboard.writeText = async (text) => {
        state.copied.push(text);
      };
      Menu.prototype.popup = function () {
        state.menu = this;
      };
      BrowserWindow.getAllWindows()[0]!.webContents.on('context-menu', (_event, params) => {
        state.params = params;
      });
    });
    await application.evaluate(({ dialog }, selected) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] });
    }, directory);
    await page.keyboard.press('ControlOrMeta+o');
    await page.getByRole('button', { name: 'Browse for a project folder' }).click();
    await expect(
      page.locator('.sidebar-actions').getByRole('button', { name: 'New chat', exact: true }),
    ).toBeEnabled();
    const sessionCount = upstream.sessions.length;
    await page.keyboard.press('ControlOrMeta+n');
    await expect.poll(() => upstream.sessions.length).toBe(sessionCount + 1);
    await expect(
      page.getByRole('heading', { name: 'Rename conversation: New chat', exact: true }),
    ).toBeVisible();
    await page.keyboard.press('ControlOrMeta+Alt+n');
    await expect.poll(() => upstream.sessions.length).toBe(sessionCount + 2);
    await page.getByRole('button', { name: 'Explore the project' }).click();
    await expect(page.getByRole('heading', { name: 'Explore the project' })).toBeVisible();
    expect(await page.evaluate(() => 'require' in window || 'process' in window)).toBe(false);
    await page.getByRole('button', { name: 'Session details', exact: true }).click();
    const summary = page.getByRole('dialog', { name: 'Session details', exact: true });
    await expect(summary).toContainText('0 files changed+0 / −0');
    await expect(summary.getByRole('button', { name: /^Subagents:/ })).toHaveCount(0);
    await expect(summary.getByText('Usage', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('session-details-electron.png') });
    await page.keyboard.press('Escape');
    await expect(summary).toBeHidden();
    await page.getByRole('button', { name: 'Open in…', exact: true }).click();
    await expect(
      page.getByRole('menuitemradio', { name: openApps[0]!.label, exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator('input[type=file]').setInputFiles({
      name: 'download.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Original attachment bytes'),
    });
    for (const source of ['draft', 'sent']) {
      if (source === 'sent') {
        await page.getByRole('button', { name: 'Send message', exact: true }).click();
        await expect(page.locator('.composer-attachments')).toHaveCount(0);
      }
      const downloadPath = info.outputPath(`download-${source}.txt`);
      const downloaded = application.evaluate(
        ({ BrowserWindow }, path) =>
          new Promise<string>((resolve) => {
            BrowserWindow.getAllWindows()[0]!.webContents.session.once(
              'will-download',
              (_event, item) => {
                item.setSavePath(path);
                item.once('done', (_event, state) => resolve(state));
              },
            );
          }),
        downloadPath,
      );
      await page.getByRole('button', { name: 'Download download.txt', exact: true }).click();
      expect(await downloaded).toBe('completed');
      expect(await readFile(downloadPath, 'utf8')).toBe('Original attachment bytes');
    }
    await application.evaluate(async ({ clipboard, ClipboardItem }, base64) => {
      await clipboard.write([
        new ClipboardItem({
          'image/png': new Blob([Buffer.from(base64, 'base64')], { type: 'image/png' }),
        }),
      ]);
    }, pngBase64);
    await page.getByRole('textbox', { name: 'Message', exact: true }).focus();
    await page.keyboard.press('ControlOrMeta+v');
    await expect(page.locator('.composer-attachments img')).toHaveCount(1);
    await expect
      .poll(() =>
        page
          .locator('.composer-attachments img')
          .evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBe(64);
    await page
      .locator('.composer-attachments')
      .getByRole('button', { name: /^Remove / })
      .click();
    await expect(page.locator('.composer-attachments')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Thinking level', exact: true })).toBeEnabled();
    await page.getByRole('textbox', { name: 'Message', exact: true }).focus();
    await page.keyboard.press('Control+t');
    await expect(page.getByRole('button', { name: 'Thinking level', exact: true })).toHaveText(
      'Low',
    );
    const composer = page.getByRole('textbox', { name: 'Message', exact: true });
    await composer.fill('Select text and correct a typo.');
    const inputBox = (await composer.boundingBox())!;
    await page.mouse.move(inputBox.x + 4, inputBox.y + 12);
    await page.mouse.down();
    await page.mouse.move(inputBox.x + 130, inputBox.y + 12, { steps: 8 });
    await page.mouse.up();
    expect(
      await composer.evaluate(
        (input: HTMLTextAreaElement) => input.selectionEnd > input.selectionStart,
      ),
    ).toBe(true);
    await composer.press('ControlOrMeta+a');
    await composer.click({ button: 'right', position: { x: 25, y: 12 } });
    await expect
      .poll(() =>
        application.evaluate(() => {
          const state = (globalThis as typeof globalThis & { linkTest: LinkState }).linkTest;
          return {
            editable: state.params?.isEditable,
            copy: state.params?.editFlags.canCopy,
            roles: state.menu?.items.map((item) => item.role?.toLowerCase()).filter(Boolean),
          };
        }),
      )
      .toEqual({
        editable: true,
        copy: true,
        roles: ['undo', 'redo', 'cut', 'copy', 'paste', 'selectall'],
      });
    await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]!.webContents.insertText('Corrected draft');
    });
    await expect(composer).toHaveValue('Corrected draft');
    // Use the actual Chromium context snapshot with deterministic suggestions;
    // do not depend on downloaded dictionaries or write the user's OS dictionary.
    const spellingItems = await application.evaluate(({ BrowserWindow }) => {
      const state = (globalThis as typeof globalThis & { linkTest: LinkState }).linkTest;
      const window = BrowserWindow.getAllWindows()[0]!;
      const contents = window.webContents;
      const replace = contents.replaceMisspelling;
      contents.replaceMisspelling = (word) => state.replacements.push(word);
      contents.emit('context-menu', {} as Electron.Event, {
        ...state.params!,
        misspelledWord: 'mistkaen',
        dictionarySuggestions: ['mistaken'],
      });
      const item = state.menu!.items.find((item) => item.label === 'mistaken')!;
      item.click(item, window, {} as Electron.KeyboardEvent);
      contents.replaceMisspelling = replace;
      return state.menu!.items.map((item) => item.label);
    });
    expect(spellingItems).toContain('Learn Spelling');
    expect(
      await application.evaluate(
        () => (globalThis as typeof globalThis & { linkTest: LinkState }).linkTest.replacements,
      ),
    ).toEqual(['mistaken']);
    await composer.fill('');
    const appURL = page.url();
    const link = page.getByRole('link', { name: 'Fixture link', exact: true });
    await link.click();
    await expect
      .poll(() =>
        application.evaluate(
          () => (globalThis as typeof globalThis & { linkTest: LinkState }).linkTest.opened,
        ),
      )
      .toEqual([linkURL]);
    expect(page.url()).toBe(appURL);
    expect(application.windows()).toHaveLength(1);
    await link.click({ button: 'right' });
    await expect
      .poll(() =>
        application.evaluate(() =>
          (globalThis as typeof globalThis & { linkTest: LinkState }).linkTest.menu?.items.map(
            (item) => item.label,
          ),
        ),
      )
      .toEqual(['Open link', 'Copy link']);
    for (const label of ['Copy link', 'Open link']) {
      await application.evaluate(({ BrowserWindow }, label) => {
        const menu = (globalThis as typeof globalThis & { linkTest: LinkState }).linkTest.menu!;
        const item = menu.items.find((item) => item.label === label)!;
        item.click(item, BrowserWindow.getAllWindows()[0], {} as Electron.KeyboardEvent);
      }, label);
    }
    await expect
      .poll(() =>
        application.evaluate(() => {
          const { opened, copied } = (globalThis as typeof globalThis & { linkTest: LinkState })
            .linkTest;
          return { opened, copied };
        }),
      )
      .toEqual({ opened: [linkURL, linkURL], copied: [linkURL] });
    // Same-window links also leave the app in place; non-web schemes never reach the OS.
    // Electron cancels this navigation in main; avoid Playwright's navigation waiter.
    await link.evaluate((element) => element.removeAttribute('target'));
    await link.click({ noWaitAfter: true });
    await expect
      .poll(() =>
        application.evaluate(
          () => (globalThis as typeof globalThis & { linkTest: LinkState }).linkTest.opened.length,
        ),
      )
      .toBe(3);
    await page.evaluate(() => window.open('opencodex-test://blocked'));
    expect(
      await application.evaluate(
        () => (globalThis as typeof globalThis & { linkTest: LinkState }).linkTest.opened,
      ),
    ).toEqual([linkURL, linkURL, linkURL]);
    expect(page.url()).toBe(appURL);
    // Reset Chromium's pending-navigation state after the main-process cancellation.
    await page.reload();
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Appearance' }).click();
    await page.getByRole('radio', { name: 'Dark' }).click();
    await page.getByRole('button', { name: 'Dark theme' }).click();
    await page.getByRole('option', { name: 'Catppuccin Macchiato' }).click();
    await expect
      .poll(async () => {
        const preferences = await page.evaluate(() => window.desktop?.getPreferences());
        return JSON.parse(preferences?.theme ?? '{}');
      })
      .toMatchObject({ mode: 'dark', dark: { preset: 'catppuccin-macchiato' } });
    const storedPreferences = JSON.parse(await readFile(preferencesFile, 'utf8'));
    expect(storedPreferences.project).toBe(savedPreferences.project);
    expect(storedPreferences.projects).toBe(savedPreferences.projects);
    expect(JSON.parse(storedPreferences.theme)).toMatchObject({
      mode: 'dark',
      dark: { preset: 'catppuccin-macchiato' },
      light: { preset: 'catppuccin-latte' },
    });
    await application.close();
    application = await launch();
    const reopened = await application.firstWindow();
    await expect(reopened.getByRole('heading', { name: 'What should we build?' })).toBeVisible();
    await expect(reopened.locator('.toolbar-project')).toHaveText('Fixture project');
    await expect(reopened.locator('body')).toHaveCSS('background-color', 'rgb(36, 39, 58)');
    const projects = reopened.getByRole('navigation', { name: 'Projects', exact: true });
    await expect(projects.locator('.project-row')).toHaveCount(1);
    await expect(projects.getByTitle(directory, { exact: true })).toBeVisible();
    await reopened.getByRole('button', { name: 'Settings', exact: true }).click();
    await reopened.getByRole('button', { name: 'Close project', exact: true }).click();
    await expect
      .poll(async () => {
        const preferences = await reopened.evaluate(() => window.desktop!.getPreferences());
        return {
          project: preferences.project,
          projects: JSON.parse(preferences.projects ?? 'null'),
        };
      })
      .toEqual({ project: null, projects: [] });
    await reopened.reload();
    await expect(projects.locator('.project-row')).toHaveCount(0);
    await expect(reopened.getByRole('heading', { name: 'Open a project' })).toBeVisible();
  } finally {
    await application.close();
    await upstream.close();
  }
});
