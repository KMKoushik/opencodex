import { lazy, Suspense, useCallback, useRef, useState } from 'react';
import {
  PanelLeftCloseIcon,
  PanelLeftIcon,
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
import { ThreadSummaryToggle } from '../features/session-panel/thread-summary-toggle';
import { SessionTitle } from '../features/sessions/session-title';
import { WorkbenchRail } from '../features/workbench/workbench-rail';
import { panels } from '../features/workbench/panels';
import { SidebarResize } from '../features/sidebar/sidebar-resize';
import { readTerminalPlacement, type TerminalPlacement } from '../features/terminal/placement';
import { writeStorage } from '../lib/storage';
import { useDraftStore } from '../features/chat/draft-context';
import { BrandIcon } from '../features/brand/brand';
import { Sidebar } from '../features/sidebar/sidebar';
import { useNavigationHistory } from '../features/sidebar/navigation-history';
import { FileLinkContext } from '../features/workbench/file-link-context';
import { resolveFileLink, type FileRequest } from '../features/workbench/file-link';

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
  const [fileRequest, setFileRequest] = useState<FileRequest>();
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
  const fileDirectory = info.data?.location.directory;
  const openFileLink = useCallback(
    (href: string) => {
      if (!selectedID || !fileDirectory) return false;
      const target = resolveFileLink(href, fileDirectory);
      if (!target) return false;
      setFileRequest({ ...target, sessionID: selectedID });
      setWorkbenchLoaded(true);
      setWorkbenchPanel(panels[0]!);
      setWorkbenchOpen(true);
      return true;
    },
    [selectedID, fileDirectory],
  );
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
  const switchProject = useMutation({
    mutationFn: ({
      project,
      model,
    }: {
      project: Project;
      sourceSessionID: string;
      model?: ModelRef;
    }) => api.createSession(project.directory, model),
    onSuccess: (session, { project: next, sourceSessionID, model }) => {
      queryClient.setQueryData(['chat', session.id, 'info'], session);
      // Keep observing this mutation across navigation so late responses cannot take over.
      if (selectedID === sourceSessionID) {
        drafts.getState().move(sourceSessionID, session.id);
        if (model) drafts.getState().rememberModel(next.directory, model);
        selectProject(next);
        setSelectedID(session.id);
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
    if (!project) return false;
    return newProjectChat(project);
  }

  function newProjectChat(next: Project) {
    if (!connected || create.isPending || switchProject.isPending) return false;
    const current = project?.directory === next.directory;
    // Capture the visible selection before creation; unsent choices win over session state.
    const model =
      (current && selectedID ? drafts.getState().drafts[selectedID]?.model : undefined) ??
      (current ? info.data?.model : undefined) ??
      drafts.getState().projectModels[next.directory] ??
      queryClient.getQueryData<ModelCatalog>([
        'models',
        (current ? info.data?.location.directory : undefined) ?? next.directory,
      ])?.defaultModel ??
      undefined;
    if (model) drafts.getState().rememberModel(next.directory, model);
    navigate(null);
    if (!current) selectProject(next);
    create.mutate({ directory: next.directory, model });
  }

  function openProject() {
    navigate(null);
    selectProject(null);
  }

  const history = useNavigationHistory({ project, sessionID: selectedID, settings }, (location) => {
    if (project?.directory !== location.project?.directory) selectProject(location.project);
    setSelectedID(location.sessionID);
    navigate(location.settings);
  });

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
        <Sidebar
          settings={settings}
          connected={connected}
          live={live}
          canCreate={Boolean(project && connected && !create.isPending && !switchProject.isPending)}
          creating={create.isPending}
          canBack={history.canBack}
          canForward={history.canForward}
          onBack={history.back}
          onForward={history.forward}
          onToggle={toggleSidebar}
          onNewChat={newChat}
          onOpenProject={openProject}
          onSettings={navigate}
          onSelectSession={(session) => {
            const next = projects.find((item) => item.directory === session.directory) ?? {
              directory: session.directory,
              name: session.directory.split(/[\\/]/).filter(Boolean).at(-1) ?? session.directory,
            };
            if (project?.directory !== next.directory) selectProject(next);
            setSelectedID(session.id);
            navigate(null);
          }}
        >
          {settings ? (
            <SettingsNav section={settings} onSelect={navigate} onBack={() => navigate(null)} />
          ) : (
            <>
              {create.isError && selectedID && (
                <p className="sidebar-note text-error" role="alert">
                  {create.error.message}
                </p>
              )}
              <ProjectList
                connected={connected}
                live={live}
                opened={projects}
                current={project}
                onSelect={selectProject}
                onClose={closeProject}
                onNewChat={newProjectChat}
                creatingDirectory={create.isPending ? create.variables.directory : undefined}
                selectedID={selectedID}
                onSelectSession={(next, id) => {
                  if (project?.directory !== next.directory) selectProject(next);
                  setSelectedID(id);
                  setSidebarOpen(false);
                }}
              />
            </>
          )}
        </Sidebar>
      </aside>

      <div className="main-shell">
        <div className="workspace-body">
          <div className="chat-column">
            <header className="toolbar">
              {sidebarCollapsed && (
                <span className="toolbar-brand" aria-label="OpenCodex">
                  <BrandIcon size="small" className="sidebar-brand-icon" />
                </span>
              )}
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
              {connected && selectedID && info.data?.location.directory && !settings && (
                <ThreadSummaryToggle
                  sessionID={selectedID}
                  directory={info.data.location.directory}
                  projectName={currentProject?.name}
                  live={live}
                  onOpen={(id) => {
                    const panel = panels.find((panel) => panel.id === id);
                    if (!panel) return;
                    setWorkbenchLoaded(true);
                    setWorkbenchPanel(panel);
                    setWorkbenchOpen(true);
                  }}
                />
              )}
              {connected && selectedID && !settings && (
                <Button
                  ref={workbenchToggle}
                  className="workspace-panel-toggle"
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
            <main ref={main} id="main" className="main scrollbar-on-hover" tabIndex={-1}>
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
                  <FileLinkContext.Provider value={openFileLink}>
                    <ChatView
                      key={selectedID}
                      sessionID={selectedID}
                      onOpenSession={setSelectedID}
                      live={live}
                      projectName={currentProject?.name}
                      project={currentProject}
                      projects={projects}
                      switching={switchProject.isPending}
                      switchError={
                        switchProject.variables?.sourceSessionID === selectedID
                          ? switchProject.error?.message
                          : undefined
                      }
                      onSwitchProject={(next, model) => {
                        if (create.isPending || switchProject.isPending) return;
                        switchProject.mutate({
                          project: next,
                          sourceSessionID: selectedID,
                          model,
                        });
                      }}
                    />
                  </FileLinkContext.Provider>
                </Suspense>
              ) : (
                <WorkspaceView
                  project={currentProject}
                  projects={projects}
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
                  fileRequest={fileRequest?.sessionID === selectedID ? fileRequest : undefined}
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
