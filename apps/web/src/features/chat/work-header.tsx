import { useEffect, useRef, useState } from 'react';
import { ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { TimelineRow } from './timeline-model';
import './work-header.css';

export function WorkHeader({
  row,
  running,
  expanded,
  onToggle,
}: {
  row: Extract<TimelineRow, { type: 'work-header' }>;
  running: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!running) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    let visible = false;
    const update = () => {
      clearInterval(timer);
      timer = undefined;
      if (!visible || document.hidden) return;
      setNow(Date.now());
      timer = setInterval(() => setNow(Date.now()), 1000);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      update();
    });
    observer.observe(element.current!);
    document.addEventListener('visibilitychange', update);
    return () => {
      observer.disconnect();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, [running]);
  const elapsed = Math.max(0, (running ? now : (row.completedAt ?? row.startedAt)) - row.startedAt);
  const duration = formatWorkDuration(elapsed);
  const label = running
    ? elapsed < 1000
      ? 'Working'
      : `Working for ${duration}`
    : row.completedAt === undefined
      ? 'Activity'
      : row.outcome === 'interrupted'
        ? `You stopped after ${duration}`
        : `Worked for ${duration}`;
  const content = (
    <>
      <span className="work-duration">{label}</span>
      {row.errors > 0 && <span className="text-error">{row.errors} failed</span>}
    </>
  );
  return (
    <div ref={element} className="work-header">
      {row.hasActivity ? (
        <button
          type="button"
          className="work-header-trigger"
          aria-expanded={expanded}
          onClick={onToggle}
        >
          {content}
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            size={14}
            className="work-header-chevron"
            data-open={expanded}
            aria-hidden="true"
          />
        </button>
      ) : (
        <div className="work-header-label">{content}</div>
      )}
      <div className="work-header-divider" />
    </div>
  );
}

function formatWorkDuration(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  return [
    seconds >= 3600 ? `${Math.floor(seconds / 3600)}h` : '',
    seconds >= 60 && Math.floor(seconds / 60) % 60 ? `${Math.floor(seconds / 60) % 60}m` : '',
    seconds % 60 || !seconds ? `${seconds % 60}s` : '',
  ]
    .filter(Boolean)
    .join(' ');
}
