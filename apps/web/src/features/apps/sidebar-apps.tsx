import { Alert02Icon, Loading03Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useQuery } from '@tanstack/react-query';
import type { AppInfo } from '@opencodex/contracts/canvas';
import { api } from '../../lib/api';
import { appsKey } from '../canvas/canvas-context';
import { AppIcon } from './app-icon';
import './apps.css';

/** Rows shown before "All apps"; the Apps page lists the rest. */
const VISIBLE = 5;

type Row = {
  id: string;
  title: string;
  icon: AppInfo['icon'];
  created: number;
  running: boolean;
  failed: boolean;
};
// Newest first by creation, so rows don't move when an app's files or data change.
const rows = (apps: AppInfo[]): Row[] =>
  apps
    .map((app) => ({
      id: app.id,
      title: app.title,
      icon: app.icon,
      created: app.created,
      running: app.running.length > 0,
      failed: Boolean(app.error) || app.lastRun?.status === 'error',
    }))
    .sort((a, b) => b.created - a.created);

/** The apps under the sidebar's Apps row, with whether each is running or failing. */
export function SidebarApps({
  connected,
  selected,
  onSelect,
}: {
  connected: boolean;
  selected: string | null;
  onSelect: (id?: string) => void;
}) {
  const apps = useQuery({
    queryKey: appsKey,
    queryFn: ({ signal }) => api.apps(signal),
    enabled: connected,
    select: rows,
  });
  if (!apps.data?.length) return null;
  const visible = apps.data.slice(0, VISIBLE);
  // The open app stays visible even when it's older than the first few.
  const open = apps.data.find((app) => app.id === selected);
  if (open && !visible.includes(open)) visible.push(open);
  const hidden = apps.data.length - visible.length;
  return (
    <div className="sidebar-apps">
      {visible.map((app) => (
        <button
          key={app.id}
          className="nav-row sidebar-app-row"
          aria-current={selected === app.id ? 'page' : undefined}
          onClick={() => onSelect(app.id)}
        >
          <AppIcon id={app.id} title={app.title} icon={app.icon} size={16} />
          <span className="truncate sidebar-app-title">{app.title}</span>
          {app.running ? (
            <HugeiconsIcon
              icon={Loading03Icon}
              size={12}
              className="apps-spin"
              aria-label="Running"
            />
          ) : app.failed ? (
            <HugeiconsIcon
              icon={Alert02Icon}
              size={12}
              className="apps-error-icon"
              aria-label="Last run failed"
            />
          ) : null}
        </button>
      ))}
      {hidden > 0 && (
        <button className="nav-row sidebar-app-row sidebar-apps-more" onClick={() => onSelect()}>
          <span>All apps</span>
          <span className="sidebar-apps-count">{apps.data.length}</span>
        </button>
      )}
    </div>
  );
}
