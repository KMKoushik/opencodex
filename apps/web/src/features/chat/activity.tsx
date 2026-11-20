import { memo } from 'react';
import { LegendList } from '@legendapp/list/react';
import {
  CheckmarkCircle02Icon,
  AlertCircleIcon,
  File01Icon,
  CommandLineIcon,
  Search01Icon,
  FileEditIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { TimelineRow, WorkEntry } from './timeline-model';
import { StreamText } from './stream-text';
import { Disclosure } from './disclosure';
import { useDisclosure } from './disclosure-state';
import { SkillTool, SkillUsage } from './skill';

export const Activity = memo(function Activity({
  row,
  sessionID,
}: {
  row: Extract<TimelineRow, { type: 'activity' }>;
  sessionID: string;
}) {
  return (
    <Disclosure
      id={row.id}
      className="activity-group"
      label={
        <>
          <span className="activity-label">{row.active ? 'Working' : row.summary}</span>
          {row.active && <span className="activity-meta truncate-fade">{row.summary}</span>}
          {row.errors > 0 && <span className="text-error">{row.errors} failed</span>}
        </>
      }
    >
      {row.entries.length > VIRTUAL_AFTER ? (
        <LegendList
          data={row.entries}
          keyExtractor={workKey}
          renderItem={({ item }) => <WorkItem key={item.id} entry={item} sessionID={sessionID} />}
          estimatedItemSize={34}
          drawDistance={160}
          maintainVisibleContentPosition
          style={{ height: Math.min(360, workHeight(row.entries)) }}
          className="activity-entries"
          aria-label="Agent activity"
          role="region"
        />
      ) : (
        // Most turns do a few steps: those take their natural height, so a short list leaves no
        // gap and an opened thought or tool shows in full instead of scrolling in a fixed box.
        <div className="activity-entries" aria-label="Agent activity" role="region">
          {row.entries.map((entry) => (
            <WorkItem key={entry.id} entry={entry} sessionID={sessionID} />
          ))}
        </div>
      )}
    </Disclosure>
  );
});

const workKey = (entry: WorkEntry) => entry.id;
/** Longer step lists render virtualized in a scrolling box. */
const VIRTUAL_AFTER = 30;
/** Rough content height: tools are one row, thoughts two lines of text. */
const workHeight = (entries: WorkEntry[]) =>
  entries.reduce((sum, entry) => sum + (entry.type === 'reasoning' ? 46 : 38), 24);

/**
 * A reasoning part shown as its own text, like T3 Code: two lines until clicked, then all of
 * it. A bare "Thinking" label hid what the agent found unless it was opened.
 */
function Thought({
  entry,
  sessionID,
}: {
  entry: Extract<WorkEntry, { type: 'reasoning' }>;
  sessionID: string;
}) {
  const [open, toggle] = useDisclosure(entry.id);
  return (
    <div
      role="button"
      tabIndex={0}
      className="activity-thought"
      data-open={open}
      aria-expanded={open}
      aria-label={open ? undefined : 'Thought, collapsed'}
      onClick={() => {
        // Selecting text to copy it shouldn't fold the thought.
        if (!window.getSelection()?.isCollapsed) return;
        toggle();
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggle();
        }
      }}
    >
      <StreamText
        sessionID={sessionID}
        messageID={entry.messageID}
        kind="reasoning"
        ordinal={entry.ordinal}
        text={entry.text}
        completed={entry.completed}
      />
    </div>
  );
}

function WorkItem({ entry, sessionID }: { entry: WorkEntry; sessionID: string }) {
  if (entry.type === 'skill')
    return <SkillUsage name={entry.message.name || entry.message.skill} />;
  if (entry.type === 'reasoning') return <Thought entry={entry} sessionID={sessionID} />;
  const tool = entry.tool;
  if (tool.name === 'skill') return <SkillTool tool={tool} />;
  const state = tool.state;
  const input = typeof state.input === 'object' ? state.input : undefined;
  const target =
    input &&
    [input.filePath, input.path, input.command, input.pattern, input.query].find(
      (value) => typeof value === 'string',
    );
  const shell = /^(shell|bash|exec|execute)$/.test(tool.name);
  const kind = /^(grep|glob|search|list|ls)$/.test(tool.name)
    ? 'search'
    : /^(edit|write|patch|apply_patch|write_file)$/.test(tool.name)
      ? 'edit'
      : shell
        ? 'shell'
        : 'read';
  const icon =
    kind === 'search'
      ? Search01Icon
      : kind === 'edit'
        ? FileEditIcon
        : shell
          ? CommandLineIcon
          : File01Icon;
  const title = /^(read|read_file)$/.test(tool.name)
    ? 'Read'
    : shell
      ? 'Run'
      : tool.name === 'question'
        ? 'Question'
        : tool.name;
  const status =
    state.status === 'error'
      ? 'Failed'
      : state.status === 'running'
        ? 'Running'
        : state.status === 'streaming'
          ? 'Preparing'
          : 'Completed';
  return (
    <Disclosure
      id={entry.id}
      className="activity-item"
      label={
        <>
          <HugeiconsIcon
            icon={icon}
            size={14}
            className="activity-tool-icon"
            data-kind={kind}
            aria-hidden="true"
          />
          <span>{title}</span>
          <span
            className="activity-target truncate-fade"
            title={typeof target === 'string' ? target : undefined}
          >
            {typeof target === 'string' ? target : tool.name === 'question' ? '' : tool.name}
          </span>
          {state.status === 'completed' || state.status === 'error' ? (
            <HugeiconsIcon
              icon={state.status === 'error' ? AlertCircleIcon : CheckmarkCircle02Icon}
              size={13}
              className={state.status === 'error' ? 'text-error' : 'activity-check'}
              aria-label={status}
            />
          ) : (
            <span className="activity-meta">{status}…</span>
          )}
        </>
      }
    >
      <ToolDetails entry={entry} />
    </Disclosure>
  );
}

function ToolDetails({ entry }: { entry: Extract<WorkEntry, { type: 'tool' }> }) {
  const state = entry.tool.state;
  return (
    <div className="tool-details">
      <div className="tool-section-label">Input</div>
      <pre>
        {typeof state.input === 'string' ? state.input : JSON.stringify(state.input, null, 2)}
      </pre>
      {state.status === 'error' && <p className="text-error">{state.error.message}</p>}
      {'content' in state &&
        state.content?.map((content, index) =>
          content.type === 'text' ? (
            <pre key={index}>{content.text}</pre>
          ) : (
            <p className="message-note" key={index}>
              File output ({content.mime})
            </p>
          ),
        )}
    </div>
  );
}
