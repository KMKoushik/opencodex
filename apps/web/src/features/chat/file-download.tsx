import { useEffect, useRef, type ReactNode } from 'react';
import type { PromptFileAttachment } from '@opencodex/contracts';

export function FileDownload({
  file,
  className,
  children,
}: {
  file: File | PromptFileAttachment;
  className: string;
  children: ReactNode;
}) {
  const objectURL = useRef<string | undefined>(undefined);
  useEffect(
    () => () => {
      if (objectURL.current) URL.revokeObjectURL(objectURL.current);
      objectURL.current = undefined;
    },
    [file],
  );
  const name = file.name || 'attachment';
  return (
    <button
      type="button"
      className={className}
      aria-label={`Download ${name}`}
      title={`Download ${name}`}
      onClick={() => {
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
  );
}
