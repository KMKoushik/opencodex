import {
  DashboardSpeed01Icon,
  Folder01Icon,
  Globe02Icon,
  KeyboardIcon,
  PaintBoardIcon,
  Settings02Icon,
} from '@hugeicons/core-free-icons';
import { remoteClient } from '../../lib/remote';

const allSections = [
  { id: 'general', label: 'General', icon: Settings02Icon },
  { id: 'appearance', label: 'Appearance', icon: PaintBoardIcon },
  { id: 'shortcuts', label: 'Shortcuts', icon: KeyboardIcon },
  { id: 'projects', label: 'Projects', icon: Folder01Icon },
  { id: 'usage', label: 'Usage', icon: DashboardSpeed01Icon },
  { id: 'remote', label: 'Remote access', icon: Globe02Icon },
] as const;

export type SettingsSection = (typeof allSections)[number]['id'];

/** Remote access is managed only on the computer running OpenCodex. */
export const settingsSections = remoteClient
  ? allSections.filter((section) => section.id !== 'remote')
  : allSections;
