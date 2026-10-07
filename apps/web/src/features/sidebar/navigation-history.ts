import { useState } from 'react';
import type { Project } from '@opencodex/contracts';
import type { SettingsSection } from '../settings/sections';

export type SidebarLocation = {
  project: Project | null;
  sessionID?: string;
  settings: SettingsSection | null;
  tasks: boolean;
};

const key = (location: SidebarLocation) =>
  JSON.stringify([
    location.project?.directory,
    location.sessionID,
    location.settings,
    location.tasks,
  ]);

// Navigation only: no transcript snapshots, disk writes, or streaming subscriptions.
export function useNavigationHistory(
  location: SidebarLocation,
  restore: (location: SidebarLocation) => void,
) {
  const [history, setHistory] = useState({ entries: [location], index: 0 });
  if (key(history.entries[history.index]!) !== key(location)) {
    const entries = [...history.entries.slice(0, history.index + 1), location].slice(-64);
    setHistory({ entries, index: entries.length - 1 });
  }
  const go = (direction: number) => {
    const index = history.index + direction;
    const target = history.entries[index];
    if (!target) return;
    setHistory({ ...history, index });
    restore(target);
  };
  return {
    canBack: history.index > 0,
    canForward: history.index < history.entries.length - 1,
    back: () => go(-1),
    forward: () => go(1),
  };
}
