import { useEffect, useRef, useState } from 'react';
import './sidebar-resize.css';

const minimum = 200;
const defaultWidth = 275;

export function SidebarResize() {
  const handle = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; width: number; next: number } | null>(null);
  const frame = useRef(0);
  const [width, setWidth] = useState(defaultWidth);
  const [maximum, setMaximum] = useState(480);

  useEffect(() => {
    const sidebar = handle.current!.parentElement!;
    const shell = sidebar.parentElement!;
    const observer = new ResizeObserver(() => {
      setMaximum(Math.max(minimum, Math.min(480, shell.clientWidth - 360)));
      if (!drag.current && sidebar.clientWidth) setWidth(sidebar.getBoundingClientRect().width);
    });
    observer.observe(shell);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame.current);
      delete shell.dataset.sidebarResizing;
    };
  }, []);

  function resize(value: number) {
    const next = Math.max(minimum, Math.min(maximum, value));
    handle.current!.parentElement!.parentElement!.style.setProperty('--sidebar-width', `${next}px`);
    return next;
  }

  function finish() {
    cancelAnimationFrame(frame.current);
    if (!drag.current) return;
    setWidth(resize(drag.current.next));
    drag.current = null;
    delete handle.current!.parentElement!.parentElement!.dataset.sidebarResizing;
  }

  return (
    <div
      ref={handle}
      className="sidebar-resize"
      role="separator"
      aria-label="Resize sidebar"
      aria-controls="sidebar"
      aria-orientation="vertical"
      aria-valuemin={minimum}
      aria-valuemax={maximum}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize sidebar; double-click to reset"
      onDoubleClick={() => setWidth(resize(defaultWidth))}
      onKeyDown={(event) => {
        const current = handle.current!.parentElement!.getBoundingClientRect().width;
        const next =
          event.key === 'ArrowLeft'
            ? current - 32
            : event.key === 'ArrowRight'
              ? current + 32
              : event.key === 'Home'
                ? minimum
                : event.key === 'End'
                  ? maximum
                  : undefined;
        if (next === undefined) return;
        event.preventDefault();
        event.stopPropagation();
        setWidth(resize(next));
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 || !event.isPrimary) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        const sidebar = event.currentTarget.parentElement!;
        const width = sidebar.getBoundingClientRect().width;
        drag.current = { x: event.clientX, width, next: width };
        event.currentTarget.setPointerCapture(event.pointerId);
        sidebar.parentElement!.dataset.sidebarResizing = 'true';
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (!start) return;
        start.next = start.width + event.clientX - start.x;
        cancelAnimationFrame(frame.current);
        // Resize the grid directly; the app and transcript don't rerender during drag.
        frame.current = requestAnimationFrame(() => resize(start.next));
      }}
      onPointerUp={(event) => {
        if (!drag.current) return;
        drag.current.next = drag.current.width + event.clientX - drag.current.x;
        finish();
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onLostPointerCapture={finish}
      onPointerCancel={finish}
    />
  );
}
