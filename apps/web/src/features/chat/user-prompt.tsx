import { memo, useId } from 'react';
import { Comment01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  messageAnnotations,
  type MessageAnnotations,
  type PromptFileAttachment,
  type PromptMention,
} from '@opencodex/contracts';
import { MessageAttachments } from './message-attachments';
import { MessageText } from './message-text';
import './comments.css';

/** A sent prompt: its review comments as one chip, the user's own text, then attachments. */
export const UserPrompt = memo(function UserPrompt({
  text,
  files,
  skills,
  metadata,
  findable,
}: {
  text: string;
  files?: readonly PromptFileAttachment[];
  skills?: readonly { id: string; mention?: PromptMention['mention'] }[];
  metadata?: Record<string, unknown>;
  /** The timeline's bubble takes part in Find. */
  findable?: boolean;
}) {
  const annotations = messageAnnotations({ text, metadata });
  const own = annotations ? text.slice(0, annotations.end).trimEnd() : text;
  return (
    <>
      {annotations && <AnnotationsChip text={text} annotations={annotations} />}
      {own && (
        <p className="user-message-bubble" data-find-text={findable ? '' : undefined}>
          <MessageText text={own} files={files} skills={skills} />
        </p>
      )}
      <MessageAttachments files={files} />
    </>
  );
});

function AnnotationsChip({ text, annotations }: { text: string; annotations: MessageAnnotations }) {
  const id = useId();
  const counts = { annotation: 0, comment: 0 };
  for (const item of annotations.items) counts[item.kind]++;
  const summary = [
    counts.annotation &&
      `${counts.annotation} ${counts.annotation === 1 ? 'annotation' : 'annotations'}`,
    counts.comment && `${counts.comment} ${counts.comment === 1 ? 'comment' : 'comments'}`,
  ]
    .filter(Boolean)
    .join(', ');
  const numbers = { annotation: 0, comment: 0 };
  return (
    <div className="message-annotations">
      <button
        type="button"
        className="message-annotations-chip"
        popoverTarget={id}
        aria-haspopup="dialog"
      >
        <HugeiconsIcon icon={Comment01Icon} size={14} aria-hidden="true" />
        {summary}
      </button>
      <div
        id={id}
        popover="auto"
        role="dialog"
        aria-label={summary}
        className="message-annotations-preview"
      >
        <ol>
          {annotations.items.map((item, index) => {
            const quote = item.quote && text.slice(...item.quote).replace(/^> ?/gm, '');
            const comment = item.comment && text.slice(...item.comment);
            return (
              <li key={index}>
                <span className="message-annotation-number">
                  {item.kind === 'comment' ? 'Comment' : 'Annotation'} {++numbers[item.kind]}
                </span>
                {item.label && (
                  <span className="message-annotation-source" title={item.label}>
                    {item.label}
                  </span>
                )}
                {quote && (
                  <>
                    <small>Selected text:</small>
                    <blockquote data-code={item.kind === 'comment'}>{quote}</blockquote>
                  </>
                )}
                {comment && (
                  <>
                    <small>User comment:</small>
                    <p>{comment}</p>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
