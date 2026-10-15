import { BubbleChatIcon, File01Icon, Layers01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { findMention, type DraftMention } from './mentions';
import type { MentionOption } from './mention-options';

const icons = { skill: Layers01Icon, file: File01Icon, chat: BubbleChatIcon };

export function MentionMenu({
  id,
  options,
  active,
  loading,
  failed,
  onRetry,
  onHover,
  onChoose,
}: {
  id: string;
  options: readonly MentionOption[];
  active: number;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onHover: (index: number) => void;
  onChoose: (option: MentionOption) => void;
}) {
  return (
    <div className="slash-menu mention-menu" id={id} role="listbox" aria-label="Mentions">
      {options.map((option, index) => (
        <button
          type="button"
          role="option"
          id={`${id}-${index}`}
          aria-selected={index === active}
          key={option.key}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => onHover(index)}
          onClick={() => onChoose(option)}
        >
          <HugeiconsIcon icon={icons[option.mention.type]} size={16} aria-hidden="true" />
          <span>{option.label}</span>
          {option.detail && <small>{option.detail}</small>}
        </button>
      ))}
      {failed && (
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onRetry}>
          Some results could not load. Retry
        </button>
      )}
      {!options.length && !failed && <p>{loading ? 'Searching…' : 'No matches'}</p>}
    </div>
  );
}

/** Pills behind the textarea's own text; it mirrors the textarea's wrapping and scroll. */
export function MentionHighlight({
  text,
  mentions,
  ref,
}: {
  text: string;
  mentions: readonly DraftMention[];
  ref: React.Ref<HTMLDivElement>;
}) {
  const parts: React.ReactNode[] = [];
  const ranges = mentions
    .flatMap((item) => {
      const found: { start: number; end: number; type: DraftMention['type'] }[] = [];
      for (let index = 0; ;) {
        index = findMention(text, item.token, index);
        if (index < 0) break;
        found.push({ start: index, end: index + item.token.length, type: item.type });
        index += item.token.length;
      }
      return found;
    })
    .sort((a, b) => a.start - b.start);
  let at = 0;
  for (const range of ranges) {
    if (range.start < at) continue;
    parts.push(text.slice(at, range.start));
    parts.push(
      <mark className="mention" data-kind={range.type} key={range.start}>
        {text.slice(range.start, range.end)}
      </mark>,
    );
    at = range.end;
  }
  // A trailing newline needs content after it to take up a line, as it does in the textarea.
  parts.push(`${text.slice(at)}\u200b`);
  return (
    <div className="composer-mentions" ref={ref} aria-hidden="true">
      {parts}
    </div>
  );
}
