import { useQuery } from '@tanstack/react-query';
import { Fragment, memo, useCallback, useMemo, useRef, useState } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { LivePart } from './stream';
import { ResponseMarks } from './response-marks';
import { MarkdownImage } from './markdown-image';
import { MarkdownLink } from './markdown-link';
import { MarkdownTable } from './markdown-table';
import { createBlockSplitter } from './markdown-blocks';
import { usePacedText } from './paced-text';
import { markdownUrl } from '../../lib/markdown-url';
import { markdownHtmlPlugins, mayContainHtml } from '../../lib/markdown-html';

const noParts: LivePart[] = [];
const remarkPlugins = [remarkGfm];

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
  // Text that streams while mounted renders block by block; finished text renders whole.
  const [split] = useState(() => (completed ? undefined : createBlockSplitter()));
  const components = useMemo<Components>(
    () => ({
      a: MarkdownLink,
      table: MarkdownTable,
      img: ({ src, alt }) => <MarkdownImage key={src} src={src} alt={alt} sessionID={sessionID} />,
    }),
    [sessionID],
  );
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
  const shown = usePacedText(stream.data);
  const blocks = useMemo(() => split?.(shown), [split, shown]);
  if (!shown) return null;
  return (
    <div
      className={kind === 'reasoning' ? 'reasoning-text' : 'markdown'}
      ref={root}
      data-streaming={!completed || shown !== stream.data ? '' : undefined}
      data-response-id={kind === 'text' ? messageID : undefined}
      data-response-ordinal={kind === 'text' ? ordinal : undefined}
    >
      {blocks ? (
        // Newlines between blocks keep textContent identical to a whole-document render.
        blocks.map((block, index) => (
          <Fragment key={index}>
            {index > 0 && '\n'}
            <MarkdownBlock source={block} components={components} />
          </Fragment>
        ))
      ) : (
        <MarkdownBlock source={shown} components={components} />
      )}
      {kind === 'text' && (
        <ResponseMarks
          root={root}
          sessionID={sessionID}
          messageID={messageID}
          ordinal={ordinal}
          text={shown}
        />
      )}
    </div>
  );
});

const MarkdownBlock = memo(function MarkdownBlock({
  source,
  components,
}: {
  source: string;
  components: Components;
}) {
  return (
    <Markdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={mayContainHtml(source) ? markdownHtmlPlugins : undefined}
      components={components}
      urlTransform={markdownUrl}
    >
      {source}
    </Markdown>
  );
});
