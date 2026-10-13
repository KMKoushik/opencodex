import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon, ArrowUp01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { Button } from '../../components/ui/button';
import './find.css';

export type FindBarProps = {
  label: string;
  query: string;
  /** Zero-based active match, or -1 when none is selected. */
  index: number;
  total: number;
  capped?: boolean;
  /** Changes whenever Mod+F is pressed again, so the input refocuses and selects. */
  focusRequest?: number;
  onQueryChange: (query: string) => void;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
};

/** One find bar for code, documents, and chats; each surface supplies its own matcher. */
export function FindBar({
  label,
  query,
  index,
  total,
  capped,
  focusRequest,
  onQueryChange,
  onNext,
  onPrevious,
  onClose,
}: FindBarProps) {
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    input.current?.focus({ preventScroll: true });
    input.current?.select();
  }, [focusRequest]);
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) onPrevious();
      else onNext();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === 'g' && (event.metaKey || event.ctrlKey) && !event.altKey) {
      event.preventDefault();
      if (event.shiftKey) onPrevious();
      else onNext();
    }
  };
  const status = !query
    ? ''
    : total === 0
      ? 'No results'
      : `${index < 0 ? '–' : index + 1}/${total}${capped ? '+' : ''}`;
  return (
    <div className="find-bar" role="search" aria-label={label} data-find-skip="">
      <input
        className="find-input"
        ref={input}
        main-field="true"
        type="text"
        value={query}
        placeholder={label}
        aria-label={label}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={keyDown}
      />
      <span
        className="find-count"
        data-empty={query && total === 0 ? '' : undefined}
        aria-live="polite"
      >
        {status}
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Previous match"
        disabled={total === 0}
        onClick={onPrevious}
      >
        <HugeiconsIcon icon={ArrowUp01Icon} size={14} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Next match"
        disabled={total === 0}
        onClick={onNext}
      >
        <HugeiconsIcon icon={ArrowDown01Icon} size={14} />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Close find" onClick={onClose}>
        <HugeiconsIcon icon={Cancel01Icon} size={14} />
      </Button>
    </div>
  );
}
