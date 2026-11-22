export const states =
  `home-empty home-no-project sidebar-hidden sidebar-project-collapsed sidebar-row-hover sidebar-focus-view app-menu-open thread-search-open composer-focused composer-text composer-attachment composer-slash composer-mention model-picker-open model-picker-filtered project-picker-open project-open-dialog project-actions-open project-edit-open project-copy-feedback worktree-picker-open worktree-new-selected worktrees-empty chat-markdown-top chat-markdown-middle chat-markdown-bottom chat-long-top chat-long-middle chat-long-bottom chat-tools-bottom chat-question-bottom chat-architecture-bottom chat-subagent-bottom chat-checklist-bottom chat-external-read-bottom chat-streaming tools-expanded tool-rows-expanded tool-detail-open thoughts-expanded question-selected question-review thread-actions-open thread-context-menu session-details-open find-markdown-open find-long-open panel-changes panel-diff-open panel-files panel-file-open panel-terminal panel-canvas panel-side-chat side-chat-new panel-subagents subagents-list subagent-conversation settings-general settings-general-bottom settings-appearance settings-shortcuts settings-projects settings-usage settings-remote-access usage-limits-open tasks-empty apps-empty connection-offline`.split(
    ' ',
  );
export function config(state, extras) {
  const flags = [],
    script = [],
    env = {};
  let session;
  if (
    state.startsWith('chat-') ||
    state.startsWith('find-') ||
    state.startsWith('panel-') ||
    [
      'side-chat-new',
      'subagents-list',
      'subagent-conversation',
      'session-details-open',
      'thread-actions-open',
      'thread-context-menu',
    ].includes(state)
  )
    session = 0;
  for (const [key, index] of Object.entries({
    markdown: 0,
    tools: 1,
    question: 2,
    architecture: 3,
    long: 4,
    subagent: 5,
    checklist: 6,
    'external-read': 7,
  }))
    if (state.includes(key) && session !== undefined) session = index;
  if (/^(tool|thought)/.test(state)) session = 1;
  if (['panel-subagents', 'subagents-list', 'subagent-conversation'].includes(state)) session = 5;
  if (state === 'thread-context-menu') session = 7;
  const composer = {
    'composer-focused': 'focused',
    'composer-text': 'text',
    'composer-attachment': 'attachment',
    'composer-slash': 'slash',
    'composer-mention': 'mention',
    'model-picker-open': 'model',
    'model-picker-filtered': 'filtered',
    'worktree-picker-open': 'worktree',
    'worktree-new-selected': 'new-worktree',
    'question-selected': 'question-selected',
    'question-review': 'question-review',
  };
  if (composer[state]) flags.push('--composer-state', composer[state]);
  if (state.startsWith('question-')) session = 2;
  if (/^chat-.*-(top|middle|bottom)$/.test(state)) flags.push('--scroll', state.split('-').at(-1));
  if (state === 'tools-expanded')
    script.push({ t: 0.1, type: 'click', key: 'turn:msg_parity_00004' });
  if (state === 'tool-rows-expanded' || state === 'tool-detail-open') flags.push('--work', 'open');
  if (state === 'tool-detail-open') script.push({ t: 0.1, type: 'click', key: 'tool_read' });
  if (state === 'thoughts-expanded') flags.push('--work', 'thoughts');
  if (/^(tool|thought)/.test(state))
    script.push({ t: 0.3, type: 'scroll', x: 650, y: 350, dy: -10000, dur: 0.1 });
  const panels = {
    'panel-changes': 'changes',
    'panel-diff-open': 'changes',
    'panel-files': 'files',
    'panel-file-open': 'files',
    'panel-terminal': 'terminal',
    'panel-canvas': 'canvas',
    'panel-side-chat': 'side-chat',
    'side-chat-new': 'side-chat',
    'panel-subagents': 'subagents',
    'subagents-list': 'subagents',
    'subagent-conversation': 'subagents',
  };
  if (panels[state]) flags.push('--panel', panels[state]);
  // Opening Electron's terminal focuses its viewport. Apply that same focus
  // after native capture mounting (the main composer also requests autofocus).
  if (state === 'panel-terminal') script.push({ t: 0.1, type: 'click', key: 'terminal-host' });
  if (state === 'panel-diff-open') flags.push('--file', 'src/index.ts');
  if (state === 'panel-file-open') flags.push('--file', 'README.md');
  if (state === 'panel-side-chat') flags.push('--file', extras.side.id);
  if (state === 'subagent-conversation') flags.push('--file', extras.child.id);
  if (state === 'sidebar-row-hover')
    script.push({ t: 0.1, type: 'move', key: 'session-ses_parity_7' });
  if (state === 'settings-general-bottom')
    script.push({ t: 0.1, type: 'scroll', x: 900, y: 500, dy: -1600, dur: 0.1 });
  if (session !== undefined) flags.push('--session', `ses_parity_${session}`);
  if (
    state.startsWith('settings-') ||
    state.startsWith('find-') ||
    [
      'app-menu-open',
      'apps-empty',
      'tasks-empty',
      'connection-offline',
      'home-no-project',
      'project-actions-open',
      'project-copy-feedback',
      'project-edit-open',
      'project-open-dialog',
      'project-picker-open',
      'sidebar-focus-view',
      'sidebar-hidden',
      'sidebar-project-collapsed',
      'thread-actions-open',
      'thread-context-menu',
      'thread-search-open',
      'usage-limits-open',
      'worktrees-empty',
      'session-details-open',
    ].includes(state)
  )
    flags.push(
      '--page',
      state === 'settings-general-bottom'
        ? 'settings-general'
        : state === 'worktrees-empty'
          ? 'worktrees-open'
          : state,
    );
  const reason =
    state === 'chat-streaming'
      ? 'No model calls: imported unfinished history does not create an active run; no native headless event-feed injection exists. Refusing a completed-transcript substitute.'
      : state === 'panel-canvas'
        ? 'WKWebView snapshot API exists but no headless CLI snapshot/export bridge mounts the native child; refusing a blank native-child pixel score.'
        : undefined;
  return { flags, script, env, session, reason };
}
