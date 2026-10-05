import { useEffect, useState } from 'react';
import { Copy01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '../../components/ui/button';
import './response-copy.css';

export function ResponseCopy({ text }: { text: string }) {
  const [status, setStatus] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle');
  useEffect(() => {
    if (status !== 'copied') return;
    const timer = setTimeout(() => setStatus('idle'), 2000);
    return () => clearTimeout(timer);
  }, [status]);

  async function copy() {
    setStatus('copying');
    try {
      await navigator.clipboard.writeText(text);
      setStatus('copied');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div
      className="response-copy"
      data-visible={status === 'copied' || status === 'error' ? 'true' : undefined}
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label="Copy response"
        title={status === 'copied' ? 'Copied' : 'Copy response'}
        disabled={status === 'copying' || status === 'copied'}
        onClick={() => void copy()}
      >
        <HugeiconsIcon
          icon={status === 'copied' ? Tick02Icon : Copy01Icon}
          size={16}
          aria-hidden="true"
        />
      </Button>
      <span role="status">{status === 'copied' ? 'Copied' : ''}</span>
      {status === 'error' && (
        <span className="text-error" role="alert">
          Could not copy. Try again.
        </span>
      )}
    </div>
  );
}
