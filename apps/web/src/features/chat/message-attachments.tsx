import { memo } from 'react';
import type { PromptFileAttachment } from '@opencodex/contracts';
import { ImageAttachment } from './image-attachment';
import { FileDownload } from './file-download';

export const MessageAttachments = memo(function MessageAttachments({
  files,
}: {
  files?: PromptFileAttachment[];
}) {
  if (!files?.length) return null;
  return (
    <ul className="message-attachments" aria-label="Attached files">
      {files.map((file, index) => (
        <li key={index}>
          {/^image\/(png|jpeg|gif|webp)$/.test(file.mime) ? (
            <ImageAttachment
              source={`data:${file.mime};base64,${file.data}`}
              name={file.name || 'Attached image'}
            />
          ) : (
            <FileDownload file={file} className="message-file-card">
              <span className="truncate" title={file.name}>
                {file.name || file.mime}
              </span>
              <span className="message-file-type truncate">
                {file.mime === 'application/pdf'
                  ? 'PDF'
                  : file.name?.includes('.')
                    ? file.name.split('.').at(-1)?.toUpperCase()
                    : 'File'}
              </span>
            </FileDownload>
          )}
        </li>
      ))}
    </ul>
  );
});
