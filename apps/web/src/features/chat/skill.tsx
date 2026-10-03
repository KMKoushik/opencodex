import { BookOpen01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { SessionMessageAssistantTool } from '@opencodex/contracts';
import { ActivityText } from './activity-text';

export function SkillUsage({
  name,
  status = 'completed',
  error,
  active = false,
}: {
  name?: string;
  status?: SessionMessageAssistantTool['state']['status'];
  error?: string;
  active?: boolean;
}) {
  const label =
    status === 'completed'
      ? 'Loaded skill'
      : status === 'error'
        ? 'Failed to load skill'
        : 'Loading skill';
  return (
    <div className="skill-usage">
      <p className="skill-usage-label">
        <HugeiconsIcon icon={BookOpen01Icon} size={18} aria-hidden="true" />
        <ActivityText active={active && (status === 'running' || status === 'streaming')}>
          {name ? `${label} ${name}` : label}
        </ActivityText>
      </p>
      {error && <p className="text-error">{error}</p>}
    </div>
  );
}

export function SkillTool({
  tool,
  active,
}: {
  tool: SessionMessageAssistantTool;
  active: boolean;
}) {
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
      active={active}
    />
  );
}
