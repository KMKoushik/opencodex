import { useEffect, useRef, useState } from 'react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '../../components/ui/button';
import { shortcutProps } from '../shortcuts/commands';
import { TerminalPanel } from './terminal-panel';
import '../workbench/workbench.css';
import './terminal-drawer.css';

export function TerminalDrawer({
  directory,
  live,
  open,
  onClose,
}: {
  directory: string;
  live: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const [headerElement, setHeaderElement] = useState<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(280);
  const root = useRef<HTMLElement>(null);
  const drag = useRef<{ y: number; height: number } | null>(null);
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const limit = (value: number) =>
    Math.max(120, Math.min(value, (root.current?.parentElement?.clientHeight ?? 600) * 0.6));
  return (
    <section
      ref={root}
      id="terminal-drawer"
      className="workbench terminal-drawer ink"
      hidden={!open}
      aria-label="Terminal"
      style={{ height }}
      data-shortcut-boundary=""
    >
      <div
        className="terminal-resize"
        role="separator"
        aria-label="Resize terminal"
        aria-orientation="horizontal"
        aria-valuemin={120}
        aria-valuenow={height}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
          event.preventDefault();
          setHeight(limit(height + (event.key === 'ArrowUp' ? 32 : -32)));
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          drag.current = { y: event.clientY, height: root.current!.getBoundingClientRect().height };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start) return;
          cancelAnimationFrame(frame.current);
          frame.current = requestAnimationFrame(() => {
            if (root.current)
              root.current.style.height = `${limit(start.height + start.y - event.clientY)}px`;
          });
        }}
        onLostPointerCapture={() => {
          cancelAnimationFrame(frame.current);
          drag.current = null;
          setHeight(root.current!.getBoundingClientRect().height);
        }}
        onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
      />
      <header className="wb-header">
        <div className="wb-header-content" ref={setHeaderElement} />
        <span className="wb-heading">Terminal</span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Hide terminal"
          {...shortcutProps('terminal.toggle')}
          onClick={onClose}
        >
          <HugeiconsIcon icon={Cancel01Icon} size={16} />
        </Button>
      </header>
      <div className="wb-content">
        <TerminalPanel
          directory={directory}

          live={live}
          active={open}
          headerElement={headerElement}
        />
      </div>
    </section>
  );
}
