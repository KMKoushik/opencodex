import { memo } from 'react';
import type { SessionMessageInfo } from '@opencodex/contracts';
import { Disclosure } from './disclosure';
import { MessageAttachments } from './message-attachments';

export const Message = memo(function Message({ message }: { message: SessionMessageInfo }) {
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
        <Disclosure id={message.id} label={<code className="truncate">{message.command}</code>}>
          <pre className="shell-output">{message.output?.output}</pre>
          {message.output?.truncated && (
            <p className="message-note">Output truncated by OpenCode.</p>
          )}
        </Disclosure>
      );
    case 'compaction':
      return (
        <p className="message-note">
          {message.status === 'running'
            ? 'Compacting context…'
            : message.status === 'failed'
              ? `Compaction failed: ${message.error.message}`
              : 'Context compacted'}
        </p>
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
      return (
        <Disclosure id={message.id} label="Skill">
          <p className="reasoning-text">{message.text}</p>
        </Disclosure>
      );
    case 'idle':
      return null;
  }
});
