import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../components/ui/button';
import { CommentEditor } from './comment-editor';
import { useDraftStore } from './draft-context';
import type { ResponseCommentTarget } from './review-comments';

function selectedTextBoundary(range: Range, node: Node, last: boolean): Text | null {
  if (!range.intersectsNode(node)) return null;
  if (node instanceof Text) {
    const from = node === range.startContainer ? range.startOffset : 0;
    const to = node === range.endContainer ? range.endOffset : node.length;
    return from < to ? node : null;
  }
  for (
    let child = last ? node.lastChild : node.firstChild;
    child;
    child = last ? child.previousSibling : child.nextSibling
  ) {
    const boundary = selectedTextBoundary(range, child, last);
    if (boundary) return boundary;
  }
  return null;
}

export function ResponseSelection({
  scope,
  sessionID,
}: {
  scope: RefObject<HTMLDivElement | null>;
  sessionID: string;
}) {
  const store = useDraftStore();
  const popup = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<{
    target: ResponseCommentTarget;
    range: Range;
    x: number;
    y: number;
  }>();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    const root = scope.current;
    if (!root) return;
    const capture = () => {
      if (editing) return;
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) {
        setSelected(undefined);
        return;
      }
      const range = selection.getRangeAt(0).cloneRange();
      const first = selectedTextBoundary(range, range.commonAncestorContainer, false);
      const last = selectedTextBoundary(range, range.commonAncestorContainer, true);
      const start = first?.parentElement?.closest<HTMLElement>('[data-response-id]');
      const end = last?.parentElement?.closest('[data-response-id]');
      if (!first || !last || !start || start !== end || !root.contains(start)) {
        setSelected(undefined);
        return;
      }
      // Triple-click can end at the following block's offset 0. Normalize to
      // selected text nodes, without accepting text from another message.
      const from = first === range.startContainer ? range.startOffset : 0;
      const to = last === range.endContainer ? range.endOffset : last.length;
      range.setStart(first, from);
      range.setEnd(last, to);
      const raw = range.toString();
      const quote = raw.trim().slice(0, 8000);
      if (!quote) return;
      const prefix = range.cloneRange();
      prefix.selectNodeContents(start);
      prefix.setEnd(range.startContainer, range.startOffset);
      const offset = prefix.toString().length + raw.indexOf(quote);
      const rects = range.getClientRects();
      const rect = rects.item(rects.length - 1) ?? range.getBoundingClientRect();
      setError(undefined);
      setSelected({
        target: {
          messageID: start.dataset.responseId!,
          ordinal: Number(start.dataset.responseOrdinal),
          offset,
          quote,
        },
        range: range.cloneRange(),
        x: Math.max(12, Math.min(rect.left, window.innerWidth - 364)),
        y: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 48)),
      });
    };
    const dismiss = (event: Event) => {
      if (popup.current?.contains(event.target as Node)) return;
      if (!editing) setSelected(undefined);
    };
    root.addEventListener('pointerup', capture);
    root.addEventListener('keyup', capture);
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      root.removeEventListener('pointerup', capture);
      root.removeEventListener('keyup', capture);
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [scope, editing]);
  useEffect(() => {
    if (!selected) return;
    const keyboard = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setSelected(undefined);
        setEditing(false);
      }
      if (event.key === 'Tab' && !editing && scope.current?.contains(event.target as Node)) {
        event.preventDefault();
        popup.current?.querySelector('button')?.focus();
      }
    };
    document.addEventListener('keydown', keyboard);
    if (typeof Highlight !== 'undefined' && CSS.highlights)
      CSS.highlights.set('response-comment', new Highlight(selected.range));
    return () => {
      document.removeEventListener('keydown', keyboard);
      CSS.highlights?.delete('response-comment');
    };
  }, [selected, editing, scope]);
  useLayoutEffect(() => {
    const node = popup.current;
    if (!node || !selected) return;
    const position = () => {
      node.style.top = `${Math.max(12, Math.min(selected.y, window.innerHeight - node.offsetHeight - 12))}px`;
      node.style.left = `${Math.max(12, Math.min(selected.x, window.innerWidth - node.offsetWidth - 12))}px`;
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(node);
    window.addEventListener('resize', position);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', position);
    };
  }, [selected, editing]);
  const close = () => {
    setEditing(false);
    setSelected(undefined);
  };
  if (!selected) return null;
  return createPortal(
    <div
      ref={popup}
      className="response-selection"
      style={{
        left: selected.x,
        top: editing ? Math.max(12, Math.min(selected.y, window.innerHeight - 300)) : selected.y,
      }}
      data-shortcut-boundary=""
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      {editing ? (
        <CommentEditor sessionID={sessionID} target={selected.target} onClose={close} />
      ) : (
        <div
          className="response-selection-actions"
          role="group"
          aria-label="Selected response actions"
          onPointerDown={(event) => event.preventDefault()}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const error = store.getState().saveComment(sessionID, {
                id: crypto.randomUUID(),
                target: selected.target,
                text: '',
              });
              setError(error);
              if (!error) {
                close();
                scope.current
                  ?.closest('.chat')
                  ?.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message"]')
                  ?.focus();
              }
            }}
          >
            Quote
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Comment
          </Button>
        </div>
      )}
      {error && (
        <p className="text-error" role="alert">
          {error}
        </p>
      )}
    </div>,
    document.body,
  );
}
