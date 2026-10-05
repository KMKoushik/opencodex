import { useMemo, useRef } from 'react';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ModelRef, SessionInfo } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/api';
import { useChat } from '../chat/use-chat';
import { useModelSelection } from '../chat/use-model-selection';
import { useDraftStore } from '../chat/draft-context';
import type { DraftSnapshot } from '../chat/draft-store';
import { EMPTY_ATTACHMENTS, encodeAttachments } from '../chat/attachments';
import { reviewPrompt } from '../chat/review-comments';
import { localCommands, parseSlash, useSlashCommands } from '../chat/slash-commands';
import { Timeline, type TimelineHandle } from '../chat/timeline';
import { MessageAttachments } from '../chat/message-attachments';
import { PermissionCard } from '../chat/requests';
import { QuestionDock } from '../chat/question-dock';
import { Composer } from '../chat/composer';
import { ModelControls } from '../chat/model-controls';
import { MainChatStatus } from './main-chat-status';

/** One side chat. Its inherited main-chat history stays hidden; it reads as a fresh chat. */
export function SideChatView({
  mainID,
  sessionID,
  directory,
  live,
}: {
  mainID: string;
  sessionID: string;
  directory: string;
  live: boolean;
}) {
  const client = useQueryClient();
  const chat = useChat(sessionID, live);
  const { catalog, select, model } = useModelSelection(sessionID, chat.info.data);
  const drafts = useDraftStore();
  const commands = useSlashCommands(chat.info.data?.location.directory, false);
  const timeline = useRef<TimelineHandle>(null);
  const sendKey = ['chat', sessionID, 'send'];
  const sending = useIsMutating({ mutationKey: sendKey }) > 0;
  const refresh = () =>
    client.invalidateQueries({
      queryKey: ['chat', sessionID],
      predicate: (query) => query.queryKey[2] !== 'stream',
    });
  const send = useMutation({
    mutationKey: sendKey,
    gcTime: 0,
    retry: false,
    mutationFn: async (input: { draft: DraftSnapshot; model?: ModelRef }) => {
      const slash = parseSlash(input.draft.text);
      if (slash && localCommands.some((item) => item.name === slash.name))
        throw new Error(`/${slash.name} isn’t available in side chats. Use it in the main chat.`);
      const catalog = slash ? await commands.refetch() : undefined;
      if (catalog?.error) throw catalog.error;
      const command = slash && catalog?.data?.find((item) => item.name === slash.name);
      if (slash && !command)
        throw new Error(`Unknown command /${slash.name}. Type / to see available commands.`);
      const text = reviewPrompt(slash ? slash.text : input.draft.text, input.draft.comments);
      if (text.length > 200_000)
        throw new Error('The draft is too long. Shorten it before sending.');
      await api.prompt(
        input.draft.sessionID,
        text,
        input.model,
        input.draft.attachments?.length
          ? await encodeAttachments(input.draft.attachments)
          : undefined,
        command && !command.skill ? command.name : undefined,
        command ? command.skill : undefined,
      );
    },
    onMutate: () => timeline.current?.scrollToLatest(),
    onSuccess: (_, input) => {
      if (input.model)
        client.setQueryData<SessionInfo>(['chat', sessionID, 'info'], (info) =>
          info ? { ...info, model: input.model } : info,
        );
      drafts.getState().acknowledge(input.draft);
      void refresh();
      void client.invalidateQueries({ queryKey: ['active'] });
      send.reset();
    },
    onError: () => void refresh(),
  });
  const stop = useMutation({
    mutationFn: () => api.interrupt(sessionID),
    onSuccess: () => {
      void refresh();
      void client.invalidateQueries({ queryKey: ['active'] });
    },
  });
  const plugin = useQuery({
    queryKey: ['side-chat-plugin', directory],
    queryFn: ({ signal }) => api.sideChatPlugin(directory, signal),
    staleTime: 60_000,
  });

  const start = chat.info.data?.time.created;
  const { messages, seen, reachedFork } = useMemo(() => {
    const loaded = chat.messages.data?.pages.flatMap((page) => page.data).toReversed() ?? [];
    const seen = new Set<string>();
    const messages = loaded.filter((message) => {
      // Forked history keeps its original times; this chat's own messages come later.
      if (start === undefined || message.time.created < start || seen.has(message.id)) return false;
      seen.add(message.id);
      return true;
    });
    return {
      messages,
      seen,
      reachedFork: start !== undefined && loaded.some((message) => message.time.created < start),
    };
  }, [chat.messages.data, start]);
  const running = Boolean(chat.active.data?.[sessionID]);
  const waiting =
    chat.inbox.data?.filter((item) => item.type === 'user' && !seen.has(item.id)) ?? [];
  const failed = [chat.info, chat.messages, chat.inbox, chat.permissions, chat.forms].find(
    (query) => query.isError,
  );
  const empty =
    chat.messages.isSuccess &&
    !messages.length &&
    !waiting.length &&
    !running &&
    !chat.permissions.data?.length &&
    !failed;
  const footer = (
    <>
      {failed && (
        <div className="chat-error" role="alert">
          <p>{failed.error?.message}</p>
          <Button variant="secondary" size="sm" onClick={() => void refresh()}>
            Retry
          </Button>
        </div>
      )}
      {waiting.map((item) => (
        <article className="user-message" key={item.id}>
          {item.type === 'user' && (
            <>
              {item.payload.text && <p className="user-message-bubble">{item.payload.text}</p>}
              <MessageAttachments files={item.payload.files} />
            </>
          )}
          <span className="message-note">Pending in OpenCode</span>
        </article>
      ))}
      {chat.permissions.data?.map((request) => (
        <PermissionCard key={request.id} request={request} session={chat.info.data} />
      ))}
      {!running && (chat.executionError.data || chat.info.data?.outcome === 'failed') && (
        <p className="text-error" role="alert">
          {chat.executionError.data || 'The run failed. Check OpenCode’s provider configuration.'}
        </p>
      )}
      <div className="chat-status" role="status">
        {chat.permissions.data?.length
          ? 'Waiting for permission'
          : chat.forms.data?.length
            ? 'Waiting for your answer'
            : !running && waiting.length
              ? 'Message accepted; waiting to run…'
              : ''}
      </div>
    </>
  );
  return (
    <section className="chat side-chat" data-session-id={sessionID} aria-label="Side chat">
      {empty ? (
        <div className="side-chat-intro">
          <h3>Side chat</h3>
          <p>
            It knows the main chat up to{' '}
            {start ? new Date(start).toLocaleTimeString([], { timeStyle: 'short' }) : 'now'}.
            Questions here don’t interrupt the main chat. Edits ask for approval first.
          </p>
          {plugin.data && plugin.data.state !== 'active' && plugin.data.state !== 'unavailable' && (
            <p className="message-note">
              To let side chats check the main chat’s latest progress, install the live context
              plugin in Settings → General.
            </p>
          )}
        </div>
      ) : chat.messages.data ? (
        <Timeline
          ref={timeline}
          sessionID={sessionID}
          messages={messages}
          hasEarlier={chat.messages.hasNextPage && !reachedFork}
          loadingEarlier={chat.messages.isFetchingNextPage}
          historyError={chat.messages.isFetchNextPageError}
          fetchEarlier={chat.messages.fetchNextPage}
          footer={footer}
          running={running}
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
        <MainChatStatus mainID={mainID} />
        {send.isError && (
          <p className="text-error" role="alert">
            {send.error.message} Your draft is kept.
          </p>
        )}
        {stop.isError && (
          <p className="text-error" role="alert">
            {stop.error.message}
          </p>
        )}
        {chat.forms.data?.[0] ? (
          <QuestionDock
            key={chat.forms.data[0].id}
            form={chat.forms.data[0]}
            pendingCount={chat.forms.data.length}
          />
        ) : (
          <Composer
            directory={chat.info.data?.location.directory}
            sessionID={sessionID}
            shortcuts={false}
            placeholder="Ask a side question"
            onSend={async () => {
              if (client.isMutating({ mutationKey: sendKey })) return;
              const draft = drafts.getState().capture(sessionID);
              if (
                !draft.text.trim() &&
                !(draft.attachments ?? EMPTY_ATTACHMENTS).length &&
                !draft.comments?.length
              )
                return;
              return send.mutateAsync({ draft, model: draft.model ?? model });
            }}
            sending={sending}
            ready={chat.info.isSuccess}
            running={running}
            stopping={stop.isPending}
            onStop={() => stop.mutate()}
            controls={
              <ModelControls
                shortcuts={false}
                sessionID={sessionID}
                models={catalog.data?.data}
                providers={catalog.data?.providers}
                model={model}
                disabled={!chat.info.isSuccess || sending}
                loading={catalog.isPending}
                failed={catalog.isError}
                onChange={select}
              />
            }
          />
        )}
      </div>
    </section>
  );
}
