import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { SessionMessageInfo } from '@opencodex/contracts';
import type { LivePart } from './stream';
import { ActivityText } from './activity-text';

const noParts: LivePart[] = [];

export function ThinkingIndicator({
  sessionID,
  latest,
}: {
  sessionID: string;
  latest?: SessionMessageInfo;
}) {
  const message = latest?.type === 'assistant' ? latest : undefined;
  const messageID = message?.time.completed === undefined ? message?.id : undefined;
  // Select the current phase only: token deltas must not rerender the status or
  // transcript, and an interrupted step's overlay must not hide a new run.
  const selectPhase = useCallback(
    (parts: LivePart[]) => {
      const part = parts.at(-1);
      if (!part || part.messageID !== messageID) return undefined;
      return part.type === 'text' && !part.completed && part.text ? 'text' : 'thinking';
    },
    [messageID],
  );
  const stream = useQuery({
    queryKey: ['chat', sessionID, 'stream'],
    queryFn: () => noParts,
    enabled: false,
    initialData: noParts,
    select: selectPhase,
    gcTime: 0,
  });
  const part = message?.content.at(-1);
  const reasoning =
    message?.time.completed === undefined &&
    part?.type === 'reasoning' &&
    part.time?.completed === undefined;
  const tools = message?.content.some(
    (part) =>
      part.type === 'tool' &&
      (part.state.status === 'running' || part.state.status === 'streaming'),
  );
  const text = message?.time.completed === undefined && part?.type === 'text' && Boolean(part.text);
  // Active work already has a shimmering disclosure. Don't duplicate it below,
  // or claim to be thinking while writing a response or displaying a retry.
  if (latest?.type === 'compaction' && latest.status === 'running') return null;
  if (reasoning || tools || message?.retry || message?.error) return null;
  if (stream.data === 'text' || (stream.data === undefined && text)) return null;
  return <ActivityText active>Thinking</ActivityText>;
}
