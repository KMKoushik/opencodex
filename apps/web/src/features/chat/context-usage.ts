import type { InfiniteData } from '@tanstack/react-query';
import type { SessionMessagesResponse, TokenUsageInfo } from '@opencodex/contracts';

export function tokenTotal(tokens: TokenUsageInfo) {
  return tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write;
}

// Native pages are newest-first. Never scan the full transcript for context usage.
export function latestResponse(data: InfiniteData<SessionMessagesResponse>) {
  return data.pages[0]?.data.find(
    (message) => message.type === 'assistant' && message.tokens && tokenTotal(message.tokens) > 0,
  );
}
