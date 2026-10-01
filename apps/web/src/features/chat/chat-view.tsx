import { useMemo, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/api';
import { useChat } from './use-chat';
import { PermissionCard, QuestionCard } from './requests';
import { Composer } from './composer';
import { Timeline, type TimelineHandle } from './timeline';

export function ChatView({
  sessionID,
  live,
  drafts,
  projectName,
}: {
  sessionID: string;
  live: boolean;
  drafts: Map<string, string>;
  projectName?: string;
}) {
  const client = useQueryClient();
  const chat = useChat(sessionID, live);
  const timeline = useRef<TimelineHandle>(null);
  const key = ['chat', sessionID];
  const refresh = () =>
    client.invalidateQueries({
      queryKey: key,
      predicate: (query) => query.queryKey[2] !== 'stream',
    });
  const send = useMutation({
    mutationFn: (text: string) => api.prompt(sessionID, text),
    retry: false,
    onSuccess: () => {
      timeline.current?.scrollToLatest();
      void refresh();
      void client.invalidateQueries({ queryKey: ['sessions'] });
      void client.invalidateQueries({ queryKey: ['active'] });
    },
    onError: () => {
      void refresh();
    },
  });
  const stop = useMutation({
    mutationFn: () => api.interrupt(sessionID),
    onSuccess: () => {
      void refresh();
      void client.invalidateQueries({ queryKey: ['active'] });
    },
  });
  const { unique, seen } = useMemo(() => {
    const messages = chat.messages.data?.pages.flatMap((page) => page.data).toReversed() ?? [];
    const seen = new Set<string>();
    const unique = messages.filter((message) => {
      if (seen.has(message.id)) return false;
      seen.add(message.id);
      return true;
    });
    return { unique, seen };
  }, [chat.messages.data]);
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
  const empty =
    chat.messages.isSuccess &&
    !unique.length &&
    !waiting.length &&
    !running &&
    !chat.permissions.data?.length &&
    !chat.forms.data?.length &&
    !failed;
  const footer = (
    <>
      {failed && (
        <div className="chat-error" role="alert">
          <p>{failed.error?.message}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void refresh();
              void client.invalidateQueries({ queryKey: ['active'] });
            }}
          >
            Retry
          </Button>
        </div>
      )}
      {waiting.map((item) => (
        <article className="user-message" key={item.id}>
          {item.type === 'user' && <p>{item.payload.text}</p>}
          <span className="message-note">Pending in OpenCode</span>
        </article>
      ))}
      {chat.permissions.data?.map((request) => (
        <PermissionCard key={request.id} request={request} />
      ))}
      {chat.forms.data?.map((form) => (
        <QuestionCard key={form.id} form={form} />
      ))}
      {!running && (chat.executionError.data || chat.info.data?.outcome === 'failed') && (
        <p className="text-error" role="alert">
          {chat.executionError.data ||
            'The run failed. Check OpenCode’s provider configuration and try again.'}
        </p>
      )}
      <div className="chat-status" role="status">
        {running
          ? 'Working…'
          : waiting.length
            ? 'Message accepted; waiting to run…'
            : chat.info.data?.outcome === 'interrupted'
              ? 'Stopped'
              : ''}
      </div>
    </>
  );
  return (
    <div className="chat" data-empty={empty}>
      {empty ? (
        <div className="chat-empty">
          <h2>Let’s build something</h2>
          <p>{projectName || 'Start a new thread'}</p>
        </div>
      ) : chat.messages.data ? (
        <Timeline
          ref={timeline}
          sessionID={sessionID}
          messages={unique}
          hasEarlier={chat.messages.hasNextPage}
          loadingEarlier={chat.messages.isFetchingNextPage}
          historyError={chat.messages.isFetchNextPageError}
          fetchEarlier={chat.messages.fetchNextPage}
          footer={footer}
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
      <div className="composer-area">
        {send.isError && (
          <p className="text-error" role="alert">
            {send.error.message} Your draft is kept. Check the conversation before sending again.
          </p>
        )}
        {stop.isError && (
          <p className="text-error" role="alert">
            {stop.error.message}
          </p>
        )}
        <Composer
          sessionID={sessionID}
          drafts={drafts}
          onSend={send.mutateAsync}
          sending={send.isPending}
          ready={chat.info.isSuccess}
          running={running}
          stopping={stop.isPending}
          onStop={() => stop.mutate()}
          agent={chat.info.data?.agent}
          model={chat.info.data?.model?.id}
        />
        <p className="composer-hint">
          {running
            ? 'Messages sent while working steer the next turn.'
            : 'Enter to send · Shift + Enter for a new line'}
        </p>
      </div>
    </div>
  );
}
