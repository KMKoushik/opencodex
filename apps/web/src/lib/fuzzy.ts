export type FuzzyMatch = { score: number; positions: number[] };

// fzf's scoring constants: a matched character, gap penalties, and bonuses for
// characters that start a word, so `oc` prefers `open-codex` over `rococo`.
const MATCH = 16;
const GAP_START = -3;
const GAP_EXTENSION = -1;
const BOUNDARY = 8;
const CAMEL = 7;
const CONSECUTIVE = 4;
const FIRST_CHAR_MULTIPLIER = 2;

const kind = (char: string | undefined) =>
  char === undefined || /[\s/\\_\-.:]/.test(char)
    ? 'separator'
    : /\d/.test(char)
      ? 'digit'
      : char !== char.toLowerCase()
        ? 'upper'
        : 'lower';

function bonus(text: string, index: number) {
  const previous = kind(text[index - 1]);
  const current = kind(text[index]);
  if (current === 'separator') return 0;
  if (previous === 'separator') return BOUNDARY;
  if (
    (previous === 'lower' && current === 'upper') ||
    (previous !== 'digit' && current === 'digit')
  )
    return CAMEL;
  return 0;
}

/**
 * fzf's v1 match: find the first window holding the query in order, shrink it from the
 * end, then score it. Smart case: an uppercase letter in the query makes it case-sensitive.
 */
export function fuzzyMatch(text: string, query: string): FuzzyMatch | undefined {
  if (!query) return { score: 0, positions: [] };
  const haystack = query === query.toLowerCase() ? text.toLowerCase() : text;
  let found = 0;
  let end = -1;
  for (let index = 0; index < haystack.length; index++)
    if (haystack[index] === query[found] && ++found === query.length) {
      end = index;
      break;
    }
  if (end < 0) return;
  let start = end;
  for (let index = end, at = query.length - 1; at >= 0; index--)
    if (haystack[index] === query[at]) {
      start = index;
      at--;
    }
  const positions: number[] = [];
  let score = 0;
  let previous = -1;
  for (let index = start, at = 0; at < query.length; index++) {
    if (haystack[index] !== query[at]) continue;
    const gained = bonus(text, index);
    score += MATCH + (at === 0 ? gained * FIRST_CHAR_MULTIPLIER : gained);
    if (previous >= 0)
      score +=
        index === previous + 1 ? CONSECUTIVE : GAP_START + GAP_EXTENSION * (index - previous - 2);
    positions.push(index);
    previous = index;
    at++;
  }
  if (haystack === query) score += MATCH * query.length;
  return { score, positions };
}

/** Matches ranked best first; ties go to the shorter, then alphabetically earlier, name. */
export function fuzzyRank<T>(
  items: readonly T[],
  query: string,
  text: (item: T) => string,
  limit: number,
) {
  const matches: { item: T; match: FuzzyMatch; text: string }[] = [];
  for (const item of items) {
    const value = text(item);
    const match = fuzzyMatch(value, query);
    if (match) matches.push({ item, match, text: value });
  }
  return matches
    .sort(
      (a, b) =>
        b.match.score - a.match.score ||
        a.text.length - b.text.length ||
        a.text.localeCompare(b.text),
    )
    .slice(0, limit);
}
