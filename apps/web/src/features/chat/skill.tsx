import { Layers01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { SessionMessageAssistantTool } from '@opencodex/contracts';

export function SkillUsage({
  name,
  status = 'completed',
  error,
}: {
  name?: string;
  status?: SessionMessageAssistantTool['state']['status'];
  error?: string;
}) {
  return (
    <div className="skill-usage">
      <p className="skill-usage-label">
        <HugeiconsIcon
          icon={Layers01Icon}
          size={14}
          className="activity-tool-icon"
          data-kind="skill"
          aria-hidden="true"
        />
        <span>
          {status === 'completed'
            ? 'Used skill'
            : status === 'error'
              ? 'Failed to load skill'
              : 'Loading skill'}
          {name && (
            <>
              : <span className="skill-usage-name">{name}</span>
            </>
          )}
          {(status === 'running' || status === 'streaming') && '…'}
        </span>
      </p>
      {error && <p className="text-error">{error}</p>}
    </div>
  );
}

export function SkillTool({ tool }: { tool: SessionMessageAssistantTool }) {
  const state = tool.state;
  const input = typeof state.input === 'object' ? state.input : undefined;
  const name = input && [input.name, input.id].find((value) => typeof value === 'string' && value);
  const outputName =
    !name && 'content' in state
      ? state.content?.flatMap((content) =>
          content.type === 'text'
            ? (/<skill_content\s+name=["']([^"']+)["']/.exec(content.text)?.[1] ?? [])
            : [],
        )[0]
      : undefined;
  return (
    <SkillUsage
      name={typeof name === 'string' ? name : outputName}
      status={state.status}
      error={state.status === 'error' ? state.error.message : undefined}
    />
  );
}
