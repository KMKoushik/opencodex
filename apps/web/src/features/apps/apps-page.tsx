import { lazy, Suspense, useRef, useState } from 'react';
import {
  AiBrain01Icon,
  Alert02Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  Delete02Icon,
  GridViewIcon,
  Loading03Icon,
  Message01Icon,
  PaintBoardIcon,
  PlayIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppInfo, AppModelSource, AppRun } from '@opencodex/contracts/canvas';
import { Button } from '../../components/ui/button';
import { SegmentedControl } from '../../components/ui/segmented-control';
import { Dialog } from '../../components/ui/dialog';
import { api } from '../../lib/api';
import { CanvasFrame } from '../canvas/canvas-frame';
import { appRunsKey, appsKey } from '../canvas/canvas-context';
import { ProjectActions } from '../projects/project-actions';
import { ProjectIcon } from '../projects/project-icon';
import { projectName } from '../projects/project-metadata';
import { AppIcon } from './app-icon';
import { useAppProject } from './app-hooks';
import { ago, duration, scheduleLabel } from './app-time';
import { AppModelDialog, AppModelName } from './app-model';
import '../canvas/canvas.css';
import './apps.css';

const AppIconPicker = lazy(() =>
  import('./app-icon-picker').then((module) => ({ default: module.AppIconPicker })),
);
const AppCode = lazy(() => import('./app-code').then((module) => ({ default: module.AppCode })));
const AppSettings = lazy(() =>
  import('./app-settings').then((module) => ({ default: module.AppSettings })),
);

const CALL_SOURCE: Record<AppModelSource, string> = {
  code: 'set in code',
  app: 'app model',
  chat: 'chat’s model',
  default: 'default model',
  thread: 'continued thread',
};

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
  const every = schedule ? scheduleLabel(app) : '';
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
  const [pickingIcon, setPickingIcon] = useState(false);
  const [pickingModel, setPickingModel] = useState(false);
  const [tab, setTab] = useState<'app' | 'settings' | 'code'>('app');
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
        <button
          className="apps-icon-button"
          aria-label="Change icon"
          title="Change icon"
          disabled={!connected}
          onClick={() => setPickingIcon(true)}
        >
          <AppIcon id={app.id} title={app.title} icon={app.icon} size={32} />
        </button>
        <div className="apps-header-text">
          <h1 className="truncate">{app.title}</h1>
          <p className="apps-header-meta truncate">
            <AppStatus app={app} />
            {app.projectID && <span aria-hidden="true">·</span>}
            <AppProject projectID={app.projectID} />
            <AppModelName id={app.id} onClick={() => setPickingModel(true)} />
          </p>
        </div>
        <SegmentedControl
          label="Show"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'app', label: 'App' },
            { value: 'settings', label: 'Settings' },
            { value: 'code', label: 'Code' },
          ]}
        />
        {app.sessionID && (
          <Button variant="ghost" size="sm" onClick={() => onOpenSession(app.sessionID!)}>
            <HugeiconsIcon icon={Message01Icon} size={13} />
            Open chat
          </Button>
        )}
        {runnable.length === 1 ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={!connected || app.running.includes(runnable[0]!)}
            onClick={() => run.mutate(runnable[0]!)}
          >
            <HugeiconsIcon icon={PlayIcon} size={12} />
            Run {runnable[0]}
          </Button>
        ) : runnable.length > 1 ? (
          <ProjectActions
            name={app.title}
            button={{
              label: 'Run a function',
              disabled: !connected,
              content: (
                <>
                  <HugeiconsIcon icon={PlayIcon} size={12} />
                  Run
                  <HugeiconsIcon icon={ArrowDown01Icon} size={12} />
                </>
              ),
            }}
            actions={runnable.map((name) => ({
              label: `Run ${name}`,
              icon: PlayIcon,
              disabled: app.running.includes(name),
              onSelect: () => run.mutate(name),
            }))}
          />
        ) : null}
        <ProjectActions
          name={app.title}
          actions={[
            {
              label: 'Change model…',
              icon: AiBrain01Icon,
              disabled: !connected,
              onSelect: () => setPickingModel(true),
            },
            {
              label: 'Change icon…',
              icon: PaintBoardIcon,
              disabled: !connected,
              onSelect: () => setPickingIcon(true),
            },
            {
              label: 'Delete app…',
              icon: Delete02Icon,
              danger: true,
              onSelect: () => setDeleting(true),
            },
          ]}
        />
      </header>
      {pickingIcon && (
        <Suspense fallback={null}>
          <AppIconPicker app={app} onClose={() => setPickingIcon(false)} />
        </Suspense>
      )}
      {pickingModel && (
        <AppModelDialog id={app.id} disabled={!connected} onClose={() => setPickingModel(false)} />
      )}
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
              Loading…
            </p>
          }
        >
          {tab === 'settings' ? (
            <AppSettings
              app={app}
              connected={connected}
              onRun={(name) => run.mutate(name)}
              onOpenSession={onOpenSession}
              onChangeIcon={() => setPickingIcon(true)}
              onChangeModel={() => setPickingModel(true)}
            />
          ) : (
            <AppCode id={app.id} />
          )}
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
          const schedule = scheduleLabel(app);
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
                      {schedule ? schedule[0]!.toUpperCase() + schedule.slice(1) : 'On demand'}
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
  const calls = run.calls ?? [];
  const detail = Boolean(run.error || run.logs.length || run.sessions.length || calls.length);
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
          {calls.length > 0 && (
            <ul className="apps-run-calls" aria-label="Model calls">
              {calls.map((call, index) => (
                <li key={index} data-error={call.error ? '' : undefined}>
                  <span className="apps-run-call-kind">oc.{call.kind}</span>
                  <span className="truncate">{call.model ?? 'choosing model…'}</span>
                  <span className="apps-run-call-meta">
                    {call.source && CALL_SOURCE[call.source]}
                    {' · '}
                    {call.ended === undefined ? 'running' : duration(call)}
                  </span>
                  {call.error && <span className="apps-run-call-error">{call.error}</span>}
                </li>
              ))}
            </ul>
          )}
          {run.error && <pre className="apps-run-error">{run.error}</pre>}
          {run.logs.length > 0 && <pre className="apps-run-logs">{run.logs.join('\n')}</pre>}
        </div>
      )}
    </li>
  );
}
