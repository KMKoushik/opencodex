import { useRef, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { useUpdates } from './use-updates';
import './updates.css';

const releases = 'https://github.com/KMKoushik/opencodex/releases';

export function UpdateControl({ compact = false }: { compact?: boolean }) {
  const { state: query, action } = useUpdates();
  const [confirming, setConfirming] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  if (!window.desktop) return null;
  const state = query.data;
  const status = state?.status;
  const pending =
    action.isPending ||
    status === 'checking' ||
    status === 'downloading' ||
    status === 'installing';
  const hasUpdate =
    status === 'available' ||
    status === 'ready' ||
    status === 'downloading' ||
    status === 'installing';
  const error = action.error?.message ?? query.error?.message ?? state?.error;
  if (compact && !hasUpdate) return null;
  const label =
    status === 'available'
      ? `Update to v${state?.version}`
      : status === 'downloading'
        ? `Downloading… ${state?.percent ?? 0}%`
        : status === 'ready'
          ? 'Restart to update'
          : status === 'installing'
            ? 'Preparing restart…'
            : status === 'checking'
              ? 'Checking…'
              : 'Check for updates';

  return (
    <div className={`update-control${compact ? ' update-compact' : ''}`}>
      {compact ? (
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => {
            if (status === 'ready') setConfirming(true);
            else action.mutate('download');
          }}
        >
          {label}
        </Button>
      ) : (
        <div className="update-actions">
          <Button
            variant="secondary"
            size="sm"
            disabled={pending || status === 'disabled' || !state}
            onClick={() => {
              if (status === 'ready') setConfirming(true);
              else action.mutate(status === 'available' ? 'download' : 'check');
            }}
          >
            {label}
          </Button>
          <a
            href={
              state?.version ? `${releases}/tag/v${encodeURIComponent(state.version)}` : releases
            }
            target="_blank"
            rel="noreferrer"
          >
            Release notes
          </a>
        </div>
      )}
      {status === 'downloading' && (
        <progress aria-label="Update download" max={100} value={state?.percent ?? 0} />
      )}
      {error && (
        <p className="update-error" role="alert">
          {error}
        </p>
      )}
      {confirming && (
        <Dialog
          title="Restart to update?"
          onClose={() => setConfirming(false)}
          initialFocus={cancel}
        >
          <p className="update-restart-copy">
            OpenCodex will restart to install v{state?.version}. Save your files and send any drafts
            first; unsaved changes will be lost. OpenCode and running agents will keep running.
          </p>
          <div className="dialog-actions">
            <Button ref={cancel} variant="secondary" onClick={() => setConfirming(false)}>
              Not now
            </Button>
            <Button
              onClick={() => {
                setConfirming(false);
                action.mutate('install');
              }}
            >
              Restart and update
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
