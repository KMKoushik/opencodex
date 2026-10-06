import { api } from '../../lib/api';
import './video-viewer.css';

export function PdfViewer({
  directory,
  path,
  bytes,
}: {
  directory: string;
  path: string;
  bytes: number;
}) {
  return (
    <div className="wb-video-viewer">
      <div className="wb-subtoolbar">
        <span className="wb-note">
          {new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(
            bytes / (1024 * 1024),
          )}{' '}
          MiB · PDF
        </span>
      </div>
      {/* Chromium's viewer streams byte ranges; a size change reloads a regenerated file. */}
      <iframe
        key={bytes}
        className="wb-pdf-frame"
        src={api.mediaURL(directory, path)}
        title={path}
      />
    </div>
  );
}
