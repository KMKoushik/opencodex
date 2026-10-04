import { useId, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { ModelInfo, ModelRef } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { messageQuery } from './message-query';
import { latestResponse, tokenTotal } from './context-usage';
import './context-indicator.css';

const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 });

export function ContextIndicator({
  sessionID,
  models,
  model,
}: {
  sessionID: string;
  models?: ModelInfo[];
  model?: ModelRef;
}) {
  const messages = useInfiniteQuery({
    ...messageQuery(sessionID),
    select: latestResponse,
    refetchOnMount: false,
  });
  const latest = messages.data?.type === 'assistant' ? messages.data : undefined;
  const responseModel = latest?.model ?? model;
  const limit = models?.find(
    (item) => item.id === responseModel?.id && item.providerID === responseModel.providerID,
  )?.limit.context;
  const tokens = latest?.tokens ? tokenTotal(latest.tokens) : undefined;
  const used = tokens !== undefined && limit ? tokens / limit : undefined;
  const label =
    used === undefined ? 'Context usage unavailable' : `${percent.format(used)} context used`;
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const hovered = useRef(false);
  const [open, setOpen] = useState(false);
  return (
    <div
      className="context-indicator"
      onPointerEnter={(event) => {
        if (event.pointerType !== 'mouse') return;
        hovered.current = true;
        panel.current?.showPopover();
      }}
      onPointerLeave={() => {
        hovered.current = false;
        if (document.activeElement !== trigger.current) panel.current?.hidePopover();
      }}
    >
      <Button
        ref={trigger}
        variant="ghost"
        size="icon"
        className="context-indicator-trigger"
        tooltip={false}
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        aria-controls={id}
        onFocus={() => panel.current?.showPopover()}
        onBlur={() => {
          if (!hovered.current) panel.current?.hidePopover();
        }}
        onClick={() => panel.current?.showPopover()}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          aria-hidden="true"
          data-level={
            used === undefined
              ? 'unknown'
              : used >= 0.9
                ? 'critical'
                : used >= 0.75
                  ? 'high'
                  : 'normal'
          }
        >
          <circle className="context-ring-track" cx="12" cy="12" r="9" />
          {used !== undefined && (
            <circle
              className="context-ring-value"
              cx="12"
              cy="12"
              r="9"
              pathLength="100"
              strokeDasharray={`${Math.min(used, 1) * 100} 100`}
              transform="rotate(-90 12 12)"
            />
          )}
        </svg>
      </Button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        role="tooltip"
        className="context-popover"
        onToggle={(event) => {
          if (event.target === event.currentTarget) setOpen(event.newState === 'open');
        }}
      >
        <div className="context-popover-heading">
          <span>Context window</span>
          <span>{used === undefined ? '—' : `${percent.format(used)} used`}</span>
        </div>
        <progress
          aria-label="Context used"
          max={1}
          value={used === undefined ? 0 : Math.min(used, 1)}
          aria-valuetext={used === undefined ? 'Usage unavailable' : `${percent.format(used)} used`}
        />
        <p>
          {tokens !== undefined
            ? `${number.format(tokens)}${limit ? ` / ${number.format(limit)}` : ''} tokens used`
            : messages.isError
              ? 'Could not load context usage.'
              : messages.isPending
                ? 'Loading context usage…'
                : 'Usage appears after the first response.'}
        </p>
        {tokens !== undefined && (
          <p>
            Latest response
            {used === undefined && ' · Context limit unavailable'}
          </p>
        )}
      </div>
    </div>
  );
}
