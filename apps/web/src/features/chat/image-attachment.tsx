import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '../../components/ui/button';

/** Blob previews belong to this mounted thumbnail, not the draft or query cache. */
export function ImageAttachment({
  source,
  name,
  className,
  onError,
  onOpen,
}: {
  source: File | string;
  name: string;
  className?: string;
  onError?: () => void;
  onOpen?: () => boolean;
}) {
  const image = useRef<HTMLImageElement>(null);
  const [preview, setPreview] = useState<string>();
  useEffect(() => {
    if (typeof source === 'string') return;
    const url = URL.createObjectURL(source);
    if (image.current) image.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [source]);
  return (
    <>
      <button
        type="button"
        className="image-attachment-trigger"
        aria-label={`Preview ${name}`}
        title={`Preview ${name}`}
        onClick={() => {
          if (onOpen?.()) return;
          if (image.current?.src) setPreview(image.current.src);
        }}
      >
        <img
          ref={image}
          className={className}
          src={typeof source === 'string' ? source : undefined}
          alt={name}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={onError}
        />
      </button>
      {preview &&
        createPortal(
          <ImagePreview src={preview} name={name} onClose={() => setPreview(undefined)} />,
          document.body,
        )}
    </>
  );
}

function ImagePreview({ src, name, onClose }: { src: string; name: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const backdropPress = useRef(false);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="image-preview"
      aria-label={`Image preview: ${name}`}
      onClose={(event) => {
        // StrictMode reopens the dialog before the cleanup's queued close event arrives.
        if (!event.currentTarget.open) onClose();
      }}
      onPointerDown={(event) => {
        backdropPress.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (backdropPress.current && event.target === event.currentTarget) dialog.current?.close();
      }}
    >
      <div className="image-preview-content">
        <header className="image-preview-header">
          <span className="truncate" title={name}>
            {name}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close image preview"
            title="Close image preview (Esc)"
            onClick={() => dialog.current?.close()}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={20} />
          </Button>
        </header>
        <img
          className="image-preview-full"
          src={src}
          alt={name}
          decoding="async"
          referrerPolicy="no-referrer"
        />
      </div>
    </dialog>
  );
}
