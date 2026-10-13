import { z } from 'zod';

const ID = '[a-z0-9][a-z0-9-]{0,62}-[a-z0-9]{4}';
/** Folder name under the canvases root, e.g. `test-results-4f2a`. */
export const canvasIDSchema = z.string().regex(new RegExp(`^${ID}$`));
/** A reply links a canvas as `[Title](canvas:<id>)`. */
export const CANVAS_LINK = new RegExp(`^canvas:(${ID})$`);
/** A data value's name: `data/<key>.json`. */
export const canvasKeySchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);

/** Glyphs an app's icon can use; the UI maps each to an icon it bundles. */
export const CANVAS_GLYPHS = [
  'activity',
  'alert',
  'analytics',
  'book',
  'bug',
  'calendar',
  'chart',
  'chat',
  'check',
  'clock',
  'cloud',
  'code',
  'database',
  'dollar',
  'file',
  'fire',
  'globe',
  'heart',
  'link',
  'mail',
  'notification',
  'package',
  'pull-request',
  'rocket',
  'search',
  'server',
  'shield',
  'star',
  'terminal',
  'test',
  'users',
] as const;
export type CanvasGlyph = (typeof CANVAS_GLYPHS)[number];
/** The project icon palette, so app and project icons sit together. */
export const CANVAS_ICON_COLORS = ['gray', 'blue', 'green', 'orange', 'pink', 'purple'] as const;
export const canvasIconSchema = z.object({
  glyph: z.enum(CANVAS_GLYPHS).optional(),
  color: z.enum(CANVAS_ICON_COLORS).optional(),
});
export type CanvasIcon = z.infer<typeof canvasIconSchema>;

export const canvasCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  sessionID: z.string().max(256).optional(),
  icon: canvasIconSchema.optional(),
});
export const canvasDataWriteSchema = z.object({
  value: z.json(),
  /** Revision the write was based on; null when the value didn't exist. */
  rev: z.string().max(64).nullable(),
});

export type CanvasInfo = {
  id: string;
  title: string;
  /** Absolute folder the agent edits. */
  path: string;
  sessionID?: string;
  /** `canvas.json`'s `icon`; invalid fields are dropped. */
  icon?: CanvasIcon;
  created: number;
  updated: number;
};

/** The view's transpiled files. `errors` are syntax errors that stop it from running. */
export type CanvasSource = CanvasInfo & {
  entry: string;
  modules: Record<string, string>;
  errors: string[];
  /** Changes whenever any view file changes, so hosts can rerun the view. */
  version: string;
  /** The canvas has a server.ts the view can call. */
  server: boolean;
};

export type CanvasValue = { value: unknown; rev: string };
export type CanvasData = Record<string, CanvasValue>;

export const canvasCallSchema = z.object({ args: z.array(z.json()).max(32).default([]) });

/** One invocation of a canvas server function, kept in the canvas's `.app/runs.json`. */
export type AppRun = {
  id: string;
  fn: string;
  /** Who started it: the view, the agent (canvas_run), or a trigger. */
  source: 'view' | 'agent' | 'trigger';
  started: number;
  ended?: number;
  status: 'running' | 'ok' | 'error' | 'interrupted';
  error?: string;
  /** Last lines the function printed. */
  logs: string[];
  /** Sessions `oc.run` started or continued. */
  sessions: { id: string; title: string }[];
};

/** A canvas with a `server.ts`: its functions, triggers, and latest run. */
export type AppInfo = CanvasInfo & {
  functions: string[];
  triggers: Record<string, { every: string }>;
  /** server.ts didn't build or load. */
  error?: string;
  running: string[];
  /** OpenCode project of the chat that made the app, when it has one. */
  projectID?: string;
  /** The newest run without its logs; the full history is `/api/apps/:id/runs`. */
  lastRun?: Omit<AppRun, 'logs'>;
  runCount: number;
};

/** A canvas's source files as written, for reading its code. */
export type CanvasFiles = { files: { name: string; text: string }[] };

/** Gateway → web event, sent on the `/api/events` stream as `canvas`. */
export type CanvasEvent =
  | { type: 'source'; id: string }
  | { type: 'data'; id: string; key: string; rev: string | null }
  | { type: 'list' }
  | { type: 'app'; id: string };

export type CanvasTheme = { scheme: 'light' | 'dark'; vars: Record<string, string> };

/** Messages between the web host and a canvas frame. Frames have an opaque origin. */
export const CANVAS_CHANNEL = 'opencodex-canvas';
export type HostMessage = { channel: typeof CANVAS_CHANNEL } & (
  | {
      type: 'init';
      mode: 'inline' | 'panel';
      theme: CanvasTheme;
      entry: string;
      modules: Record<string, string>;
      data: Record<string, unknown>;
    }
  | { type: 'theme'; theme: CanvasTheme }
  | { type: 'modules'; entry: string; modules: Record<string, string> }
  | { type: 'data'; key: string; value: unknown }
  | { type: 'result'; call: number; value?: unknown; error?: string }
  | { type: 'running'; names: string[] }
);
export type FrameMessage = { channel: typeof CANVAS_CHANNEL } & (
  | { type: 'ready' }
  | { type: 'size'; height: number }
  | { type: 'set'; key: string; value: unknown }
  | { type: 'call'; call: number; name: string; args: unknown[] }
  | { type: 'open'; target: string | { session: string } }
);
