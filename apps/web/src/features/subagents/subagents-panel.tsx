import { useEffect, useRef, useState } from 'react';
import { LegendList } from '@legendapp/list/react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ArrowRight01Icon, BotIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { SessionInfo } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/api';
import { QueryError } from '../workbench/query-error';
import type { PanelContext } from '../workbench/panels';
import { SubagentSession } from './subagent-session';
import { noSubagents, subagentsQuery } from './subagents-query';
import './subagents.css';

export function SubagentsPanel({ sessionID, live, active, subagentRequest }: PanelContext) {
  const [selectedID, setSelectedID] = useState<string>();
  const [handledRequest, setHandledRequest] = useState<typeof subagentRequest>();
  if (subagentRequest && subagentRequest !== handledRequest) {
    setHandledRequest(subagentRequest);
    setSelectedID(subagentRequest.childID);
  }
  // Retain selection, but release readers, stream observers, and polling when hidden.
  if (!active) return null;
  if (selectedID)
    return (
      <section className="subagent-reader" aria-label="Subagent conversation">
        <SubagentSession
          key={selectedID}
          sessionID={selectedID}
          live={live}
          onBack={() => setSelectedID(undefined)}
        />
      </section>
    );
  return <SubagentsList sessionID={sessionID} live={live} onSelect={setSelectedID} />;
}

const sessionKey = (session: SessionInfo) => session.id;

function SubagentsList({
  sessionID,
  live,
  onSelect,
}: {
  sessionID: string;
  live: boolean;
  onSelect: (id: string) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  const sessions = useInfiniteQuery(subagentsQuery(sessionID, live));
  const active = useQuery({
    queryKey: ['active'],
    queryFn: ({ signal }) => api.active(signal),
    refetchOnMount: false,
  });
  const items = sessions.data ?? noSubagents;
  return (
    <section className="subagents-panel" aria-label="Subagents">
      <div className="subagents-list-pane">
        <div className="wb-subtoolbar">
          <h2 ref={heading} tabIndex={-1}>
            Delegated sessions
          </h2>
          <p className="wb-note">
            {items.length}
            {sessions.hasNextPage ? '+' : ''}
          </p>
        </div>
        <QueryError query={sessions} />
        {sessions.isPending && (
          <p className="wb-notice" role="status">
            Loading subagents…
          </p>
        )}
        {sessions.isSuccess && !items.length && (
          <div className="wb-empty">
            <HugeiconsIcon icon={BotIcon} size={24} />
            <h3>No subagents yet</h3>
            <p>Delegated sessions will appear here as the agent starts them.</p>
          </div>
        )}
        {items.length > 0 && (
          <LegendList
            data={items}
            extraData={active.data}
            keyExtractor={sessionKey}
            estimatedItemSize={62}
            drawDistance={160}
            className="subagents-list scrollbar-on-hover"
            aria-label="Subagent sessions"
            renderItem={({ item }) => {
              const running = Boolean(active.data?.[item.id]);
              return (
                <button type="button" className="subagent-row" onClick={() => onSelect(item.id)}>
                  <span className="subagent-avatar" aria-hidden="true">
                    <HugeiconsIcon icon={BotIcon} size={18} />
                  </span>
                  <div className="subagent-row-info">
                    <p className="truncate" title={item.title}>
                      {item.title || 'Untitled subagent'}
                    </p>
                    <p className="subagent-meta">
                      <span className="truncate">{item.agent || 'Subagent'}</span>
                      <span aria-hidden="true">·</span>
                      <span data-status={running ? 'running' : item.outcome}>
                        {running
                          ? 'Working'
                          : item.outcome === 'succeeded'
                            ? 'Completed'
                            : item.outcome === 'failed'
                              ? 'Failed'
                              : item.outcome === 'interrupted'
                                ? 'Stopped'
                                : 'Idle'}
                      </span>
                    </p>
                  </div>
                  <HugeiconsIcon icon={ArrowRight01Icon} size={16} />
                </button>
              );
            }}
          />
        )}
        {sessions.hasNextPage && (
          <div className="subagents-more">
            <Button
              variant="ghost"
              size="sm"
              disabled={sessions.isFetchingNextPage}
              onClick={() => void sessions.fetchNextPage()}
            >
              {sessions.isFetchingNextPage ? 'Loading…' : 'Load more subagents'}
            </Button>
          </div>
        )}
        <QueryError query={active} />
      </div>
    </section>
  );
}
