import type { ReactNode } from 'react';
import type { PromptFileAttachment, PromptMention } from '@opencodex/contracts';
import { sentMentionRanges } from './mentions';

/** A sent message's text, with its mentions as pills where OpenCode recorded them. */
export function MessageText({
  text,
  files,
  skills,
}: {
  text: string;
  files?: readonly PromptFileAttachment[];
  skills?: readonly { id: string; mention?: PromptMention['mention'] }[];
}) {
  const ranges = files?.length || skills?.length ? sentMentionRanges(text, { files, skills }) : [];
  if (!ranges.length) return text;
  const parts: ReactNode[] = [];
  let at = 0;
  for (const range of ranges) {
    parts.push(text.slice(at, range.start));
    parts.push(
      <span className="mention" data-kind={range.kind} key={range.start}>
        {range.text}
      </span>,
    );
    at = range.end;
  }
  parts.push(text.slice(at));
  return parts;
}
