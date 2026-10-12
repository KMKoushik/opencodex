import { createStore } from 'zustand/vanilla';
import { z } from 'zod';

const layoutSchema = z.object({
  open: z.boolean().default(false),
  expanded: z.boolean().default(false),
  panel: z
    .enum(['files', 'changes', 'terminal', 'subagents', 'side', 'browser', 'canvas'])
    .default('files'),
  width: z.number().min(340).max(2400).default(820),
});
const tabSchema = z.object({
  id: z.string().max(8192),
  path: z.string().min(1).max(2048),
  directory: z.string().min(1).max(2048),
  kind: z.enum(['file', 'diff']),
  mode: z.enum(['working', 'branch']),
  pinned: z.boolean(),
});
const workspaceSchema = z.object({
  tabs: z.array(tabSchema).max(64).default([]),
  selected: z.string().max(8192).default(''),
  mode: z.enum(['working', 'branch']).default('working'),
  diffStyle: z.enum(['unified', 'split']).default('unified'),
  treeVisible: z.boolean().default(true),
  treeWidth: z.number().min(150).max(360).default(220),
});
export const MAX_BROWSER_TABS = 12;
const browserSchema = z.object({
  // An empty URL is a new tab that has not loaded a page yet.
  tabs: z
    .array(z.object({ id: z.string().max(64), url: z.string().max(8192) }))
    .max(MAX_BROWSER_TABS)
    .default([]),
  selected: z.string().max(64).default(''),
});
const MAX_CANVAS_TABS = 12;
// An empty selection shows the list of this chat's canvases.
const canvasSchema = z.object({
  tabs: z.array(z.string().max(128)).max(MAX_CANVAS_TABS).default([]),
  selected: z.string().max(128).default(''),
});
const entrySchema = z.object({
  layout: layoutSchema,
  workspace: workspaceSchema,
  browser: browserSchema.default(() => ({ tabs: [], selected: '' })),
  canvas: canvasSchema.default(() => ({ tabs: [], selected: '' })),
});
export type WorkspaceTab = z.infer<typeof tabSchema>;
export type WorkspaceState = z.infer<typeof workspaceSchema>;
export type BrowserState = z.infer<typeof browserSchema>;
export type CanvasTabs = z.infer<typeof canvasSchema>;
type Layout = z.infer<typeof layoutSchema>;
type Entry = z.infer<typeof entrySchema>;
export const defaultWorkbenchLayout = layoutSchema.parse({});
export const defaultWorkspaceState = workspaceSchema.parse({});
export const defaultBrowserState = browserSchema.parse({});
export const defaultCanvasTabs = canvasSchema.parse({});
const defaultEntry: Entry = {
  layout: defaultWorkbenchLayout,
  workspace: defaultWorkspaceState,
  browser: defaultBrowserState,
  canvas: defaultCanvasTabs,
};

function readEntries(saved?: string | null): Record<string, Entry> {
  if (!saved || saved.length > 16_384) return {};
  try {
    const data = JSON.parse(saved);
    if (data.version !== 1 || !Array.isArray(data.entries)) return {};
    return Object.fromEntries(
      data.entries.slice(-64).flatMap((item: unknown) => {
        const result = z.tuple([z.string().max(2048), entrySchema]).safeParse(item);
        return result.success ? [result.data] : [];
      }),
    );
  } catch {
    return {};
  }
}

/** Presentation only: no file contents, editor drafts, API snapshots, or live viewers. */
export function createWorkbenchStore(saved?: string | null) {
  return createStore<{
    entries: Record<string, Entry>;
    layout: (key: string, patch: Partial<Layout>) => void;
    workspace: (key: string, value: WorkspaceState) => void;
    browser: (key: string, change: (state: BrowserState) => BrowserState) => void;
    /** The Canvas panel's open canvases. */
    canvas: (key: string, change: (state: CanvasTabs) => CanvasTabs) => void;
    /** Opens a canvas in a tab, reusing its tab when already open. */
    openCanvas: (key: string, id: string) => void;
  }>((set, get) => {
    const update = (key: string, change: (entry: Entry) => Entry) =>
      set((state) => {
        const entries = { ...state.entries };
        const value = change(entries[key] ?? defaultEntry);
        // Reinsertion gives a bounded, least-recently-updated cache without timestamps.
        delete entries[key];
        entries[key] = value;
        for (const key of Object.keys(entries).slice(0, -64)) delete entries[key];
        return { entries };
      });
    return {
      entries: readEntries(saved),
      layout: (key, patch) =>
        update(key, (entry) => ({ ...entry, layout: { ...entry.layout, ...patch } })),
      workspace: (key, value) =>
        update(key, (entry) => ({
          ...entry,
          workspace: {
            ...value,
            tabs:
              value.tabs.length <= 64
                ? value.tabs
                : [
                    ...value.tabs.filter((tab) => tab.id !== value.selected).slice(-63),
                    ...value.tabs.filter((tab) => tab.id === value.selected),
                  ],
          },
        })),
      browser: (key, change) => {
        const current = get().entries[key]?.browser ?? defaultBrowserState;
        const browser = change(current);
        if (browser !== current) update(key, (entry) => ({ ...entry, browser }));
      },
      canvas: (key, change) => {
        const current = get().entries[key]?.canvas ?? defaultEntry.canvas;
        const canvas = change(current);
        if (canvas !== current) update(key, (entry) => ({ ...entry, canvas }));
      },
      openCanvas: (key, id) =>
        get().canvas(key, (state) => ({
          tabs: state.tabs.includes(id) ? state.tabs : [...state.tabs, id].slice(-MAX_CANVAS_TABS),
          selected: id,
        })),
    };
  });
}

/** Stay inside the existing native preference limit; oldest layouts are evicted first. */
export function serializeWorkbench(entries: Record<string, Entry>) {
  const saved = Object.entries(entries);
  const serialize = () => JSON.stringify({ version: 1, entries: saved });
  const lengths = saved.map((entry) => JSON.stringify(entry).length);
  let size =
    JSON.stringify({ version: 1, entries: [] }).length +
    lengths.reduce((sum, length) => sum + length, 0) +
    Math.max(0, saved.length - 1);
  while (saved.length > 1 && size > 16_384) {
    size -= lengths.shift()! + 1;
    saved.shift();
  }
  if (saved.length && serialize().length > 16_384) {
    const [key, entry] = saved[0]!;
    const workspace = { ...entry.workspace, tabs: [...entry.workspace.tabs] };
    const browser = { ...entry.browser, tabs: [...entry.browser.tabs] };
    saved[0] = [key, { ...entry, workspace, browser }];
    // Unselected tabs go first, browser tabs (long URLs) before documents; selected tabs last.
    for (const keepSelected of [true, false])
      for (const state of [browser, workspace]) {
        const tabs: { id: string }[] = state.tabs;
        while (tabs.length && serialize().length > 16_384) {
          const index = tabs.findIndex((tab) => !keepSelected || tab.id !== state.selected);
          if (index < 0) break;
          tabs.splice(index, 1);
        }
        if (!tabs.some((tab) => tab.id === state.selected)) state.selected = '';
      }
  }
  return serialize();
}
