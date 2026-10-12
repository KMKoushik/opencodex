import { z } from 'zod';

const ID = '[a-z0-9][a-z0-9-]{0,62}-[a-z0-9]{4}';
/** Folder name under the canvases root, e.g. `test-results-4f2a`. */
export const canvasIDSchema = z.string().regex(new RegExp(`^${ID}$`));
/** A reply links a canvas as `[Title](canvas:<id>)`. */
export const CANVAS_LINK = new RegExp(`^canvas:(${ID})$`);
/** A data value's name: `data/<key>.json`. */
export const canvasKeySchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);

export const canvasCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  sessionID: z.string().max(256).optional(),
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
  created: number;
  updated: number;
};

/** The view's transpiled files. `errors` are syntax errors that stop it from running. */
export type CanvasSource = CanvasInfo & {
  entry: string;
  modules: Record<string, string>;
  errors: string[];
  /** Changes whenever any file changes, so hosts can rerun the view. */
  version: string;
};

export type CanvasValue = { value: unknown; rev: string };
export type CanvasData = Record<string, CanvasValue>;

/** Gateway → web event, sent on the `/api/events` stream as `canvas`. */
export type CanvasEvent =
  | { type: 'source'; id: string }
  | { type: 'data'; id: string; key: string; rev: string | null }
  | { type: 'list' };

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
);
export type FrameMessage = { channel: typeof CANVAS_CHANNEL } & (
  | { type: 'ready' }
  | { type: 'size'; height: number }
  | { type: 'set'; key: string; value: unknown }
);
