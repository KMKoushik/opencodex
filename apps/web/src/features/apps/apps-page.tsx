import { lazy, Suspense, useCallback, useRef, useState } from 'react';
import {
  Alert02Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  Delete02Icon,
  GridViewIcon,
  Loading03Icon,
  PlayIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OpenCodeProject } from '@opencodex/contracts';
import type { AppInfo, AppRun } from '@opencodex/contracts/canvas';
import { Button } from '../../components/ui/button';
import { SegmentedControl } from '../../components/ui/segmented-control';
import { Dialog } from '../../components/ui/dialog';
import { api } from '../../lib/api';
import { CanvasFrame } from '../canvas/canvas-frame';
import { appRunsKey, appsKey } from '../canvas/canvas-context';
import { ProjectIcon } from '../projects/project-icon';
import { projectName } from '../projects/project-metadata';
import { AppIcon } from './app-icon';
import '../canvas/canvas.css';
import './apps.css';

const AppCode = lazy(() => import('./app-code').then((module) => ({ default: module.AppCode })));

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'short' });
function ago(time: number) {
  const seconds = Math.round((time - Date.now()) / 1000);
  for (const [unit, size] of [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ] as const)
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  return 'just now';
}
function duration(run: Pick<AppRun, 'started' | 'ended'>) {
  const ms = (run.ended ?? Date.now()) - run.started;
  return ms < 1000
    ? `${ms} ms`
    : ms < 60_000
      ? `${(ms / 1000).toFixed(1)} s`
      : `${Math.round(ms / 60_000)} min`;
}

/** Every app at a glance, or one app full-size with its code and runs. */
export function AppsPage({
  connected,
  selected,
  onSelect,
  onOpenSession,
  onDeleted,
}: {
  connected: boolean;
  /** An app id, or undefined for the index of all apps. */
  selected?: string;
  onSelect: (id: string) => void;
  onOpenSession: (sessionID: string) => void;
  onDeleted: () => void;
}) {
  const apps = useQuery({
    queryKey: appsKey,
    queryFn: ({ signal }) => api.apps(signal),
  });
  const app = selected ? apps.data?.find((item) => item.id === selected) : undefined;

  if (!apps.data)
    return (
      <div className="apps-page">
        <p className="apps-note" role="status">
          {apps.error ? apps.error.message : 'Loading apps…'}
        </p>
      </div>
    );
  if (!app && apps.data.length)
    return (
      <div className="apps-page">
        <AppsIndex apps={apps.data} onSelect={onSelect} />
      </div>
    );
  if (!app)
    return (
      <div className="apps-page">
        <div className="apps-empty">
          <HugeiconsIcon icon={GridViewIcon} size={22} />
          <h2>No apps yet</h2>
          <p>
            An app is a canvas with code behind it that can call OpenCode. Ask for one in any chat,
            for example: “Every day, check open PRs and issues in my repo, fix the easy ones, and
            show me a dashboard of what needs my decision.”
          </p>
        </div>
      </div>
    );
  return (
    <div className="apps-page">
      <AppDetail
        key={app.id}
        app={app}
        connected={connected}
        onOpenSession={onOpenSession}
        onDeleted={onDeleted}
      />
    </div>
  );
}

/** The project of the chat that made the app, from the projects list the sidebar already loads. */
function useAppProject(projectID: string | undefined) {
  return useQuery({
    queryKey: ['projects'],
    queryFn: ({ signal }) => api.projects(signal),
    enabled: Boolean(projectID),
    select: useCallback(
      (projects: OpenCodeProject[]) => projects.find((project) => project.id === projectID),
      [projectID],
    ),
  }).data;
}

function AppProject({ projectID }: { projectID?: string }) {
  const project = useAppProject(projectID);
  if (!project) return null;
  const name = projectName(project);
  return (
    <span className="apps-project" title={project.canonical}>
      <ProjectIcon name={name} icon={project.icon} />
      <span className="truncate">{name}</span>
    </span>
  );
}

function AppStatus({ app, schedule = true }: { app: AppInfo; schedule?: boolean }) {
  if (app.error)
    return (
      <>
        <HugeiconsIcon icon={Alert02Icon} size={12} className="apps-error-icon" />
        server.ts failed
      </>
    );
  if (app.running.length)
    return (
      <>
        <HugeiconsIcon icon={Loading03Icon} size={12} className="apps-spin" />
        Running {app.running.join(', ')}
      </>
    );
  const last = app.lastRun;
  const every = schedule
    ? Object.values(app.triggers)
        .map((trigger) => `every ${trigger.every}`)
        .join(', ')
    : '';
  return (
    <>
      {last
        ? `${last.status === 'error' ? 'Failed' : 'Ran'} ${ago(last.ended ?? last.started)}`
        : 'Never run'}
      {every && ` · ${every}`}
    </>
  );
}

function AppDetail({
  app,
  connected,
  onOpenSession,
  onDeleted,
}: {
  app: AppInfo;
  connected: boolean;
  onOpenSession: (sessionID: string) => void;
  onDeleted: () => void;
}) {
  const [runsOpen, setRunsOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState<'app' | 'code'>('app');
  const runs = useQuery({
    queryKey: appRunsKey(app.id),
    queryFn: ({ signal }) => api.appRuns(app.id, signal),
    enabled: runsOpen,
  });
  const run = useMutation({
    mutationFn: (name: string) => api.callCanvasFunction(app.id, name, []),
  });
  const runnable = Object.keys(app.triggers);
  return (
    <section className="apps-detail" aria-label={app.title}>
      <header className="apps-header">
        <AppIcon id={app.id} title={app.title} icon={app.icon} size={32} />
        <div className="apps-header-text">
          <h1 className="truncate">{app.title}</h1>
          <p className="apps-header-meta truncate">
            <AppStatus app={app} />
            {app.projectID && <span aria-hidden="true">·</span>}
            <AppProject projectID={app.projectID} />
          </p>
        </div>
        <SegmentedControl
          label="Show"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'app', label: 'App' },
            { value: 'code', label: 'Code' },
          ]}
        />
        {app.sessionID && (
          <Button variant="ghost" size="sm" onClick={() => onOpenSession(app.sessionID!)}>
            Open chat
            <HugeiconsIcon icon={ArrowUpRight01Icon} size={13} />
          </Button>
        )}
        {runnable.map((name) => (
          <Button
            key={name}
            variant="secondary"
            size="sm"
            disabled={!connected || app.running.includes(name)}
            onClick={() => run.mutate(name)}
          >
            <HugeiconsIcon icon={PlayIcon} size={12} />
            Run {name}
          </Button>
        ))}
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Delete ${app.title}`}
          title="Delete app"
          onClick={() => setDeleting(true)}
        >
          <HugeiconsIcon icon={Delete02Icon} size={15} />
        </Button>
      </header>
      {deleting && <DeleteApp app={app} onClose={() => setDeleting(false)} onDeleted={onDeleted} />}
      {(app.error || run.error) && (
        <div className="canvas-frame-error" role="alert">
          {app.error ?? run.error?.message}
        </div>
      )}
      {tab === 'app' ? (
        <CanvasFrame id={app.id} mode="panel" title={app.title} />
      ) : (
        <Suspense
          fallback={
            <p className="apps-note" role="status">
              Loading code…
            </p>
          }
        >
          <AppCode id={app.id} />
        </Suspense>
      )}
      <div className="apps-runs" data-open={runsOpen}>
        <button
          className="apps-runs-toggle"
          aria-expanded={runsOpen}
          onClick={() => setRunsOpen((open) => !open)}
        >
          <HugeiconsIcon icon={runsOpen ? ArrowDown01Icon : ArrowRight01Icon} size={12} />
          Runs
          <span className="apps-runs-count">{app.runCount}</span>
        </button>
        {runsOpen && (
          <ol className="apps-runs-list">
            {!runs.data && (
              <li className="apps-note" role={runs.error ? 'alert' : 'status'}>
                {runs.error ? runs.error.message : 'Loading runs…'}
              </li>
            )}
            {runs.data?.length === 0 && <li className="apps-note">No runs yet.</li>}
            {runs.data?.map((item) => (
              <RunRow key={item.id} run={item} onOpenSession={onOpenSession} />
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function AppsIndex({ apps, onSelect }: { apps: AppInfo[]; onSelect: (id: string) => void }) {
  const running = apps.filter((app) => app.running.length).length;
  const failing = apps.filter((app) => app.error || app.lastRun?.status === 'error').length;
  return (
    <div className="apps-index">
      <header className="apps-index-header">
        <h1>Apps</h1>
        <p>
          {apps.length} {apps.length === 1 ? 'app' : 'apps'}
          {running > 0 && ` · ${running} running`}
          {failing > 0 && ` · ${failing} failing`}
        </p>
      </header>
      <ul className="apps-grid">
        {apps.map((app) => {
          const state = app.running.length
            ? 'running'
            : app.error || app.lastRun?.status === 'error'
              ? 'error'
              : 'idle';
          const schedule = Object.values(app.triggers).map((trigger) => trigger.every);
          return (
            <li key={app.id}>
              <button className="apps-tile" data-state={state} onClick={() => onSelect(app.id)}>
                <AppIcon id={app.id} title={app.title} icon={app.icon} size={36} />
                <span className="apps-tile-text">
                  <span className="apps-tile-title truncate">{app.title}</span>
                  <span className="apps-tile-meta truncate">
                    <AppStatus app={app} schedule={false} />
                  </span>
                  <span className="apps-tile-foot">
                    <span className="truncate">
                      {schedule.length ? `Every ${schedule.join(', ')}` : 'On demand'}
                    </span>
                    <AppProject projectID={app.projectID} />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DeleteApp({
  app,
  onClose,
  onDeleted,
}: {
  app: AppInfo;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const client = useQueryClient();
  const cancel = useRef<HTMLButtonElement>(null);
  const remove = useMutation({
    mutationFn: () => api.deleteCanvas(app.id),
    onSuccess: () => {
      client.setQueryData<AppInfo[]>(appsKey, (apps) => apps?.filter((item) => item.id !== app.id));
      onDeleted();
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: appsKey });
      void client.invalidateQueries({ queryKey: ['canvases'] });
    },
  });
  return (
    <Dialog title="Delete app?" busy={remove.isPending} onClose={onClose} initialFocus={cancel}>
      <p>
        “{app.title}” stops running. Its code, data, run history, and the agent sessions it started
        are deleted. Pull requests and other changes it already made stay.
      </p>
      {remove.error && (
        <p className="text-error" role="alert">
          {remove.error.message}
        </p>
      )}
      <div className="dialog-actions">
        <Button ref={cancel} variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={remove.isPending} onClick={() => remove.mutate()}>
          {remove.isPending ? 'Deleting…' : 'Delete'}
        </Button>
      </div>
    </Dialog>
  );
}

function RunRow({ run, onOpenSession }: { run: AppRun; onOpenSession: (id: string) => void }) {
  const [open, setOpen] = useState(run.status === 'error');
  const detail = Boolean(run.error || run.logs.length || run.sessions.length);
  return (
    <li className="apps-run" data-status={run.status}>
      <button
        className="apps-run-summary"
        aria-expanded={detail ? open : undefined}
        disabled={!detail}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="apps-run-dot" aria-hidden="true" />
        <span className="apps-run-fn">{run.fn}()</span>
        <span className="apps-run-meta">
          {run.status === 'running' ? 'running' : run.status} · {run.source} · {ago(run.started)} ·{' '}
          {duration(run)}
        </span>
      </button>
      {open && detail && (
        <div className="apps-run-detail">
          {run.sessions.map((session) => (
            <button
              key={session.id}
              className="apps-run-session"
              onClick={() => onOpenSession(session.id)}
            >
              <HugeiconsIcon icon={ArrowUpRight01Icon} size={12} />
              <span className="truncate">{session.title}</span>
            </button>
          ))}
          {run.error && <pre className="apps-run-error">{run.error}</pre>}
          {run.logs.length > 0 && <pre className="apps-run-logs">{run.logs.join('\n')}</pre>}
        </div>
      )}
    </li>
  );
}
