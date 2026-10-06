import { useRef, useState } from 'react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/button';
import './video-viewer.css';

export function VideoViewer({
  directory,
  path,
  bytes,
}: {
  directory: string;
  path: string;
  bytes: number;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  return (
    <div className="wb-video-viewer">
      <div className="wb-subtoolbar">
        <span className="wb-note">
          {new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(
            bytes / (1024 * 1024),
          )}{' '}
          MiB · Video
        </span>
      </div>
      <div className="wb-video-viewport">
        <video
          ref={video}
          src={api.mediaURL(directory, path)}
          controls
          playsInline
          preload="metadata"
          aria-label={path}
          onError={() => setFailed(true)}
        />
        {failed && (
          <div className="wb-empty" role="alert">
            <p>
              This video could not be played. Its format or codec may not be supported, or the file
              may no longer be available. You can open it from your file manager in the desktop app.
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setFailed(false);
                video.current?.load();
              }}
            >
              Retry
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
