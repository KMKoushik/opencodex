import type { OpenCodeEvent } from '@opencodex/contracts';

export type LivePart = {
  messageID: string;
  type: 'text' | 'reasoning';
  ordinal: number;
  text: string;
};

// Only an ephemeral display overlay. Durable messages always come from OpenCode.
export function updateStream(parts: LivePart[], event: OpenCodeEvent): LivePart[] {
  switch (event.type) {
    case 'session.step.started':
      return [];
    case 'session.text.started':
    case 'session.reasoning.started': {
      const type = event.type === 'session.text.started' ? 'text' : 'reasoning';
      const part: LivePart = {
        messageID: event.data.assistantMessageID,
        type,
        ordinal: event.data.ordinal,
        text: '',
      };
      return [...parts.filter((item) => !matches(item, part)), part];
    }
    case 'session.text.delta':
    case 'session.reasoning.delta':
    case 'session.text.ended':
    case 'session.reasoning.ended': {
      const type = event.type.startsWith('session.text.') ? 'text' : 'reasoning';
      const key = { messageID: event.data.assistantMessageID, type, ordinal: event.data.ordinal };
      // A late subscriber must not present a suffix as a complete response. The ended
      // event triggers a snapshot refresh with the full text, even if started was missed.
      return parts.map((part) =>
        matches(part, key)
          ? {
              ...part,
              text: 'delta' in event.data ? part.text + event.data.delta : event.data.text,
            }
          : part,
      );
    }
    default:
      return parts;
  }
}

function matches(a: LivePart, b: { messageID: string; type: string; ordinal: number }) {
  return a.messageID === b.messageID && a.type === b.type && a.ordinal === b.ordinal;
}
