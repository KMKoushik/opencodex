import { useRunningSubagents } from './running-subagents';

export function RunningSubagentsBadge({ sessionID }: { sessionID: string }) {
  const running = useRunningSubagents(sessionID);
  if (running.failed)
    return (
      <span
        id={`running-subagents-${sessionID}`}
        className="wb-rail-badge"
        data-error="true"
        role="img"
        aria-label="Could not load running subagent count"
        title="Could not load running subagent count"
      >
        !
      </span>
    );
  if (running.pending) return null;
  const count = running.items.length;
  if (!count) return null;
  const label = `${count} ${count === 1 ? 'subagent' : 'subagents'} running`;
  return (
    <span
      id={`running-subagents-${sessionID}`}
      className="wb-rail-badge"
      role="img"
      aria-label={label}
      title={label}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
