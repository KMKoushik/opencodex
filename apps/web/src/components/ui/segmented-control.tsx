import { useRef, type KeyboardEvent, type ReactNode } from 'react';

type Option<T extends string> = { value: T; label: string; icon?: ReactNode; badge?: ReactNode };

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  iconOnly = false,
}: {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  iconOnly?: boolean;
}) {
  const group = useRef<HTMLDivElement>(null);

  function move(event: KeyboardEvent, index: number) {
    const offset = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!offset) return;
    event.preventDefault();
    const next = options[(index + offset + options.length) % options.length]!;
    onChange(next.value);
    group.current?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus();
  }

  return (
    <div
      ref={group}
      className="segmented"
      data-icon-only={iconOnly || undefined}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          data-value={option.value}
          aria-checked={option.value === value}
          aria-label={iconOnly ? option.label : undefined}
          data-tooltip={iconOnly ? option.label : undefined}
          tabIndex={option.value === value ? 0 : -1}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => move(event, index)}
        >
          {option.icon}
          {(!iconOnly || !option.icon) && option.label}
          {option.badge !== undefined && <span className="segmented-badge">{option.badge}</span>}
        </button>
      ))}
    </div>
  );
}
