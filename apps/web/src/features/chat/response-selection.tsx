import { useContext, type RefObject } from 'react';
import { SideChatQuoteContext } from '../side-chat/side-chat-context';
import { TextSelection } from './text-selection';

function responseTarget(range: Range, quote: string) {
  const start = range.startContainer.parentElement?.closest<HTMLElement>('[data-response-id]');
  const end = range.endContainer.parentElement?.closest('[data-response-id]');
  if (!start || start !== end) return;
  const prefix = range.cloneRange();
  prefix.selectNodeContents(start);
  prefix.setEnd(range.startContainer, range.startOffset);
  return {
    messageID: start.dataset.responseId!,
    ordinal: Number(start.dataset.responseOrdinal),
    offset: prefix.toString().length + range.toString().indexOf(quote),
    quote,
  };
}

export function ResponseSelection({
  scope,
  sessionID,
}: {
  scope: RefObject<HTMLDivElement | null>;
  sessionID: string;
}) {
  const askSideChat = useContext(SideChatQuoteContext);
  return (
    <TextSelection
      scope={scope}
      sessionID={sessionID}
      getTarget={responseTarget}
      actionsLabel="Selected response actions"
      onAskSideChat={askSideChat ?? undefined}
    />
  );
}
