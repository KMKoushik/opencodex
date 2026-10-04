import { useEffect, useRef } from 'react';
import './tooltip.css';

const DELAY = 450;
/** Moving between controls soon after a tooltip closes shows the next one at once. */
const WARM = 400;

/**
 * One delegated tooltip for every `[data-tooltip]` element, with an optional
 * `data-shortcut`. Native `title` tooltips are slow and unreliable in Electron. Hover and
 * focus update this single element directly, so no component renders on pointer movement.
 * The tooltip is visual only; controls keep their own accessible names.
 */
export function TooltipLayer() {
  const tip = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const shortcut = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = tip.current!;
    let target: HTMLElement | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closedAt = 0;
    const open = () => element.matches(':popover-open');

    function show(anchor: HTMLElement) {
      const text = anchor.dataset.tooltip;
      if (!text || !anchor.isConnected) return;
      label.current!.textContent = text;
      shortcut.current!.textContent = anchor.dataset.shortcut ?? '';
      shortcut.current!.hidden = !anchor.dataset.shortcut;
      if (!open()) element.showPopover();
      const rect = anchor.getBoundingClientRect();
      const { width, height } = element.getBoundingClientRect();
      const below = rect.bottom + 6;
      const top = below + height > innerHeight - 8 ? rect.top - height - 6 : below;
      const left = rect.left + rect.width / 2 - width / 2;
      element.style.top = `${Math.max(8, top)}px`;
      element.style.left = `${Math.max(8, Math.min(left, innerWidth - width - 8))}px`;
    }
    function hide() {
      clearTimeout(timer);
      if (open()) {
        element.hidePopover();
        closedAt = performance.now();
      }
      target = null;
    }
    function enter(anchor: HTMLElement, delay: number) {
      if (anchor === target) return;
      clearTimeout(timer);
      target = anchor;
      if (open() || performance.now() - closedAt < WARM || delay === 0) {
        show(anchor);
        return;
      }
      timer = setTimeout(() => {
        if (target === anchor) show(anchor);
      }, delay);
    }
    function find(node: EventTarget | null) {
      if (!(node instanceof Element)) return null;
      const anchor = node.closest<HTMLElement>('[data-tooltip]');
      // Text fields describe their shortcut through ARIA; a tooltip would cover typing.
      return anchor && !anchor.matches('input, textarea') ? anchor : null;
    }
    const over = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const anchor = find(event.target);
      if (anchor) enter(anchor, DELAY);
      else if (target) hide();
    };
    const out = (event: PointerEvent) => {
      if (!event.relatedTarget) hide();
    };
    const focus = (event: FocusEvent) => {
      const anchor = find(event.target);
      // Focus can move while another popover is opening; showing one then is invalid.
      if (anchor)
        queueMicrotask(() => {
          if (document.activeElement === anchor && anchor.matches(':focus-visible'))
            enter(anchor, 0);
        });
    };
    const blur = (event: FocusEvent) => {
      if (event.target === target) hide();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerout', out);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', blur);
    document.addEventListener('keydown', key, true);
    document.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerout', out);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', blur);
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('scroll', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, []);
  return (
    <div ref={tip} className="tooltip" popover="manual" aria-hidden="true">
      <span ref={label} />
      <kbd ref={shortcut} hidden />
    </div>
  );
}
