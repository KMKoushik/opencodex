import { useEffect, useRef, useState, type FormEvent } from 'react';
import { apiErrorSchema } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { BrandIcon } from '../brand/brand';
import './remote.css';

/** Shown instead of the app in a remote browser that isn't paired yet. */
function linkedCode() {
  const match = /^#pair=([0-9A-Za-z-]{1,32})$/.exec(location.hash);
  if (!match) return;
  // The QR link carries the code in the fragment, which never reaches a server log.
  history.replaceState(null, '', location.pathname + location.search);
  return match[1];
}

// Read once, when this lazily loaded module first runs, before StrictMode replays anything.
const linked = linkedCode();

export function PairScreen() {
  const [code, setCode] = useState(linked ?? '');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(Boolean(linked));
  const input = useRef<HTMLInputElement>(null);

  const send = async (value: string) => {
    try {
      const response = await fetch('/api/remote/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: value }),
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok) {
        location.reload();
        return;
      }
      const body = apiErrorSchema.safeParse(await response.json().catch(() => null));
      setError(body.success ? body.data.message : 'This device couldn’t be paired.');
    } catch {
      setError('OpenCodex couldn’t be reached. Check that it’s open on your computer.');
    }
    setBusy(false);
    input.current?.focus();
  };

  const start = (value: string) => {
    setBusy(true);
    setError(undefined);
    void send(value);
  };

  const linkedSent = useRef(false);
  useEffect(() => {
    if (linked && !linkedSent.current) {
      linkedSent.current = true;
      void send(linked);
    }
    // A link opened in this same tab changes only the fragment; reload to read it.
    const changed = () => {
      if (location.hash.startsWith('#pair=')) location.reload();
    };
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!busy && code.trim()) start(code);
  };

  return (
    <main className="pair-screen">
      <form className="pair-card" onSubmit={submit}>
        <BrandIcon size="large" className="pair-icon" />
        <h1>Pair this device</h1>
        <p>
          On your computer, open OpenCodex Settings → Remote access and choose Add device. Scan the
          QR code, or enter the code here.
        </p>
        <input
          ref={input}
          aria-label="Pairing code"
          placeholder="XXXXX-XXXXX"
          autoCapitalize="characters"
          autoComplete="one-time-code"
          spellCheck={false}
          autoFocus
          value={code}
          disabled={busy}
          onChange={(event) => setCode(event.target.value)}
        />
        <p className="field-error" role="alert">
          {error}
        </p>
        <Button type="submit" disabled={busy || !code.trim()}>
          {busy ? 'Pairing…' : 'Pair'}
        </Button>
      </form>
    </main>
  );
}
