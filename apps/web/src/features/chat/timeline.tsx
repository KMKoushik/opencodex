import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import { LegendList, type LegendListRef } from '@legendapp/list/react';
import { ArrowDown02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { SessionMessageInfo } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { Activity } from './activity';
import { DisclosureProvider } from './disclosure';
import { createTimelineProjector, createTurnGrouper, type DisplayRow } from './timeline-model';
import { TurnHeader } from './turn-header';
import { Message } from './message';
import { StreamText } from './stream-text';
import { ResponseSelection } from './response-selection';
import { ResponseCopy } from './response-copy';

export type TimelineHandle = { scrollToLatest: () => void };
const followOutput = {
  animated: false,
  on: { dataChange: true, itemLayout: true, footerLayout: true, layout: true },
};
// While a turn runs, each new line glides into view instead of jumping.
const followOutputSmooth = { ...followOutput, animated: true };
// Scrolling back within this distance of the end resumes following.
const FOLLOW_BAND = 40;
const AWAY_KEYS = new Set(['PageUp', 'Home', 'ArrowUp']);
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const rowKey = (row: DisplayRow) => row.id;

/** A nested scroller (code, diffs) that the wheel moves before the transcript. */
function scrollsInside(target: EventTarget, root: HTMLElement) {
  for (let node = target as HTMLElement | null; node && node !== root; node = node.parentElement)
    if (node.scrollTop > 0 && /auto|scroll/.test(getComputedStyle(node).overflowY)) return true;
  return false;
}

export function Timeline({
  ref,
  sessionID,
  messages,
  hasEarlier,
  loadingEarlier,
  historyError,
  fetchEarlier,
  footer,
  running = false,
  readOnly = false,
}: {
  ref?: Ref<TimelineHandle>;
  sessionID: string;
  messages: SessionMessageInfo[];
  hasEarlier: boolean;
  loadingEarlier: boolean;
  historyError: boolean;
  fetchEarlier: () => Promise<unknown>;
  footer: ReactNode;
  /** The session is running, so its last turn is still working. */
  running?: boolean;
  readOnly?: boolean;
}) {
  const [project] = useState(createTimelineProjector);
  const [group] = useState(createTurnGrouper);
  // Explicit open/closed choices per turn; otherwise a turn is open only while it works.
  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const projected = useMemo(() => project(messages), [project, messages]);
  const rows = useMemo(
    () => group(projected, messages, running, overrides),
    [group, projected, messages, running, overrides],
  );
  const toggleTurn = useCallback(
    (id: string, open: boolean) => setOverrides((previous) => new Map(previous).set(id, open)),
    [],
  );
  const list = useRef<LegendListRef>(null);
  const scope = useRef<HTMLDivElement>(null);
  const ready = useRef(false);
  const fetching = useRef(false);
  // Following stops only on a reading gesture, never on scroll position alone: the list's
  // own measuring and end-following scrolls would otherwise be mistaken for the reader.
  // History anchoring is enabled only while reading, so it cannot fight end-following on refresh.
  const [following, setFollowingState] = useState(true);
  const followingRef = useRef(true);
  const setFollowing = useCallback((value: boolean) => {
    if (followingRef.current === value) return;
    followingRef.current = value;
    setFollowingState(value);
  }, []);
  const distanceFromEnd = () => {
    const node = list.current?.getScrollableNode();
    return node ? node.scrollHeight - node.scrollTop - node.clientHeight : 0;
  };
  const loadEarlier = useCallback(() => {
    if (!ready.current || !hasEarlier || loadingEarlier || fetching.current || historyError) return;
    fetching.current = true;
    void fetchEarlier().finally(() => {
      fetching.current = false;
    });
  }, [hasEarlier, loadingEarlier, historyError, fetchEarlier]);
  useEffect(() => {
    if (loadingEarlier) return;
    const frame = requestAnimationFrame(() => {
      const node = list.current?.getScrollableNode();
      // A page of collapsed work can fit entirely on screen. Continue until
      // there is scrollable history rather than stranding the reader at the top.
      if (node && node.scrollHeight <= node.clientHeight + 32) loadEarlier();
    });
    return () => cancelAnimationFrame(frame);
  }, [rows, loadingEarlier, loadEarlier]);
  const scrollToLatest = (animated = false) => {
    setFollowing(true);
    // Sending at the end only needs to resume following, not start another scroll target.
    if (distanceFromEnd() > FOLLOW_BAND)
      void list.current?.scrollToEnd({ animated: animated && !reducedMotion() });
  };
  useImperativeHandle(ref, () => ({ scrollToLatest }));
  const renderItem = useCallback(
    ({ item }: { item: DisplayRow }) => (
      <Row key={item.id} row={item} sessionID={sessionID} onToggleTurn={toggleTurn} />
    ),
    [sessionID, toggleTurn],
  );
  return (
    <DisclosureProvider>
      <div
        className="timeline"
        ref={scope}
        onClickCapture={(event) => {
          // Opening history never pulls the reader back to the newest output.
          if ((event.target as HTMLElement).closest('.disclosure-trigger, .turn-work'))
            setFollowing(false);
        }}
        onWheel={(event) => {
          if (event.deltaY >= 0 || event.ctrlKey || !followingRef.current) return;
          const node = list.current?.getScrollableNode();
          if (node && node.scrollTop > 0 && !scrollsInside(event.target, node)) setFollowing(false);
        }}
        onTouchMove={() => {
          if (followingRef.current && distanceFromEnd() > FOLLOW_BAND) setFollowing(false);
        }}
        onPointerDown={(event) => {
          // The scroll node itself is only the target for a scrollbar drag.
          if (event.target === list.current?.getScrollableNode() || distanceFromEnd() > FOLLOW_BAND)
            setFollowing(false);
        }}
        onKeyDown={(event) => {
          const target = event.target as HTMLElement;
          if (
            AWAY_KEYS.has(event.key) &&
            !event.metaKey &&
            !event.ctrlKey &&
            !target.closest('input, textarea, [contenteditable="true"]')
          )
            setFollowing(false);
        }}
      >
        <LegendList
          ref={list}
          data={rows}
          keyExtractor={rowKey}
          renderItem={renderItem}
          estimatedItemSize={100}
          drawDistance={500}
          initialScrollAtEnd
          maintainVisibleContentPosition={!following}
          maintainScrollAtEnd={
            following ? (running && !reducedMotion() ? followOutputSmooth : followOutput) : false
          }
          maintainScrollAtEndThreshold={1}
          onReady={() => {
            ready.current = true;
            const node = list.current?.getScrollableNode();
            if (node && node.scrollHeight <= node.clientHeight + 32) loadEarlier();
          }}
          onStartReached={loadEarlier}
          onStartReachedThreshold={0.5}
          onScroll={() => {
            if (!ready.current) return;
            const node = list.current?.getScrollableNode();
            if (!node) return;
            if (node.scrollHeight - node.scrollTop - node.clientHeight <= FOLLOW_BAND)
              setFollowing(true);
            if (node.scrollTop < 240) loadEarlier();
          }}
          className="chat-scroll timeline-scroll scrollbar-on-hover"
          aria-label="Conversation"
          tabIndex={0}
          ListHeaderComponent={
            <div className="history-status" role="status">
              {loadingEarlier ? (
                'Loading earlier messages…'
              ) : historyError ? (
                <Button variant="ghost" size="sm" onClick={() => void fetchEarlier()}>
                  Retry loading history
                </Button>
              ) : !hasEarlier ? (
                'Beginning of conversation'
              ) : (
                ''
              )}
            </div>
          }
          ListFooterComponent={<div className="timeline-footer">{footer}</div>}
        />
        {!readOnly && <ResponseSelection key={sessionID} scope={scope} sessionID={sessionID} />}
        {!following && (
          <div className="jump-to-latest">
            <Button variant="secondary" size="sm" onClick={() => scrollToLatest(true)}>
              <HugeiconsIcon icon={ArrowDown02Icon} size={14} />
              Jump to latest
            </Button>
          </div>
        )}
      </div>
    </DisclosureProvider>
  );
}

const Row = memo(function Row({
  row,
  sessionID,
  onToggleTurn,
}: {
  row: DisplayRow;
  sessionID: string;
  onToggleTurn: (id: string, open: boolean) => void;
}) {
  return (
    <div className="timeline-row" data-row-id={row.id} data-row-type={row.type}>
      {row.type === 'turn' ? (
        <TurnHeader row={row} onToggle={onToggleTurn} />
      ) : row.type === 'activity' ? (
        <Activity row={row} sessionID={sessionID} />
      ) : row.type === 'text' ? (
        <article className="assistant-message" aria-label="Assistant">
          <StreamText
            sessionID={sessionID}
            messageID={row.message.id}
            ordinal={row.ordinal}
            text={row.text}
            completed={Boolean(row.message.time.completed)}
          />
          {row.copyable && <ResponseCopy text={row.text} />}
        </article>
      ) : (
        <Message message={row.message} />
      )}
    </div>
  );
});
