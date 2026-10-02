import { lazy, Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { QueryError } from './query-error';
import { Annotation, type AnnotationTarget } from './annotation';
import { ImageViewer } from './image-viewer';
import { FileLinkContext } from './file-link-context';
const MarkdownFile = lazy(() =>
  import('./markdown-file').then((module) => ({ default: module.MarkdownFile })),
);
const FileEditor = lazy(() =>
  import('./file-editor').then((module) => ({ default: module.FileEditor })),
);
export function FilePreview({
  directory,
  path,
  sessionID,
  live,
  onOpenFile,
}: {
  directory: string;
  path: string;
  sessionID: string;
  live: boolean;
  onOpenFile: (href: string) => boolean;
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
    <FileLinkContext.Provider value={onOpenFile}>
      <QueryError query={query} />
      {query.isPending && (
        <p className="wb-empty" role="status">
          Loading file…
        </p>
      )}
      {query.data?.kind === 'text' && (
        <Suspense fallback={<p className="wb-empty">Loading editor…</p>}>
          {/\.(?:md|markdown|mdown)$/i.test(path) ? (
            <MarkdownFile
              directory={directory}
              path={path}
              file={query.data}
              sessionID={sessionID}
              onComment={() => setAnnotation({ path, directory })}
              source={
                <FileEditor
                  directory={directory}
                  path={path}
                  file={query.data}
                  sessionID={sessionID}
                />
              }
            />
          ) : (
            <FileEditor directory={directory} path={path} file={query.data} sessionID={sessionID} />
          )}
        </Suspense>
      )}
      {query.data?.kind === 'image' && (
        <ImageViewer
          src={query.data.uri}
          name={path}
          bytes={query.data.bytes}
          onComment={(quote) => setAnnotation({ path, directory, quote })}
        />
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
    </FileLinkContext.Provider>
  );
}
