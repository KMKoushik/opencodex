import { useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { QueryError } from './query-error';
import './docx-viewer.css';

export function DocxViewer({ source, name }: { source: File | string; name: string }) {
  const id = useId();
  const query = useQuery({
    queryKey: ['docx-preview', id],
    queryFn: ({ signal }) => preview(source, signal),
    gcTime: 0,
    staleTime: Infinity,
    retry: false,
  });
  return (
    <div className="wb-docx-viewer">
      <div className="wb-subtoolbar">
        <span className="wb-note">Word document · Read-only preview</span>
      </div>
      <QueryError query={query} />
      {query.isPending && (
        <p className="wb-empty" role="status">
          Loading document…
        </p>
      )}
      {query.data !== undefined && (
        <div className="wb-docx-scroll" tabIndex={0} role="region" aria-label={name}>
          <article className="wb-docx-page" dangerouslySetInnerHTML={{ __html: query.data }} />
        </div>
      )}
    </div>
  );
}

function preview(source: File | string, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const worker = new Worker(new URL('./docx.worker.ts', import.meta.url), { type: 'module' });
    const cleanup = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      worker.terminate();
    };
    const fail = (error: Error) => {
      cleanup();
      reject(error);
    };
    const abort = () => fail(new DOMException('Document preview cancelled.', 'AbortError'));
    const timeout = setTimeout(
      () => fail(new Error('This document took too long to preview. Download it to open in Word.')),
      15_000,
    );
    signal.addEventListener('abort', abort, { once: true });
    worker.onerror = () => fail(new Error('Could not preview this Word document.'));
    worker.onmessage = (event: MessageEvent<{ html?: string; error?: string }>) => {
      cleanup();
      if (event.data.error) {
        reject(new Error(event.data.error));
        return;
      }
      // Documents cannot introduce scripts, styles, embeds, navigation, or remote resources.
      resolve(
        DOMPurify.sanitize(event.data.html ?? '', {
          ALLOWED_TAGS: [
            'p',
            'br',
            'strong',
            'em',
            'u',
            's',
            'sup',
            'sub',
            'h1',
            'h2',
            'h3',
            'h4',
            'h5',
            'h6',
            'ul',
            'ol',
            'li',
            'table',
            'thead',
            'tbody',
            'tr',
            'td',
            'th',
            'blockquote',
            'pre',
            'code',
            'img',
          ],
          ALLOWED_ATTR: ['colspan', 'rowspan', 'src', 'alt'],
        }),
      );
    };
    worker.postMessage(source);
  });
}
