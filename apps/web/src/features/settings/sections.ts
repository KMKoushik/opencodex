import { PaintBoardIcon, Settings02Icon } from '@hugeicons/core-free-icons';

export const settingsSections = [
  { id: 'general', label: 'General', icon: Settings02Icon },
  { id: 'appearance', label: 'Appearance', icon: PaintBoardIcon },
] as const;

export type SettingsSection = (typeof settingsSections)[number]['id'];
