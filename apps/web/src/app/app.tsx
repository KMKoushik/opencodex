import { useState } from 'react';
import { PanelLeftCloseIcon, PanelLeftIcon, Settings01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { Project } from '@opencodex/contracts';
import { Button } from '../components/ui/button';
import { useConnection } from '../features/connection/use-connection';
import { useEvents } from '../features/connection/use-events';
import { readProject, storeProject } from '../features/projects/storage';
import { SessionList } from '../features/sessions/session-list';
import { useSessions } from '../features/sessions/use-sessions';
import { GeneralSettings } from '../features/settings/general-settings';
import { settingsSections, type SettingsSection } from '../features/settings/sections';
import { SettingsNav } from '../features/settings/settings-nav';
import { AppearanceSettings } from '../features/theme/appearance-settings';
import { useThemeEffect } from '../features/theme/use-theme';
import { WorkspaceView } from '../features/workspace/workspace-view';

export function App() {
  useThemeEffect();
  const [project, setProject] = useState(readProject);
  const [selectedID, setSelectedID] = useState<string>();
  const [settings, setSettings] = useState<SettingsSection | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { connected } = useConnection();
  const live = useEvents(connected);
  const sessions = useSessions(project?.directory, connected, live);
  const items = sessions.data?.pages.flatMap((page) => page.sessions);
  const selected = items?.find((session) => session.id === selectedID);
  const settingsTitle = settingsSections.find((section) => section.id === settings)?.label;

  function selectProject(next: Project | null) {
    setProject(next);
    storeProject(next);
    setSelectedID(undefined);
    setSidebarOpen(false);
  }

  function navigate(next: SettingsSection | null) {
    setSettings(next);
    setSidebarOpen(false);
  }

  return (
    <div className="app-shell" data-sidebar-open={sidebarOpen}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar" id="sidebar" aria-label="Sidebar">
        <div className="sidebar-drag" />
        {settings ? (
          <SettingsNav section={settings} onSelect={navigate} onBack={() => navigate(null)} />
        ) : (
          <>
            <SessionList
              project={project}
              connected={connected}
              sessions={sessions}
              selectedID={selected?.id}
              onSelect={(id) => {
                setSelectedID(id);
                setSidebarOpen(false);
              }}
              onCloseProject={() => selectProject(null)}
            />
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
          {!settings && selected && <h1 className="toolbar-title truncate">{selected.title}</h1>}
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
                  onCloseProject={() => selectProject(null)}
                />
              ) : (
                <AppearanceSettings />
              )}
            </div>
          ) : (
            <WorkspaceView
              project={project}
              session={selected}
              sessionCount={items?.length}
              onSelectProject={selectProject}
            />
          )}
        </main>
      </div>
      <div className="sidebar-scrim" aria-hidden="true" onClick={() => setSidebarOpen(false)} />
    </div>
  );
}
