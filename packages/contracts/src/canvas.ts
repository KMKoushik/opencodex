import { z } from 'zod';
import type { AnnotationOverlayResult, BrowserAnnotationTheme } from './desktop';
import { CANVAS_GLYPH_GROUPS } from './canvas-glyphs';

export { CANVAS_GLYPH_GROUPS };

const ID = '[a-z0-9][a-z0-9-]{0,62}-[a-z0-9]{4}';
/** Folder name under the canvases root, e.g. `test-results-4f2a`. */
export const canvasIDSchema = z.string().regex(new RegExp(`^${ID}$`));
/** A reply links a canvas as `[Title](canvas:<id>)`. */
export const CANVAS_LINK = new RegExp(`^canvas:(${ID})$`);
/** A data value's name: `data/<key>.json`. */
export const canvasKeySchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);

export type CanvasGlyph = (typeof CANVAS_GLYPH_GROUPS)[keyof typeof CANVAS_GLYPH_GROUPS][number];
export const CANVAS_GLYPHS = Object.values(
  CANVAS_GLYPH_GROUPS,
).flat() as readonly CanvasGlyph[] as [CanvasGlyph, ...CanvasGlyph[]];
/** The project icon palette, so app and project icons sit together. */
export const CANVAS_ICON_COLORS = ['gray', 'blue', 'green', 'orange', 'pink', 'purple'] as const;
export const canvasIconSchema = z.object({
  glyph: z.enum(CANVAS_GLYPHS).optional(),
  color: z.enum(CANVAS_ICON_COLORS).optional(),
});
export type CanvasIcon = z.infer<typeof canvasIconSchema>;
/** Body of `PUT /api/apps/:id/icon`; null goes back to the title's initial. */
export const canvasIconUpdateSchema = z.object({ icon: canvasIconSchema.nullable() });

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

export const appModelRefSchema = z.object({
  id: z.string().min(1).max(256),
  providerID: z.string().min(1).max(256),
  variant: z.string().max(64).optional(),
});
export type AppModelRef = z.infer<typeof appModelRefSchema>;
/** Body of `PUT /api/apps/:id/model`; null goes back to the chat's model. */
export const appModelUpdateSchema = z.object({ model: appModelRefSchema.nullable() });

/**
 * Where a model came from, most specific first: named in server.ts, picked for the app,
 * the chat that made the app, OpenCode's default, or the session a `thread` continues.
 */
export type AppModelSource = 'code' | 'app' | 'chat' | 'default' | 'thread';

/** The model `oc.ask` and `oc.run` use when the code doesn't name one. */
export type AppModel = {
  model: AppModelRef | null;
  source: Exclude<AppModelSource, 'code' | 'thread'> | 'none';
  /** The folder whose model catalog the picker shows: the chat's, or the home folder. */
  directory: string;
};

/** One `oc.ask` or `oc.run` inside a run. */
export type AppCall = {
  kind: 'ask' | 'run';
  /** `providerID/modelID`, with `:variant` when one is set. */
  model?: string;
  source?: AppModelSource;
  started: number;
  ended?: number;
  error?: string;
};

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
  /** Model calls, oldest first; absent on runs recorded before they were tracked. */
  calls?: AppCall[];
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
  /** Shows the comment overlay; the frame answers with `annotation`. */
  | { type: 'annotate'; theme: BrowserAnnotationTheme }
  /** `cancel` drops an open overlay; `close` removes the marks left for the screenshot. */
  | { type: 'annotate-end'; action: 'cancel' | 'close' }
);
export type FrameMessage = { channel: typeof CANVAS_CHANNEL } & (
  | { type: 'ready' }
  | { type: 'size'; height: number }
  | { type: 'set'; key: string; value: unknown }
  | { type: 'call'; call: number; name: string; args: unknown[] }
  | { type: 'open'; target: string | { session: string } }
  /** The overlay's result; null when cancelled. Marks stay drawn until `annotate-end`. */
  | { type: 'annotation'; result: AnnotationOverlayResult | null }
);
