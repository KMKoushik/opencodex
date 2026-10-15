import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

type Option<T extends string> = { value: T; label: string; icon?: ReactNode; badge?: ReactNode };
type Span = { left: number; width: number };

/** Where the thumb is now, so a second click flows on from mid-flight. */
function current(root: HTMLElement, thumb: HTMLElement): Span | undefined {
  if (!thumb.getAnimations().length) return;
  const box = root.getBoundingClientRect();
  const rect = thumb.getBoundingClientRect();
  const scale = root.offsetWidth / box.width || 1;
  return { left: (rect.left - box.left) * scale, width: rect.width * scale };
}

/**
 * Moves the thumb like a drop of liquid: each edge rides its own spring, the leading edge
 * quick and the trailing one lagging, so it stretches out and draws back together. As it
 * stretches it thins to keep its volume and its ends round off; nothing bounces.
 */
function flow(thumb: HTMLElement, from: Span, to: Span) {
  const height = thumb.offsetHeight;
  const forward = to.left > from.left;
  const edges = forward
    ? { lead: [from.left + from.width, to.left + to.width], trail: [from.left, to.left] }
    : { lead: [from.left, to.left], trail: [from.left + from.width, to.left + to.width] };
  // Lightly underdamped lead, critically damped trail: one soft settle, no wobble.
  const springs = [
    { at: edges.lead[0]!, goal: edges.lead[1]!, velocity: 0, omega: 26, zeta: 0.82 },
    { at: edges.trail[0]!, goal: edges.trail[1]!, velocity: 0, omega: 17, zeta: 1 },
  ];
  const step = 1 / 120;
  const frames: Keyframe[] = [];
  for (let t = 0; t < 1; t += step) {
    const [lead, trail] = springs as [(typeof springs)[0], (typeof springs)[0]];
    const left = Math.min(lead.at, trail.at);
    const width = Math.max(1, Math.abs(lead.at - trail.at));
    const rest = from.width + (to.width - from.width) * Math.min(1, Math.max(0, (t * 120) / 40));
    const stretch = Math.max(0, width / rest - 1);
    frames.push({
      transform: `translateX(${left}px) scaleY(${Math.max(0.78, 1 / Math.sqrt(1 + stretch))})`,
      width: `${width}px`,
      borderRadius: `${Math.min(height / 2, 7 + stretch * 14)}px`,
    });
    if (springs.every((s) => Math.abs(s.goal - s.at) < 0.1 && Math.abs(s.velocity) < 2)) break;
    for (const spring of springs) {
      const force =
        spring.omega ** 2 * (spring.goal - spring.at) -
        2 * spring.zeta * spring.omega * spring.velocity;
      spring.velocity += force * step;
      spring.at += spring.velocity * step;
    }
  }
  frames.push({
    transform: `translateX(${to.left}px) scaleY(1)`,
    width: `${to.width}px`,
    borderRadius: '7px',
  });
  thumb.animate(frames, { duration: (frames.length - 1) * step * 1000 });
}

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
  const thumb = useRef<HTMLSpanElement>(null);
  const rest = useRef<Span | null>(null);
  const shown = useRef(value);

  // The thumb rests under the checked option. It stays hidden while the control has no
  // size (in a hidden panel), so it appears in place instead of growing from zero.
  useLayoutEffect(() => {
    const root = group.current!;
    const place = () => {
      const checked = root.querySelector<HTMLElement>('[aria-checked="true"]');
      if (!checked?.offsetWidth) {
        delete root.dataset.placed;
        rest.current = null;
        return;
      }
      rest.current = { left: checked.offsetLeft, width: checked.offsetWidth };
      root.style.setProperty('--thumb-x', `${checked.offsetLeft}px`);
      root.style.setProperty('--thumb-width', `${checked.offsetWidth}px`);
      root.dataset.placed = '';
    };
    const from = shown.current === value ? null : (current(root, thumb.current!) ?? rest.current);
    shown.current = value;
    for (const animation of thumb.current!.getAnimations()) animation.cancel();
    place();
    if (from && rest.current && matchMedia('(prefers-reduced-motion: no-preference)').matches)
      flow(thumb.current!, from, rest.current);
    const observer = new ResizeObserver(place);
    for (const button of root.querySelectorAll('button')) observer.observe(button);
    return () => observer.disconnect();
  }, [value, options.length]);

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
      <span ref={thumb} className="segmented-thumb" aria-hidden="true" />
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
