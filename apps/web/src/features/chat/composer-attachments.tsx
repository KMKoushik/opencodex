import { memo } from 'react';
import { Attachment01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '../../components/ui/button';
import { attachmentSize, imageAttachment, type DraftAttachment } from './attachments';
import { ImageAttachment } from './image-attachment';
import { FileDownload } from './file-download';

export const ComposerAttachments = memo(function ComposerAttachments({
  attachments,
  onRemove,
}: {
  attachments: readonly DraftAttachment[];
  onRemove: (id: string) => void;
}) {
  if (!attachments.length) return null;
  return (
    <ul className="composer-attachments" aria-label="Attachments">
      {attachments.map((attachment) => {
        const details = (
          <span className="attachment-details">
            <span className="truncate" title={attachment.file.name}>
              {attachment.file.name}
            </span>
            <span className="message-note">{attachmentSize(attachment.file.size)}</span>
          </span>
        );
        return (
          <li className="composer-attachment" key={attachment.id}>
            {imageAttachment(attachment.file) ? (
              <>
                <ImageAttachment
                  source={attachment.file}
                  name={attachment.file.name}
                  className="attachment-thumbnail"
                />
                {details}
              </>
            ) : (
              <FileDownload file={attachment.file} className="composer-file-download">
                <span className="attachment-icon">
                  <HugeiconsIcon icon={Attachment01Icon} size={20} />
                </span>
                {details}
              </FileDownload>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove ${attachment.file.name}`}
              title={`Remove ${attachment.file.name}`}
              onClick={() => onRemove(attachment.id)}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={14} />
            </Button>
          </li>
        );
      })}
    </ul>
  );
});
