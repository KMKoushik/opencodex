/**
 * OpenCode plugin installed by OpenCodex. It teaches agents to make canvases: HTML pages
 * OpenCodex shows in the chat, themed with the app, with saved data and optional server
 * code. The agent writes the files with its normal tools; these tools ask the running
 * OpenCodex gateway to create a canvas folder, and to check and screenshot one before it's
 * shown.
 *
 * The gateway installs this file verbatim into OpenCode's global plugins folder, so it must
 * stay self-contained: no static imports. Types below describe only the parts of the V2
 * plugin context this file uses.
 */

type ToolInput = Record<string, unknown>;
type Context = {
  skill: {
    transform(
      callback: (draft: {
        add(skill: {
          id: string;
          name: string;
          description: string;
          path: string;
          content: string;
        }): void;
      }) => void,
    ): Promise<unknown>;
  };
  session: {
    get(
      input: { sessionID: string },
      options?: { signal?: AbortSignal },
    ): Promise<{ parentID?: string; metadata?: Record<string, unknown> }>;
    hook(
      name: 'context',
      callback: (event: {
        sessionID: string;
        messages?: unknown[];
        tools: Record<string, unknown>;
      }) => Promise<void> | void,
    ): Promise<unknown>;
  };
  tool: {
    transform(
      callback: (editor: {
        add(tool: {
          name: string;
          description: string;
          input: Record<string, unknown>;
          options?: { codemode: boolean };
          execute: (
            input: ToolInput,
            context: { sessionID: string; signal: AbortSignal },
          ) => Promise<{ content: string }>;
        }): void;
      }) => void,
    ): Promise<unknown>;
  };
};
type Canvas = { id: string; title: string; path: string; updated: number };

/** Icon glyph names; `bun plugins` defines this from packages/contracts/src/canvas-glyphs.ts. */
declare const CANVAS_GLYPHS: readonly string[];

// Present only in the skill body, so finding it in a session's context means the skill loaded.
const MARKER = 'opencodex-canvas-skill';
const TOOLS = ['canvas_create', 'canvas_check', 'canvas_list', 'canvas_run'];
// Direct tools, not Code Mode catalog entries, so the context hook can hide them.
const OPTIONS = { codemode: false };

class CanvasError extends Error {}

const SKILL = `<!-- ${MARKER} -->
# Canvas

A canvas is a page OpenCodex shows in the chat, where you link it, and full size in a side
panel. Use one when a visual or interactive result says more than text: reports, dashboards,
comparisons, charts, audits, architecture or flow diagrams, timelines, checklists, small
tools. Prefer a canvas over a long markdown table or an ASCII diagram.

## Workflow

1. \`canvas_create({ title })\` makes a folder with a starter \`index.html\` and returns its
   path and id.
2. Write the page in \`index.html\` with your normal file tools: one self-contained HTML
   document with its own \`<style>\` and \`<script>\`. You have full control of the design.
   Make it look like a polished product page made by a great designer, not an admin
   template.
3. Put the data the page shows in \`data/<key>.json\` (one JSON value per file) and read it
   from \`canvas.data.<key>\`. Don't paste data into the page: the user and the app update
   values, and the page follows them.
4. \`canvas_check({ id })\` checks the canvas and renders the page the way OpenCodex shows it:
   728px wide (the reply column) and 390px (a phone) in dark mode, 728px in light, and the
   first screen of the full-size side panel at 1280px. It
   saves screenshots and reports the page's height, sideways overflow, and console errors.
   Read every screenshot, fix anything broken, cramped, misaligned, generic or hard to read,
   and check again until it passes and looks right.
5. Put the link it gives you, \`[Title](canvas:<id>)\`, on its own line in your final reply.
   The user sees the page there, so don't announce it or restate it; add only what the page
   doesn't say.

To change a canvas, edit its files (\`canvas_list\` finds it), run \`canvas_check\`, and link
it again. Open views update live.

## The page

- OpenCodex injects its theme as CSS variables on \`:root\`. They follow the user's theme and
  light/dark mode live, so build colors from them, directly or with \`color-mix()\`:
  \`--surface\` (the chat background behind the page), \`--elevated\` (raised surfaces),
  \`--text\`, \`--text-secondary\`, \`--text-tertiary\`, \`--border\`, \`--border-heavy\`, \`--hover\`,
  \`--primary\` and \`--on-primary\` (solid buttons), \`--accent\`, \`--success\`, \`--warning\`,
  \`--error\`, \`--code-bg\`, \`--font-sans\`, \`--font-mono\`, and the palette \`--blue\`, \`--green\`,
  \`--orange\`, \`--purple\`, \`--pink\`, \`--yellow\`, \`--red\`, \`--gray\`, with \`--chart-1\` to
  \`--chart-6\` for series. \`prefers-color-scheme\` matches too.
- The base stylesheet only sets the background, the text color, the font at 14px, and
  \`body { margin: 0 }\`. Everything else is yours.
- Scripts, styles and fonts load from public CDNs: cdn.jsdelivr.net, unpkg.com,
  cdnjs.cloudflare.com, esm.sh, and Google Fonts. Use a chart or diagram library when it
  helps (Chart.js, D3, Mermaid). Nothing else is reachable: no requests to other hosts, no
  local files, no localStorage. Data comes through \`canvas\`.
- Links to web pages open in the browser; use \`#anchors\` to move within the page.
- Build markup from data with \`textContent\`, or escape values you put in \`innerHTML\`.

## Layout

- In the chat, the page has no border and sits on the chat background, as wide as the reply
  column (about 728px; 390px on phones). Leave html, body and the outermost element without
  a background, and add no outer card, border, or banner title: the page is part of the
  reply.
- Use a fluid width with no horizontal padding on the outermost element. A box with its own
  background gets at least 16px of padding and rounded corners.
- In the side panel and an app's own page, the page fills a much wider frame (often 1100 to
  1600px) with the frame's padding. Fill that width: don't cap or center the whole page. Use
  the room for side-by-side sections, and cap only the line length of paragraphs (about
  75 characters) so text stays readable.
- Let content set the height. Give charts fixed pixel heights. Never use \`100vh\` or
  \`height: 100%\` on html or body. A page taller than about 1000px scrolls inside its frame in
  the chat, so put what matters first.

## Design

- Decide what the page is for before choosing its form: a verdict to read, a status to scan,
  decisions to make, or a tool to use. Lead with the answer, in words and numbers.
- Give each screen one most important thing. Numbers carry a sentence that says what they
  mean. Color means something (good, watch, bad), not decoration.
- Use readable type: body text at least 14px, real headings, comfortable line length and
  spacing. Don't nest boxes inside boxes.
- Keep long lists usable: important rows first, the rest grouped or collapsed, and search or
  filters only when they help.
- Turn raw errors and ids into plain words. Show when the data was last refreshed.
- It must work at 390px as well as 728px and wider, in light and dark.

## window.canvas

- \`canvas.data\` holds every value by key; \`canvas.get(key, fallback)\` reads one.
- \`canvas.set(key, value)\` or \`canvas.set(key, (current) => next)\` saves a value: the user's
  state, like checked items, notes, and choices. It's shared with you and every open view;
  you see it on your next read of \`data/<key>.json\`.
- When a value changes outside the page (you, a run, another view), the page is shown again
  with the new data. To update in place instead, keeping inputs and scroll, handle it with
  \`canvas.on('data', (key, value) => ...)\`.
- \`await canvas.call('name', ...args)\` runs an exported function of server.ts (see Apps) and
  resolves with its JSON result, or rejects with its error. \`canvas.running\` lists the
  functions running now, from any caller; \`canvas.on('running', (names) => ...)\`.
- \`canvas.open(url)\` opens a web page; \`canvas.open({ session })\` opens a chat that \`oc.run\`
  started.
- \`canvas.scheme\` is \`'light'\` or \`'dark'\`; \`canvas.on('theme', (scheme) => ...)\` is for
  drawing code that can't use CSS variables.

## Apps: server.ts

A canvas becomes an app when it needs live data or actions: refresh from GitHub, triage
issues, a button that does something. Add \`server.ts\` beside \`index.html\`. Its exported async
functions run in a process OpenCodex starts, with \`@opencodex/canvas/server\` (exact types in
\`.sdk/server.d.ts\` next to the canvases):

Apps are listed in the sidebar with an icon. Give one to \`canvas_create\` (\`icon: { glyph,
color }\`) or set \`"icon"\` in \`canvas.json\`; pick the glyph for what the app does.

- \`data.get(key, fallback)\`, \`data.set(key, value)\`, \`data.update(key, fallback, fn)\`: the
  same \`data/<key>.json\` values the page reads; writes show up in open views live. \`update\`
  is safe against concurrent edits from the page.
- \`sh(command, { cwd })\` runs a shell command and returns stdout; \`sh.json<T>(command)\`
  parses it (\`gh ... --json\`). A nonzero exit throws.
- \`oc.ask(prompt, { input, schema })\`: one model call without tools for judgment (classify,
  summarize, decide). With \`schema\` it returns validated, typed JSON. Build schemas with
  \`s.object\`, \`s.string\`, \`s.number\`, \`s.integer\`, \`s.boolean\`, \`s.enum([...])\`, \`s.array\`,
  \`s.optional\`; each takes a description. \`Infer<typeof schema>\` gives the type.
- \`oc.run(prompt, { project, title, thread, permissions })\`: a full agent session with tools
  in \`project\` (an absolute folder). Waits and returns \`{ text, sessionID }\`. \`thread\`
  continues the same session on later calls (e.g. \`issue-123\`).
- Leave out \`model\` on both. The user picks the app's model in its header (until then it
  follows this chat's model). Name one (\`model: 'providerID/modelID'\`) only when the user
  asks for a specific model for that call; it then overrides the user's pick.
- \`export const triggers: Triggers = { refresh: { every: '1d' } }\` runs a function on a
  schedule while OpenCodex is open. Only add one when the user asks for recurring work.

Put deterministic work in code (listing, filtering, diffing, skipping unchanged items, gh
commands) and use \`oc.ask\`/\`oc.run\` only where judgment is needed, so runs stay cheap. Keep
state the next run needs (what was seen, decisions) in data values. Functions take and
return JSON. server.ts can import only \`@opencodex/canvas/server\` and its own \`.ts\` files;
use \`sh\` for everything else.

In the page, \`await canvas.call('refresh')\` runs it; disable its button while
\`canvas.running.includes('refresh')\`, and show when the data was last refreshed. After
\`canvas_check\` passes, try each function with \`canvas_run\` before linking the canvas.

\`\`\`ts
// server.ts
import { data, oc, s, sh, type Triggers } from '@opencodex/canvas/server';

type Issue = { number: number; title: string; body: string; kind?: string; summary?: string };

export const triggers: Triggers = { refresh: { every: '6h' } };

const verdict = s.object({
  kind: s.enum(['bug', 'feature', 'question']),
  summary: s.string('One sentence for the dashboard'),
});

export async function refresh() {
  const issues = await sh.json<Issue[]>(
    'gh issue list -R owner/repo --json number,title,body --limit 50',
  );
  const known = await data.get<Issue[]>('issues', []);
  const fresh = issues.filter((issue) => !known.some((item) => item.number === issue.number));
  const labeled = await Promise.all(
    fresh.map(async (issue) => ({ ...issue, ...(await oc.ask('Triage this issue.', { input: issue, schema: verdict })) })),
  );
  await data.update<Issue[]>('issues', [], (current) => [...labeled, ...current]);
  await data.set('refreshed', Date.now());
  return { added: labeled.length };
}
\`\`\`

## Example page

\`\`\`html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  h1 { margin: 0 0 6px; font-size: 24px; line-height: 1.2; letter-spacing: -0.015em; }
  .sub { margin: 0 0 20px; color: var(--text-secondary); font-size: 15px; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1px;
    overflow: hidden; border: 1px solid var(--border); border-radius: 12px; background: var(--border); }
  .stat { padding: 14px 16px; background: var(--surface); }
  .stat b { display: block; font-size: 26px; letter-spacing: -0.02em; }
  .stat span { color: var(--text-secondary); font-size: 13px; }
  .bad b { color: var(--red); }
  ul { margin: 24px 0 0; padding: 0; list-style: none; }
  li { padding: 12px 0 12px 14px; border-top: 1px solid var(--border); border-left: 3px solid var(--red); }
  li small { display: block; color: var(--text-tertiary); }
</style>
</head>
<body>
<h1 id="lead"></h1>
<p class="sub" id="sub"></p>
<div class="stats" id="stats"></div>
<ul id="failures"></ul>
<script>
  const suites = canvas.get('suites', []);
  const failed = suites.filter((suite) => suite.failed > 0);
  const tests = suites.reduce((sum, suite) => sum + suite.passed + suite.failed, 0);
  document.getElementById('lead').textContent = failed.length
    ? \`\${failed.length} of \${suites.length} suites are failing\`
    : \`All \${suites.length} suites pass\`;
  document.getElementById('sub').textContent = \`\${tests.toLocaleString()} tests in the last CI run.\`;
  const stat = (value, label, bad) => {
    const cell = document.createElement('div');
    cell.className = bad ? 'stat bad' : 'stat';
    cell.append(Object.assign(document.createElement('b'), { textContent: value }));
    cell.append(Object.assign(document.createElement('span'), { textContent: label }));
    return cell;
  };
  document.getElementById('stats').append(
    stat(failed.reduce((sum, suite) => sum + suite.failed, 0), 'failing tests', failed.length > 0),
    stat(\`\${Math.max(0, ...suites.map((suite) => suite.seconds))}s\`, 'slowest suite'),
  );
  for (const suite of failed) {
    const item = document.createElement('li');
    item.textContent = suite.name;
    item.append(Object.assign(document.createElement('small'), { textContent: suite.firstError }));
    document.getElementById('failures').append(item);
  }
</script>
</body>
</html>
\`\`\`
`;

/** Gateways register in ~/.opencodex/gateways; newest first, skipping ones that are gone. */
async function gateway<T>(
  path: string,
  init: RequestInit,
  signal: AbortSignal,
  timeout = 30_000,
): Promise<T> {
  const { readdir, readFile, stat } = await import('node:fs/promises');
  const { homedir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = join(homedir(), '.opencodex', 'gateways');
  const names = await readdir(directory).catch(() => [] as string[]);
  const entries = await Promise.all(
    names
      .filter((name) => name.endsWith('.json'))
      .map(async (name) => {
        const file = join(directory, name);
        try {
          const [text, info] = await Promise.all([readFile(file, 'utf8'), stat(file)]);
          const url = (JSON.parse(text) as { url?: unknown }).url;
          return typeof url === 'string' ? { url, time: info.mtimeMs } : undefined;
        } catch {
          return undefined;
        }
      }),
  );
  for (const entry of entries
    .filter((item): item is { url: string; time: number } => Boolean(item))
    .sort((a, b) => b.time - a.time)) {
    let response: Response;
    try {
      response = await fetch(`${entry.url}/api${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json' },
        signal: timeout ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : signal,
      });
    } catch (error) {
      if (signal.aborted) throw error;
      continue;
    }
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    if (!response.ok)
      throw new CanvasError(body.message ?? `OpenCodex answered ${response.status}.`);
    return body as T;
  }
  throw new CanvasError(
    'OpenCodex isn’t running, so canvases can’t be created or checked. Ask the user to open OpenCodex.',
  );
}

/** Side chats keep their main chat here, like OpenCodex's side-chat plugin reads it. */
const SIDE_CHAT_KEY = 'opencodexSideChat';

const describe = (canvas: Canvas) =>
  `- ${canvas.id}: "${canvas.title}" (updated ${new Date(canvas.updated).toISOString().slice(0, 16).replace('T', ' ')}) ${canvas.path}`;

export default {
  id: 'opencodex.canvas',
  async setup(ctx: Context) {
    await ctx.skill.transform((draft) => {
      draft.add({
        id: 'canvas',
        name: 'canvas',
        description:
          'Show results as a canvas: a polished, interactive HTML page in the chat, themed with the app. Use for dashboards, metrics, charts, comparisons, reports, audits, architecture or flow diagrams, timelines, checklists, and small tools, instead of long markdown tables or ASCII diagrams. Also use it to build apps: a canvas with server code that runs on demand or on a schedule (every day, every hour) and calls the agent for judgment, for recurring work like triaging issues and PRs, monitors, and daily reports. OpenCodex apps are the way to schedule recurring work; do not use cron, launchd, or other schedulers.',
        path: new URL(import.meta.url).pathname,
        content: SKILL,
      });
    });

    const tool =
      (
        run: (
          input: ToolInput,
          context: { sessionID: string; signal: AbortSignal },
        ) => Promise<string>,
      ) =>
      async (input: ToolInput, context: { sessionID: string; signal: AbortSignal }) => {
        try {
          return { content: await run(input, context) };
        } catch (error) {
          if (error instanceof CanvasError) return { content: `Error: ${error.message}` };
          throw error;
        }
      };
    // A canvas belongs to the chat the user sees, not the subagent or side chat that made it.
    async function rootSession(sessionID: string, signal: AbortSignal) {
      let current = sessionID;
      for (let depth = 0; depth < 16; depth++) {
        const session = await ctx.session.get({ sessionID: current }, { signal });
        const marker = session.metadata?.[SIDE_CHAT_KEY] as { parentID?: unknown } | undefined;
        const parent =
          session.parentID ?? (typeof marker?.parentID === 'string' ? marker.parentID : undefined);
        if (!parent) break;
        current = parent;
      }
      return current;
    }
    const idField = { type: 'string', description: 'Canvas id from canvas_create or canvas_list.' };

    await ctx.tool.transform((editor) => {
      editor.add({
        name: 'canvas_create',
        options: OPTIONS,
        description:
          'Create a canvas folder with a starter index.html. Returns its id and the folder to write the page and data in.',
        input: {
          type: 'object',
          additionalProperties: false,
          required: ['title'],
          properties: {
            title: { type: 'string', description: 'Short title shown above it.' },
            icon: {
              type: 'object',
              additionalProperties: false,
              description: 'Icon for apps (canvases with server.ts) in the sidebar.',
              properties: {
                glyph: {
                  type: 'string',
                  enum: CANVAS_GLYPHS,
                },
                color: {
                  type: 'string',
                  enum: ['gray', 'blue', 'green', 'orange', 'pink', 'purple'],
                },
              },
            },
          },
        },
        execute: tool(async (input, context) => {
          const title = typeof input.title === 'string' ? input.title.trim() : '';
          if (!title) throw new CanvasError('Give the canvas a title.');
          const canvas = await gateway<Canvas>(
            '/canvases',
            {
              method: 'POST',
              body: JSON.stringify({
                title,
                sessionID: await rootSession(context.sessionID, context.signal),
                ...(input.icon && typeof input.icon === 'object' ? { icon: input.icon } : {}),
              }),
            },
            context.signal,
          );
          const root = canvas.path.replace(/[\\/][^\\/]+$/, '');
          return [
            `Created canvas "${canvas.title}" (id: ${canvas.id}).`,
            `Folder: ${canvas.path}`,
            `- Write the page in ${canvas.path}/index.html: one self-contained HTML document.`,
            `- Write data in ${canvas.path}/data/<key>.json and read it as canvas.data.<key>.`,
            `- For an app, server.ts goes beside it; its SDK types are in ${root}/.sdk/server.d.ts.`,
            `Then run canvas_check with id "${canvas.id}" and read its screenshots.`,
          ].join('\n');
        }),
      });
      editor.add({
        name: 'canvas_check',
        options: OPTIONS,
        description:
          'Check a canvas and render its page with its saved data as OpenCodex shows it, at chat and phone widths in dark and light. Saves screenshots to read, and reports overflow, page errors, and server.ts problems. Run after every change and fix what it reports; it gives the link to show the canvas when it passes.',
        input: {
          type: 'object',
          additionalProperties: false,
          required: ['id'],
          properties: { id: idField },
        },
        execute: tool(async (input, context) => {
          const id = typeof input.id === 'string' ? input.id : '';
          const result = await gateway<{ ok: boolean; report: string }>(
            `/canvases/${encodeURIComponent(id)}/check`,
            { method: 'POST' },
            context.signal,
            180_000,
          );
          return result.report;
        }),
      });
      editor.add({
        name: 'canvas_run',
        options: OPTIONS,
        description:
          "Run an exported function of a canvas's server.ts, as the page would, and return its result or error. Use it to test functions and to refresh an app on request.",
        input: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'name'],
          properties: {
            id: idField,
            name: { type: 'string', description: 'Exported function name.' },
            args: { type: 'array', description: 'JSON arguments.', items: {} },
          },
        },
        execute: tool(async (input, context) => {
          const id = typeof input.id === 'string' ? input.id : '';
          const name = typeof input.name === 'string' ? input.name : '';
          const result = await gateway<{ value: unknown }>(
            `/canvases/${encodeURIComponent(id)}/functions/${encodeURIComponent(name)}?source=agent`,
            {
              method: 'POST',
              body: JSON.stringify({ args: Array.isArray(input.args) ? input.args : [] }),
            },
            context.signal,
            0,
          );
          const text = JSON.stringify(result.value, null, 2) ?? 'null';
          return `${name}() returned:\n${text.length > 8000 ? `${text.slice(0, 8000)}\n…` : text}`;
        }),
      });
      editor.add({
        name: 'canvas_list',
        options: OPTIONS,
        description: 'List existing canvases, newest first, with their ids and folders.',
        input: { type: 'object', additionalProperties: false, properties: {} },
        execute: tool(async (_, context) => {
          const canvases = await gateway<Canvas[]>('/canvases', { method: 'GET' }, context.signal);
          return canvases.length
            ? canvases.slice(0, 50).map(describe).join('\n')
            : 'There are no canvases yet.';
        }),
      });
    });

    // Sessions that loaded the skill, and how many context messages were already searched.
    const enabled = new Set<string>();
    const searched = new Map<string, number>();
    await ctx.session.hook('context', (event) => {
      if (!enabled.has(event.sessionID)) {
        const messages = event.messages ?? [];
        // Compaction can shorten the context; search it again from the start.
        let start = searched.get(event.sessionID) ?? 0;
        if (start > messages.length) start = 0;
        if (messages.slice(start).some((message) => JSON.stringify(message).includes(MARKER))) {
          enabled.add(event.sessionID);
          searched.delete(event.sessionID);
        } else {
          if (searched.size >= 500 && !searched.has(event.sessionID))
            searched.delete(searched.keys().next().value!);
          searched.set(event.sessionID, messages.length);
        }
      }
      if (enabled.has(event.sessionID)) return;
      for (const name of TOOLS) delete event.tools[name];
    });
  },
};
