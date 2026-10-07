import { lazy, Suspense, useCallback, useRef, useState } from 'react';
import {
  PanelLeftCloseIcon,
  PanelLeftIcon,
  Folder01Icon,
  PanelRightIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useStore } from 'zustand';
import { sessionSummary } from '@opencodex/contracts';
import type {
  ModelCatalog,
  ModelRef,
  OpenCodeProject,
  Project,
  Session,
} from '@opencodex/contracts';
import { Button } from '../components/ui/button';
import { TooltipLayer } from '../components/ui/tooltip-layer';
import { useConnection } from '../features/connection/use-connection';
import { useEvents } from '../features/connection/use-events';
import { useNotificationTarget } from '../features/notifications/notifications';
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
import { ThreadsView } from '../features/threads/threads-view';
import { ProjectsSettings } from '../features/projects/projects-settings';
import { projectFolder } from '../features/projects/project-metadata';
import { api } from '../lib/api';
import { useCommand } from '../features/shortcuts/use-command';
import { shortcutProps } from '../features/shortcuts/commands';
import { ShortcutsSettings } from '../features/shortcuts/shortcuts-settings';
import { UsageLimitsPage } from '../features/usage/usage-limits';
import { SessionPanelToggle } from '../features/session-panel/session-panel-toggle';
import { SessionActionsToggle } from '../features/sessions/session-actions-toggle';
import { SessionTitle } from '../features/sessions/session-title';
import { WorkbenchRail } from '../features/workbench/workbench-rail';
import { panels, type SideChatRequest, type SubagentRequest } from '../features/workbench/panels';
import { SideChatQuoteContext } from '../features/side-chat/side-chat-context';
import { SidebarResize } from '../features/sidebar/sidebar-resize';
import { readTerminalPlacement, type TerminalPlacement } from '../features/terminal/placement';
import { readStorage, writeStorage } from '../lib/storage';
import { useDraftStore } from '../features/chat/draft-context';
import { BrandIcon, DevelopmentBadge } from '../features/brand/brand';
import { appName } from '../features/brand/identity';
import { Sidebar } from '../features/sidebar/sidebar';
import { useNavigationHistory } from '../features/sidebar/navigation-history';
import { FileLinkContext } from '../features/workbench/file-link-context';
import { resolveFileLink, type FileRequest } from '../features/workbench/file-link';
import { useWorkbenchStore, workbenchKey } from '../features/workbench/workbench-context';
import { defaultWorkbenchLayout } from '../features/workbench/workbench-store';
import { browserFileURL, isHTMLPath, isLocalWebURL } from '../features/browser/browser-url';
import { openTab } from '../features/browser/browser-runtime';

const TerminalDrawer = lazy(() =>
  import('../features/terminal/terminal-drawer').then((module) => ({
    default: module.TerminalDrawer,
  })),
);
const terminalPanel = panels.find((panel) => panel.id === 'terminal')!;
const subagentsPanel = panels.find((panel) => panel.id === 'subagents')!;

const ChatView = lazy(() =>
  import('../features/chat/chat-view').then((module) => ({ default: module.ChatView })),
);
const BrowserHost = lazy(() =>
  import('../features/browser/browser-host').then((module) => ({ default: module.BrowserHost })),
);
const browserPanel = panels.find((panel) => panel.id === 'browser');
const TaskBoard = lazy(() =>
  import('../features/tasks/task-board').then((module) => ({ default: module.TaskBoard })),
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
  const [composerFocus, setComposerFocus] = useState<{ sessionID: string; token: number }>();
  const composerFocusToken = useRef(0);
  const [settings, setSettings] = useState<SettingsSection | null>(null);
  const [tasks, setTasks] = useState(false);
  // Settings and Tasks replace the chat column and its session tools.
  const page = settings !== null || tasks;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sessionCardVisible, setSessionCardVisible] = useState(
    () => readStorage('sessionCardVisible') !== 'false',
  );
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalPlacement, setTerminalPlacement] = useState(readTerminalPlacement);
  const [terminalLoaded, setTerminalLoaded] = useState(false);
  const terminalFocus = useRef<HTMLElement | null>(null);

  const workbench = useWorkbenchStore();
  const workspaceKey = workbenchKey(selectedID, project?.directory);
  const workbenchLayout = useStore(
    workbench,
    (state) => state.entries[workspaceKey]?.layout ?? defaultWorkbenchLayout,
  );
  const rightTerminalHidden =
    workbenchLayout.panel === 'terminal' && terminalPlacement === 'bottom';
  const workbenchOpen = workbenchLayout.open && !rightTerminalHidden;
  // A layout saved by the desktop app can name the browser, which the web app does not offer.
  const workbenchPanel =
    panels.find((panel) => panel.id === (rightTerminalHidden ? 'files' : workbenchLayout.panel)) ??
    panels[0]!;
  const setWorkbenchOpen = (open: boolean) => workbench.getState().layout(workspaceKey, { open });
  const setWorkbenchPanel = (panel: (typeof panels)[number]) =>
    workbench.getState().layout(workspaceKey, { panel: panel.id as typeof workbenchLayout.panel });
  const [workbenchLoaded, setWorkbenchLoaded] = useState(false);
  const [fileRequest, setFileRequest] = useState<FileRequest>();
  const [subagentRequest, setSubagentRequest] = useState<SubagentRequest>();
  const [sideChatRequest, setSideChatRequest] = useState<SideChatRequest>();
  const [requestSessionID, setRequestSessionID] = useState(selectedID);
  if (requestSessionID !== selectedID) {
    setRequestSessionID(selectedID);
    setFileRequest(undefined);
    setSubagentRequest(undefined);
    setSideChatRequest(undefined);
    if (composerFocus && composerFocus.sessionID !== selectedID) setComposerFocus(undefined);
  }
  const workbenchToggle = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const main = useRef<HTMLElement>(null);
  const chatColumn = useRef<HTMLDivElement>(null);
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
    (href: string, event?: { metaKey: boolean; ctrlKey: boolean }) => {
      if (!selectedID) return false;
      // Like Codex, local servers open beside the chat; Cmd/Ctrl-click uses the system browser.
      if (browserPanel && !event?.metaKey && !event?.ctrlKey && isLocalWebURL(href)) {
        workbench.getState().browser(workspaceKey, (state) => {
          const existing = state.tabs.find((tab) => tab.url === href);
          return existing
            ? { ...state, selected: existing.id }
            : openTab(state, href, state.selected);
        });
        setWorkbenchLoaded(true);
        workbench.getState().layout(workspaceKey, { panel: 'browser', open: true });
        return true;
      }
      if (!fileDirectory) return false;
      const target = resolveFileLink(href, fileDirectory);
      if (!target) return false;
      if (browserPanel && isHTMLPath(target.path)) {
        const url = browserFileURL(target.directory, target.path, href);
        workbench.getState().browser(workspaceKey, (state) => {
          const existing = state.tabs.find((tab) => tab.url === url);
          return existing
            ? { ...state, selected: existing.id }
            : openTab(state, url, state.selected);
        });
        setWorkbenchLoaded(true);
        workbench.getState().layout(workspaceKey, { panel: 'browser', open: true });
        return true;
      }
      setFileRequest({ ...target, sessionID: selectedID });
      setWorkbenchLoaded(true);
      workbench.getState().layout(workspaceKey, { panel: 'files', open: true });
      return true;
    },
    [selectedID, fileDirectory, workbench, workspaceKey],
  );
  const openSideChat = useCallback(
    (request: SideChatRequest) => {
      setSideChatRequest(request);
      setWorkbenchLoaded(true);
      workbench.getState().layout(workspaceKey, { panel: 'side', open: true });
    },
    [workbench, workspaceKey],
  );
  const askSideChat = useCallback(
    (quote: string) => {
      if (selectedID) openSideChat({ sessionID: selectedID, kind: 'quote', quote });
    },
    [selectedID, openSideChat],
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
    setTasks(false);
    setSidebarOpen(false);
    create.reset();
  }

  function closeProject(directory: string) {
    const remaining = projects.filter((item) => item.directory !== directory);
    if (project?.directory === directory) selectProject(remaining[0] ?? null);
    setProjects(remaining);
    storeProjects(remaining);
  }

  /** Open a thread from any project, adding its folder to the sidebar when needed. */
  function openSession(session: Session) {
    const nativeProject = queryClient
      .getQueryData<OpenCodeProject[]>(['projects'])
      ?.find((item) => item.id === session.projectID);
    const directory = nativeProject?.canonical ?? session.directory;
    const next = projects.find((item) => item.directory === directory) ?? {
      directory,
      name: nativeProject?.name || directory.split(/[\\/]/).filter(Boolean).at(-1) || directory,
    };
    if (project?.directory !== next.directory) selectProject(next);
    setSelectedID(session.id);
    setTasks(false);
    setSidebarOpen(false);
  }

  async function openSessionByID(sessionID: string) {
    const session = await queryClient.fetchQuery({
      queryKey: ['chat', sessionID, 'info'],
      queryFn: ({ signal }) => api.session(sessionID, signal),
    });
    openSession(sessionSummary(session));
  }

  function openTasks() {
    setSettings(null);
    setTasks(true);
    setSidebarOpen(false);
    main.current?.focus({ preventScroll: true });
  }

  function navigate(next: SettingsSection | null) {
    setSettings(next);
    setTasks(false);
    setSidebarOpen(false);
    main.current?.focus({ preventScroll: true });
  }

  useNotificationTarget(page ? undefined : selectedID, (session) => {
    openSession(session);
    navigate(null);
  });

  function toggleSidebar() {
    const mobile = matchMedia('(max-width: 720px)').matches;
    if (sidebar.current?.contains(document.activeElement))
      main.current?.focus({ preventScroll: true });
    if (mobile) setSidebarOpen((open) => !open);
    else setSidebarCollapsed((collapsed) => !collapsed);
  }

  function changeSessionCardVisibility(visible: boolean) {
    setSessionCardVisible(visible);
    writeStorage('sessionCardVisible', String(visible));
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

  const history = useNavigationHistory(
    { project, sessionID: selectedID, settings, tasks },
    (location) => {
      if (project?.directory !== location.project?.directory) selectProject(location.project);
      setSelectedID(location.sessionID);
      if (location.tasks) openTasks();
      else navigate(location.settings);
    },
  );

  const terminalDirectory = selectedID ? info.data?.location.directory : project?.directory;
  const workbenchExpanded = Boolean(
    workbenchOpen &&
    workbenchLayout.expanded &&
    connected &&
    terminalDirectory &&
    (selectedID || workbenchPanel.id === 'terminal') &&
    !page,
  );
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
    requestAnimationFrame(() => {
      if (target?.isConnected && !target.closest('[hidden], [inert]'))
        target.focus({ preventScroll: true });
      else main.current?.focus({ preventScroll: true });
    });
  }
  function toggleTerminal() {
    if (!connected || !terminalDirectory || page) return false;
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
      page ||
      !terminalDirectory ||
      (!selectedID && workbenchPanel.id !== 'terminal')
    )
      return false;
    setWorkbenchLoaded(true);
    if (rightTerminalHidden) setWorkbenchPanel(panels[0]!);
    setWorkbenchOpen(!workbenchOpen);
    if (workbenchOpen && document.activeElement?.closest('#workbench')) {
      requestAnimationFrame(() =>
        (workbenchToggle.current ?? main.current)?.focus({ preventScroll: true }),
      );
    }
  }

  useCommand('workspace.toggle', toggleWorkbench);
  useCommand('terminal.toggle', toggleTerminal);
  useCommand('sidebar.toggle', toggleSidebar);
  useCommand('sidebar.focus', () => {
    if (!connected || settings) return false;
    setSidebarCollapsed(false);
    setSidebarOpen(true);
    requestAnimationFrame(() => {
      const rows = Array.from(
        sidebar.current?.querySelectorAll<HTMLButtonElement>('.session-row') ?? [],
      ).filter((row) => row.getClientRects().length > 0);
      const target = rows.find((row) => row.getAttribute('aria-current') === 'page') ?? rows[0];
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: 'nearest' });
    });
  });
  useCommand('chat.new', newChat);
  useCommand('project.open', openProject);
  useCommand('tasks.open', openTasks);
  useCommand('settings.open', () => navigate('general'));
  useCommand('shortcuts.open', () => navigate('shortcuts'));
  useCommand('view.dismiss', () => {
    if (sidebarOpen && matchMedia('(max-width: 720px)').matches) {
      setSidebarOpen(false);
      main.current?.focus({ preventScroll: true });
    } else if (page) navigate(null);
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
      <TooltipLayer />
      {browserPanel && (
        <Suspense fallback={null}>
          <BrowserHost />
        </Suspense>
      )}
      <aside ref={sidebar} className="sidebar" id="sidebar" aria-label="Sidebar">
        <SidebarResize />
        <Sidebar
          settings={settings}
          tasks={tasks}
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
          onTasks={openTasks}
          onSettings={navigate}
          onSelectSession={(session) => {
            openSession(session);
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
              <ThreadsView
                connected={connected}
                live={live}
                selectedID={selectedID}
                onSelect={openSession}
                onShortcutSelect={(session) => {
                  openSession(session);
                  const key = workbenchKey(session.id, session.directory);
                  if (workbench.getState().entries[key]?.layout.expanded)
                    workbench.getState().layout(key, { expanded: false });
                  // Delivered by the destination composer, even after a cold lazy import.
                  setComposerFocus({ sessionID: session.id, token: ++composerFocusToken.current });
                }}
              >
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
                    setTasks(false);
                    setSidebarOpen(false);
                  }}
                />
              </ThreadsView>
            </>
          )}
        </Sidebar>
      </aside>

      <div className="main-shell">
        <div className="workspace-body" data-workbench-expanded={workbenchExpanded}>
          <div ref={chatColumn} className="chat-column" inert={workbenchExpanded}>
            <header className="toolbar">
              {sidebarCollapsed && (
                <span className="toolbar-brand" aria-label={appName}>
                  <BrandIcon size="small" className="sidebar-brand-icon" />
                  <DevelopmentBadge />
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
              {!page && project && (
                <span className="toolbar-project truncate" title={project.directory}>
                  <HugeiconsIcon icon={Folder01Icon} size={14} />
                  {currentProject?.name}
                </span>
              )}
              {!page && project && (
                <span className="toolbar-separator" aria-hidden="true">
                  /
                </span>
              )}
              {!page && selectedID ? (
                <SessionTitle
                  key={`title-${selectedID}`}
                  sessionID={selectedID}
                  title={info.data?.title || 'New chat'}
                  disabled={!connected || !info.isSuccess}
                />
              ) : tasks ? (
                <h1 className="toolbar-title truncate">Tasks</h1>
              ) : !page ? (
                <h1 className="toolbar-title truncate">{project ? 'New thread' : appName}</h1>
              ) : null}
              {connected && !live && !page && (
                <span className="toolbar-status" role="status">
                  Live updates paused
                </span>
              )}
              {connected && selectedID && !page && (
                <SessionActionsToggle
                  key={`actions-${selectedID}`}
                  sessionID={selectedID}
                  title={info.data?.title || 'New chat'}
                  className="toolbar-session-actions"
                />
              )}
              {connected && selectedID && !page && (
                <SessionPanelToggle
                  key={selectedID}
                  sessionID={selectedID}
                  projectName={currentProject?.name}
                  live={live}
                  column={chatColumn}
                  workspaceOpen={workbenchOpen}
                  cardVisible={sessionCardVisible}
                  onCardVisibilityChange={changeSessionCardVisibility}
                  onOpen={(id) => {
                    const panel = panels.find((panel) => panel.id === id);
                    if (!panel) return;
                    setWorkbenchLoaded(true);
                    setWorkbenchPanel(panel);
                    setWorkbenchOpen(true);
                  }}
                />
              )}
              {connected && selectedID && !page && (
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
                  {settings !== 'projects' && settings !== 'usage' && <h1>{settingsTitle}</h1>}
                  {settings === 'general' ? (
                    <GeneralSettings
                      live={live}
                      project={currentProject}
                      onCloseProject={() => project && closeProject(project.directory)}
                    />
                  ) : settings === 'shortcuts' ? (
                    <ShortcutsSettings />
                  ) : settings === 'usage' ? (
                    <UsageLimitsPage connected={connected} />
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
              ) : tasks ? (
                <Suspense
                  fallback={
                    <p className="sidebar-note" role="status">
                      Loading tasks…
                    </p>
                  }
                >
                  <TaskBoard
                    connected={connected}
                    onOpenSession={(sessionID) => void openSessionByID(sessionID)}
                  />
                </Suspense>
              ) : selectedID && connected ? (
                <Suspense
                  fallback={
                    <p className="sidebar-note" role="status">
                      Loading conversation…
                    </p>
                  }
                >
                  <FileLinkContext.Provider value={openFileLink}>
                    <SideChatQuoteContext.Provider value={askSideChat}>
                      <ChatView
                        key={selectedID}
                        sessionID={selectedID}
                        focusRequest={
                          composerFocus?.sessionID === selectedID ? composerFocus.token : undefined
                        }
                        onFocusHandled={() => setComposerFocus(undefined)}
                        onOpenSession={setSelectedID}
                        onOpenSubagent={(childID) => {
                          setSubagentRequest({ sessionID: selectedID, childID });
                          setWorkbenchLoaded(true);
                          setWorkbenchPanel(subagentsPanel);
                          setWorkbenchOpen(true);
                        }}
                        onOpenSideChat={(sideID) =>
                          openSideChat({ sessionID: selectedID, kind: 'open', sideID })
                        }
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
                    </SideChatQuoteContext.Provider>
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
          {(workbenchLoaded || workbenchOpen) &&
            connected &&
            terminalDirectory &&
            (selectedID || workbenchPanel.id === 'terminal') &&
            !page && (
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
                  expanded={workbenchLayout.expanded}
                  onExpandedChange={(expanded) =>
                    workbench.getState().layout(workspaceKey, { expanded })
                  }
                  panel={workbenchPanel}
                  onSelectPanel={(id) => {
                    const next = panels.find((panel) => panel.id === id);
                    if (next) setWorkbenchPanel(next);
                  }}
                  fileRequest={fileRequest?.sessionID === selectedID ? fileRequest : undefined}
                  subagentRequest={
                    subagentRequest?.sessionID === selectedID ? subagentRequest : undefined
                  }
                  sideChatRequest={
                    sideChatRequest?.sessionID === selectedID ? sideChatRequest : undefined
                  }
                  onSideChatRequestHandled={(request) =>
                    setSideChatRequest((current) => (current === request ? undefined : current))
                  }
                  onClose={() => {
                    if (workbenchPanel.id === 'terminal') {
                      closeTerminal();
                      return;
                    }
                    setWorkbenchOpen(false);
                    requestAnimationFrame(() => workbenchToggle.current?.focus());
                  }}
                />
              </Suspense>
            )}
          {connected && selectedID && info.data?.location.directory && !page && (
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
                setWorkbenchOpen(panel.id !== workbenchPanel.id || !workbenchOpen);
              }}
            />
          )}
        </div>
        {terminalPlacement === 'bottom' &&
          terminalLoaded &&
          connected &&
          terminalDirectory &&
          !page && (
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
