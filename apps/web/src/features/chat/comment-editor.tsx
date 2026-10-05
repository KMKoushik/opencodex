import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { useDraftStore } from './draft-context';
import {
  commentLabel,
  commentQuote,
  type CommentTarget,
  type ReviewComment,
} from './review-comments';
import './comments.css';

export function CommentEditor({
  sessionID,
  target,
  comment,
  onClose,
  value,
  onChange,
}: {
  sessionID: string;
  target: CommentTarget;
  comment?: ReviewComment;
  onClose: () => void;
  value?: string;
  onChange?: (text: string) => void;
}) {
  const store = useDraftStore();
  const [id] = useState(() => comment?.id ?? crypto.randomUUID());
  const [localText, setLocalText] = useState(comment?.text ?? '');
  const text = value ?? localText;
  const setText = onChange ?? setLocalText;
  const [error, setError] = useState<string>();
  function save() {
    if (!text.trim()) return;
    const error = store.getState().saveComment(sessionID, { id, target, text: text.trim() });
    setError(error);
    if (!error) onClose();
  }
  return (
    <div
      className="comment-editor"
      role="group"
      aria-label="Comment editor"
      data-shortcut-boundary=""
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          event.stopPropagation();
          save();
        }
      }}
    >
      <div className="comment-source" title={commentLabel(target)}>
        {commentLabel(target)}
      </div>
      {('messageID' in target || ('previewQuote' in target && target.previewQuote)) && (
        <blockquote>{commentQuote(target)}</blockquote>
      )}
      <textarea
        aria-label="Review comment"
        placeholder="What should change?"
        autoFocus
        rows={2}
        maxLength={8000}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      {error && (
        <p className="text-error" role="alert">
          {error}
        </p>
      )}
      <div className="comment-actions">
        <span>Send with your next message</span>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" disabled={!text.trim()} onClick={save}>
          {comment ? 'Save' : 'Add comment'}
        </Button>
      </div>
    </div>
  );
}

export function CommentCard({ sessionID, comment }: { sessionID: string; comment: ReviewComment }) {
  const store = useDraftStore();
  const [editing, setEditing] = useState(false);
  if (editing)
    return (
      <CommentEditor
        sessionID={sessionID}
        target={comment.target}
        comment={comment}
        onClose={() => setEditing(false)}
      />
    );
  return (
    <div className="comment-card">
      <button
        type="button"
        className="comment-card-body"
        onClick={() => setEditing(true)}
        aria-label={`Edit comment on ${commentLabel(comment.target)}`}
      >
        <span className="comment-source">{commentLabel(comment.target)}</span>
        <span className="comment-summary">{comment.text || commentQuote(comment.target)}</span>
      </button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Remove comment on ${commentLabel(comment.target)}`}
        onClick={() => store.getState().removeComment(sessionID, comment.id)}
      >
        ×
      </Button>
    </div>
  );
}
