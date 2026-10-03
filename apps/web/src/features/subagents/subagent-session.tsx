import { useEffect, useMemo, useRef } from 'react';
import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useQuery } from '@tanstack/react-query';
import type { ModelRef } from '@opencodex/contracts';
import { useChat } from '../chat/use-chat';
import { Timeline } from '../chat/timeline';
import { MessageAttachments } from '../chat/message-attachments';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/api';
import { ProviderLogo } from '../chat/provider-logo';
import { ThinkingIndicator } from '../chat/thinking-indicator';

export function SubagentSession({
  sessionID,
  live,
  onBack,
}: {
  sessionID: string;
  live: boolean;
  onBack: () => void;
}) {
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => back.current?.focus({ preventScroll: true }), []);
  const chat = useChat(sessionID, live);
  const { messages, seen } = useMemo(() => {
    const seen = new Set<string>();
    const items = chat.messages.data?.pages.flatMap((page) => page.data).toReversed() ?? [];
    const boundary = chat.info.data?.revert?.messageID;
    const end = boundary ? items.findIndex((message) => message.id === boundary) : -1;
    const messages = (boundary ? (end < 0 ? [] : items.slice(0, end)) : items).filter((message) => {
      if (seen.has(message.id)) return false;
      seen.add(message.id);
      return true;
    });
    return { messages, seen };
  }, [chat.messages.data, chat.info.data?.revert?.messageID]);
  const running = Boolean(chat.active.data?.[sessionID]);
  const waiting =
    chat.inbox.data?.filter((item) => item.type === 'user' && !seen.has(item.id)) ?? [];
  const failed = [
    chat.info,
    chat.messages,
    chat.active,
    chat.inbox,
    chat.permissions,
    chat.forms,
  ].find((query) => query.isError);
  const footer = (
    <>
      {failed && (
        <div className="chat-error" role="alert">
          <p>{failed.error?.message}</p>
          <Button variant="secondary" size="sm" onClick={() => void failed.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {waiting.map(
        (item) =>
          item.type === 'user' && (
            <article className="user-message" key={item.id}>
              {item.payload.text && <p className="user-message-bubble">{item.payload.text}</p>}
              <MessageAttachments files={item.payload.files} />
              <p className="message-note">Pending in OpenCode</p>
            </article>
          ),
      )}
      {!running && (chat.executionError.data || chat.info.data?.outcome === 'failed') && (
        <p className="text-error" role="alert">
          {chat.executionError.data || 'This subagent run failed.'}
        </p>
      )}
      <p className="chat-status" role="status">
        {chat.permissions.data?.length ? (
          'Waiting for permission'
        ) : chat.forms.data?.length ? (
          'Waiting for an answer'
        ) : running ? (
          <ThinkingIndicator sessionID={sessionID} latest={messages.at(-1)} />
        ) : waiting.length ? (
          'Waiting to run…'
        ) : chat.info.data?.outcome === 'interrupted' ? (
          'Stopped'
        ) : chat.info.data?.outcome === 'succeeded' ? (
          'Completed'
        ) : (
          'Idle'
        )}
      </p>
    </>
  );
  return (
    <>
      <header className="subagent-session-header">
        <Button
          ref={back}
          variant="ghost"
          size="icon"
          onClick={onBack}
          aria-label="Back to subagents"
          title="Back to subagents"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
        </Button>
        <div className="subagent-session-details">
          <h3 className="truncate" title={chat.info.data?.title}>
            {chat.info.data?.title || 'Subagent session'}
          </h3>
          {chat.info.data?.model && (
            <SubagentModel
              directory={chat.info.data.location.directory}
              model={chat.info.data.model}
            />
          )}
        </div>
        {running && (
          <span
            className="session-activity"
            role="img"
            aria-label="Responding"
            title="Responding…"
          />
        )}
      </header>
      {chat.messages.data ? (
        <Timeline
          sessionID={sessionID}
          messages={messages}
          hasEarlier={chat.messages.hasNextPage}
          loadingEarlier={chat.messages.isFetchingNextPage}
          historyError={chat.messages.isFetchNextPageError}
          fetchEarlier={chat.messages.fetchNextPage}
          footer={footer}
          working={running && !chat.permissions.data?.length && !chat.forms.data?.length}
          running={running}
          readOnly
        />
      ) : (
        <div className="chat-transcript">
          {chat.messages.isPending && (
            <p className="message-note" role="status">
              Loading messages…
            </p>
          )}
          {footer}
        </div>
      )}
    </>
  );
}

function SubagentModel({ directory, model }: { directory: string; model: ModelRef }) {
  const catalog = useQuery({
    queryKey: ['models', directory],
    queryFn: ({ signal }) => api.models(directory, signal),
    staleTime: 5 * 60_000,
  });
  const current = catalog.data?.data.find(
    (item) => item.id === model.id && item.providerID === model.providerID,
  );
  const provider = catalog.data?.providers.find((item) => item.id === model.providerID);
  const name = current?.name || model.id;
  return (
    <p
      className="subagent-session-model"
      aria-label={`Model: ${name}`}
      title={`${provider?.name || model.providerID} · ${model.id}`}
    >
      <ProviderLogo providerID={model.providerID} canonical={provider?.canonical} />
      <span className="truncate">{name}</span>
    </p>
  );
}
