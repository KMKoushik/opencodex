import { lazy, Suspense, useCallback, useRef, useState } from 'react';
import {
  PanelLeftCloseIcon,
  PanelLeftIcon,
  Settings01Icon,
  PencilEdit02Icon,
  FolderOpenIcon,
  Folder01Icon,
  PanelRightIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ModelCatalog, ModelRef, OpenCodeProject, Project } from '@opencodex/contracts';
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
import { SessionTitle } from '../features/sessions/session-title';
import { WorkbenchRail } from '../features/workbench/workbench-rail';
import { panels } from '../features/workbench/panels';
import { SidebarResize } from '../features/sidebar/sidebar-resize';
import { readTerminalPlacement, type TerminalPlacement } from '../features/terminal/placement';
import { writeStorage } from '../lib/storage';
import { useDraftStore } from '../features/chat/draft-context';
import { BrandIcon, Wordmark } from '../features/brand/brand';

const TerminalDrawer = lazy(() =>
  import('../features/terminal/terminal-drawer').then((module) => ({
    default: module.TerminalDrawer,
  })),
);
const terminalPanel = panels.find((panel) => panel.id === 'terminal')!;

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
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalPlacement, setTerminalPlacement] = useState(readTerminalPlacement);
  const [terminalLoaded, setTerminalLoaded] = useState(false);
  const terminalFocus = useRef<HTMLElement | null>(null);

  const [workbenchOpen, setWorkbenchOpen] = useState(false);
  const [workbenchPanel, setWorkbenchPanel] = useState(panels[0]!);
  const [workbenchLoaded, setWorkbenchLoaded] = useState(false);
  const workbenchToggle = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const main = useRef<HTMLElement>(null);
  const queryClient = useQueryClient();
  const drafts = useDraftStore();
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
    mutationFn: ({ directory, model }: { directory: string; model?: ModelRef }) =>
      api.createSession(directory, model),
    onSuccess: (session, { directory }) => {
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
    // Capture the visible selection before creation; unsent choices win over session state.
    const model =
      (selectedID ? drafts.getState().drafts[selectedID]?.model : undefined) ??
      info.data?.model ??
      drafts.getState().projectModels[project.directory] ??
      queryClient.getQueryData<ModelCatalog>([
        'models',
        info.data?.location.directory ?? project.directory,
      ])?.defaultModel ??
      undefined;
    if (model) drafts.getState().rememberModel(project.directory, model);
    navigate(null);
    create.mutate({ directory: project.directory, model });
  }

  function openProject() {
    navigate(null);
    selectProject(null);
  }

  const terminalDirectory = selectedID ? info.data?.location.directory : project?.directory;
  const terminalVisible =
    terminalPlacement === 'bottom'
      ? terminalOpen
      : workbenchOpen && workbenchPanel.id === 'terminal';
  function changeTerminalPlacement(next: TerminalPlacement) {
    if (next === terminalPlacement) return;
    setTerminalPlacement(next);
    writeStorage('terminalPlacement', next);
    if (next === 'right') {
      setTerminalOpen(false);
      if (terminalVisible) {
        setWorkbenchLoaded(true);
        setWorkbenchPanel(terminalPanel);
        setWorkbenchOpen(true);
      }
    } else {
      if (workbenchPanel.id === 'terminal') {
        setWorkbenchPanel(panels[0]!);
        setWorkbenchOpen(false);
      }
      setTerminalLoaded((loaded) => loaded || terminalVisible);
      setTerminalOpen(terminalVisible);
    }
  }
  function closeTerminal() {
    if (terminalPlacement === 'bottom') setTerminalOpen(false);
    else setWorkbenchOpen(false);
    const target = terminalFocus.current;
    if (target?.isConnected) target.focus({ preventScroll: true });
    else main.current?.focus({ preventScroll: true });
  }
  function toggleTerminal() {
    if (!connected || !terminalDirectory || settings) return false;
    if (terminalVisible) closeTerminal();
    else {
      terminalFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (terminalPlacement === 'bottom') {
        setTerminalLoaded(true);
        setTerminalOpen(true);
      } else {
        setWorkbenchLoaded(true);
        setWorkbenchPanel(terminalPanel);
        setWorkbenchOpen(true);
      }
    }
  }

  function toggleWorkbench() {
    if (
      !connected ||
      settings ||
      !terminalDirectory ||
      (!selectedID && workbenchPanel.id !== 'terminal')
    )
      return false;
    setWorkbenchLoaded(true);
    setWorkbenchOpen((open) => !open);
    if (workbenchOpen && document.activeElement?.closest('#workbench')) {
      (workbenchToggle.current ?? main.current)?.focus({ preventScroll: true });
    }
  }

  useCommand('workspace.toggle', toggleWorkbench);
  useCommand('terminal.toggle', toggleTerminal);
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
        <SidebarResize />
        <div className="sidebar-header">
          <span className="sidebar-brand">
            <BrandIcon size="small" className="sidebar-brand-icon" />
            <Wordmark className="sidebar-wordmark" />
          </span>
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
                <HugeiconsIcon icon={PencilEdit02Icon} size={16} />
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
              {!settings && selectedID ? (
                <SessionTitle
                  key={`title-${selectedID}`}
                  sessionID={selectedID}
                  title={info.data?.title || 'New chat'}
                  disabled={!connected || !info.isSuccess}
                />
              ) : !settings ? (
                <h1 className="toolbar-title truncate">{project ? 'New thread' : 'OpenCodex'}</h1>
              ) : null}
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
                  {...shortcutProps('workspace.toggle')}
                  aria-expanded={workbenchOpen}
                  aria-controls="workbench"
                  onClick={toggleWorkbench}
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
                    <AppearanceSettings
                      terminalPlacement={terminalPlacement}
                      onTerminalPlacementChange={changeTerminalPlacement}
                    />
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
            terminalDirectory &&
            (selectedID || workbenchPanel.id === 'terminal') &&
            !settings && (
              <Suspense
                fallback={
                  <div className="workspace-loading" role="status">
                    Loading workspace…
                  </div>
                }
              >
                <WorkbenchPanel
                  key={selectedID ?? terminalDirectory}
                  directory={terminalDirectory}
                  sessionID={selectedID ?? ''}
                  live={live}
                  open={workbenchOpen}
                  panel={workbenchPanel}
                  onSelectPanel={(id) => {
                    const next = panels.find((panel) => panel.id === id);
                    if (next) setWorkbenchPanel(next);
                  }}
                  onClose={() => {
                    if (workbenchPanel.id === 'terminal') {
                      closeTerminal();
                      return;
                    }
                    setWorkbenchOpen(false);
                    workbenchToggle.current?.focus();
                  }}
                />
              </Suspense>
            )}
          {connected && selectedID && info.data?.location.directory && !settings && (
            <WorkbenchRail
              directory={info.data.location.directory}
              sessionID={selectedID}
              panels={panels}
              active={terminalVisible ? 'terminal' : workbenchOpen ? workbenchPanel.id : null}
              onSelect={(panel) => {
                if (panel.id === 'terminal') {
                  toggleTerminal();
                  return;
                }
                setWorkbenchLoaded(true);
                setWorkbenchPanel(panel);
                setWorkbenchOpen((open) => panel.id !== workbenchPanel.id || !open);
              }}
            />
          )}
        </div>
        {terminalPlacement === 'bottom' &&
          terminalLoaded &&
          connected &&
          terminalDirectory &&
          !settings && (
            <Suspense fallback={null}>
              <TerminalDrawer
                key={terminalDirectory}
                directory={terminalDirectory}
                live={live}
                open={terminalOpen}
                onClose={closeTerminal}
              />
            </Suspense>
          )}
      </div>
      <div className="sidebar-scrim" aria-hidden="true" onClick={() => setSidebarOpen(false)} />
    </div>
  );
}
