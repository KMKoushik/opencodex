import { createElement, lazy, type ComponentProps, type ReactNode } from 'react';
import type { HugeiconsIcon } from '@hugeicons/react';
import { FileEditIcon, Folder01Icon, CommandLineIcon, BotIcon } from '@hugeicons/core-free-icons';
import type { FileRequest } from './file-link';

export type PanelContext = {
  directory: string;
  sessionID: string;
  live: boolean;
  /** Hidden surfaces must pause queries and release expensive resources. */
  active: boolean;
  /** Optional top-row content can be portalled here while active. */
  headerElement: HTMLDivElement | null;
  /** Switches the workspace panel to another view, e.g. Files ↔ Changes. */
  selectView?: (id: string) => void;
  fileRequest?: FileRequest;
};

export type PanelDefinition = {
  id: string;
  label: string;
  icon: ComponentProps<typeof HugeiconsIcon>['icon'];
  /** Views of the same surface share retained component state. Defaults to id. */
  stateKey?: string;
  render: (context: PanelContext) => ReactNode;
};

const WorkspaceEditor = lazy(() =>
  import('./workspace-editor').then((module) => ({ default: module.WorkspaceEditor })),
);
const TerminalPanel = lazy(() =>
  import('../terminal/terminal-panel').then((module) => ({ default: module.TerminalPanel })),
);
const SubagentsPanel = lazy(() =>
  import('../subagents/subagents-panel').then((module) => ({ default: module.SubagentsPanel })),
);

export const panels: readonly PanelDefinition[] = [
  {
    id: 'files',
    label: 'Files',
    icon: Folder01Icon,
    stateKey: 'editor',
    render: (context) => createElement(WorkspaceEditor, { ...context, view: 'files' }),
  },
  {
    id: 'changes',
    label: 'Changes',
    icon: FileEditIcon,
    stateKey: 'editor',
    render: (context) => createElement(WorkspaceEditor, { ...context, view: 'changes' }),
  },
  {
    id: 'subagents',
    label: 'Subagents',
    icon: BotIcon,
    render: (context) => createElement(SubagentsPanel, context),
  },
  {
    id: 'terminal',
    label: 'Terminal',
    icon: CommandLineIcon,
    render: (context) => createElement(TerminalPanel, context),
  },
];
