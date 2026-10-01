import { useQuery } from '@tanstack/react-query';
import { memo, useCallback } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { LivePart } from './stream';

const noParts: LivePart[] = [];
export const StreamText = memo(function StreamText({
  sessionID,
  messageID,
  kind = 'text',
  ordinal,
  text,
  completed,
}: {
  sessionID: string;
  messageID: string;
  kind?: 'text' | 'reasoning';
  ordinal: number;
  text: string;
  completed: boolean;
}) {
  const select = useCallback(
    (parts: LivePart[]) =>
      completed
        ? text
        : (parts.find(
            (part) =>
              part.messageID === messageID && part.type === kind && part.ordinal === ordinal,
          )?.text ?? text),
    [completed, text, messageID, kind, ordinal],
  );
  const stream = useQuery({
    queryKey: ['chat', sessionID, 'stream'],
    queryFn: () => noParts,
    enabled: false,
    initialData: noParts,
    select,
    gcTime: 0,
  });
  if (!stream.data) return null;
  return (
    <div className={kind === 'reasoning' ? 'reasoning-text' : 'markdown'}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          img: ({ alt }) => <span>[Image: {alt || 'attachment'}]</span>,
        }}
      >
        {stream.data}
      </Markdown>
    </div>
  );
});
