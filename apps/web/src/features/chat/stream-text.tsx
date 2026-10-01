import { useQuery } from '@tanstack/react-query';
import { memo, useCallback, useRef } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { LivePart } from './stream';
import { ResponseMarks } from './response-marks';

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
  const root = useRef<HTMLDivElement>(null);
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
    <div
      className={kind === 'reasoning' ? 'reasoning-text' : 'markdown'}
      ref={root}
      data-response-id={kind === 'text' ? messageID : undefined}
      data-response-ordinal={kind === 'text' ? ordinal : undefined}
    >
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
      {kind === 'text' && (
        <ResponseMarks
          root={root}
          sessionID={sessionID}
          messageID={messageID}
          ordinal={ordinal}
          text={stream.data}
        />
      )}
    </div>
  );
});
