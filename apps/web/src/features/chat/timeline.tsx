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

export type TimelineHandle = { scrollToLatest: () => void };
const followOutput = {
  animated: false,
  on: { dataChange: true, itemLayout: true, footerLayout: true, layout: true },
};
const rowKey = (row: DisplayRow) => row.id;

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
  const [following, setFollowing] = useState(true);
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
  const scrollToLatest = () => {
    setFollowing(true);
    void list.current?.scrollToEnd({ animated: false });
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
      >
        <LegendList
          ref={list}
          data={rows}
          keyExtractor={rowKey}
          renderItem={renderItem}
          estimatedItemSize={100}
          drawDistance={500}
          initialScrollAtEnd
          maintainVisibleContentPosition
          maintainScrollAtEnd={following ? followOutput : false}
          maintainScrollAtEndThreshold={0.1}
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
            setFollowing(node.scrollHeight - node.scrollTop - node.clientHeight < 48);
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
            <Button variant="secondary" size="sm" onClick={scrollToLatest}>
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
        </article>
      ) : (
        <Message message={row.message} />
      )}
    </div>
  );
});
