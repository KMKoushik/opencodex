export type FileCommentTarget = Readonly<{
  path: string;
  directory?: string;
  start?: number;
  end?: number;
  side?: 'old' | 'new';
  quote?: string;
  /** The exact rendered selection; quote retains source lines for anchor validation. */
  previewQuote?: string;
  diffMode?: 'working' | 'branch';
  anchor?: { line: number; side: 'additions' | 'deletions' };
  version?: string;
}>;
export type ResponseCommentTarget = Readonly<{
  messageID: string;
  ordinal: number;
  offset?: number;
  quote: string;
}>;
export type CommentTarget = FileCommentTarget | ResponseCommentTarget;
export type ReviewComment = Readonly<{ id: string; target: CommentTarget; text: string }>;
export const EMPTY_COMMENTS: readonly ReviewComment[] = [];

export function commentQuote(target: CommentTarget) {
  return ('previewQuote' in target ? target.previewQuote : undefined) ?? target.quote;
}

export function commentLabel(target: CommentTarget) {
  if ('messageID' in target) return 'Assistant response';
  return `${target.path}${target.start ? `:${target.start}${target.end && target.end !== target.start ? `–${target.end}` : ''}` : ''}${target.side === 'old' ? ' (old)' : ''}`;
}

/** Context stays structured locally; OpenCode receives ordinary prompt text on explicit send. */
export function reviewPrompt(text: string, comments: readonly ReviewComment[] = EMPTY_COMMENTS) {
  return [
    text,
    ...comments.map(({ target, text: comment }) => {
      const quote = commentQuote(target);
      const source =
        'messageID' in target
          ? `Assistant response (${target.messageID}, part ${target.ordinal + 1})`
          : `${target.directory ? `${target.directory}/` : ''}${commentLabel(target)}${target.diffMode ? ` [${target.diffMode} diff]` : ''}`;
      return `Review comment on ${source}:\n${
        quote
          ? `${quote
              .split('\n')
              .map((line) => `> ${line}`)
              .join('\n')}\n\n`
          : ''
      }${comment}`;
    }),
  ]
    .filter(Boolean)
    .join('\n\n');
}
