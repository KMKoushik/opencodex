import { lazy, Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { QueryError } from './query-error';
import { Annotation, type AnnotationTarget } from './annotation';
import { Button } from '../../components/ui/button';
const FileEditor = lazy(() =>
  import('./file-editor').then((module) => ({ default: module.FileEditor })),
);
export function FilePreview({
  directory,
  path,
  sessionID,
  live,
}: {
  directory: string;
  path: string;
  sessionID: string;
  live: boolean;
}) {
  const [annotation, setAnnotation] = useState<AnnotationTarget>();
  const query = useQuery({
    queryKey: ['workspace', 'file', directory, path],
    queryFn: ({ signal }) => api.file(directory, path, signal),
    gcTime: 0,
    staleTime: 5000,
    refetchInterval: live ? false : 15_000,
  });
  return (
    <>
      <QueryError query={query} />
      {query.isPending && (
        <p className="wb-empty" role="status">
          Loading file…
        </p>
      )}
      {query.data?.kind === 'text' && (
        <Suspense fallback={<p className="wb-empty">Loading editor…</p>}>
          <FileEditor directory={directory} path={path} file={query.data} sessionID={sessionID} />
        </Suspense>
      )}
      {query.data?.kind === 'image' && (
        <>
          <div className="wb-subtoolbar">
            <span className="wb-note">Click a point to annotate</span>
            <Button variant="ghost" size="sm" onClick={() => setAnnotation({ path, directory })}>
              Comment on image
            </Button>
          </div>
          <div className="wb-image">
            <button
              className="wb-image-target"
              aria-label={`Annotate ${path}`}
              onClick={(event) => {
                const image = event.currentTarget.querySelector('img')!;
                const bounds = image.getBoundingClientRect();
                const x = Math.round(
                  Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) * 100,
                );
                const y = Math.round(
                  Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) * 100,
                );
                setAnnotation({
                  path,
                  directory,
                  ...(event.detail
                    ? {
                        quote: `Image point: ${x}% from left, ${y}% from top. Original dimensions: ${image.naturalWidth} × ${image.naturalHeight}.`,
                      }
                    : {}),
                });
              }}
            >
              <img src={query.data.uri} alt={path} />
            </button>
            <p className="wb-note">{path}</p>
          </div>
        </>
      )}
      {query.data?.kind === 'binary' && (
        <p className="wb-empty">
          Binary file · {new Intl.NumberFormat().format(query.data.bytes)} bytes. Text preview is
          unavailable.
        </p>
      )}
      {annotation && (
        <Annotation
          sessionID={sessionID}
          target={annotation}
          onClose={() => setAnnotation(undefined)}
        />
      )}
    </>
  );
}
