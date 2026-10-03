import type { SessionMessageInfo, SessionMessageAssistantTool } from '@opencodex/contracts';
import { toolKind } from './tool-activity';

type Assistant = Extract<SessionMessageInfo, { type: 'assistant' }>;
export type WorkEntry =
  | { id: string; type: 'tool'; messageID: string; tool: SessionMessageAssistantTool }
  | {
      id: string;
      type: 'skill';
      messageID: string;
      message: Extract<SessionMessageInfo, { type: 'skill' }>;
    }
  | {
      id: string;
      type: 'reasoning';
      messageID: string;
      ordinal: number;
      text: string;
      completed: boolean;
    };
export type TimelineRow =
  | { id: string; type: 'message'; message: SessionMessageInfo }
  | { id: string; type: 'text'; message: Assistant; ordinal: number; text: string }
  | {
      id: string;
      type: 'work-header';
      startedAt: number;
      completedAt?: number;
      outcome?: 'succeeded' | 'failed' | 'interrupted';
      errors: number;
      hasActivity: boolean;
    }
  | {
      id: string;
      type: 'activity';
      entries: WorkEntry[];
      summary: string;
      current?: WorkEntry;
      errors: number;
    };
type Entry = Exclude<TimelineRow, { type: 'activity' | 'work-header' }> | WorkEntry;

// Snapshot projection only: token deltas subscribe at the visible text row.
// Reuse row identities and group keys, including when an older page extends a group.
export function createTimelineProjector() {
  const cache = new WeakMap<SessionMessageInfo, Entry[]>();
  let previous = new Map<string, TimelineRow>();
  let groups = new Map<string, string>();
  return (messages: SessionMessageInfo[]) => {
    const rows: TimelineRow[] = [];
    const nextGroups = new Map<string, string>();
    const claimed = new Set<string>();
    let work: WorkEntry[] = [];
    const flush = () => {
      if (!work.length) return;
      const id =
        work.map((entry) => groups.get(entry.id)).find((key) => key && !claimed.has(key)) ??
        `activity:${work[0]!.id}`;
      claimed.add(id);
      const old = previous.get(id);
      const row =
        old?.type === 'activity' &&
        old.entries.length === work.length &&
        old.entries.every((entry, i) => entry === work[i])
          ? old
          : { id, type: 'activity' as const, entries: work, ...summarizeWork(work) };
      rows.push(row);
      for (const entry of work) nextGroups.set(entry.id, id);
      work = [];
    };
    for (const message of messages) {
      // Work from separate native executions must not merge across idle rows,
      // even though those rows do not render transcript content themselves.
      if (message.type === 'idle') flush();
      let entries = cache.get(message);
      if (!entries) {
        entries = [];
        if (message.type === 'assistant') {
          let text = 0;
          let reasoning = 0;
          for (const [index, part] of message.content.entries()) {
            if (part.type === 'tool')
              entries.push({
                id: part.id,
                type: 'tool',
                messageID: message.id,
                tool: part,
              });
            if (part.type === 'reasoning')
              entries.push({
                id: `${message.id}:reasoning:${reasoning}`,
                type: 'reasoning',
                messageID: message.id,
                ordinal: reasoning++,
                text: part.text,
                completed:
                  message.time.completed !== undefined ||
                  part.time?.completed !== undefined ||
                  index < message.content.length - 1,
              });
            if (part.type === 'text') {
              const ordinal = text++;
              if (part.text.trim() || !message.time.completed)
                entries.push({
                  id: `${message.id}:text:${ordinal}`,
                  type: 'text',
                  message,
                  ordinal,
                  text: part.text,
                });
            }
          }
          if (!text && !message.time.completed)
            entries.push({
              id: `${message.id}:text:0`,
              type: 'text',
              message,
              ordinal: 0,
              text: '',
            });
          if (message.error || message.retry)
            entries.push({
              id: `${message.id}:status`,
              type: 'message',
              message: { ...message, content: [] },
            });
        } else if (message.type === 'skill')
          entries.push({ id: message.id, type: 'skill', messageID: message.id, message });
        else if (
          message.type !== 'idle' &&
          message.type !== 'system' &&
          message.type !== 'synthetic'
        )
          entries.push({ id: message.id, type: 'message', message });
        cache.set(message, entries);
      }
      for (const entry of entries) {
        if (entry.type === 'tool' || entry.type === 'reasoning' || entry.type === 'skill')
          work.push(entry);
        else {
          flush();
          rows.push(entry);
        }
      }
    }
    flush();
    previous = new Map(rows.map((row) => [row.id, row]));
    groups = nextGroups;
    return rows;
  };
}

function summarizeWork(entries: WorkEntry[]) {
  let reads = 0,
    searches = 0,
    commands = 0,
    edits = 0,
    questions = 0,
    skills = 0,
    subagents = 0,
    other = 0,
    errors = 0;
  let current: WorkEntry | undefined;
  for (const entry of entries) {
    if (entry.type === 'skill') {
      skills++;
      continue;
    }
    if (entry.type !== 'tool') {
      if (!entry.completed) current = entry;
      continue;
    }
    const tool = entry.tool;
    if (tool.state.status === 'running' || tool.state.status === 'streaming') current = entry;
    if (tool.state.status === 'error') errors++;
    switch (toolKind(tool.name)) {
      case 'read':
        reads++;
        break;
      case 'search':
      case 'list':
        searches++;
        break;
      case 'command':
        commands++;
        break;
      case 'edit':
        edits++;
        break;
      case 'question':
        questions++;
        break;
      case 'skill':
        skills++;
        break;
      case 'subagent':
        subagents++;
        break;
      default:
        other++;
    }
  }
  const count = (n: number, singular: string, plural = `${singular}s`) =>
    `${n} ${n === 1 ? singular : plural}`;
  const summary =
    [
      reads ? `Read ${count(reads, 'file')}` : '',
      searches ? count(searches, 'search', 'searches') : '',
      commands ? `ran ${count(commands, 'command')}` : '',
      edits ? count(edits, 'edit') : '',
      questions ? count(questions, 'question') : '',
      skills ? `used ${count(skills, 'skill')}` : '',
      subagents ? count(subagents, 'subagent') : '',
      other ? count(other, 'tool call') : '',
    ]
      .filter(Boolean)
      .join(' · ') || 'Thought process';
  return { summary: summary.charAt(0).toUpperCase() + summary.slice(1), current, errors };
}
