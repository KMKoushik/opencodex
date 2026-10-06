import { useContext, type ReactNode } from 'react';
import { SourceCodeIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { FileLinkContext } from '../workbench/file-link-context';

export function MarkdownLink({ href, children }: { href?: string; children?: ReactNode }) {
  const openFile = useContext(FileLinkContext);
  const local = Boolean(href) && !/^([a-z][a-z\d+.-]*:|#)/i.test(href!);
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={local ? 'file-link' : undefined}
      onClick={(event) => {
        if (href && openFile?.(href, event)) event.preventDefault();
      }}
      onAuxClick={(event) => {
        if (event.button === 1 && href && openFile?.(href)) event.preventDefault();
      }}
    >
      {local && <HugeiconsIcon icon={SourceCodeIcon} size={13} />}
      {children}
    </a>
  );
}
