import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { PromptFileAttachment } from '@opencodex/contracts';

const DocumentPreview = lazy(() =>
  import('./document-preview').then((module) => ({ default: module.DocumentPreview })),
);

export function FileDownload({
  file,
  className,
  children,
  downloadOnly = false,
}: {
  file: File | PromptFileAttachment;
  className: string;
  children: ReactNode;
  downloadOnly?: boolean;
}) {
  const [preview, setPreview] = useState(false);
  const objectURL = useRef<string | undefined>(undefined);
  useEffect(
    () => () => {
      if (objectURL.current) URL.revokeObjectURL(objectURL.current);
      objectURL.current = undefined;
    },
    [file],
  );
  const name = file.name || 'attachment';
  const canPreview = !downloadOnly && /\.docx$/i.test(name);
  return (
    <>
      <button
        type="button"
        className={className}
        aria-label={`${canPreview ? 'Preview' : 'Download'} ${name}`}
        title={`${canPreview ? 'Preview' : 'Download'} ${name}`}
        onClick={() => {
          if (canPreview) {
            setPreview(true);
            return;
          }
          // Create the download only on demand, keeping large base64 URLs out of rendered rows.
          const link = document.createElement('a');
          link.href =
            file instanceof File
              ? (objectURL.current ??= URL.createObjectURL(file))
              : `data:${file.mime};base64,${file.data}`;
          link.download = name;
          document.body.append(link);
          link.click();
          link.remove();
        }}
      >
        {children}
      </button>
      {preview &&
        createPortal(
          <Suspense fallback={null}>
            <DocumentPreview file={file} onClose={() => setPreview(false)} />
          </Suspense>,
          window.document.body,
        )}
    </>
  );
}
