import type { ReactNode } from 'react';

export function MarkdownTable({ children }: { children?: ReactNode }) {
  return (
    <div className="markdown-table-scroll" role="region" aria-label="Table" tabIndex={0}>
      <table>{children}</table>
    </div>
  );
}
