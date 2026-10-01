import { lazy, Suspense, useCallback, useRef, useState } from 'react';
import {
  PanelLeftCloseIcon,
  PanelLeftIcon,
  Settings01Icon,
  Add01Icon,
  FolderOpenIcon,
  Folder01Icon,
  PanelRightIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OpenCodeProject, Project } from '@opencodex/contracts';
import { Button } from '../components/ui/button';
import { useConnection } from '../features/connection/use-connection';
import { useEvents } from '../features/connection/use-events';
import {
  readProject,
  readProjects,
  storeProject,
  storeProjects,
} from '../features/projects/storage';
import { GeneralSettings } from '../features/settings/general-settings';
import { settingsSections, type SettingsSection } from '../features/settings/sections';
import { SettingsNav } from '../features/settings/settings-nav';
import { AppearanceSettings } from '../features/theme/appearance-settings';
import { useThemeEffect } from '../features/theme/use-theme';
import { WorkspaceView } from '../features/workspace/workspace-view';
import { ProjectList } from '../features/projects/project-list';
import { ProjectsSettings } from '../features/projects/projects-settings';
import { projectFolder } from '../features/projects/project-metadata';
import { api } from '../lib/api';
import { useCommand } from '../features/shortcuts/use-command';
import { shortcutProps } from '../features/shortcuts/commands';
import { ShortcutsSettings } from '../features/shortcuts/shortcuts-settings';
import { SessionPanelToggle } from '../features/session-panel/session-panel-toggle';
import { WorkbenchRail } from '../features/workbench/workbench-rail';
import { panels } from '../features/workbench/panels';

const ChatView = lazy(() =>
  import('../features/chat/chat-view').then((module) => ({ default: module.ChatView })),
);
const WorkbenchPanel = lazy(() =>
  import('../features/workbench/workbench-panel').then((module) => ({
    default: module.WorkbenchPanel,
  })),
);

export function App() {
  useThemeEffect();
  const [project, setProject] = useState(readProject);
  const [projects, setProjects] = useState(readProjects);
  const [selectedID, setSelectedID] = useState<string>();
  const [settings, setSettings] = useState<SettingsSection | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [workbenchOpen, setWorkbenchOpen] = useState(false);
  const [workbenchPanel, setWorkbenchPanel] = useState(panels[0]!);
  const [workbenchLoaded, setWorkbenchLoaded] = useState(false);
  const workbenchToggle = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const main = useRef<HTMLElement>(null);
  const queryClient = useQueryClient();
  const { connected } = useConnection();
  const live = useEvents(connected);
  const metadata = useQuery({
    queryKey: ['projects'],
    queryFn: ({ signal }) => api.projects(signal),
    enabled: connected && Boolean(project),
    select: useCallback(
      (projects: OpenCodeProject[]) =>
        projects.find((item) => item.canonical === project?.directory),
      [project?.directory],
    ),
  });
  const currentProject = metadata.data ? projectFolder(metadata.data) : project;
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
    main.current?.focus({ preventScroll: true });
  }

  function toggleSidebar() {
    const mobile = matchMedia('(max-width: 720px)').matches;
    if (sidebar.current?.contains(document.activeElement))
      main.current?.focus({ preventScroll: true });
    if (mobile) setSidebarOpen((open) => !open);
    else setSidebarCollapsed((collapsed) => !collapsed);
  }

  function newChat() {
    if (!project || !connected || create.isPending) return false;
    navigate(null);
    create.mutate(project.directory);
  }

  function openProject() {
    navigate(null);
    selectProject(null);
  }

  useCommand('sidebar.toggle', toggleSidebar);
  useCommand('chat.new', newChat);
  useCommand('project.open', openProject);
  useCommand('settings.open', () => navigate('general'));
  useCommand('shortcuts.open', () => navigate('shortcuts'));
  useCommand('view.dismiss', () => {
    if (sidebarOpen && matchMedia('(max-width: 720px)').matches) {
      setSidebarOpen(false);
      main.current?.focus({ preventScroll: true });
    } else if (settings) navigate(null);
    else return false;
  });

  return (
    <div
      className="app-shell"
      data-sidebar-open={sidebarOpen}
      data-sidebar-collapsed={sidebarCollapsed}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside ref={sidebar} className="sidebar" id="sidebar" aria-label="Sidebar">
        <div className="sidebar-header">
          <span className="sidebar-brand">OpenCodex</span>
          <Button
            className="desktop-sidebar-toggle"
            variant="ghost"
            size="icon"
            aria-label="Hide sidebar"
            {...shortcutProps('sidebar.toggle')}
            onClick={toggleSidebar}
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
                {...shortcutProps('chat.new')}
                onClick={newChat}
              >
                <HugeiconsIcon icon={Add01Icon} size={16} />
                <span>{create.isPending ? 'Creating…' : 'New chat'}</span>
              </button>
              <button className="nav-row" {...shortcutProps('project.open')} onClick={openProject}>
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
              live={live}
              opened={projects}
              current={project}
              onSelect={selectProject}
              onClose={closeProject}
              selectedID={selectedID}
              onSelectSession={(next, id) => {
                if (project?.directory !== next.directory) selectProject(next);
                setSelectedID(id);
                setSidebarOpen(false);
              }}
            />
            <div className="sidebar-footer">
              <button
                className="nav-row"
                {...shortcutProps('settings.open')}
                onClick={() => navigate('general')}
              >
                <HugeiconsIcon icon={Settings01Icon} size={16} />
                <span>Settings</span>
              </button>
            </div>
          </>
        )}
      </aside>

      <div className="main-shell">
        <div className="workspace-body">
          <div className="chat-column">
            <header className="toolbar">
              {sidebarCollapsed && (
                <Button
                  className="desktop-sidebar-toggle"
                  variant="ghost"
                  size="icon"
                  aria-label="Show sidebar"
                  {...shortcutProps('sidebar.toggle')}
                  onClick={toggleSidebar}
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
                {...shortcutProps('sidebar.toggle')}
                onClick={toggleSidebar}
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
                  {currentProject?.name}
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
                    ? info.data?.title || 'New chat'
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
              {connected && selectedID && !settings && (
                <SessionPanelToggle
                  key={selectedID}
                  sessionID={selectedID}
                  projectName={currentProject?.name}
                  live={live}
                />
              )}
              {connected && selectedID && !settings && (
                <Button
                  ref={workbenchToggle}
                  variant="ghost"
                  size="icon"
                  aria-label="Toggle workspace panel"
                  title="Toggle workspace panel"
                  aria-expanded={workbenchOpen}
                  aria-controls="workbench"
                  onClick={() => {
                    setWorkbenchLoaded(true);
                    setWorkbenchOpen((value) => !value);
                  }}
                >
                  <HugeiconsIcon icon={PanelRightIcon} size={17} />
                </Button>
              )}
            </header>
            <main ref={main} id="main" className="main" tabIndex={-1}>
              {settings ? (
                <div className="settings-page" data-section={settings}>
                  {settings !== 'projects' && <h1>{settingsTitle}</h1>}
                  {settings === 'general' ? (
                    <GeneralSettings
                      live={live}
                      project={currentProject}
                      onCloseProject={() => project && closeProject(project.directory)}
                    />
                  ) : settings === 'shortcuts' ? (
                    <ShortcutsSettings />
                  ) : settings === 'projects' ? (
                    <ProjectsSettings
                      connected={connected}
                      live={live}
                      opened={projects}
                      onAdd={selectProject}
                      onClose={closeProject}
                      onOpen={(project) => {
                        selectProject(project);
                        navigate(null);
                      }}
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
                    onOpenSession={setSelectedID}
                    live={live}
                    projectName={currentProject?.name}
                  />
                </Suspense>
              ) : (
                <WorkspaceView
                  project={currentProject}
                  onSelectProject={selectProject}
                  onNewChat={newChat}
                  creating={create.isPending}
                  createError={create.error?.message}
                />
              )}
            </main>
          </div>
          {workbenchLoaded &&
            connected &&
            selectedID &&
            info.data?.location.directory &&
            !settings && (
              <Suspense
                fallback={
                  <div className="workspace-loading" role="status">
                    Loading workspace…
                  </div>
                }
              >
                <WorkbenchPanel
                  key={selectedID}
                  directory={info.data.location.directory}
                  sessionID={selectedID}
                  live={live}
                  open={workbenchOpen}
                  panel={workbenchPanel}
                  onClose={() => {
                    setWorkbenchOpen(false);
                    workbenchToggle.current?.focus();
                  }}
                />
              </Suspense>
            )}
          {connected && selectedID && info.data?.location.directory && !settings && (
            <WorkbenchRail
              directory={info.data.location.directory}
              panels={panels}
              active={workbenchOpen ? workbenchPanel.id : null}
              onSelect={(panel) => {
                setWorkbenchLoaded(true);
                setWorkbenchPanel(panel);
                setWorkbenchOpen((open) => panel.id !== workbenchPanel.id || !open);
              }}
            />
          )}
        </div>
      </div>
      <div className="sidebar-scrim" aria-hidden="true" onClick={() => setSidebarOpen(false)} />
    </div>
  );
}
