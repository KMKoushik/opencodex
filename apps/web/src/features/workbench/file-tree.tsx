import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { FileSystemEntry } from '@opencodex/contracts';
import { FileTree, useFileTree } from '@pierre/trees/react';
import type { GitStatusEntry, FileTreeBatchOperation } from '@pierre/trees';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { useTheme } from '../theme/use-theme';

const treeCSS = `:host {
  --trees-bg-override: var(--surface);
  --trees-fg-override: var(--text-secondary);
  --trees-selected-bg-override: var(--selected);
  --trees-hover-bg-override: var(--hover);
  --trees-border-color-override: var(--border);
  --trees-accent-override: var(--accent-text);
  --trees-selected-fg-override: var(--text);
  --trees-focus-ring-color-override: var(--accent-text);
  --trees-git-added-color-override: var(--success);
  --trees-git-untracked-color-override: var(--success);
  --trees-git-modified-color-override: var(--text-secondary);
  --trees-git-deleted-color-override: var(--error);
  --trees-font-family-override: var(--font-sans);
  --trees-font-size-override: 12px;
} button[data-type='item'] { border-radius: 4px; }`;

function combineDirectories(results: UseQueryResult<FileSystemEntry[], Error>[]) {
  return {
    entries: results.flatMap((result) => result.data ?? []),
    errors: results
      .filter((result) => result.isError)
      .map((result) => ({ error: result.error, refetch: result.refetch })),
    pending: results[0]?.isPending ?? false,
  };
}

export function WorkspaceTree({
  directory,
  kind,
  changes,
  selected,
  visible,
  live,
  onOpen,
}: {
  directory: string;
  kind: 'files' | 'changes';
  changes: GitStatusEntry[];
  selected: string;
  visible: boolean;
  live: boolean;
  onOpen: (path: string, pinned: boolean) => void;
}) {
  const { variant } = useTheme();
  const [folders, setFolders] = useState(['']);
  const parents = useMemo(() => {
    const segments = selected.split('/');
    return segments.slice(0, -1).map((_, i) => segments.slice(0, i + 1).join('/'));
  }, [selected]);
  const loadedFolders = useMemo(() => [...new Set([...folders, ...parents])], [folders, parents]);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 180);
    return () => clearTimeout(timer);
  }, [search]);
  const queries = useQueries({
    combine: combineDirectories,
    queries: loadedFolders.map((path) => ({
      queryKey: ['workspace', 'files', directory, path, ''],
      queryFn: ({ signal }: { signal: AbortSignal }) => api.files(directory, path, '', signal),
      enabled: visible && kind === 'files',
      staleTime: 10_000,
      gcTime: 30_000,
      refetchInterval: visible && !live ? 15_000 : (false as const),
    })),
  });
  const found = useQuery({
    queryKey: ['workspace', 'files', directory, '', query],
    queryFn: ({ signal }) => api.files(directory, '', query, signal),
    enabled: visible && kind === 'files' && Boolean(query),
    staleTime: 10_000,
    gcTime: 30_000,
  });
  const stablePaths = useMemo(
    () =>
      kind === 'changes'
        ? changes.map((entry) => entry.path)
        : [
            ...new Set([
              ...queries.entries.map((entry) =>
                entry.type === 'directory' ? `${entry.path.replace(/\/$/, '')}/` : entry.path,
              ),
              ...(query ? (found.data?.map((entry) => entry.path) ?? []) : []),
            ]),
          ],
    [kind, changes, queries.entries, query, found.data],
  );
  const directories = useMemo(
    () => stablePaths.filter((path) => path.endsWith('/')),
    [stablePaths],
  );
  const callback = useRef(onOpen);
  const previousPaths = useRef(new Set<string>());
  const syncing = useRef(false);
  useEffect(() => {
    callback.current = onOpen;
  }, [onOpen]);
  const { model } = useFileTree({
    paths: [],
    density: 'compact',
    initialExpansion: kind === 'changes' ? 'open' : 'closed',
    flattenEmptyDirectories: kind === 'changes',
    stickyFolders: true,
    search: false,
    searchBlurBehavior: 'retain',
    onSearchChange: (value) => {
      setSearch(value ?? '');
    },
    fileTreeSearchMode: 'hide-non-matches',
    unsafeCSS: treeCSS,
    onSelectionChange: (selected) => {
      const path = selected.at(-1);
      if (path && !path.endsWith('/') && !syncing.current) callback.current(path, false);
    },
  });
  useEffect(() => {
    const next = new Set(stablePaths);
    const updates: FileTreeBatchOperation[] = [];
    for (const path of previousPaths.current)
      if (!next.has(path)) updates.push({ type: 'remove', path });
    for (const path of next)
      if (!previousPaths.current.has(path)) updates.push({ type: 'add', path });
    syncing.current = true;
    if (!previousPaths.current.size) model.resetPaths(stablePaths);
    else if (updates.length) model.batch(updates);
    previousPaths.current = next;
    syncing.current = false;
  }, [model, stablePaths]);
  useEffect(() => {
    model.setGitStatus(changes);
  }, [model, changes]);
  useEffect(() => {
    if (kind !== 'files' || !visible || query) return;
    const loadExpanded = () => {
      const pending = directories
        .filter((path) => {
          const item = model.getItem(path);
          return (
            item &&
            'isExpanded' in item &&
            item.isExpanded() &&
            !loadedFolders.includes(path.replace(/\/$/, ''))
          );
        })
        .map((path) => path.replace(/\/$/, ''));
      if (pending.length) setFolders((previous) => [...new Set([...previous, ...pending])]);
    };
    loadExpanded();
    return model.subscribe(loadExpanded);
  }, [model, directories, loadedFolders, kind, visible, query]);
  useEffect(() => {
    if (!selected || !visible) return;
    syncing.current = true;
    for (const path of model.getSelectedPaths())
      if (path !== selected) model.getItem(path)?.deselect();
    for (const path of parents) {
      const item = model.getItem(`${path}/`);
      if (item && 'expand' in item) item.expand();
    }
    model.getItem(selected)?.select();
    model.scrollToPath(selected, { focus: false, offset: 'nearest' });
    syncing.current = false;
  }, [selected, parents, model, stablePaths, kind, visible, search]);
  const error =
    kind === 'files' ? (queries.errors[0] ?? (found.isError ? found : undefined)) : undefined;
  return (
    <section
      className="wb-tree-pane"
      hidden={!visible}
      aria-label={kind === 'files' ? 'File explorer' : 'Changes explorer'}
    >
      <div className="wb-tree-tools">
        <input
          aria-label={kind === 'files' ? 'Find files' : 'Filter changed files'}
          placeholder="Filter files…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            model.setSearch(event.target.value || null);
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          title="Collapse folders"
          aria-label="Collapse folders"
          onClick={() => model.resetPaths(stablePaths, { initialExpandedPaths: [] })}
        >
          −
        </Button>
      </div>
      {error && (
        <div role="alert" className="wb-notice">
          {error.error?.message}
          <Button variant="ghost" size="sm" onClick={() => void error.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {queries.pending && kind === 'files' && <p className="wb-notice">Loading files…</p>}
      <FileTree
        model={model}
        className="wb-pierre-tree"
        style={{ colorScheme: variant, height: '100%', minHeight: 0 }}
        onClickCapture={(event) => {
          // Search closes on activation; capture the path before Pierre recycles the row.
          const row = event.nativeEvent
            .composedPath()
            .find((node) => node instanceof HTMLElement && node.dataset.itemPath) as
            HTMLElement | undefined;
          const path = row?.dataset.itemPath;
          if (path && !path.endsWith('/')) callback.current(path, false);
        }}
        onDoubleClickCapture={(event) => {
          const row = event.nativeEvent
            .composedPath()
            .find((node) => node instanceof HTMLElement && node.dataset.itemPath) as
            HTMLElement | undefined;
          const path = row?.dataset.itemPath;
          if (path && !path.endsWith('/')) callback.current(path, true);
        }}
      />
      {query && kind === 'files' && found.data?.length === 200 && (
        <p className="wb-notice">First 200 results. Narrow your search.</p>
      )}
    </section>
  );
}
