import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowUp02Icon, StopIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '../../components/ui/button';

export function Composer({
  sessionID,
  drafts,
  onSend,
  sending,
  ready,
  running,
  stopping,
  onStop,
  controls,
}: {
  sessionID: string;
  drafts: Map<string, string>;
  onSend: (text: string) => Promise<unknown>;
  sending: boolean;
  ready: boolean;
  running: boolean;
  stopping: boolean;
  onStop: () => void;
  controls: ReactNode;
}) {
  const [draft, setDraft] = useState(() => drafts.get(sessionID) ?? '');
  const textarea = useRef<HTMLTextAreaElement>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || sending || !ready) return;
    const text = draft;
    try {
      await onSend(text);
      if (drafts.get(sessionID) === text) {
        drafts.delete(sessionID);
        setDraft('');
      }
      textarea.current?.focus();
    } catch {
      // The mutation renders the error. Keep the draft for an explicit retry.
    }
  }
  return (
    <form className="composer" onSubmit={(event) => void submit(event)}>
      <textarea
        ref={textarea}
        aria-label="Message"
        placeholder="Ask anything, or describe what to build"
        rows={2}
        value={draft}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          if (text) drafts.set(sessionID, text);
          else drafts.delete(sessionID);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <div className="composer-footer">
        {controls}
        {running && (
          <Button
            variant="secondary"
            size="icon"
            aria-label="Stop"
            title="Stop"
            disabled={stopping}
            onClick={onStop}
          >
            <HugeiconsIcon icon={StopIcon} size={14} />
          </Button>
        )}
        <Button
          type="submit"
          size="icon"
          aria-label="Send message"
          title="Send message"
          disabled={!draft.trim() || sending || !ready}
        >
          <HugeiconsIcon icon={ArrowUp02Icon} size={16} />
        </Button>
      </div>
    </form>
  );
}
