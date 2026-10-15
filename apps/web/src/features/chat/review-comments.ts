import type { MessageAnnotations } from '@opencodex/contracts';

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
/** Marks on a browser panel page or a canvas (`canvas:<id>`); the quote describes them. */
export type PageCommentTarget = Readonly<{
  url: string;
  title?: string;
  quote: string;
  screenshot?: boolean;
}>;
export type CommentTarget = FileCommentTarget | ResponseCommentTarget | PageCommentTarget;
export type ReviewComment = Readonly<{ id: string; target: CommentTarget; text: string }>;
export const EMPTY_COMMENTS: readonly ReviewComment[] = [];

export function commentQuote(target: CommentTarget) {
  return ('previewQuote' in target ? target.previewQuote : undefined) ?? target.quote;
}

export function commentLabel(target: CommentTarget) {
  if ('messageID' in target) return 'Assistant response';
  if ('url' in target) return target.title || target.url;
  return `${target.path}${target.start ? `:${target.start}${target.end && target.end !== target.start ? `–${target.end}` : ''}` : ''}${target.side === 'old' ? ' (old)' : ''}`;
}

/** Context stays structured locally; OpenCode receives ordinary prompt text on explicit send. */
export function reviewPrompt(text: string, comments: readonly ReviewComment[] = EMPTY_COMMENTS) {
  return annotatedPrompt(text, comments).text;
}

/** The prompt text, and where the user's text and each comment sit in it for the sent bubble. */
export function annotatedPrompt(
  text: string,
  comments: readonly ReviewComment[] = EMPTY_COMMENTS,
): { text: string; annotations?: MessageAnnotations } {
  if (!comments.length) return { text };
  let prompt = text;
  const counts = { annotation: 0, comment: 0 };
  const items = comments.map(({ target, text: comment }): MessageAnnotations['items'][number] => {
    const kind = 'path' in target ? 'comment' : 'annotation';
    const quote = commentQuote(target);
    const source =
      'messageID' in target
        ? `Assistant response (${target.messageID}, part ${target.ordinal + 1})`
        : 'url' in target
          ? `${target.url.startsWith('canvas:') ? 'canvas' : 'page'} ${target.url}${target.title ? ` ("${target.title}")` : ''}${target.screenshot ? ', shown in the attached screenshot' : ''}`
          : `${target.directory ? `${target.directory}/` : ''}${commentLabel(target)}${target.diffMode ? ` [${target.diffMode} diff]` : ''}`;
    if (prompt) prompt += '\n\n';
    prompt += `${kind === 'comment' ? 'Comment' : 'Annotation'} ${++counts[kind]} on ${source}:\n`;
    const quoted = quote
      ? ([prompt.length, (prompt += quote.replace(/^/gm, '> ')).length] as [number, number])
      : undefined;
    if (quote && comment) prompt += '\n\n';
    const start = prompt.length;
    prompt += comment;
    return {
      kind,
      label: commentLabel(target),
      quote: quoted,
      comment: comment ? [start, prompt.length] : undefined,
    };
  });
  return { text: prompt, annotations: { end: text.length, items } };
}
