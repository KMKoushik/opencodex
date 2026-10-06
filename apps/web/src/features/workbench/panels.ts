import { createElement, lazy, type ComponentProps, type ReactNode } from 'react';
import type { HugeiconsIcon } from '@hugeicons/react';
import {
  FileEditIcon,
  Folder01Icon,
  CommandLineIcon,
  BotIcon,
  BubbleChatQuestionIcon,
  Globe02Icon,
} from '@hugeicons/core-free-icons';
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
  subagentRequest?: SubagentRequest;
  sideChatRequest?: SideChatRequest;
  /** Clears a handled request, so remounting the panel can't apply it again. */
  onSideChatRequestHandled?: (request: SideChatRequest) => void;
};

/** Opens one child session in the Subagents panel; each request object applies once. */
export type SubagentRequest = { sessionID: string; childID: string };

/**
 * Shows a side chat of a main chat, or adds a quote from the main chat to a side chat's
 * draft. Each request object applies once.
 */
export type SideChatRequest =
  | { sessionID: string; kind: 'open'; sideID: string }
  | { sessionID: string; kind: 'quote'; quote: string };

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
const SideChatPanel = lazy(() =>
  import('../side-chat/side-chat-panel').then((module) => ({ default: module.SideChatPanel })),
);
const BrowserPanel = lazy(() =>
  import('../browser/browser-panel').then((module) => ({ default: module.BrowserPanel })),
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
    id: 'side',
    label: 'Side chat',
    icon: BubbleChatQuestionIcon,
    render: (context) => createElement(SideChatPanel, context),
  },
  {
    id: 'terminal',
    label: 'Terminal',
    icon: CommandLineIcon,
    render: (context) => createElement(TerminalPanel, context),
  },
  // Pages are Electron `<webview>` guests, which only the desktop app can host.
  ...(typeof window !== 'undefined' && window.desktop?.onBrowserOpenTab
    ? [
        {
          id: 'browser',
          label: 'Browser',
          icon: Globe02Icon,
          render: (context: PanelContext) => createElement(BrowserPanel, context),
        },
      ]
    : []),
];
