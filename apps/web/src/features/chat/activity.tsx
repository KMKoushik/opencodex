import { memo } from 'react';
import { LegendList } from '@legendapp/list/react';
import {
  AlertCircleIcon,
  File01Icon,
  CommandLineIcon,
  Folder01Icon,
  Search01Icon,
  PencilEdit01Icon,
  BookOpen01Icon,
  BotIcon,
  MessageQuestionIcon,
  GlobeIcon,
  Wrench01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { TimelineRow, WorkEntry } from './timeline-model';
import { StreamText } from './stream-text';
import { Disclosure } from './disclosure';
import { SkillTool, SkillUsage } from './skill';
import { ActivityText } from './activity-text';
import { toolActivity, type ToolKind } from './tool-activity';

const toolIcons = {
  read: File01Icon,
  search: Search01Icon,
  list: Folder01Icon,
  command: CommandLineIcon,
  edit: PencilEdit01Icon,
  skill: BookOpen01Icon,
  subagent: BotIcon,
  question: MessageQuestionIcon,
  web: GlobeIcon,
  tool: Wrench01Icon,
} satisfies Record<ToolKind, typeof File01Icon>;

export const Activity = memo(function Activity({
  row,
  sessionID,
  active,
  expanded = false,
}: {
  row: Extract<TimelineRow, { type: 'activity' }>;
  sessionID: string;
  active: boolean;
  expanded?: boolean;
}) {
  const current =
    active && row.current?.type === 'tool' ? toolActivity(row.current.tool) : undefined;
  const label =
    active && row.current?.type === 'reasoning' ? 'Thinking' : (current?.text ?? row.summary);
  const entries = (
    <LegendList
      data={row.entries}
      extraData={active}
      keyExtractor={workKey}
      renderItem={({ item }) => (
        <WorkItem
          key={item.id}
          entry={item}
          sessionID={sessionID}
          active={active && item.messageID === row.current?.messageID}
        />
      )}
      estimatedItemSize={34}
      drawDistance={160}
      maintainVisibleContentPosition
      style={{ height: Math.max(160, Math.min(300, row.entries.length * 38 + 24)) }}
      className="activity-entries"
      aria-label="Agent activity"
      role="region"
    />
  );
  if (expanded) return <section className="activity-group">{entries}</section>;
  return (
    <Disclosure
      id={row.id}
      className="activity-group"
      label={
        <>
          {current && (
            <HugeiconsIcon icon={toolIcons[current.kind]} size={18} className="activity-icon" />
          )}
          <ActivityText active={active} className="activity-label truncate-fade" title={label}>
            {label}
          </ActivityText>
          {row.errors > 0 && <span className="text-error">{row.errors} failed</span>}
        </>
      }
    >
      {entries}
    </Disclosure>
  );
});

const workKey = (entry: WorkEntry) => entry.id;

function WorkItem({
  entry,
  sessionID,
  active,
}: {
  entry: WorkEntry;
  sessionID: string;
  active: boolean;
}) {
  if (entry.type === 'skill')
    return <SkillUsage name={entry.message.name || entry.message.skill} />;
  if (entry.type === 'reasoning')
    return (
      <Disclosure
        id={entry.id}
        className="activity-item"
        label={<ActivityText active={active && !entry.completed}>Thinking</ActivityText>}
      >
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
  if (tool.name === 'skill') return <SkillTool tool={tool} active={active} />;
  const state = tool.state;
  const working = active && (state.status === 'running' || state.status === 'streaming');
  const presentation = toolActivity(tool);
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
          <HugeiconsIcon icon={toolIcons[presentation.kind]} size={18} className="activity-icon" />
          <ActivityText
            active={working}
            className="activity-label truncate-fade"
            title={presentation.text}
          >
            {presentation.text}
          </ActivityText>
          {state.status === 'error' ? (
            <HugeiconsIcon
              icon={AlertCircleIcon}
              size={14}
              className="text-error"
              aria-label={status}
            />
          ) : (
            <span className="sr-only">{status}</span>
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
