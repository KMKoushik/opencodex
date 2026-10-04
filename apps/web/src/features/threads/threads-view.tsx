import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  InboxIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useInfiniteQuery, useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { sessionSummary, type Session, type SessionInfo } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/api';
import { readStorage, writeStorage } from '../../lib/storage';
import { projectFolders, projectName } from '../projects/project-metadata';
import { SessionRow } from '../sessions/session-row';
import { ACTIVE_WINDOW, deriveFocus, threadStatus, type ThreadRow } from './focus';
import { rememberPinned, usePinnedIDs } from './pins';
import { ProjectFilter } from './project-filter';
import { dismissUndo, useFocusMany, useUndo } from './use-thread-focus';
import './threads.css';

type View = 'focus' | 'projects';
const MAX_ACTIVE_PAGES = 4;
const INACTIVE_STEP = 10;

export function ThreadsView({
  connected,
  live,
  selectedID,
  onSelect,
  children,
}: {
  connected: boolean;
  live: boolean;
  selectedID: string | undefined;
  onSelect: (session: Session) => void;
  /** The Projects view. */
  children: ReactNode;
}) {
  const [view, setView] = useState<View>(() =>
    readStorage('threadView') === 'focus' ? 'focus' : 'projects',
  );
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(readExcluded);
  // Presentation-only multi-selection; the open thread stays separate.
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [anchor, setAnchor] = useState<string>();
  const now = useMinute();
  const refetchInterval = connected && !live ? 15_000 : false;
  const running = useQuery({
    queryKey: ['active'],
    queryFn: ({ signal }) => api.active(signal),
    enabled: connected,
    refetchOnMount: false,
  });
  const folders = useQuery({
    queryKey: ['projects'],
    queryFn: ({ signal }) => api.projects(signal),
    select: projectFolders,
    enabled: connected,
  });

  const pinnedIDs = usePinnedIDs();
  const pinnedInfo = useQueries({
    queries: pinnedIDs.map((id) => ({
      queryKey: ['chat', id, 'info'],
      queryFn: ({ signal }: { signal: AbortSignal }) => api.session(id, signal),
      enabled: connected,
      refetchInterval,
    })),
    combine: pinnedData,
  });
  const pinned = useMemo(
    () =>
      pinnedInfo
        .flatMap((info) => (info ? [sessionSummary(info)] : []))
        .filter((session) => session.pinned)
        .sort((a, b) => b.pinned! - a.pinned!),
    [pinnedInfo],
  );
  useEffect(() => {
    // Metadata is authoritative: forget IDs whose pin was removed elsewhere.
    for (const info of pinnedInfo)
      if (info && !sessionSummary(info).pinned) rememberPinned(info.id, false);
  }, [pinnedInfo]);

  const recent = useInfiniteQuery({
    queryKey: ['sessions', 'focus'],
    queryFn: ({ pageParam, signal }) => api.searchSessions('', pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: connected && view === 'focus',
    refetchInterval,
  });
  const loaded = useMemo(
    () => recent.data?.pages.flatMap((page) => page.sessions) ?? [],
    [recent.data],
  );
  const { fetchNextPage, hasNextPage, isFetching } = recent;
  const pages = recent.data?.pages;
  useEffect(() => {
    // Native order is newest update first, and updates never precede the last run, so every
    // thread active within the window is on the pages up to the first older update.
    const last = pages?.at(-1)?.sessions.at(-1);
    if (!pages || !hasNextPage || isFetching || pages.length >= MAX_ACTIVE_PAGES) return;
    if (last && last.updatedAt >= now - ACTIVE_WINDOW) void fetchNextPage();
  }, [pages, hasNextPage, isFetching, fetchNextPage, now]);
  useEffect(() => {
    for (const session of loaded) if (session.pinned) rememberPinned(session.id, true);
  }, [loaded]);

  // Pending requests are location-scoped; a thread waiting on one is still running.
  const directories = useMemo(
    () =>
      [
        ...new Set(
          [...pinned, ...loaded]
            .filter((session) => running.data?.[session.id])
            .map((session) => session.directory),
        ),
      ]
        .sort()
        .slice(0, 32),
    [pinned, loaded, running.data],
  );
  const attention = useQuery({
    queryKey: ['attention', ...directories],
    queryFn: ({ signal }) => api.attention(directories, signal),
    enabled: connected && directories.length > 0,
    refetchInterval,
  });
  const requests = directories.length ? attention.data : undefined;
  const focus = useMemo(
    () => deriveFocus(loaded, running.data, requests, now, excluded),
    [loaded, running.data, requests, now, excluded],
  );
  // Visual order, for Shift-click ranges. Selection ignores threads that left every list.
  const order = useMemo(
    () => [
      ...pinned.map((session) => session.id),
      ...(view === 'focus'
        ? [...focus.active, ...focus.inactive].map((row) => row.session.id)
        : []),
    ],
    [pinned, focus, view],
  );
  const selection = useMemo(() => {
    const listed = new Set(order);
    return new Set([...picked].filter((id) => listed.has(id)));
  }, [order, picked]);
  const bulk = useFocusMany();
  const { reset: resetBulk } = bulk;
  const selecting = selection.size > 0;
  useEffect(() => {
    if (!selecting) {
      resetBulk();
      return;
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) setPicked(new Set());
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [selecting, resetBulk]);
  // Offer projects with loaded threads, plus hidden ones so they can always be restored.
  const filterDirectories = useMemo(
    () => [...new Set([...loaded.map((session) => session.directory), ...excluded])],
    [loaded, excluded],
  );

  if (!connected) return null;
  const project = (directory: string) => {
    const folder = folders.data?.get(directory);
    return folder
      ? { name: projectName(folder), icon: folder.icon }
      : { name: directory.split(/[\\/]/).filter(Boolean).at(-1) ?? directory };
  };
  const picking = selection.size > 0;
  const ready = [...selection].filter((id) => !running.data?.[id]);
  const markDone = () =>
    bulk.mutate(
      { ids: ready, action: 'done' },
      {
        onSuccess: (results) => {
          if (results.every(({ result }) => result.status === 'fulfilled')) setPicked(new Set());
        },
      },
    );
  const clearSelection = () => setPicked(new Set());
  function click(session: Session, event: MouseEvent) {
    const id = session.id;
    const from = anchor ?? selectedID;
    if (event.shiftKey && from && order.includes(from)) {
      const a = order.indexOf(from);
      const b = order.indexOf(id);
      setPicked(new Set([...selection, ...order.slice(Math.min(a, b), Math.max(a, b) + 1)]));
    } else if (event.metaKey || event.ctrlKey || picking) {
      const next = new Set(selection);
      if (!next.delete(id)) next.add(id);
      setPicked(next);
      setAnchor(id);
    } else {
      setAnchor(id);
      onSelect(session);
    }
  }
  const row = ({ session, status }: ThreadRow) => (
    <SessionRow
      key={session.id}
      session={session}
      selected={selectedID === session.id}
      responding={status === 'running' || Boolean(running.data?.[session.id])}
      attention={status === 'permission' || status === 'question' ? status : undefined}
      project={project(session.directory)}
      connected={connected}
      checked={picking ? selection.has(session.id) : undefined}
      selection={{
        count: selection.size,
        ready: ready.length,
        onDone: markDone,
        onClear: clearSelection,
      }}
      onPick={() => {
        setPicked(new Set(selection).add(session.id));
        setAnchor(session.id);
      }}
      onSelect={(event) => click(session, event)}
    />
  );

  const toggle = (
    <Button
      className="thread-view-toggle"
      variant="ghost"
      size="icon"
      aria-label="Focus view"
      aria-pressed={view === 'focus'}
      title={
        view === 'focus'
          ? 'Group threads by project'
          : 'Focus view: what needs you, running, and recent'
      }
      onClick={() => {
        const next = view === 'focus' ? 'projects' : 'focus';
        setView(next);
        setPicked(new Set());
        writeStorage('threadView', next);
      }}
    >
      <HugeiconsIcon icon={InboxIcon} size={14} />
    </Button>
  );

  return (
    <>
      <div className="project-list scrollbar-on-hover" data-picking={picking || undefined}>
        {pinned.length > 0 && (
          <section className="thread-section" aria-label="Pinned threads">
            <h2 className="sidebar-heading">Pinned</h2>
            {pinned.map((session) =>
              row({ session, status: threadStatus(session, running.data, requests) }),
            )}
          </section>
        )}
        {view === 'projects' ? (
          <>
            <div className="sidebar-heading">
              Projects
              {toggle}
            </div>
            {children}
          </>
        ) : (
          <FocusSections
            toggle={
              <span className="sidebar-heading-actions">
                <ProjectFilter
                  options={filterDirectories
                    .map((directory) => ({ directory, ...project(directory) }))
                    .sort((a, b) => a.name.localeCompare(b.name))}
                  excluded={excluded}
                  onChange={(next) => {
                    setExcluded(next);
                    writeStorage('focusExcluded', next.size ? JSON.stringify([...next]) : null);
                  }}
                />
                {toggle}
              </span>
            }
            active={focus.active}
            inactive={focus.inactive}
            loading={recent.isPending}
            error={recent.isError ? recent.error.message : undefined}
            onRetry={() => void recent.refetch()}
            canLoadMore={Boolean(hasNextPage)}
            loadingMore={recent.isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
            row={row}
          />
        )}
      </div>
      {picking ? (
        <div className="thread-undo" role="toolbar" aria-label="Selected threads">
          <span className="truncate" role="status">
            {bulk.isError || bulk.data?.some(({ result }) => result.status === 'rejected')
              ? 'Some threads could not be updated'
              : `${selection.size} selected${
                  ready.length < selection.size ? `, ${selection.size - ready.length} running` : ''
                }`}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={!ready.length || bulk.isPending}
            onClick={markDone}
          >
            {bulk.isPending ? 'Marking…' : 'Mark as done'}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Clear selection (Esc)"
            onClick={clearSelection}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={12} />
          </Button>
        </div>
      ) : (
        <UndoNotice />
      )}
    </>
  );
}

function FocusSections({
  toggle,
  active,
  inactive,
  loading,
  error,
  onRetry,
  canLoadMore,
  loadingMore,
  onLoadMore,
  row,
}: {
  toggle: ReactNode;
  active: ThreadRow[];
  inactive: ThreadRow[];
  loading: boolean;
  error: string | undefined;
  onRetry: () => void;
  canLoadMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => Promise<{ isError: boolean }>;
  row: (row: ThreadRow) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(INACTIVE_STEP);
  const heading = (
    <h2 className="sidebar-heading">
      Focus
      {toggle}
    </h2>
  );
  if (loading || error)
    return (
      <section className="thread-section" aria-label="Focus threads">
        {heading}
        {error ? (
          <div className="sidebar-note" role="alert">
            <p className="text-error">{error}</p>
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Retry
            </Button>
          </div>
        ) : (
          <p className="sidebar-note">Loading…</p>
        )}
      </section>
    );
  const hidden = inactive.length > visible;
  return (
    <>
      <section className="thread-section" aria-label="Focus threads">
        {heading}
        {active.length ? active.map(row) : <p className="sidebar-note">Nothing needs focus</p>}
      </section>
      <section className="thread-section" aria-label="Inactive threads">
        <h2 className="sidebar-heading">
          <button
            className="thread-section-toggle"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            Inactive
            <HugeiconsIcon icon={open ? ArrowDown01Icon : ArrowRight01Icon} size={12} />
          </button>
        </h2>
        {open && (
          <>
            {inactive.slice(0, visible).map(row)}
            {!inactive.length && !canLoadMore && (
              <p className="sidebar-note">No inactive threads</p>
            )}
            {(hidden || canLoadMore) && (
              <button
                className="nav-row session-more"
                disabled={loadingMore}
                onClick={async () => {
                  if (!hidden && (await onLoadMore()).isError) return;
                  setVisible((count) => count + INACTIVE_STEP);
                }}
              >
                {loadingMore ? 'Loading…' : 'Show more'}
              </button>
            )}
          </>
        )}
      </section>
    </>
  );
}

function UndoNotice() {
  const undo = useUndo();
  return undo ? <UndoRow key={undo.ids.join()} ids={undo.ids} /> : null;
}

function UndoRow({ ids }: { ids: string[] }) {
  const undo = useFocusMany();
  const failed =
    undo.isError || undo.data?.some(({ result }) => result.status === 'rejected') === true;
  return (
    <div className="thread-undo" role="status">
      <span className="truncate">
        {failed
          ? 'Could not undo'
          : ids.length === 1
            ? 'Marked as done'
            : `Marked ${ids.length} threads as done`}
      </span>
      <Button
        variant="ghost"
        size="sm"
        disabled={undo.isPending}
        onClick={() => undo.mutate({ ids, action: 'undone' })}
      >
        {failed ? 'Retry' : 'Undo'}
      </Button>
      <Button variant="ghost" size="icon" aria-label="Dismiss" onClick={dismissUndo}>
        <HugeiconsIcon icon={Cancel01Icon} size={12} />
      </Button>
    </div>
  );
}

function readExcluded(): ReadonlySet<string> {
  try {
    const value: unknown = JSON.parse(readStorage('focusExcluded') ?? '[]');
    return new Set(
      Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [],
    );
  } catch {
    return new Set();
  }
}

function pinnedData(results: UseQueryResult<SessionInfo>[]) {
  return results.map((result) => result.data);
}

/** Wall-clock time for the Active window, refreshed once a minute. */
function useMinute() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
