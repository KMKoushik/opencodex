import { useEffect, useRef, useState } from 'react';

// The backlog drains with this time constant, so bursts spread into a steady flow
// while the display stays a fraction of a second behind the stream.
const CATCH_UP_MS = 280;
const MIN_CHARS_PER_MS = 0.05;
const WHITESPACE = /\s/g;

/**
 * Reveals growing text at a steady, word-aligned pace instead of in network bursts.
 * Text present at mount shows at once; only later growth is paced.
 */
export function usePacedText(target: string) {
  const [shown, setShown] = useState(target.length);
  const pace = useRef({ target, shown: target.length, frame: 0, last: 0 });
  useEffect(() => {
    const state = pace.current;
    state.target = target;
    if (state.shown > target.length || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      state.shown = target.length;
      setShown(target.length);
      return;
    }
    if (state.frame || state.shown === target.length) return;
    const tick = (now: number) => {
      const elapsed = state.last ? Math.min(now - state.last, 50) : 16;
      state.last = now;
      const text = state.target;
      const backlog = text.length - state.shown;
      if (backlog <= 0) {
        state.frame = 0;
        state.last = 0;
        return;
      }
      const step = Math.max(MIN_CHARS_PER_MS * elapsed, (backlog * elapsed) / CATCH_UP_MS);
      WHITESPACE.lastIndex = Math.min(text.length, state.shown + Math.ceil(step));
      state.shown = WHITESPACE.exec(text)?.index ?? text.length;
      setShown(state.shown);
      state.frame = requestAnimationFrame(tick);
    };
    state.frame = requestAnimationFrame(tick);
  }, [target]);
  useEffect(
    () => () => {
      cancelAnimationFrame(pace.current.frame);
      pace.current.frame = 0;
      pace.current.last = 0;
    },
    [],
  );
  return shown >= target.length ? target : target.slice(0, shown);
}
