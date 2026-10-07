import { useEffect, useRef } from 'react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { PromptFileAttachment } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { DocxViewer } from '../workbench/docx-viewer';
import { FileDownload } from './file-download';

export function DocumentPreview({
  file,
  onClose,
}: {
  file: File | PromptFileAttachment;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="docx-preview-dialog"
      aria-label={`Document preview: ${file.name}`}
      onClose={(event) => {
        if (!event.currentTarget.open) onClose();
      }}
    >
      <header>
        <span className="truncate" title={file.name}>
          {file.name}
        </span>
        <FileDownload file={file} className="button button-ghost" downloadOnly>
          Download
        </FileDownload>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close document preview"
          title="Close (Esc)"
          onClick={() => dialog.current?.close()}
        >
          <HugeiconsIcon icon={Cancel01Icon} size={20} />
        </Button>
      </header>
      <DocxViewer
        source={file instanceof File ? file : file.data}
        name={file.name ?? 'Word document'}
      />
    </dialog>
  );
}
