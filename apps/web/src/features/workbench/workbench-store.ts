import { createStore } from 'zustand/vanilla';
import { z } from 'zod';

const layoutSchema = z.object({
  open: z.boolean().default(false),
  panel: z.enum(['files', 'changes', 'terminal', 'subagents']).default('files'),
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
const entrySchema = z.object({ layout: layoutSchema, workspace: workspaceSchema });
export type WorkspaceTab = z.infer<typeof tabSchema>;
export type WorkspaceState = z.infer<typeof workspaceSchema>;
type Layout = z.infer<typeof layoutSchema>;
type Entry = z.infer<typeof entrySchema>;
export const defaultWorkbenchLayout = layoutSchema.parse({});
export const defaultWorkspaceState = workspaceSchema.parse({});
const defaultEntry: Entry = { layout: defaultWorkbenchLayout, workspace: defaultWorkspaceState };

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
  }>((set) => {
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
    const tabs = [...entry.workspace.tabs];
    const workspace = { ...entry.workspace, tabs };
    saved[0] = [key, { ...entry, workspace }];
    while (tabs.length && serialize().length > 16_384) {
      const index = tabs.findIndex((tab) => tab.id !== workspace.selected);
      tabs.splice(index < 0 ? 0 : index, 1);
    }
    if (!tabs.some((tab) => tab.id === workspace.selected)) workspace.selected = '';
  }
  return serialize();
}
