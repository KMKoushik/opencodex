/**
 * OpenCode plugin installed by OpenCodex. It teaches agents to make canvases: small React
 * views built from OpenCodex's own components, shown beside the chat and themed with the
 * app. The agent writes the files with its normal tools; these tools ask the running
 * OpenCodex gateway to create a canvas folder and to check one before it's shown.
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

// Present only in the skill body, so finding it in a session's context means the skill loaded.
const MARKER = 'opencodex-canvas-skill';
const TOOLS = ['canvas_create', 'canvas_check', 'canvas_list'];
// Direct tools, not Code Mode catalog entries, so the context hook can hide them.
const OPTIONS = { codemode: false };

class CanvasError extends Error {}

const SKILL = `<!-- ${MARKER} -->
# Canvas

A canvas is a small React view that OpenCodex shows beside the chat, built from OpenCodex's
own components so it always matches the app's theme (light, dark, any preset). Use one when
a visual or interactive result reads better than text: dashboards, metrics, comparisons,
charts, audits, reports, architecture or flow diagrams, timelines, checklists, small tools.
Prefer a canvas over a long markdown table or an ASCII diagram.

## Workflow

1. \`canvas_create({ title })\` makes a folder and returns its path and id.
2. Write the view in \`app.tsx\` there with your normal file tools. It must
   \`export default function App()\`. Other \`.ts\`/\`.tsx\` files in the same folder can be
   imported with \`./name\`.
3. Put data the view shows in \`data/<key>.json\` (one JSON value per file) and read it with
   \`useData('<key>', fallback)\`. Keep large or changing data there rather than in code, so
   you can update it later without touching the view.
4. \`canvas_check({ id })\` type-checks, builds, and test-renders the view with its data.
   Fix every error it reports and check again until it passes.
5. Put the link it gives you, \`[Title](canvas:<id>)\`, on its own line in your final
   reply. OpenCodex shows the canvas there. Don't repeat the canvas's content in text;
   summarize what it shows in a sentence or two.

To change an existing canvas, edit its files (\`canvas_list\` finds it), run
\`canvas_check\`, and link it again. The user sees edits live.

## Rules

- Import only from \`react\`, \`@opencodex/canvas\`, and the canvas's own files. There is no
  network access: no fetch, no CDN scripts, no remote images. Put everything in data files.
- Use the components for all standard UI. Don't set colors, fonts, or shadows yourself;
  the components follow the theme. For custom SVG or small details, use the theme's CSS
  variables: \`var(--text)\`, \`var(--text-secondary)\`, \`var(--text-tertiary)\`,
  \`var(--surface)\`, \`var(--elevated)\`, \`var(--border)\`, \`var(--cv-blue)\`, \`--cv-green\`,
  \`--cv-orange\`, \`--cv-purple\`, \`--cv-pink\`, \`--cv-yellow\`, \`--cv-red\`, \`--cv-gray\`.
- Lay out with \`Stack\` (vertical, the page default), \`Row\`, and \`Grid\`. Lead with the
  answer: key numbers or the main chart first, details after. Keep it to one screen of
  dense, useful content; no decorative headers, emojis, or gradients.
- Canvases render inline in the chat (about 700 px wide) and full-size in a side panel,
  so layouts must work at any width: let \`Grid\` and charts size themselves.
- \`useData\` values are shared: the user's edits in the canvas are saved to the same
  files you edit, and you see them on your next read.

## Components (import from '@opencodex/canvas')

Exact props are in the \`.sdk\` folder next to the canvases (path in canvas_create's result).

Layout: \`Stack gap align\`, \`Row gap align justify wrap\`, \`Grid columns|minWidth gap\`,
\`Card title subtitle actions padding\`, \`Section title description actions\`, \`Divider label\`,
\`Tabs\` with \`Tab label\` children.
Text: \`Title subtitle actions\`, \`Heading level\`, \`Text muted size weight mono\`, \`Code\`,
\`CodeBlock code title maxHeight\`.
Display: \`Stat label value format delta deltaFormat invert caption tone\`, \`Badge tone\`,
\`Callout tone title\`, \`KeyValue items columns\`, \`Progress value max label format tone\`,
\`List items={[{ title, description, trailing }]}\`, \`Timeline items={[{ title, time,
description, tone }]}\`, \`TaskList items={[{ id, label, status|done, note }]} onToggle\`,
\`Table rows columns sortable maxHeight dense onRowClick\` (columns: keys or
\`{ key, label, align, format, width, render, tone: 'delta' }\`), \`DiffView patch|before+after\`,
\`Empty title\`.
Inputs (controlled, \`onChange\` gets the value): \`Button variant onClick\`, \`TextInput\`,
\`TextArea\`, \`NumberInput\`, \`Select options\`, \`SegmentedControl options\`, \`Checkbox\`,
\`Switch\`, \`Slider min max step\`.
Charts: \`BarChart data x series stacked horizontal showValues format\`,
\`LineChart data x series area curve dots zero format\`, \`AreaChart\`,
\`PieChart data={[{ label, value }]} donut center format\`, \`Sparkline values\`,
\`ScatterChart data x y group size label\`, \`Heatmap rows columns values format\`.
\`series\` is a column key, a list of keys, or \`{ key, label, color }\`; it defaults to every
numeric column.
Diagrams: \`AsciiDiagram spec\` (see Diagrams below).
Hooks: \`useData(key, fallback)\` returns \`[value, setValue]\`; \`useColorScheme()\`.
Formats: 'number', 'integer', 'compact', 'percent' (0.25 → 25%), 'currency', 'bytes',
'duration' (ms), Intl.NumberFormat options, or a function. Tones: neutral, info, success,
warning, danger. Colors: blue, green, orange, purple, pink, yellow, red, gray.

## Diagrams

Draw architecture, flow, and sequence diagrams with \`<AsciiDiagram spec={...} />\`. The spec
is the ascii-diagram format: everything sits in whole character cells, x to the right and y
down from 0,0. About 85 columns fit inline; wider diagrams scroll.

- \`boxes\`: \`{ id, x | centerX, y, width?, height?, title, lines, color, textColor, align }\`.
  The title sits in the top border. A box grows to fit: at least its longest line + 4 wide
  and its line count + 2 tall. Boxes can nest but not partly overlap.
- \`connectors\`: \`{ from: { box, port }, to: { box, port }, via?, route?, color }\` with ports
  top, right, bottom, left. The arrowhead stops one cell before the target. Without \`via\`
  the route bends once halfway; give \`via\` points for anything else. Every segment is
  horizontal or vertical. Connectors into the same port merge into one stem.
- \`lines\` are connectors without arrowheads; \`texts\` are \`{ x, y, value, anchor, color }\`
  (omit x to center). Labels go next to a line, never across it.
- Colors are theme names only: blue, green, orange, purple, pink, yellow, red, gray, the
  tones, \`text\`, \`muted\` (structure and labels), or \`accent\`.
- Leave 4 or more empty rows between stacked boxes (room for the connector and its label)
  and 4 or more columns between side-by-side boxes. Lead the main path top to bottom and
  bring side inputs in from the right. Keep titles short and in capitals.

canvas_check renders the diagram and reports overlaps, text crossing lines, and arrows
that don't end a straight stem, with their coordinates.

\`\`\`tsx
<AsciiDiagram
  spec={{
    boxes: [
      { id: 'ui', centerX: 20, y: 0, width: 26, title: 'WEB UI', lines: ['React'], color: 'blue' },
      { id: 'api', centerX: 20, y: 7, width: 26, title: 'GATEWAY', lines: ['/api routes'], color: 'green' },
      { id: 'db', x: 46, y: 7, width: 20, title: 'STORE', lines: ['SQLite'], color: 'orange' },
    ],
    connectors: [
      { from: { box: 'ui', port: 'bottom' }, to: { box: 'api', port: 'top' } },
      { from: { box: 'api', port: 'right' }, to: { box: 'db', port: 'left' }, color: 'orange' },
    ],
    texts: [{ x: 22, y: 4, value: 'HTTP', color: 'muted' }],
  }}
/>
\`\`\`

## Example

\`\`\`tsx
import { BarChart, Card, Grid, Stack, Stat, Table, Title, useData } from '@opencodex/canvas';

type Run = { suite: string; passed: number; failed: number; ms: number };

export default function App() {
  const [runs] = useData<Run[]>('runs', []);
  const failed = runs.reduce((sum, run) => sum + run.failed, 0);
  return (
    <Stack>
      <Title subtitle="Last CI run">Test results</Title>
      <Grid columns={3}>
        <Stat label="Suites" value={runs.length} />
        <Stat label="Failed tests" value={failed} tone={failed ? 'danger' : 'success'} />
        <Stat label="Slowest" value={Math.max(0, ...runs.map((run) => run.ms))} format="duration" />
      </Grid>
      <Card title="By suite">
        <BarChart data={runs} x="suite" series={['passed', 'failed']} stacked />
      </Card>
      <Table rows={runs} columns={['suite', 'passed', 'failed', { key: 'ms', label: 'Time', format: 'duration' }]} />
    </Stack>
  );
}
\`\`\`
`;

/** Gateways register in ~/.opencodex/gateways; newest first, skipping ones that are gone. */
async function gateway<T>(path: string, init: RequestInit, signal: AbortSignal): Promise<T> {
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
        signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
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
          'Show results as a canvas: an interactive view beside the chat built from themed components. Use for dashboards, metrics, charts, comparisons, reports, audits, architecture or flow diagrams, timelines, checklists, and small tools, instead of long markdown tables or ASCII diagrams.',
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
          'Create a canvas folder with a starter app.tsx. Returns its id and the folder to write the view and data in.',
        input: {
          type: 'object',
          additionalProperties: false,
          required: ['title'],
          properties: { title: { type: 'string', description: 'Short title shown above it.' } },
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
              }),
            },
            context.signal,
          );
          const root = canvas.path.replace(/[\\/][^\\/]+$/, '');
          return [
            `Created canvas "${canvas.title}" (id: ${canvas.id}).`,
            `Folder: ${canvas.path}`,
            `- Write the view in ${canvas.path}/app.tsx (default-export the component).`,
            `- Write data in ${canvas.path}/data/<key>.json and read it with useData('<key>', fallback).`,
            `- Component props: ${root}/.sdk/index.d.ts and the files next to it.`,
            `Then run canvas_check with id "${canvas.id}".`,
          ].join('\n');
        }),
      });
      editor.add({
        name: 'canvas_check',
        options: OPTIONS,
        description:
          'Type-check, build, and test-render a canvas with its saved data. Run after every change and fix what it reports; it gives the link to show the canvas when it passes.',
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
          );
          return result.report;
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
