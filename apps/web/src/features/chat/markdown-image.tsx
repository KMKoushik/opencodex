import { useState } from 'react';
import { ImageAttachment } from './image-attachment';
import './markdown-image.css';

export function MarkdownImage({
  src,
  alt,
  sessionID,
}: {
  src?: string;
  alt?: string;
  sessionID: string;
}) {
  const [failed, setFailed] = useState(false);
  const name = alt || 'Image';
  if (!src) return <span className="markdown-image-error">Image unavailable: {name}</span>;
  const source = /^(?:https?:|data:image\/|\/\/)/i.test(src)
    ? src
    : `/api/sessions/${encodeURIComponent(sessionID)}/image?${new URLSearchParams({ path: localImagePath(src) })}`;
  return (
    <span className="markdown-image">
      {failed ? (
        <span className="markdown-image-error" role="status">
          Could not load image: {name}
          <button type="button" onClick={() => setFailed(false)}>
            Retry
          </button>
        </span>
      ) : (
        <ImageAttachment source={source} name={name} onError={() => setFailed(true)} />
      )}
    </span>
  );
}

function localImagePath(src: string) {
  if (/^file:/i.test(src)) return src;
  try {
    return decodeURIComponent(src);
  } catch {
    return src;
  }
}
