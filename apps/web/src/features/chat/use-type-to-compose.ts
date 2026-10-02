import { useEffect, type RefObject } from 'react';

const interactive =
  'input, textarea, select, button, a, summary, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="button"], [role="combobox"], [role="listbox"], [role="menu"], [role="menuitem"], [role="slider"], [role="separator"], [role="dialog"], dialog, [data-shortcut-boundary]';

export function useTypeToCompose(input: RefObject<HTMLTextAreaElement | null>, sessionID: string) {
  useEffect(() => {
    const textarea = input.current;
    const chat = textarea?.closest('.chat');
    if (!textarea || !chat) return;
    let clickedChat = false;
    const reset = () => {
      clickedChat = false;
    };
    const pointerdown = (event: PointerEvent) => {
      const target = event.target;
      clickedChat =
        target instanceof Element && chat.contains(target) && !target.closest(interactive);
    };
    const focusin = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof Element && !chat.contains(target) && !target.contains(chat)) reset();
    };
    const keydown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.metaKey ||
        ((event.ctrlKey || event.altKey) && !event.getModifierState('AltGraph')) ||
        (event.key.length !== 1 && event.key !== 'Dead' && event.key !== 'Process')
      )
        return;
      const target = event.target;
      if (
        !(target instanceof Element) ||
        target.closest(interactive) ||
        (!chat.contains(target) && !(clickedChat && target.contains(chat))) ||
        document.querySelector(':modal') ||
        !window.getSelection()?.isCollapsed ||
        textarea.disabled ||
        textarea.readOnly
      )
        return;
      // Leave the key's native text/IME insertion intact so the first character,
      // keyboard layout, undo history, and normal draft onChange all work normally.
      textarea.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', pointerdown, true);
    document.addEventListener('focusin', focusin);
    document.addEventListener('keydown', keydown);
    window.addEventListener('blur', reset);
    return () => {
      document.removeEventListener('pointerdown', pointerdown, true);
      document.removeEventListener('focusin', focusin);
      document.removeEventListener('keydown', keydown);
      window.removeEventListener('blur', reset);
    };
  }, [input, sessionID]);
}
