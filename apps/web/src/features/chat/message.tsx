import { memo } from 'react';
import { TextSelectIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { SessionMessageInfo } from '@opencodex/contracts';
import { ActivityText } from './activity-text';
import { Disclosure } from './disclosure';
import { MessageAttachments } from './message-attachments';
import { SkillUsage } from './skill';

export const Message = memo(function Message({
  message,
  active = false,
}: {
  message: SessionMessageInfo;
  active?: boolean;
}) {
  switch (message.type) {
    case 'user':
      return (
        <article className="user-message" aria-label="You">
          {message.text && <p className="user-message-bubble">{message.text}</p>}
          <MessageAttachments files={message.files} />
        </article>
      );
    case 'assistant':
      return (
        <article className="assistant-message" aria-label="Assistant">
          {message.retry && (
            <p className="message-note" role="status">
              Retrying: {message.retry.error.message}
            </p>
          )}
          {message.error && (
            <p className="text-error" role="alert">
              {message.error.message}
            </p>
          )}
        </article>
      );
    case 'shell':
      return (
        <Disclosure
          id={message.id}
          label={<code className="truncate-fade">{message.command}</code>}
        >
          <pre className="shell-output">{message.output?.output}</pre>
          {message.output?.truncated && (
            <p className="message-note">Output truncated by OpenCode.</p>
          )}
        </Disclosure>
      );
    case 'compaction':
      return (
        <div
          className="context-compaction"
          data-status={message.status}
          role={
            message.status === 'failed'
              ? 'alert'
              : message.status === 'running'
                ? 'status'
                : undefined
          }
        >
          <HugeiconsIcon icon={TextSelectIcon} size={16} aria-hidden="true" />
          <ActivityText active={active && message.status === 'running'}>
            {message.status === 'running'
              ? 'Compacting context'
              : message.status === 'failed'
                ? `Compaction failed: ${message.error.message}`
                : message.reason === 'auto'
                  ? 'Context automatically compacted'
                  : 'Context compacted'}
          </ActivityText>
        </div>
      );
    case 'agent-switched':
      return <p className="message-note">Agent: {message.agent}</p>;
    case 'model-switched':
      return <p className="message-note">Model: {message.model.id}</p>;
    case 'location-switched':
      return <p className="message-note">Directory: {message.location.directory}</p>;
    case 'system':
    case 'synthetic':
      return null;
    case 'skill':
      return <SkillUsage name={message.name || message.skill} />;
    case 'idle':
      return null;
  }
});
