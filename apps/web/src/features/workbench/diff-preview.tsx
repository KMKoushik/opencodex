import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { useQuery } from '@tanstack/react-query';
import { CodeView } from '@pierre/diffs/react';
import type {
  CodeViewLineSelection,
  FileDiffMetadata,
  DiffLineAnnotation,
  SelectedLineRange,
} from '@pierre/diffs';
import { api } from '../../lib/api';
import { useTheme } from '../theme/use-theme';
import { QueryError } from './query-error';
import { Annotation, type AnnotationTarget } from './annotation';
import { useDraftStore } from '../chat/draft-context';
import { EMPTY_COMMENTS, type ReviewComment } from '../chat/review-comments';
import { CommentCard } from '../chat/comment-editor';
import { Button } from '../../components/ui/button';
import { diffComment } from './diff-comment';

const diffCSS = `:host { --diffs-font-family: var(--font-mono); --diffs-font-size: 12px; --diffs-line-height: 22px;
 --diffs-bg: var(--surface); --diffs-fg: var(--text); --diffs-addition-color: var(--success); --diffs-deletion-color: var(--error); }
 [data-diffs-header] { display: none; }
`;
export function DiffPreview({
  directory,
  path,
  mode,
  sessionID,
  onOpenFile,
  live,
  style,
  onStyleChange,
}: {
  directory: string;
  path: string;
  mode: 'working' | 'branch';
  sessionID: string;
  onOpenFile: () => void;
  live: boolean;
  style: 'unified' | 'split';
  onStyleChange: (style: 'unified' | 'split') => void;
}) {
  const query = useQuery({
    queryKey: ['workspace', 'diff', directory, mode, path],
    queryFn: ({ signal }) => api.diff(directory, mode, path, signal),
    gcTime: 0,
    refetchInterval: live ? false : 15_000,
  });
  const patch = query.data?.patch;
  const { variant } = useTheme();
  const [parsed, setParsed] = useState<{
    source: string;
    file?: FileDiffMetadata;
    error?: string;
  }>();
  const [selection, setSelection] = useState<CodeViewLineSelection | null>(null);
  const [pending, setPending] = useState<AnnotationTarget>();
  const [pendingText, setPendingText] = useState('');
  const drafts = useDraftStore();
  const comments = useStore(drafts, (state) => state.drafts[sessionID]?.comments ?? EMPTY_COMMENTS);
  useEffect(() => {
    if (!patch) return;
    const worker = new Worker(new URL('./diff.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ file?: FileDiffMetadata; error?: string }>) => {
      setParsed({ source: patch, ...event.data });
      worker.terminate();
    };
    worker.onerror = () => {
      setParsed({ source: patch, error: 'Could not prepare this diff.' });
      worker.terminate();
    };
    worker.postMessage({ patch, path, key: `${directory}:${mode}:${path}:${crypto.randomUUID()}` });
    return () => worker.terminate();
  }, [patch, path, directory, mode]);
  const file = parsed?.source === patch ? parsed?.file : undefined;
  const beginComment = useCallback(
    (range: SelectedLineRange) => {
      if (!file) return;
      setPendingText('');
      setPending({
        ...diffComment(path, file, range),
        directory,
        diffMode: mode,
        anchor: { line: range.end, side: range.endSide ?? range.side ?? 'additions' },
      });
    },
    [file, path, directory, mode],
  );
  const closeComment = () => {
    setPending(undefined);
    setSelection(null);
  };
  const items = useMemo(() => {
    if (!file) return [];
    const annotations: DiffLineAnnotation<{
      comments: ReviewComment[];
      pending?: AnnotationTarget;
    }>[] = [];
    function group(target: AnnotationTarget) {
      const anchor = target.anchor!;
      let annotation = annotations.find(
        (item) => item.lineNumber === anchor.line && item.side === anchor.side,
      );
      if (!annotation) {
        annotation = { lineNumber: anchor.line, side: anchor.side, metadata: { comments: [] } };
        annotations.push(annotation);
      }
      return annotation.metadata;
    }
    for (const comment of comments) {
      const target = comment.target;
      if (
        !('path' in target) ||
        target.path !== path ||
        target.directory !== directory ||
        target.diffMode !== mode ||
        !target.anchor
      )
        continue;
      if (
        target.start &&
        diffComment(path, file, {
          start: target.start,
          end: target.end ?? target.start,
          side: target.side === 'old' ? 'deletions' : 'additions',
        }).quote !== target.quote
      )
        continue;
      group(target).comments.push(comment);
    }
    if (pending) group(pending).pending = pending;
    // CodeView intentionally ignores changed item objects without a version change.
    let version = 2166136261;
    for (const char of `${file.cacheKey}:${JSON.stringify(annotations)}`)
      version = Math.imul(version ^ char.charCodeAt(0), 16777619);
    return [
      { id: path, type: 'diff' as const, fileDiff: file, annotations, version: version >>> 0 },
    ];
  }, [file, path, directory, mode, comments, pending]);
  const options = useMemo(
    () => ({
      theme: { dark: 'pierre-dark' as const, light: 'pierre-light' as const },
      themeType: variant,
      diffStyle: style,
      disableFileHeader: true,
      enableLineSelection: !pending,
      enableGutterUtility: !pending,
      onGutterUtilityClick: beginComment,
      overflow: 'scroll' as const,
      unsafeCSS: diffCSS,
      tokenizeMaxLineLength: 2000,
      maxLineDiffLength: 2000,
      hunkSeparators: 'line-info' as const,
    }),
    [variant, style, pending, beginComment],
  );
  const range = selection?.range;
  return (
    <div className="wb-diff-preview">
      <div className="wb-subtoolbar">
        <select
          aria-label="Diff layout"
          value={style}
          onChange={(event) => onStyleChange(event.target.value as typeof style)}
        >
          <option value="unified">Unified</option>
          <option value="split">Split</option>
        </select>
        <div className="wb-actions">
          <Button
            variant="ghost"
            size="sm"
            disabled={!selection}
            onClick={() => range && beginComment(range)}
          >
            Comment
          </Button>
          {query.data?.status !== 'deleted' && (
            <Button variant="ghost" size="sm" onClick={onOpenFile}>
              Edit file
            </Button>
          )}
        </div>
      </div>
      <QueryError query={query} />
      {parsed?.source === patch && parsed?.error && (
        <p className="wb-empty" role="alert">
          {parsed.error}
        </p>
      )}
      {query.isPending || (patch && parsed?.source !== patch) ? (
        <p className="wb-empty" role="status">
          Loading diff…
        </p>
      ) : !patch || (parsed && !file && !parsed.error) ? (
        <p className="wb-empty">No text diff available.</p>
      ) : null}
      {file && (
        <CodeView
          className="wb-pierre-diff"
          items={items}
          options={options}
          selectedLines={selection}
          onSelectedLinesChange={setSelection}
          renderAnnotation={(annotation) => (
            <div>
              {annotation.metadata.comments.map((comment) => (
                <CommentCard key={comment.id} sessionID={sessionID} comment={comment} />
              ))}
              {annotation.metadata.pending && (
                <Annotation
                  sessionID={sessionID}
                  target={annotation.metadata.pending}
                  value={pendingText}
                  onChange={setPendingText}
                  onClose={closeComment}
                />
              )}
            </div>
          )}
        />
      )}
    </div>
  );
}
