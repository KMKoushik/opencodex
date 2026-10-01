import { memo } from 'react';
import { LegendList } from '@legendapp/list/react';
import {
  CheckmarkCircle02Icon,
  AlertCircleIcon,
  File01Icon,
  CommandLineIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { TimelineRow, WorkEntry } from './timeline-model';
import { StreamText } from './stream-text';
import { Disclosure } from './disclosure';

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
          {row.active && <span className="activity-meta truncate">{row.summary}</span>}
          {row.errors > 0 && <span className="text-error">{row.errors} failed</span>}
        </>
      }
    >
      <LegendList
        data={row.entries}
        keyExtractor={workKey}
        renderItem={({ item }) => <WorkItem key={item.id} entry={item} sessionID={sessionID} />}
        estimatedItemSize={34}
        drawDistance={160}
        maintainVisibleContentPosition
        style={{ height: Math.max(160, Math.min(300, row.entries.length * 38 + 24)) }}
        className="activity-entries"
        aria-label="Agent activity"
        role="region"
      />
    </Disclosure>
  );
});

const workKey = (entry: WorkEntry) => entry.id;

function WorkItem({ entry, sessionID }: { entry: WorkEntry; sessionID: string }) {
  if (entry.type === 'reasoning')
    return (
      <Disclosure id={entry.id} className="activity-item" label={<span>Thinking</span>}>
        <StreamText
          sessionID={sessionID}
          messageID={entry.messageID}
          kind="reasoning"
          ordinal={entry.ordinal}
          text={entry.text}
          completed={entry.completed}
        />
      </Disclosure>
    );
  const tool = entry.tool;
  const state = tool.state;
  const input = typeof state.input === 'object' ? state.input : undefined;
  const target =
    input &&
    [input.filePath, input.path, input.command, input.pattern, input.query].find(
      (value) => typeof value === 'string',
    );
  const shell = /^(shell|bash|exec|execute)$/.test(tool.name);
  const title = /^(read|read_file)$/.test(tool.name) ? 'Read' : shell ? 'Run' : tool.name;
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
          <HugeiconsIcon icon={shell ? CommandLineIcon : File01Icon} size={14} />
          <span>{title}</span>
          <span
            className="activity-target truncate"
            title={typeof target === 'string' ? target : undefined}
          >
            {typeof target === 'string' ? target : tool.name}
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
