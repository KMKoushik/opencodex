import { useLayoutEffect, useRef, type RefObject } from 'react';

type Scope = { open: () => void; fallback: boolean };
const scopes = new Map<Element, Scope>();
let last: Element | null = null;
let tracking = false;

// Mod+F goes to the surface the person last clicked or focused; clicks on
// static text move no focus, so pointer targets count as well.
function track() {
  if (tracking) return;
  tracking = true;
  const remember = (event: Event) => {
    if (event.target instanceof Element) last = event.target;
  };
  document.addEventListener('pointerdown', remember, true);
  document.addEventListener('focusin', remember, true);
}

/** Registers a surface that answers Mod+F while it holds the person's attention. */
export function useFindScope(
  ref: RefObject<HTMLElement | null>,
  open: (() => void) | undefined,
  { fallback = false } = {},
) {
  const latest = useRef(open);
  const registered = useRef<HTMLElement | null>(null);
  // Every commit, because the element can mount after the owner (for example, once data loads).
  useLayoutEffect(() => {
    latest.current = open;
    const element = open ? ref.current : null;
    if (element === registered.current) {
      if (element) scopes.get(element)!.fallback = fallback;
      return;
    }
    release(registered.current);
    registered.current = element;
    if (!element) return;
    track();
    element.setAttribute('data-find-scope', '');
    scopes.set(element, { open: () => latest.current?.(), fallback });
  });
  useLayoutEffect(
    () => () => {
      release(registered.current);
      registered.current = null;
    },
    [],
  );
}

function release(element: HTMLElement | null) {
  if (!element) return;
  scopes.delete(element);
  element.removeAttribute('data-find-scope');
}

/**
 * Opens find in the innermost scope around the last interaction. Outside any scope
 * (a panel's tabs or toolbar), the nearest area holding a single scope wins, else the main chat.
 */
export function openFind() {
  const visible = [...scopes].filter(([element]) => element.getClientRects().length > 0);
  for (let node = last?.isConnected ? last : null; node; node = node.parentElement) {
    const scope = scopes.get(node);
    if (scope && node.getClientRects().length > 0) {
      scope.open();
      return true;
    }
    const inside = visible.filter(([element]) => node!.contains(element));
    const outer = inside.filter(([element]) =>
      inside.every(([other]) => other === element || !other.contains(element)),
    );
    if (outer.length === 1) {
      outer[0]![1].open();
      return true;
    }
    if (outer.length > 1) break;
  }
  for (const [element, scope] of [...scopes].reverse()) {
    if (scope.fallback && element.getClientRects().length > 0) {
      scope.open();
      return true;
    }
  }
  return false;
}
