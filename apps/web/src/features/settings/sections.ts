import {
  DashboardSpeed01Icon,
  Folder01Icon,
  KeyboardIcon,
  PaintBoardIcon,
  Settings02Icon,
} from '@hugeicons/core-free-icons';

export const settingsSections = [
  { id: 'general', label: 'General', icon: Settings02Icon },
  { id: 'appearance', label: 'Appearance', icon: PaintBoardIcon },
  { id: 'shortcuts', label: 'Shortcuts', icon: KeyboardIcon },
  { id: 'projects', label: 'Projects', icon: Folder01Icon },
  { id: 'usage', label: 'Usage', icon: DashboardSpeed01Icon },
] as const;

export type SettingsSection = (typeof settingsSections)[number]['id'];
