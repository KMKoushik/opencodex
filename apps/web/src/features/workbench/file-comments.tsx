import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Decoration, EditorView } from '@codemirror/view';
import { useStore } from 'zustand';
import { useDraftStore } from '../chat/draft-context';
import { CommentCard } from '../chat/comment-editor';
import { EMPTY_COMMENTS } from '../chat/review-comments';
import { Annotation, type AnnotationTarget } from './annotation';
import { CommentWidget, commentWidgets, setComments } from './comment-widgets';

export function FileComments({
  editor,
  directory,
  path,
  version,
  sessionID,
  pending,
  onClose,
}: {
  editor: EditorView | null;
  directory: string;
  path: string;
  sessionID: string;
  version: string;
  pending?: AnnotationTarget;
  onClose: () => void;
}) {
  const drafts = useDraftStore();
  const comments = useStore(drafts, (state) => state.drafts[sessionID]?.comments ?? EMPTY_COMMENTS);
  const slots = useMemo(() => {
    const entries = comments.flatMap((comment) => {
      const target = comment.target;
      return 'path' in target &&
        target.directory === directory &&
        target.path === path &&
        target.version === version &&
        !target.diffMode &&
        target.end
        ? [{ id: comment.id, target, comment }]
        : [];
    });
    return [
      ...entries,
      ...(pending ? [{ id: 'pending', target: pending, comment: undefined }] : []),
    ].map((entry) => ({
      ...entry,
      element: Object.assign(document.createElement('div'), { className: 'cm-comment-widget' }),
    }));
  }, [comments, directory, path, version, pending]);
  useEffect(() => {
    if (!editor) return;
    const positions = new Map<string, number>();
    editor.state
      .field(commentWidgets)
      .between(0, editor.state.doc.length, (from, _to, decoration) => {
        const widget = decoration.spec.widget;
        if (widget instanceof CommentWidget) positions.set(widget.id, from);
      });
    editor.dispatch({
      effects: setComments.of(
        Decoration.set(
          slots.flatMap((slot) => {
            const line = editor.state.doc.line(
              Math.min(slot.target.end ?? 1, editor.state.doc.lines),
            );
            const mapped = positions.get(slot.id);
            // Reopened documents may have changed outside this editor. Keep captured context
            // in the composer rather than placing its source card beneath unrelated code.
            if (mapped === undefined && slot.comment && slot.target.start) {
              if (slot.target.start > editor.state.doc.lines) return [];
              const start = editor.state.doc.line(slot.target.start).from;
              if (
                editor.state.sliceDoc(start, Math.min(line.to, start + 8000)) !== slot.target.quote
              )
                return [];
            }
            return [
              Decoration.widget({
                widget: new CommentWidget(slot.id, slot.element),
                block: true,
                side: 1,
              }).range(mapped ?? line.to),
            ];
          }),
          true,
        ),
      ),
    });
    if (pending)
      editor.dispatch({
        effects: EditorView.scrollIntoView(
          editor.state.doc.line(Math.min(pending.end ?? 1, editor.state.doc.lines)).from,
          { y: 'center' },
        ),
      });
  }, [editor, slots, pending]);
  return slots.map((slot) =>
    createPortal(
      slot.comment ? (
        <CommentCard sessionID={sessionID} comment={slot.comment} />
      ) : (
        <Annotation sessionID={sessionID} target={slot.target} onClose={onClose} />
      ),
      slot.element,
      slot.id,
    ),
  );
}
