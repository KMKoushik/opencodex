import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useStore } from 'zustand';
import type { GitStatusEntry } from '@pierre/trees';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, File01Icon, FileEditIcon, RefreshIcon } from '@hugeicons/core-free-icons';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { SegmentedControl } from '../../components/ui/segmented-control';
import { WorkspaceTree } from './file-tree';
import { FilePreview } from './file-preview';
import { QueryError } from './query-error';
import { editorKey, useEditorDrafts } from './editor-drafts';
import { resolveFileLink, type FileRequest } from './file-link';
import { useWorkbenchStore, workbenchKey } from './workbench-context';
import { defaultWorkspaceState, type WorkspaceTab } from './workbench-store';

const DiffPreview = lazy(() =>
  import('./diff-preview').then((module) => ({ default: module.DiffPreview })),
);
const DiffPool = lazy(() => import('./diff-pool').then((module) => ({ default: module.DiffPool })));
type Tab = WorkspaceTab;

export function WorkspaceEditor({
  directory,
  sessionID,
  live,
  view,
  active,
  headerElement,
  selectView,
  fileRequest,
}: {
  directory: string;
  sessionID: string;
  live: boolean;
  view: 'files' | 'changes';
  active: boolean;
  headerElement: HTMLDivElement | null;
  selectView?: (id: string) => void;
  fileRequest?: FileRequest;
}) {
  const workbench = useWorkbenchStore();
  const key = workbenchKey(sessionID, directory);
  const [initial] = useState(
    () => workbench.getState().entries[key]?.workspace ?? defaultWorkspaceState,
  );
  const [mode, setMode] = useState(initial.mode);
  const [diffStyle, setDiffStyle] = useState(initial.diffStyle);
  const [tabs, setTabs] = useState<Tab[]>(initial.tabs);
  const [selected, setSelected] = useState(initial.selected);
  const [treeVisible, setTreeVisible] = useState(initial.treeVisible);
  const [previousView, setPreviousView] = useState(view);
  if (previousView !== view) {
    setPreviousView(view);
    setTreeVisible(true);
  }
  const [treeWidth, setTreeWidth] = useState(initial.treeWidth);
  useEffect(() => {
    workbench
      .getState()
      .workspace(key, { tabs, selected, mode, diffStyle, treeVisible, treeWidth });
  }, [workbench, key, tabs, selected, mode, diffStyle, treeVisible, treeWidth]);
  const [toolbarSlot, setToolbarSlot] = useState<HTMLDivElement | null>(null);
  const tree = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const store = useEditorDrafts();
  useEffect(
    () =>
      store.subscribe((state) => {
        setTabs((previous) =>
          previous.some((tab) => !tab.pinned && state.edits[editorKey(tab.directory, tab.path)])
            ? previous.map((tab) =>
                state.edits[editorKey(tab.directory, tab.path)] ? { ...tab, pinned: true } : tab,
              )
            : previous,
        );
      }),
    [store, directory],
  );
  const dirtyKeys = useStore(store, (state) => Object.keys(state.edits).join('\n'));
  const dirty = useMemo(() => new Set(dirtyKeys.split('\n')), [dirtyKeys]);
  const client = useQueryClient();
  const changes = useQuery({
    queryKey: ['workspace', 'diff', directory, mode],
    queryFn: ({ signal }) => api.changes(directory, mode, signal),
    enabled: active,
    staleTime: 2000,
    gcTime: 30_000,
    refetchInterval: active && !live ? 15_000 : false,
  });
  const statuses = useMemo<GitStatusEntry[]>(
    () => (changes.data ?? []).map((file) => ({ path: file.file, status: file.status })),
    [changes.data],
  );
  const total = useMemo(
    () =>
      (changes.data ?? []).reduce(
        (sum, file) => ({
          additions: sum.additions + file.additions,
          deletions: sum.deletions + file.deletions,
        }),
        { additions: 0, deletions: 0 },
      ),
    [changes.data],
  );
  const current = tabs.find((tab) => tab.id === selected);
  function open(path: string, kind: Tab['kind'], pinned = false, fileDirectory = directory) {
    if ((tree.current?.parentElement?.clientWidth ?? Infinity) <= 560) setTreeVisible(false);
    selectFile(path, kind, pinned, fileDirectory);
  }
  function selectFile(path: string, kind: Tab['kind'], pinned: boolean, fileDirectory: string) {
    const id = JSON.stringify([fileDirectory, kind, kind === 'diff' ? mode : '', path]);
    setTabs((previous) => {
      const existing = previous.find((tab) => tab.id === id);
      if (existing)
        return pinned
          ? previous.map((tab) => (tab.id === id ? { ...tab, pinned: true } : tab))
          : previous;
      const keep = previous.filter(
        (tab) => tab.pinned || dirty.has(editorKey(tab.directory, tab.path)),
      );
      return [...keep, { id, kind, path, directory: fileDirectory, mode, pinned }];
    });
    setSelected(id);
  }
  const [handledRequest, setHandledRequest] = useState<FileRequest>();
  if (fileRequest && fileRequest !== handledRequest) {
    setHandledRequest(fileRequest);
    selectFile(fileRequest.path, 'file', true, fileRequest.directory);
    setTreeVisible(false);
  }
  function close(id: string) {
    const index = tabs.findIndex((tab) => tab.id === id);
    const next = tabs.filter((tab) => tab.id !== id);
    setTabs(next);
    if (selected === id) setSelected(next[Math.min(index, next.length - 1)]?.id ?? '');
  }
  const parts = current
    ? `${current.directory === directory ? '' : `${current.directory}/`}${current.path}`
        .split('/')
        .filter(Boolean)
    : [];
  return (
    <div className="wb-editor-workspace" hidden={!active}>
      {active &&
        headerElement &&
        createPortal(
          <div
            className="wb-document-tabs"
            role="tablist"
            aria-label="Open files"
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !tabs.length)
                return;
              event.preventDefault();
              const index = tabs.findIndex((tab) => tab.id === selected);
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? tabs.length - 1
                    : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
              setSelected(tabs[next]!.id);
              const buttons =
                event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]');
              buttons[next]?.focus();
            }}
          >
            {tabs.map((tab) => {
              const unsaved = tab.kind === 'file' && dirty.has(editorKey(tab.directory, tab.path));
              return (
                <div className="wb-document-tab" data-active={selected === tab.id} key={tab.id}>
                  <button
                    role="tab"
                    aria-selected={selected === tab.id}
                    aria-controls="wb-document-content"
                    tabIndex={selected === tab.id ? 0 : -1}
                    title={`${tab.directory}/${tab.path}${tab.kind === 'diff' ? ` (${tab.mode === 'working' ? 'uncommitted' : 'base branch'} diff)` : ''}`}
                    data-preview={!tab.pinned && !unsaved}
                    onClick={() => setSelected(tab.id)}
                    onDoubleClick={() =>
                      setTabs((previous) =>
                        previous.map((item) =>
                          item.id === tab.id ? { ...item, pinned: true } : item,
                        ),
                      )
                    }
                  >
                    <HugeiconsIcon
                      icon={tab.kind === 'diff' ? FileEditIcon : File01Icon}
                      size={14}
                    />
                    <span>{tab.path.split('/').at(-1)}</span>
                    {tab.kind === 'diff' && (
                      <span className="wb-tab-kind">
                        {tab.mode === 'working' ? 'diff' : 'base diff'}
                      </span>
                    )}
                    {unsaved && <span aria-label="Unsaved edits">●</span>}
                  </button>
                  <button
                    aria-label={`Close ${tab.path}${tab.kind === 'diff' ? ' diff' : ''}`}
                    title={unsaved ? 'Save or discard edits before closing' : 'Close tab'}
                    disabled={unsaved}
                    onClick={() => close(tab.id)}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={12} />
                  </button>
                </div>
              );
            })}
            {!tabs.length && (
              <span className="wb-tabs-placeholder">{view === 'files' ? 'Files' : 'Changes'}</span>
            )}
          </div>,
          headerElement,
        )}
      <div className="wb-editor-layout" data-tree={treeVisible}>
        <div className="wb-document">
          <div className="wb-breadcrumbs" data-view={view}>
            {view === 'changes' ? (
              // The review toolbar: what is compared, its totals, then the open diff's controls.
              <>
                <select
                  aria-label="Changes comparison"
                  value={mode}
                  onChange={(event) => setMode(event.target.value as typeof mode)}
                >
                  <option value="working">Uncommitted</option>
                  <option value="branch">Base branch</option>
                </select>
                <span className="wb-totals">
                  <span className="wb-added">+{total.additions.toLocaleString()}</span>
                  <span className="wb-removed">−{total.deletions.toLocaleString()}</span>
                </span>
                <div className="wb-toolbar-slot" ref={setToolbarSlot} />
              </>
            ) : (
              <nav aria-label="File breadcrumbs">
                {parts.map((part, index) => (
                  <span key={index}>
                    {index > 0 && <span className="wb-breadcrumb-separator">›</span>}
                    {part}
                  </span>
                ))}
              </nav>
            )}
            <Button
              variant="ghost"
              size="sm"
              aria-label={treeVisible ? 'Hide file tree' : 'Show file tree'}
              onClick={() => setTreeVisible((value) => !value)}
            >
              {treeVisible ? 'Hide tree' : 'Show tree'}
            </Button>
          </div>
          <div
            id="wb-document-content"
            className="wb-document-content"
            role="tabpanel"
            aria-label={current?.path ?? 'Editor'}
          >
            <Suspense
              fallback={
                <p className="wb-empty" role="status">
                  Loading editor…
                </p>
              }
            >
              {active && current?.kind === 'file' && (
                <FilePreview
                  key={current.id}
                  directory={current.directory}
                  path={current.path}
                  sessionID={sessionID}
                  live={live}
                  onOpenFile={(href) => {
                    const target = resolveFileLink(href, directory);
                    if (!target) return false;
                    open(target.path, 'file', true, target.directory);
                    return true;
                  }}
                />
              )}
              {active && current?.kind === 'diff' && (
                <DiffPool>
                  <DiffPreview
                    key={current.id}
                    directory={directory}
                    path={current.path}
                    mode={current.mode}
                    style={diffStyle}
                    onStyleChange={setDiffStyle}
                    sessionID={sessionID}
                    live={live}
                    toolbarElement={view === 'changes' ? toolbarSlot : null}
                    onOpenFile={() => open(current.path, 'file', true)}
                  />
                </DiffPool>
              )}
            </Suspense>
            {!current && (
              <div className="wb-empty">
                <HugeiconsIcon icon={view === 'changes' ? FileEditIcon : File01Icon} size={28} />
                <h3>{view === 'changes' ? 'Review your changes' : 'Your workspace'}</h3>
                <p>Select a file in the tree to open it.</p>
                <p className="wb-note">Double-click to keep a tab open.</p>
              </div>
            )}
          </div>
        </div>
        <section
          ref={tree}
          className="wb-explorer"
          hidden={!treeVisible}
          style={{ width: treeWidth }}
          aria-label="Workspace explorer"
        >
          <div
            className="wb-tree-resize"
            role="separator"
            aria-label="Resize file tree"
            aria-orientation="vertical"
            aria-valuemin={150}
            aria-valuemax={360}
            aria-valuenow={treeWidth}
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault();
                setTreeWidth(
                  Math.max(150, Math.min(360, treeWidth + (event.key === 'ArrowLeft' ? 16 : -16))),
                );
              }
            }}
            onPointerDown={(event) => {
              drag.current = { x: event.clientX, width: treeWidth };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (drag.current && tree.current)
                tree.current.style.width = `${Math.max(150, Math.min(360, drag.current.width + drag.current.x - event.clientX))}px`;
            }}
            onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
            onLostPointerCapture={() => {
              if (tree.current) setTreeWidth(tree.current.getBoundingClientRect().width);
              drag.current = null;
            }}
          />
          <div className="wb-explorer-heading">
            {selectView ? (
              <SegmentedControl
                label="Workspace view"
                value={view}
                options={[
                  { value: 'files', label: 'All files' },
                  {
                    value: 'changes',
                    label: 'Changes',
                    badge: changes.isSuccess ? statuses.length : undefined,
                  },
                ]}
                onChange={selectView}
              />
            ) : (
              <span>
                {view === 'changes' ? 'Changes' : directory.split('/').filter(Boolean).at(-1)}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Refresh workspace"
              onClick={() => void client.invalidateQueries({ queryKey: ['workspace'] })}
            >
              <HugeiconsIcon icon={RefreshIcon} size={14} />
            </Button>
          </div>
          {view === 'changes' && (
            <>
              <QueryError query={changes} />
              {changes.isSuccess && !statuses.length && <p className="wb-notice">No changes.</p>}
            </>
          )}
          <WorkspaceTree
            directory={directory}
            kind="files"
            changes={statuses}
            selected={
              current?.kind === 'file' && current.directory === directory ? current.path : ''
            }
            visible={active && view === 'files' && treeVisible}
            live={live}
            onOpen={(path, pinned) => open(path, 'file', pinned)}
          />
          <WorkspaceTree
            directory={directory}
            kind="changes"
            changes={statuses}
            selected={current?.kind === 'diff' ? current.path : ''}
            visible={active && view === 'changes' && treeVisible}
            live={live}
            onOpen={(path, pinned) => open(path, 'diff', pinned)}
          />
          <footer className="wb-explorer-footer">
            <span>{view === 'changes' ? `${statuses.length} changed` : 'Project files'}</span>
            <span className="wb-added">+{total.additions.toLocaleString()}</span>
            <span className="wb-removed">−{total.deletions.toLocaleString()}</span>
          </footer>
        </section>
      </div>
    </div>
  );
}
