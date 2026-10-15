import type { PromptFileAttachment, PromptMention } from '@opencodex/contracts';

/** A mention picked from the `@` menu. Its `@` token in the draft text carries it. */
export type DraftMention = Readonly<
  | { type: 'file'; path: string; token: string }
  | { type: 'skill'; id: string; token: string }
  | { type: 'chat'; id: string; token: string }
>;
export const EMPTY_MENTIONS: readonly DraftMention[] = [];

const BEFORE = /[\s([{"'`]/;
const AFTER = /[\s)\]}"'`,.;:!?]/;

/** A whole-token occurrence, so `@a.ts` is not found inside `@a.tsx`. */
export function findMention(text: string, token: string, from = 0) {
  for (let index = text.indexOf(token, from); index >= 0; index = text.indexOf(token, index + 1)) {
    const before = text[index - 1];
    const after = text[index + token.length];
    if ((before === undefined || BEFORE.test(before)) && (after === undefined || AFTER.test(after)))
      return index;
  }
  return -1;
}

/** The `@query` typed just before the caret, if the caret is inside one. */
export function mentionQuery(text: string, caret: number) {
  for (let index = caret - 1; index >= 0 && caret - index <= 128; index--) {
    const char = text[index]!;
    if (char === '@')
      return index === 0 || BEFORE.test(text[index - 1]!)
        ? { start: index, query: text.slice(index + 1, caret) }
        : undefined;
    if (/\s/.test(char)) return;
  }
}

/** Native mention ranges for the tokens still present in the text being sent. */
export function promptMentions(
  text: string,
  mentions: readonly DraftMention[] = EMPTY_MENTIONS,
): PromptMention[] {
  return mentions.flatMap((item): PromptMention[] => {
    const start = findMention(text, item.token);
    if (start < 0) return [];
    const mention = { start, end: start + item.token.length, text: item.token };
    return [
      item.type === 'file'
        ? { type: 'file', path: item.path, mention }
        : { type: item.type, id: item.id, mention },
    ];
  });
}

type SentMentions = {
  files?: readonly PromptFileAttachment[];
  skills?: readonly { id: string; mention?: PromptMention['mention'] }[];
};

/** Mentions of a sent message, restored into the composer by undo. */
export function sentMentions(message: SentMentions): DraftMention[] {
  return [
    ...(message.files ?? []).flatMap((file): DraftMention[] => {
      if (!file.mention) return [];
      const token = file.mention.text;
      if (file.source.type === 'uri') return [{ type: 'file', path: token.slice(1), token }];
      const id = /\(([^()\s]+)\)$/.exec(file.description ?? '')?.[1];
      return id ? [{ type: 'chat', id, token }] : [];
    }),
    ...(message.skills ?? []).flatMap((skill): DraftMention[] =>
      skill.mention ? [{ type: 'skill', id: skill.id, token: skill.mention.text }] : [],
    ),
  ];
}

/** Sorted, non-overlapping mention ranges of a sent message that still match its text. */
export function sentMentionRanges(text: string, message: SentMentions) {
  const ranges = [
    ...(message.files ?? []).flatMap((file) =>
      file.mention ? [{ ...file.mention, kind: file.source.type === 'uri' ? 'file' : 'chat' }] : [],
    ),
    ...(message.skills ?? []).flatMap((skill) =>
      skill.mention ? [{ ...skill.mention, kind: 'skill' }] : [],
    ),
  ]
    .filter((range) => text.slice(range.start, range.end) === range.text)
    .sort((a, b) => a.start - b.start);
  let end = 0;
  return ranges.filter((range) => {
    if (range.start < end) return false;
    end = range.end;
    return true;
  });
}
