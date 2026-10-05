import { useCallback, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useIsMutating } from '@tanstack/react-query';
import { useStore } from 'zustand';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { WorkspaceFile } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { markdownUrl } from '../../lib/markdown-url';
import { MarkdownLink } from '../chat/markdown-link';
import { MarkdownTable } from '../chat/markdown-table';
import { MarkdownImage } from '../chat/markdown-image';
import { editorKey, useEditorDrafts } from './editor-drafts';
import { resolveFileLink } from './file-link';
import { TextSelection, type TextSelectionHandle } from '../chat/text-selection';
import { markdownSourcePositions, markdownSelectionTarget } from './markdown-selection';
import './markdown-file.css';

// Larger documents retain the virtualized source editor instead of an unbounded DOM.
const previewLimit = 200_000;

export function MarkdownFile({
  directory,
  path,
  file,
  sessionID,
  source,
  onComment,
}: {
  directory: string;
  path: string;
  file: Extract<WorkspaceFile, { kind: 'text' }>;
  sessionID: string;
  source: ReactNode;
  onComment: () => void;
}) {
  const drafts = useEditorDrafts();
  const key = editorKey(directory, path);
  const dirty = useStore(drafts, (state) => Boolean(state.edits[key]));
  const [mode, setMode] = useState<'preview' | 'source'>(() =>
    dirty || file.text.length > previewLimit ? 'source' : 'preview',
  );
  const saving = useIsMutating({ mutationKey: ['file-save', directory, path] }) > 0;
  const selection = useRef<TextSelectionHandle>(null);
  return (
    <div className="wb-markdown-file">
      <div className="wb-subtoolbar">
        <div className="wb-markdown-modes" role="group" aria-label="Markdown view">
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={mode === 'preview'}
            disabled={saving}
            onClick={() => setMode('preview')}
          >
            Preview
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={mode === 'source'}
            disabled={saving}
            onClick={() => setMode('source')}
          >
            Source
          </Button>
        </div>
        {mode === 'preview' && (
          <div className="wb-actions">
            {dirty && <span className="wb-note">Unsaved edits</span>}
            <Button
              variant="ghost"
              size="sm"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => {
                if (!selection.current?.comment()) onComment();
              }}
            >
              Comment
            </Button>
          </div>
        )}
      </div>
      {mode === 'source' ? (
        source
      ) : (
        <MarkdownPreview
          directory={directory}
          path={path}
          file={file}
          sessionID={sessionID}
          selection={selection}
          onSource={() => setMode('source')}
        />
      )}
    </div>
  );
}

function MarkdownPreview({
  directory,
  path,
  file,
  sessionID,
  selection,
  onSource,
}: {
  directory: string;
  path: string;
  file: Extract<WorkspaceFile, { kind: 'text' }>;
  sessionID: string;
  selection: RefObject<TextSelectionHandle | null>;
  onSource: () => void;
}) {
  const drafts = useEditorDrafts();
  const doc = useStore(drafts, (state) => state.edits[editorKey(directory, path)]?.state.doc);
  const content = useMemo(
    () => doc?.sliceString(0, doc.length, file.text.includes('\r\n') ? '\r\n' : '\n') ?? file.text,
    [doc, file.text],
  );
  const scope = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => content.split('\n'), [content]);
  const getTarget = useCallback(
    (range: Range, quote: string) =>
      markdownSelectionTarget(range, quote, { directory, path, version: file.version }, lines),
    [directory, path, file.version, lines],
  );
  const base = [directory.replace(/\/$/, ''), ...path.split('/').slice(0, -1)].join('/') || '/';
  const transform = useCallback(
    (url: string, key: string) => {
      const target = resolveFileLink(url, base);
      if (target)
        return `file://${`${target.directory}/${target.path}`.split('/').map(encodeURIComponent).join('/')}`;
      return markdownUrl(url, key);
    },
    [base],
  );
  const components = useMemo<Components>(
    () => ({
      a: MarkdownLink,
      table: MarkdownTable,
      img: ({ src, alt }) => <MarkdownImage key={src} src={src} alt={alt} sessionID={sessionID} />,
    }),
    [sessionID],
  );
  if (content.length > previewLimit)
    return (
      <div className="wb-empty">
        <p>This document is too large for rendered preview.</p>
        <Button variant="secondary" size="sm" onClick={onSource}>
          View source
        </Button>
      </div>
    );
  return (
    <div
      ref={scope}
      className="wb-markdown-scroll"
      tabIndex={0}
      aria-label={`Markdown preview: ${path}`}
    >
      <article
        className="markdown wb-markdown-prose"
        onClickCapture={(event) => {
          const link = (event.target as HTMLElement).closest('a');
          const href = link?.getAttribute('href');
          if (!href?.startsWith('#')) return;
          event.preventDefault();
          event.stopPropagation();
          let id: string;
          try {
            id = decodeURIComponent(href.slice(1));
          } catch {
            return;
          }
          const headings = event.currentTarget.querySelectorAll('h1, h2, h3, h4, h5, h6');
          const counts = new Map<string, number>();
          for (const heading of headings) {
            const slug = (heading.textContent ?? '')
              .toLowerCase()
              .replace(/[^\p{L}\p{N}\s_-]/gu, '')
              .replace(/\s/g, '-');
            const count = counts.get(slug) ?? 0;
            counts.set(slug, count + 1);
            if ((count ? `${slug}-${count}` : slug) === id) {
              heading.scrollIntoView({ block: 'start' });
              break;
            }
          }
        }}
      >
        <Markdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[markdownSourcePositions]}
          components={components}
          urlTransform={transform}
        >
          {content}
        </Markdown>
      </article>
      <TextSelection
        scope={scope}
        handle={selection}
        sessionID={sessionID}
        getTarget={getTarget}
        highlightName="preview-comment"
        actionsLabel="Selected preview actions"
        className="ink"
      />
    </div>
  );
}
