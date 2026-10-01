import { lazy, Suspense, useState } from 'react';
import {
  PanelLeftCloseIcon,
  PanelLeftIcon,
  Settings01Icon,
  Add01Icon,
  FolderOpenIcon,
  Folder01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Project } from '@opencodex/contracts';
import { Button } from '../components/ui/button';
import { useConnection } from '../features/connection/use-connection';
import { useEvents } from '../features/connection/use-events';
import {
  readProject,
  readProjects,
  storeProject,
  storeProjects,
} from '../features/projects/storage';
import { SessionList } from '../features/sessions/session-list';
import { useSessions } from '../features/sessions/use-sessions';
import { GeneralSettings } from '../features/settings/general-settings';
import { settingsSections, type SettingsSection } from '../features/settings/sections';
import { SettingsNav } from '../features/settings/settings-nav';
import { AppearanceSettings } from '../features/theme/appearance-settings';
import { useThemeEffect } from '../features/theme/use-theme';
import { WorkspaceView } from '../features/workspace/workspace-view';
import { ProjectList } from '../features/projects/project-list';
import { api } from '../lib/api';

const ChatView = lazy(() =>
  import('../features/chat/chat-view').then((module) => ({ default: module.ChatView })),
);

export function App() {
  useThemeEffect();
  const [project, setProject] = useState(readProject);
  const [projects, setProjects] = useState(readProjects);
  const [selectedID, setSelectedID] = useState<string>();
  const [settings, setSettings] = useState<SettingsSection | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Drafts survive navigation, but typing only updates the composer component.
  const [drafts] = useState(() => new Map<string, string>());
  const queryClient = useQueryClient();
  const { connected } = useConnection();
  const live = useEvents(connected);
  const sessions = useSessions(project?.directory, connected, live);
  const items = sessions.data?.pages.flatMap((page) => page.sessions);
  const selected = items?.find((session) => session.id === selectedID);
  const info = useQuery({
    queryKey: ['chat', selectedID, 'info'],
    enabled: Boolean(selectedID && connected),
    queryFn: ({ signal }) => api.session(selectedID!, signal),
  });
  const create = useMutation({
    mutationFn: (directory: string) => api.createSession(directory),
    onSuccess: (session, directory) => {
      queryClient.setQueryData(['chat', session.id, 'info'], session);
      if (project?.directory === directory) {
        setSelectedID(session.id);
        setSidebarOpen(false);
      }
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
  const settingsTitle = settingsSections.find((section) => section.id === settings)?.label;

  function selectProject(next: Project | null) {
    const opened =
      next && !projects.some((item) => item.directory === next.directory)
        ? [next, ...projects]
        : projects;
    if (opened !== projects) setProjects(opened);
    storeProjects(opened);
    setProject(next);
    storeProject(next);
    setSelectedID(undefined);
    setSidebarOpen(false);
    create.reset();
  }

  function closeProject(directory: string) {
    const remaining = projects.filter((item) => item.directory !== directory);
    if (project?.directory === directory) selectProject(remaining[0] ?? null);
    setProjects(remaining);
    storeProjects(remaining);
  }

  function navigate(next: SettingsSection | null) {
    setSettings(next);
    setSidebarOpen(false);
  }

  return (
    <div
      className="app-shell"
      data-sidebar-open={sidebarOpen}
      data-sidebar-collapsed={sidebarCollapsed}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setSidebarOpen(false);
      }}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar" id="sidebar" aria-label="Sidebar">
        <div className="sidebar-header">
          <span className="sidebar-brand">OpenCodex</span>
          <Button
            className="desktop-sidebar-toggle"
            variant="ghost"
            size="icon"
            aria-label="Hide sidebar"
            title="Hide sidebar"
            onClick={() => setSidebarCollapsed(true)}
          >
            <HugeiconsIcon icon={PanelLeftCloseIcon} size={16} />
          </Button>
        </div>
        {settings ? (
          <SettingsNav section={settings} onSelect={navigate} onBack={() => navigate(null)} />
        ) : (
          <>
            <div className="sidebar-actions">
              <button
                className="nav-row"
                disabled={!project || !connected || create.isPending}
                onClick={() => project && create.mutate(project.directory)}
              >
                <HugeiconsIcon icon={Add01Icon} size={16} />
                <span>{create.isPending ? 'Creating…' : 'New chat'}</span>
              </button>
              <button className="nav-row" onClick={() => selectProject(null)}>
                <HugeiconsIcon icon={FolderOpenIcon} size={16} />
                <span>Open project</span>
              </button>
              {create.isError && selectedID && (
                <p className="sidebar-note text-error" role="alert">
                  {create.error.message}
                </p>
              )}
            </div>
            <ProjectList
              connected={connected}
              opened={projects}
              current={project}
              onSelect={selectProject}
              onClose={closeProject}
            >
              <SessionList
                connected={connected}
                sessions={sessions}
                selectedID={selectedID}
                onSelect={(id) => {
                  setSelectedID(id);
                  setSidebarOpen(false);
                }}
              />
            </ProjectList>
            <div className="sidebar-footer">
              <button className="nav-row" onClick={() => navigate('general')}>
                <HugeiconsIcon icon={Settings01Icon} size={16} />
                <span>Settings</span>
              </button>
            </div>
          </>
        )}
      </aside>

      <div className="main-shell">
        <header className="toolbar">
          {sidebarCollapsed && (
            <Button
              className="desktop-sidebar-toggle"
              variant="ghost"
              size="icon"
              aria-label="Show sidebar"
              title="Show sidebar"
              onClick={() => setSidebarCollapsed(false)}
            >
              <HugeiconsIcon icon={PanelLeftIcon} size={16} />
            </Button>
          )}
          <Button
            className="sidebar-toggle"
            variant="ghost"
            size="icon"
            aria-label="Toggle sidebar"
            aria-expanded={sidebarOpen}
            aria-controls="sidebar"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? (
              <HugeiconsIcon icon={PanelLeftCloseIcon} size={16} />
            ) : (
              <HugeiconsIcon icon={PanelLeftIcon} size={16} />
            )}
          </Button>
          {!settings && project && (
            <span className="toolbar-project truncate" title={project.directory}>
              <HugeiconsIcon icon={Folder01Icon} size={14} />
              {project.name}
            </span>
          )}
          {!settings && project && (
            <span className="toolbar-separator" aria-hidden="true">
              /
            </span>
          )}
          {!settings && (
            <h1 className="toolbar-title truncate">
              {selectedID
                ? info.data?.title || selected?.title || 'New chat'
                : project
                  ? 'New thread'
                  : 'OpenCodex'}
            </h1>
          )}
          {connected && !live && !settings && (
            <span className="toolbar-status" role="status">
              Live updates paused
            </span>
          )}
        </header>
        <main id="main" className="main" tabIndex={-1}>
          {settings ? (
            <div className="settings-page">
              <h1>{settingsTitle}</h1>
              {settings === 'general' ? (
                <GeneralSettings
                  live={live}
                  project={project}
                  onCloseProject={() => project && closeProject(project.directory)}
                />
              ) : (
                <AppearanceSettings />
              )}
            </div>
          ) : selectedID && connected ? (
            <Suspense
              fallback={
                <p className="sidebar-note" role="status">
                  Loading conversation…
                </p>
              }
            >
              <ChatView
                key={selectedID}
                sessionID={selectedID}
                live={live}
                drafts={drafts}
                projectName={project?.name}
              />
            </Suspense>
          ) : (
            <WorkspaceView
              project={project}
              onSelectProject={selectProject}
              onNewChat={() => project && create.mutate(project.directory)}
              creating={create.isPending}
              createError={create.error?.message}
            />
          )}
        </main>
      </div>
      <div className="sidebar-scrim" aria-hidden="true" onClick={() => setSidebarOpen(false)} />
    </div>
  );
}
