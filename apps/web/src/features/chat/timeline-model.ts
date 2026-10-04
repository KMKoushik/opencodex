import type { SessionMessageInfo, SessionMessageAssistantTool } from '@opencodex/contracts';

type Assistant = Extract<SessionMessageInfo, { type: 'assistant' }>;
export type WorkEntry =
  | { id: string; type: 'tool'; tool: SessionMessageAssistantTool }
  | { id: string; type: 'skill'; message: Extract<SessionMessageInfo, { type: 'skill' }> }
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
      type: 'activity';
      entries: WorkEntry[];
      summary: string;
      active: boolean;
      errors: number;
    };
type Entry = Exclude<TimelineRow, { type: 'activity' }> | WorkEntry;

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
      let entries = cache.get(message);
      if (!entries) {
        entries = [];
        if (message.type === 'assistant') {
          let text = 0;
          let reasoning = 0;
          for (const part of message.content) {
            if (part.type === 'tool')
              entries.push({
                id: part.id,
                type: 'tool',
                tool: part,
              });
            if (part.type === 'reasoning')
              entries.push({
                id: `${message.id}:reasoning:${reasoning}`,
                type: 'reasoning',
                messageID: message.id,
                ordinal: reasoning++,
                text: part.text,
                completed: Boolean(message.time.completed),
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
          entries.push({ id: message.id, type: 'skill', message });
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

/** Header for a turn's work: tool activity, reasoning, and progress text before the answer. */
export type TurnRow = {
  id: string;
  type: 'turn';
  status: 'working' | 'worked' | 'stopped';
  start: number;
  end: number | undefined;
  open: boolean;
};
export type DisplayRow = TimelineRow | TurnRow;

type TurnTime = { start: number; end: number | undefined; outcome: string | undefined };

/**
 * Folds each turn's work under one header, Codex-style. OpenCode does not mark which text is
 * the final answer, so a finished turn's last text is the answer and everything else is work.
 * While a turn runs, its newest text stays below the header until more work follows it.
 * Runs on snapshots and toggles only; header IDs survive older pages and turn completion.
 */
export function createTurnGrouper() {
  let previous = new Map<string, TurnRow>();
  let owners = new Map<string, string>();
  return (
    rows: TimelineRow[],
    messages: SessionMessageInfo[],
    running: boolean,
    overrides: ReadonlyMap<string, boolean>,
  ) => {
    const times = turnTimes(messages);
    const out: DisplayRow[] = [];
    const nextHeaders = new Map<string, TurnRow>();
    const nextOwners = new Map<string, string>();
    const claimed = new Set<string>();
    let start = 0;
    while (start < rows.length) {
      const user = isUser(rows[start]!) ? rows[start] : undefined;
      if (user) out.push(user);
      let end = user ? start + 1 : start;
      while (end < rows.length && !isUser(rows[end]!)) end++;
      const turn = rows.slice(user ? start + 1 : start, end);
      const live = running && end === rows.length;
      let answer = -1;
      for (let i = turn.length - 1; i >= 0; i--) {
        const row = turn[i]!;
        if (row.type === 'text') {
          answer = i;
          break;
        }
        // While running, text is only the answer so far if no work has followed it.
        if (live && row.type === 'activity') break;
      }
      const members = new Set(
        turn.filter((row, i) => i !== answer && (row.type === 'activity' || row.type === 'text')),
      );
      if (!members.size) {
        out.push(...turn);
        start = end;
        continue;
      }
      const id =
        [...members].map((row) => owners.get(row.id)).find((key) => key && !claimed.has(key)) ??
        `turn:${user?.id ?? [...members][0]!.id}`;
      claimed.add(id);
      const time = times.get(user?.id ?? '');
      const status = live ? 'working' : time?.outcome === 'interrupted' ? 'stopped' : 'worked';
      const open = overrides.get(id) ?? live;
      const old = previous.get(id);
      const header: TurnRow =
        old &&
        old.status === status &&
        old.open === open &&
        old.start === time?.start &&
        old.end === (live ? undefined : time?.end)
          ? old
          : {
              id,
              type: 'turn',
              status,
              start: time?.start ?? 0,
              end: live ? undefined : time?.end,
              open,
            };
      nextHeaders.set(id, header);
      let placed = false;
      for (const row of turn) {
        const member = members.has(row);
        if (member) nextOwners.set(row.id, id);
        if (member && !placed) {
          out.push(header);
          placed = true;
        }
        if (!member || open) out.push(row);
      }
      start = end;
    }
    previous = nextHeaders;
    owners = nextOwners;
    return out;
  };
}

function isUser(row: TimelineRow) {
  return row.type === 'message' && row.message.type === 'user';
}

/** Start, end, and outcome per turn, keyed by its user message ('' before the first). */
function turnTimes(messages: SessionMessageInfo[]) {
  const times = new Map<string, TurnTime>();
  let current: TurnTime | undefined;
  for (const message of messages) {
    if (message.type === 'user') {
      current = { start: message.time.created, end: undefined, outcome: undefined };
      times.set(message.id, current);
      continue;
    }
    if (!current) {
      current = { start: message.time.created, end: undefined, outcome: undefined };
      times.set('', current);
    }
    if (message.type === 'idle') {
      current.end = message.time.created;
      current.outcome = message.outcome;
    } else if (message.type === 'assistant' && current.outcome === undefined) {
      const done = message.time.completed ?? message.time.created;
      current.end = Math.max(current.end ?? 0, done);
    }
  }
  return times;
}

function summarizeWork(entries: WorkEntry[]) {
  let reads = 0,
    searches = 0,
    commands = 0,
    edits = 0,
    questions = 0,
    skills = 0,
    other = 0,
    errors = 0;
  let active = false;
  for (const entry of entries) {
    if (entry.type === 'skill') {
      skills++;
      continue;
    }
    if (entry.type !== 'tool') {
      active ||= !entry.completed;
      continue;
    }
    const tool = entry.tool;
    active ||= tool.state.status === 'running' || tool.state.status === 'streaming';
    if (tool.state.status === 'error') errors++;
    if (/^(read|read_file)$/.test(tool.name)) reads++;
    else if (/^(grep|glob|search|list|ls)$/.test(tool.name)) searches++;
    else if (/^(shell|bash|exec|execute)$/.test(tool.name)) commands++;
    else if (/^(edit|write|patch|apply_patch|write_file)$/.test(tool.name)) edits++;
    else if (tool.name === 'question') questions++;
    else if (tool.name === 'skill') skills++;
    else other++;
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
      other ? count(other, 'tool call') : '',
    ]
      .filter(Boolean)
      .join(' · ') || 'Thought process';
  return { summary: summary.charAt(0).toUpperCase() + summary.slice(1), active, errors };
}
