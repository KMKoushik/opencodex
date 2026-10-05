import { lazy, Suspense, useId, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft02Icon,
  ArrowRight02Icon,
  ArrowDown01Icon,
  FolderOpenIcon,
  PanelLeftCloseIcon,
  PencilEdit02Icon,
  Search01Icon,
  Settings01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { Session } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { BrandIcon, DevelopmentBadge, Wordmark } from '../brand/brand';
import { appName } from '../brand/identity';
import { shortcutProps } from '../shortcuts/commands';
import type { SettingsSection } from '../settings/sections';
import './sidebar.css';
import { UpdateControl } from '../updates/update-control';

const ThreadSearch = lazy(() =>
  import('./thread-search').then((module) => ({ default: module.ThreadSearch })),
);
const menuSections = [
  { section: 'projects', label: 'Projects' },
  { section: 'appearance', label: 'Appearance' },
  { section: 'shortcuts', label: 'Shortcuts' },
] as const;

export function Sidebar({
  children,
  settings,
  connected,
  live,
  canCreate,
  creating,
  canBack,
  canForward,
  onBack,
  onForward,
  onToggle,
  onNewChat,
  onOpenProject,
  onSettings,
  onSelectSession,
}: {
  children: ReactNode;
  settings: SettingsSection | null;
  connected: boolean;
  live: boolean;
  canCreate: boolean;
  creating: boolean;
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onToggle: () => void;
  onNewChat: () => void;
  onOpenProject: () => void;
  onSettings: (section: SettingsSection) => void;
  onSelectSession: (session: Session) => void;
}) {
  const [searching, setSearching] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const brand = useRef<HTMLButtonElement>(null);
  const menuID = useId();
  return (
    <>
      <div className="sidebar-header">
        <div className="sidebar-history">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Go back"
            title="Go back"
            disabled={!canBack}
            onClick={onBack}
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Go forward"
            title="Go forward"
            disabled={!canForward}
            onClick={onForward}
          >
            <HugeiconsIcon icon={ArrowRight02Icon} size={14} />
          </Button>
        </div>
        <Button
          className="desktop-sidebar-toggle"
          variant="ghost"
          size="icon"
          aria-label="Hide sidebar"
          {...shortcutProps('sidebar.toggle')}
          onClick={onToggle}
        >
          <HugeiconsIcon icon={PanelLeftCloseIcon} size={16} />
        </Button>
      </div>
      <div className="sidebar-content">
        <div className="sidebar-identity">
          <button
            ref={brand}
            className="sidebar-brand"
            aria-label={`${appName} menu`}
            aria-haspopup="menu"
            popoverTarget={menuID}
          >
            <BrandIcon size="small" className="sidebar-brand-icon" />
            <Wordmark className="sidebar-wordmark" />
            <DevelopmentBadge />
            <HugeiconsIcon icon={ArrowDown01Icon} size={10} />
          </button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Search threads"
            title="Search threads"
            disabled={!connected}
            onClick={() => setSearching(true)}
          >
            <HugeiconsIcon icon={Search01Icon} size={15} />
          </Button>
          <div
            ref={menu}
            id={menuID}
            className="sidebar-app-menu"
            popover="auto"
            role="menu"
            aria-label={appName}
            data-shortcut-boundary=""
            onToggle={(event) => {
              if (event.newState === 'open')
                menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
            }}
            onKeyDown={(event) => {
              const items = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>('button'),
              );
              const index = items.indexOf(document.activeElement as HTMLButtonElement);
              const next = {
                ArrowDown: (index + 1) % items.length,
                ArrowUp: (index - 1 + items.length) % items.length,
                Home: 0,
                End: items.length - 1,
              }[event.key];
              if (next !== undefined) {
                event.preventDefault();
                items[next]?.focus();
              }
              if (event.key === 'Escape' || event.key === 'Tab') {
                menu.current?.hidePopover();
                if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  brand.current?.focus();
                }
              }
            }}
          >
            {menuSections.map(({ section, label }) => (
              <button
                role="menuitem"
                key={section}
                onClick={() => {
                  menu.current?.hidePopover();
                  onSettings(section);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {!settings && (
          <div className="sidebar-actions">
            <button
              className="nav-row"
              aria-label="New chat"
              disabled={!canCreate}
              {...shortcutProps('chat.new')}
              onClick={onNewChat}
            >
              <HugeiconsIcon icon={PencilEdit02Icon} size={16} />
              <span>{creating ? 'Creating…' : 'New thread'}</span>
            </button>
            <button className="nav-row" {...shortcutProps('project.open')} onClick={onOpenProject}>
              <HugeiconsIcon icon={FolderOpenIcon} size={16} />
              <span>Open project</span>
            </button>
          </div>
        )}
        {children}
        {!settings && (
          <div className="sidebar-footer">
            <UpdateControl compact />
            <button
              className="nav-row"
              {...shortcutProps('settings.open')}
              onClick={() => onSettings('general')}
            >
              <HugeiconsIcon icon={Settings01Icon} size={16} />
              <span>Settings</span>
            </button>
          </div>
        )}
      </div>
      {searching && (
        <Suspense fallback={null}>
          <ThreadSearch
            connected={connected}
            live={live}
            onClose={() => setSearching(false)}
            onSelect={(session) => {
              setSearching(false);
              onSelectSession(session);
            }}
          />
        </Suspense>
      )}
    </>
  );
}
