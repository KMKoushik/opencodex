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
import { createTimelineProjector, type TimelineRow } from './timeline-model';
import { Message } from './message';
import { StreamText } from './stream-text';
import { ResponseSelection } from './response-selection';
import { createWorkHeaderProjector } from './work-header-model';
import { WorkHeader } from './work-header';

export type TimelineHandle = { scrollToLatest: () => void };
const followOutput = {
  animated: false,
  on: { dataChange: true, itemLayout: true, footerLayout: true, layout: true },
};
const rowKey = (row: TimelineRow) => row.id;

export function Timeline({
  ref,
  sessionID,
  messages,
  hasEarlier,
  loadingEarlier,
  historyError,
  fetchEarlier,
  footer,
  readOnly = false,
  working = false,
  running = working,
}: {
  ref?: Ref<TimelineHandle>;
  sessionID: string;
  messages: SessionMessageInfo[];
  hasEarlier: boolean;
  loadingEarlier: boolean;
  historyError: boolean;
  fetchEarlier: () => Promise<unknown>;
  footer: ReactNode;
  readOnly?: boolean;
  working?: boolean;
  running?: boolean;
}) {
  const [project] = useState(createTimelineProjector);
  const [projectWork] = useState(createWorkHeaderProjector);
  const { rows, scopes, latestWorkID } = useMemo(
    () => projectWork(messages, project(messages)),
    [projectWork, project, messages],
  );
  const [expandedWork, setExpandedWork] = useState(() => new Set<string>());
  const latest = messages.at(-1);
  const activeMessageID =
    working && (latest?.type === 'assistant' || latest?.type === 'compaction')
      ? latest.id
      : undefined;
  const runningWorkID = running ? latestWorkID : undefined;
  const currentMessageID = running && latest?.type === 'assistant' ? latest.id : undefined;
  const visibleRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          row.type !== 'activity' ||
          expandedWork.has(scopes.get(row.id) ?? '') ||
          !scopes.has(row.id) ||
          Boolean(currentMessageID && row.current?.messageID === currentMessageID),
      ),
    [rows, scopes, expandedWork, currentMessageID],
  );
  const toggleWork = useCallback(
    (id: string) =>
      setExpandedWork((previous) => {
        const next = new Set(previous);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
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
  }, [visibleRows, loadingEarlier, loadEarlier]);
  const scrollToLatest = () => {
    setFollowing(true);
    void list.current?.scrollToEnd({ animated: false });
  };
  useImperativeHandle(ref, () => ({ scrollToLatest }));
  const renderItem = useCallback(
    ({ item }: { item: TimelineRow }) => (
      <Row
        key={item.id}
        row={item}
        sessionID={sessionID}
        active={Boolean(
          activeMessageID &&
          (item.type === 'activity'
            ? item.current?.messageID === activeMessageID
            : item.type === 'message' && item.message.id === activeMessageID),
        )}
        running={item.type === 'work-header' && item.id === runningWorkID}
        expanded={expandedWork.has(
          item.type === 'work-header' ? item.id : (scopes.get(item.id) ?? ''),
        )}
        onToggleWork={toggleWork}
      />
    ),
    [sessionID, activeMessageID, runningWorkID, expandedWork, scopes, toggleWork],
  );
  return (
    <DisclosureProvider>
      <div
        className="timeline"
        ref={scope}
        onClickCapture={(event) => {
          if ((event.target as HTMLElement).closest('.disclosure-trigger, .work-header-trigger'))
            setFollowing(false);
        }}
      >
        <LegendList
          ref={list}
          data={visibleRows}
          extraData={renderItem}
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
  active,
  running,
  expanded,
  onToggleWork,
}: {
  row: TimelineRow;
  sessionID: string;
  active: boolean;
  running: boolean;
  expanded: boolean;
  onToggleWork: (id: string) => void;
}) {
  return (
    <div className="timeline-row" data-row-id={row.id} data-row-type={row.type}>
      {row.type === 'work-header' ? (
        <WorkHeader
          row={row}
          running={running}
          expanded={expanded}
          onToggle={() => onToggleWork(row.id)}
        />
      ) : row.type === 'activity' ? (
        <Activity row={row} sessionID={sessionID} active={active} expanded={expanded} />
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
        <Message message={row.message} active={active} />
      )}
    </div>
  );
});
