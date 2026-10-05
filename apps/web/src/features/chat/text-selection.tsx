import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Button } from '../../components/ui/button';
import { CommentEditor } from './comment-editor';
import { useDraftStore } from './draft-context';
import type { CommentTarget } from './review-comments';

function selectedTextBoundary(range: Range, node: Node, last: boolean): Text | null {
  if (!range.intersectsNode(node)) return null;
  if (node instanceof Text) {
    const from = node === range.startContainer ? range.startOffset : 0;
    const to = node === range.endContainer ? range.endOffset : node.length;
    // Block separators belong to the rendered root, not a positioned Markdown node.
    return from < to && /\S/.test(node.data.slice(from, to)) ? node : null;
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

export type TextSelectionHandle = { comment: () => boolean };

function readTextSelection(
  scope: RefObject<HTMLElement | null>,
  getTarget: (range: Range, quote: string) => CommentTarget | undefined,
) {
  const root = scope.current;
  const selection = window.getSelection();
  if (!root || !selection || selection.isCollapsed || !selection.rangeCount) return;
  const range = selection.getRangeAt(0).cloneRange();
  if (!root.contains(range.commonAncestorContainer)) return;
  const first = selectedTextBoundary(range, range.commonAncestorContainer, false);
  const last = selectedTextBoundary(range, range.commonAncestorContainer, true);
  if (!first || !last) return;
  // Triple-click can end at the following block's offset 0. Normalize to
  // actually selected text nodes before resolving a response or file target.
  range.setStart(first, first === range.startContainer ? range.startOffset : 0);
  range.setEnd(last, last === range.endContainer ? range.endOffset : last.length);
  const quote = range.toString().trim().slice(0, 8000);
  if (!quote) return;
  const target = getTarget(range, quote);
  if (!target) return;
  const rects = range.getClientRects();
  const rect = rects.item(rects.length - 1) ?? range.getBoundingClientRect();
  return {
    target,
    range,
    x: Math.max(12, Math.min(rect.left, window.innerWidth - 364)),
    y: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 48)),
  };
}

export function TextSelection({
  scope,
  sessionID,
  getTarget,
  handle,
  highlightName = 'response-comment',
  actionsLabel = 'Selected text actions',
  className,
  onAskSideChat,
}: {
  scope: RefObject<HTMLElement | null>;
  sessionID: string;
  getTarget: (range: Range, quote: string) => CommentTarget | undefined;
  handle?: RefObject<TextSelectionHandle | null>;
  highlightName?: string;
  actionsLabel?: string;
  className?: string;
  onAskSideChat?: (quote: string) => void;
}) {
  const store = useDraftStore();
  const popup = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<{
    target: CommentTarget;
    range: Range;
    x: number;
    y: number;
  }>();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string>();
  const readSelection = useCallback(() => readTextSelection(scope, getTarget), [scope, getTarget]);
  const beginComment = useCallback(() => {
    const captured = readSelection() ?? selected;
    if (
      !captured ||
      !captured.range.startContainer.isConnected ||
      !captured.range.endContainer.isConnected
    )
      return false;
    setSelected(captured);
    setError(undefined);
    setEditing(true);
    return true;
  }, [readSelection, selected]);
  useImperativeHandle(handle, () => ({ comment: beginComment }), [beginComment]);
  useEffect(() => {
    const root = scope.current;
    if (!root) return;
    const capture = (event: Event) => {
      if (editing || (event instanceof KeyboardEvent && event.key === 'Escape')) return;
      setError(undefined);
      setSelected(readSelection());
    };
    const dismiss = (event: Event) => {
      if (popup.current?.contains(event.target as Node)) return;
      if (!editing) setSelected(undefined);
    };
    const shortcut = (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        !(event.metaKey || event.ctrlKey) ||
        !event.shiftKey ||
        event.key.toLowerCase() !== 'm'
      )
        return;
      if (beginComment()) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    root.addEventListener('pointerup', capture);
    root.addEventListener('keyup', capture);
    root.addEventListener('keydown', shortcut);
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      root.removeEventListener('pointerup', capture);
      root.removeEventListener('keyup', capture);
      root.removeEventListener('keydown', shortcut);
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [scope, editing, readSelection, beginComment]);
  useEffect(() => {
    if (!selected) return;
    const keyboard = (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        (!scope.current?.contains(event.target as Node) &&
          !popup.current?.contains(event.target as Node))
      )
        return;
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
    document.addEventListener('keydown', keyboard, true);
    if (typeof Highlight !== 'undefined' && CSS.highlights)
      CSS.highlights.set(highlightName, new Highlight(selected.range));
    return () => {
      document.removeEventListener('keydown', keyboard, true);
      CSS.highlights?.delete(highlightName);
    };
  }, [selected, editing, scope, highlightName]);
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
      className={clsx('response-selection', className)}
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
          aria-label={actionsLabel}
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
          {onAskSideChat && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onAskSideChat(selected.target.quote ?? '');
                close();
              }}
            >
              Ask in side chat
            </Button>
          )}
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
