import { useMutation } from '@tanstack/react-query';
import { FolderOpenIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/button';
import './file-reveal.css';

export function FileReveal({ directory, path }: { directory: string; path: string }) {
  const desktop = window.desktop;
  const label =
    desktop?.platform === 'darwin'
      ? 'Finder'
      : desktop?.platform === 'win32'
        ? 'File Explorer'
        : 'Files';
  const reveal = useMutation({
    mutationFn: async () => {
      const target = await api.fileLocation(directory, path);
      await desktop!.revealFile(target.path);
    },
  });
  if (typeof desktop?.revealFile !== 'function') return null;
  return (
    <div className="wb-file-reveal">
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Show in ${label}`}
        title={`Show ${path} in ${label}`}
        disabled={reveal.isPending}
        onClick={() => reveal.mutate()}
      >
        <HugeiconsIcon icon={FolderOpenIcon} size={14} aria-hidden="true" />
        {label}
      </Button>
      {reveal.isError && (
        <div role="alert" className="wb-file-reveal-error">
          <p>{reveal.error.message}</p>
          <Button variant="secondary" size="sm" onClick={() => reveal.mutate()}>
            Retry
          </Button>
          <Button variant="ghost" size="sm" onClick={() => reveal.reset()}>
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}
