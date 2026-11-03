import type { ShellInfo, SessionMessageInfo } from '@opencodex/contracts';

/** Shell and subagent calls the current reply is waiting on, as OpenCode's app reads them. */
export type BlockingWork = {
  shells: { id?: string; command?: string }[];
  subagents: { id?: string }[];
};

export const NO_BLOCKING_WORK: BlockingWork = { shells: [], subagents: [] };

const text = (value: unknown) => (typeof value === 'string' ? value : undefined);

/** Reads only the newest message, which is the unfinished reply while the session runs. */
export function blockingWork(messages: readonly SessionMessageInfo[]): BlockingWork {
  const last = messages.findLast((message) => message.type === 'assistant');
  if (!last || last.type !== 'assistant' || last.time.completed !== undefined)
    return NO_BLOCKING_WORK;
  const work: BlockingWork = { shells: [], subagents: [] };
  for (const part of last.content) {
    if (part.type !== 'tool' || part.state.status !== 'running') continue;
    const { metadata, input } = part.state;
    if (part.name === 'shell')
      work.shells.push({ id: text(metadata.shellID), command: text(input.command) });
    if (part.name === 'subagent') work.subagents.push({ id: text(metadata.sessionID) });
  }
  return work.shells.length || work.subagents.length ? work : NO_BLOCKING_WORK;
}

export function blocksReply(shell: ShellInfo, work: BlockingWork) {
  return work.shells.some((item) =>
    item.id ? item.id === shell.id : item.command !== undefined && item.command === shell.command,
  );
}
