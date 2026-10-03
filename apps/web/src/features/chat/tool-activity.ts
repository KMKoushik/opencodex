import type { SessionMessageAssistantTool } from '@opencodex/contracts';

export type ToolKind =
  | 'read'
  | 'search'
  | 'list'
  | 'command'
  | 'edit'
  | 'skill'
  | 'subagent'
  | 'question'
  | 'web'
  | 'tool';

export function toolKind(name: string): ToolKind {
  switch (name) {
    case 'read':
    case 'read_file':
      return 'read';
    case 'grep':
    case 'search':
      return 'search';
    case 'glob':
    case 'list':
    case 'ls':
      return 'list';
    case 'shell':
    case 'bash':
    case 'exec':
      return 'command';
    case 'edit':
    case 'write':
    case 'patch':
    case 'apply_patch':
    case 'write_file':
      return 'edit';
    case 'skill':
      return 'skill';
    case 'subagent':
    case 'task':
      return 'subagent';
    case 'question':
      return 'question';
    case 'webfetch':
    case 'websearch':
      return 'web';
    default:
      // Code Mode execute and namespaced/plugin tools are not shell commands.
      return 'tool';
  }
}

export function toolActivity(tool: SessionMessageAssistantTool) {
  const { state } = tool;
  const input = typeof state.input === 'object' ? state.input : undefined;
  const field = (...keys: string[]) => {
    for (const key of keys) {
      const value = input?.[key];
      if (typeof value === 'string' && value.trim()) return value;
    }
  };
  const ongoing = state.status === 'running' || state.status === 'streaming';
  const action = (pending: string, completed: string, failed: string) =>
    state.status === 'error' ? `Failed to ${failed}` : ongoing ? pending : completed;
  const kind = toolKind(tool.name);
  let label: string;
  let target: string | undefined;
  switch (kind) {
    case 'read':
      label = action('Reading', 'Read', 'read');
      target = field('path', 'filePath') ?? 'file';
      break;
    case 'search':
      label = action('Searching for', 'Searched for', 'search for');
      target = field('pattern', 'query') ?? 'files';
      break;
    case 'list':
      label = action('Listing files', 'Listed files', 'list files');
      target = field('pattern', 'path');
      break;
    case 'command':
      label = action('Running', 'Ran', 'run');
      target = field('command') ?? 'command';
      break;
    case 'edit':
      label = action('Editing', 'Edited', 'edit');
      target = field('path', 'filePath') ?? 'files';
      break;
    case 'skill':
      label = action('Loading skill', 'Loaded skill', 'load skill');
      target = field('id', 'name');
      break;
    case 'subagent':
      label = action('Delegating to', 'Delegated to', 'delegate to');
      target = [field('agent', 'subagent_type') ?? 'subagent', field('description')]
        .filter(Boolean)
        .join(' · ');
      break;
    case 'question':
      label = action('Asking a question', 'Asked a question', 'ask a question');
      break;
    case 'web':
      label = action('Looking up', 'Looked up', 'look up');
      target = field('query', 'url');
      break;
    default:
      label = action('Calling', 'Called', 'call');
      target = tool.name;
  }
  return { kind, text: target ? `${label} ${target}` : label };
}
