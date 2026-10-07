import {
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  type ButtonHTMLAttributes,
} from 'react';
import { ArrowDown01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';

type Option = { value: string; label: string };

/** A listbox for options that need richer rendering than a native select. */
export function Select<T extends Option>({
  label,
  value,
  options,
  onChange,
  renderOption,
  renderValue = renderOption,
  placeholder,
  disabled = false,
  triggerRef,
  triggerProps,
  floating = false,
}: {
  label: string;
  value: string;
  options: T[];
  onChange: (value: string) => void;
  renderOption: (option: T) => ReactNode;
  renderValue?: (option: T) => ReactNode;
  placeholder?: string;
  disabled?: boolean;
  triggerRef?: Ref<HTMLButtonElement>;
  triggerProps?: Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'title' | 'aria-keyshortcuts'> & {
    'data-tooltip'?: string;
    'data-shortcut'?: string;
  };
  /** Open the menu in the top layer, so scrolling ancestors cannot clip it. */
  floating?: boolean;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useImperativeHandle(triggerRef, () => trigger.current!, []);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [above, setAbove] = useState(false);
  const selected = options.find((option) => option.value === value);

  // Before the focus effect below: a hidden popover can't take focus.
  useLayoutEffect(() => {
    if (open && floating) menu.current?.showPopover();
  }, [open, floating]);

  useEffect(() => {
    if (!open) return;
    const menu = list.current;
    const item = menu?.children[active] as HTMLElement | undefined;
    menu?.focus({ preventScroll: true });
    if (menu && item) {
      // Scroll only the menu; scrollIntoView would also move the page.
      if (item.offsetTop < menu.scrollTop) menu.scrollTop = item.offsetTop;
      const bottom = item.offsetTop + item.offsetHeight;
      if (bottom > menu.scrollTop + menu.clientHeight) menu.scrollTop = bottom - menu.clientHeight;
    }
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open, active]);

  function show() {
    if (disabled) return;
    const rect = trigger.current!.getBoundingClientRect();
    setAbove(innerHeight - rect.bottom < 340 && rect.top > innerHeight - rect.bottom);
    const index = options.indexOf(selected!);
    setActive(Math.max(0, index));
    setOpen(true);
  }

  function choose(option: T) {
    onChange(option.value);
    setOpen(false);
    trigger.current?.focus();
  }

  function navigate(event: KeyboardEvent) {
    if (event.nativeEvent.isComposing) return;
    const last = Math.max(0, options.length - 1);
    const next = {
      ArrowDown: Math.min(last, active + 1),
      ArrowUp: Math.max(0, active - 1),
      Home: 0,
      End: last,
    }[event.key];
    if (next !== undefined) {
      event.preventDefault();
      setActive(next);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (options[active]) choose(options[active]);
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
      }
      setOpen(false);
      trigger.current?.focus();
    }
  }

  return (
    <div
      className="select"
      data-floating={floating || undefined}
      data-shortcut-boundary={open ? '' : undefined}
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="select-trigger"
        disabled={disabled}
        aria-label={label}
        title={label}
        {...triggerProps}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            show();
          }
        }}
      >
        {selected ? renderValue(selected) : <span className="truncate">{placeholder}</span>}
        <HugeiconsIcon icon={ArrowDown01Icon} size={14} className="select-chevron" />
      </button>
      {open && (
        <div
          ref={menu}
          className="select-menu"
          popover={floating ? 'manual' : undefined}
          data-placement={above ? 'top' : 'bottom'}
        >
          <ul
            ref={list}
            id={id}
            className="select-options"
            role="listbox"
            aria-label={label}
            tabIndex={-1}
            aria-activedescendant={options.length ? `${id}-${active}` : undefined}
            onKeyDown={navigate}
          >
            {options.map((option, index) => (
              <li
                key={option.value}
                id={`${id}-${index}`}
                role="option"
                aria-selected={option.value === value}
                data-active={index === active}
                onPointerMove={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                {renderOption(option)}
                {option.value === value && (
                  <HugeiconsIcon icon={Tick02Icon} size={14} className="select-check" />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
