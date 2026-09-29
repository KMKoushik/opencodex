import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Folder,
  FolderOpen,
  MessageSquare,
  Moon,
  PanelLeft,
  RefreshCw,
  SquareTerminal,
  Sun,
  X,
} from 'lucide-react';
import type { Project } from '@opencodex/contracts';
import { Button } from '../components/ui/button';
import { useConnection } from '../features/connection/use-connection';
import { useEvents } from '../features/connection/use-events';
import { ProjectForm } from '../features/projects/project-form';
import { readProject, storeProject } from '../features/projects/storage';
import { useSessions } from '../features/sessions/use-sessions';
import { readStorage, writeStorage } from '../lib/storage';

export function App() {
  const [project, setProject] = useState(readProject);
  const [selectedID, setSelectedID] = useState<string>();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(() => (readStorage('theme') === 'light' ? 'light' : 'dark'));
  const { connection, connect, connected } = useConnection();
  const live = useEvents(connected);
  const sessions = useSessions(project?.directory, connected, live);
  const items = sessions.data?.pages.flatMap((page) => page.sessions) ?? [];
  const selected = items.find((session) => session.id === selectedID);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writeStorage('theme', theme);
  }, [theme]);

  function selectProject(next: Project | null) {
    setProject(next);
    storeProject(next);
    setSelectedID(undefined);
    setSidebarOpen(false);
  }

  return (
    <div className="app-shell" data-sidebar-open={sidebarOpen}>
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      <aside className="sidebar" id="sidebar" aria-label="Project and sessions">
        <div className="brand">
          <SquareTerminal size={21} strokeWidth={1.6} />
          <span>OpenCodex</span>
          <span className="edition">alpha</span>
        </div>
        <div className="sidebar-project">
          <span className="eyebrow">Workspace</span>
          <div className="project-row">
            <Folder size={17} />
            <span className="truncate" title={project?.directory}>
              {project?.name ?? 'No project selected'}
            </span>
            {project && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close project"
                title="Close project"
                onClick={() => selectProject(null)}
              >
                <X size={14} />
              </Button>
            )}
          </div>
        </div>
        <div className="sessions-heading">
          <span className="eyebrow">Sessions</span>
          {project && connected && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Refresh sessions"
              title="Refresh sessions"
              disabled={sessions.isFetching}
              onClick={() => void sessions.refetch()}
            >
              <RefreshCw size={14} />
            </Button>
          )}
        </div>
        <nav className="session-list" aria-label="Sessions">
          {!project && <p className="sidebar-hint">Open a project to see its sessions.</p>}
          {project && !connected && (
            <p className="sidebar-hint">Connect to OpenCode to load sessions.</p>
          )}
          {project && connected && sessions.isPending && (
            <p className="sidebar-hint" role="status">
              Loading sessions…
            </p>
          )}
          {project && connected && sessions.isError && (
            <div className="sidebar-error" role="alert">
              <p>{sessions.error.message}</p>
              <Button variant="secondary" onClick={() => void sessions.refetch()}>
                Retry
              </Button>
            </div>
          )}
          {project && connected && sessions.isSuccess && items.length === 0 && (
            <p className="sidebar-hint">No sessions in this project yet.</p>
          )}
          {items.map((session) => (
            <button
              className="session-item"
              key={session.id}
              aria-current={selectedID === session.id ? 'page' : undefined}
              onClick={() => {
                setSelectedID(session.id);
                setSidebarOpen(false);
              }}
            >
              <MessageSquare size={15} />
              <span className="truncate">{session.title}</span>
            </button>
          ))}
          {sessions.hasNextPage && (
            <Button
              variant="ghost"
              disabled={sessions.isFetchingNextPage || !connected}
              onClick={() => void sessions.fetchNextPage()}
            >
              {sessions.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          )}
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" data-connected={connected} />
          <div>
            <strong>{connected ? 'OpenCode connected' : 'OpenCode offline'}</strong>
            <span>
              {connected
                ? live
                  ? 'Live updates connected'
                  : 'Reconnecting live updates…'
                : 'Local agent backend'}
            </span>
          </div>
        </div>
      </aside>

      <div className="workspace-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <Button
              className="mobile-menu"
              variant="ghost"
              size="icon"
              aria-label="Toggle sidebar"
              aria-expanded={sidebarOpen}
              aria-controls="sidebar"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <PanelLeft size={18} />
            </Button>
            <span>{project?.name ?? 'Workspace'}</span>
            <ChevronRight size={13} />
            <span className="muted truncate">{selected ? 'Session overview' : 'Overview'}</span>
          </div>
          <div className="topbar-actions">
            <span className="runtime-label">{window.desktop ? 'Desktop' : 'Browser'}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </Button>
          </div>
        </header>

        <main id="workspace" className="workspace" tabIndex={-1}>
          <div className="welcome">
            <div className="workspace-mark">
              <SquareTerminal size={30} strokeWidth={1.3} />
            </div>
            <p className="eyebrow">Your coding workspace</p>
            <h1>
              {selected
                ? selected.title
                : project
                  ? `Welcome to ${project.name}.`
                  : 'A place to build.'}
            </h1>
            <p className="intro">
              {selected
                ? 'Session details from your OpenCode backend.'
                : 'Your projects and coding sessions, together in one quiet workspace.'}
            </p>

            <section className="setup-panel" aria-label="Workspace setup">
              <div className="connection-row">
                <div className="step-icon" data-complete={connected}>
                  {connected ? <Check size={17} /> : <SquareTerminal size={17} />}
                </div>
                <div className="connection-copy">
                  <h2>OpenCode backend</h2>
                  <p role="status">
                    {connected && connection.data?.status === 'connected'
                      ? `Connected · v${connection.data.version}`
                      : connection.isPending
                        ? 'Looking for your local service…'
                        : 'Connect your local coding agent.'}
                  </p>
                </div>
                <Button
                  variant={connected ? 'ghost' : 'secondary'}
                  disabled={connect.isPending || connection.isPending}
                  onClick={() => (connected ? void connection.refetch() : connect.mutate())}
                >
                  {connect.isPending ? 'Connecting…' : connected ? 'Check' : 'Connect'}
                  {!connected && <ArrowUpRight size={14} />}
                </Button>
              </div>
              {(connection.isError || connect.isError) && (
                <p className="panel-error" role="alert">
                  {connect.error?.message ??
                    'The gateway is unavailable. Check that the local server is running.'}
                </p>
              )}
              {connection.data?.status === 'disconnected' && (
                <p className="connection-help">{connection.data.message}</p>
              )}
              <div className="project-section">
                <div className="section-heading">
                  <FolderOpen size={17} />
                  <h2>{project ? 'Project directory' : 'Open a project'}</h2>
                </div>
                {project ? (
                  <div className="selected-project">
                    <code>{project.directory}</code>
                    <Button variant="ghost" onClick={() => selectProject(null)}>
                      Change
                    </Button>
                  </div>
                ) : (
                  <ProjectForm onSelect={selectProject} />
                )}
              </div>
            </section>

            {selected && (
              <section className="session-detail" aria-label="Session details">
                <div>
                  <span className="eyebrow">Last updated</span>
                  <p>{new Date(selected.updatedAt).toLocaleString()}</p>
                </div>
                <div>
                  <span className="eyebrow">Model</span>
                  <p>{selected.model ?? 'Not selected'}</p>
                </div>
              </section>
            )}
            {project && !selected && (
              <p className="workspace-note">
                {connected
                  ? 'Choose a session in the sidebar to inspect its details.'
                  : 'Connect to load sessions for this project.'}
              </p>
            )}
          </div>
          <footer className="workspace-footer">
            <span>Powered by OpenCode</span>
            <span>Web + desktop foundation</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
