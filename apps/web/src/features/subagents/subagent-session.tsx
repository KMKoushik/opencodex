import { useEffect, useMemo, useRef } from 'react';
import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useChat } from '../chat/use-chat';
import { Timeline } from '../chat/timeline';
import { MessageAttachments } from '../chat/message-attachments';
import { Button } from '../../components/ui/button';

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
        {chat.permissions.data?.length
          ? 'Waiting for permission'
          : chat.forms.data?.length
            ? 'Waiting for an answer'
            : running
              ? 'Working…'
              : waiting.length
                ? 'Waiting to run…'
                : chat.info.data?.outcome === 'interrupted'
                  ? 'Stopped'
                  : chat.info.data?.outcome === 'succeeded'
                    ? 'Completed'
                    : 'Idle'}
      </p>
    </>
  );
  return (
    <>
      <header className="subagent-session-header">
        <Button
          ref={back}
          variant="ghost"
          size="sm"
          onClick={onBack}
          aria-label="Back to subagents"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
          Subagents
        </Button>
        <div className="subagent-session-details">
          <h3 className="truncate" title={chat.info.data?.title}>
            {chat.info.data?.title || 'Subagent session'}
          </h3>
          <p className="wb-note">{live ? 'Live · Read-only' : 'Live updates paused · Read-only'}</p>
        </div>
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
