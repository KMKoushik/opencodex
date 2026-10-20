import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { encode } from 'uqr';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { api } from '../../lib/api';

function QrCode({ value }: { value: string }) {
  const path = useMemo(() => {
    const { data } = encode(value, { ecc: 'M', border: 2 });
    let d = '';
    data.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) d += `M${x} ${y}h1v1h-1z`;
      }),
    );
    return { d, size: data.length };
  }, [value]);
  return (
    <svg
      className="pair-qr"
      viewBox={`0 0 ${path.size} ${path.size}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="Pairing QR code"
    >
      <path d={path.d} />
    </svg>
  );
}

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/** One-time pairing code for a new device; closes itself into a confirmation once used. */
export default function PairDialog({
  hostname,
  paired,
  onClose,
}: {
  hostname: string;
  paired: string | undefined;
  onClose: () => void;
}) {
  const create = useMutation({ mutationFn: api.createPairCode });
  const { mutate } = create;
  useEffect(() => mutate(), [mutate]);
  const code = create.data;
  const now = useNow(Boolean(code) && !paired);
  const left = code ? Math.max(0, Math.floor((code.expires - now) / 1000)) : 0;

  return (
    <Dialog title="Add a device" onClose={onClose}>
      <div className="pair-dialog" aria-live="polite">
        {paired ? (
          <>
            <p className="pair-dialog-done">{paired} is paired.</p>
            <Button onClick={onClose}>Done</Button>
          </>
        ) : create.error ? (
          <p className="field-error">{create.error.message}</p>
        ) : !code ? (
          <p>Making a code…</p>
        ) : left > 0 ? (
          <>
            <QrCode value={code.url} />
            <p>
              Scan with the device’s camera, or open <strong>{hostname}</strong> on it and enter:
            </p>
            <p className="pair-code">{code.code}</p>
            <p>
              Works once. Expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}.
            </p>
          </>
        ) : (
          <>
            <p>This code expired.</p>
            <Button disabled={create.isPending} onClick={() => mutate()}>
              New code
            </Button>
          </>
        )}
      </div>
    </Dialog>
  );
}
