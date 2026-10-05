import { memo, useId, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, Comment01Icon, Edit02Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { useDraftStore } from './draft-context';
import { commentLabel, commentQuote, EMPTY_COMMENTS, type ReviewComment } from './review-comments';
import './comments.css';

export const ComposerComments = memo(function ComposerComments({
  sessionID,
}: {
  sessionID: string;
}) {
  const store = useDraftStore();
  const comments = useStore(store, (state) => state.drafts[sessionID]?.comments ?? EMPTY_COMMENTS);
  if (!comments.length) return null;
  const code = comments.filter((comment) => 'path' in comment.target);
  const quotes = comments.filter((comment) => 'messageID' in comment.target);
  return (
    <div className="composer-context" aria-label="Review context">
      {code.length > 0 && (
        <ContextGroup label="Review comments" comments={code} sessionID={sessionID} />
      )}
      {quotes.length > 0 && (
        <ContextGroup label="Chat quotes" comments={quotes} sessionID={sessionID} />
      )}
    </div>
  );
});

function ContextGroup({
  label,
  comments,
  sessionID,
}: {
  label: string;
  comments: readonly ReviewComment[];
  sessionID: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="composer-context-chip"
        popoverTarget={id}
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="dialog"
      >
        <HugeiconsIcon icon={Comment01Icon} size={14} />
        <span>{label}</span>
        <span className="composer-context-count">{comments.length}</span>
      </button>
      <div
        ref={popover}
        id={id}
        popover="auto"
        className="composer-context-preview"
        role="dialog"
        aria-label={label}
        data-shortcut-boundary=""
        onToggle={(event) => {
          if (event.target === event.currentTarget) setOpen(event.newState === 'open');
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.stopPropagation();
            popover.current?.hidePopover();
            trigger.current?.focus();
          }
        }}
      >
        {comments.map((comment, index) => (
          <ContextEntry key={comment.id} sessionID={sessionID} comment={comment} index={index} />
        ))}
      </div>
    </>
  );
}

function ContextEntry({
  sessionID,
  comment,
  index,
}: {
  sessionID: string;
  comment: ReviewComment;
  index: number;
}) {
  const store = useDraftStore();
  const editButton = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(comment.text);
  const [error, setError] = useState<string>();
  const response = 'messageID' in comment.target;
  const label = response ? `Quote ${index + 1}` : commentLabel(comment.target);
  const close = () => {
    setEditing(false);
    setError(undefined);
    editButton.current?.focus();
  };
  const save = () => {
    const error = store.getState().saveComment(sessionID, { ...comment, text: text.trim() });
    setError(error);
    if (!error) close();
  };
  return (
    <section className="context-entry" aria-label={label}>
      <header>
        <span className="context-entry-title" title={label}>
          {label}
        </span>
        <button
          ref={editButton}
          type="button"
          className="context-entry-action"
          aria-label={editing ? `Save comment on ${label}` : `Edit comment on ${label}`}
          title={editing ? 'Save comment' : 'Edit comment'}
          onClick={() => {
            if (editing) save();
            else {
              setText(comment.text);
              setEditing(true);
            }
          }}
        >
          <HugeiconsIcon icon={editing ? Tick02Icon : Edit02Icon} size={14} />
        </button>
        <button
          type="button"
          className="context-entry-action"
          aria-label={editing ? `Cancel editing ${label}` : `Remove ${label}`}
          title={editing ? 'Cancel' : 'Remove'}
          onClick={() => {
            if (editing) close();
            else store.getState().removeComment(sessionID, comment.id);
          }}
        >
          <HugeiconsIcon icon={Cancel01Icon} size={14} />
        </button>
      </header>
      <div className="context-entry-content">
        {commentQuote(comment.target) && (
          <blockquote data-code={!response && !('previewQuote' in comment.target)}>
            {commentQuote(comment.target)}
          </blockquote>
        )}
        {editing ? (
          <textarea
            aria-label={`Comment on ${label}`}
            autoFocus
            rows={2}
            maxLength={8000}
            placeholder="Add a comment…"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                close();
              }
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                save();
              }
            }}
          />
        ) : (
          comment.text && <p>{comment.text}</p>
        )}
        {error && (
          <p className="text-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
