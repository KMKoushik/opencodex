import { lazy, Suspense, useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  REMOTE_DEFAULT_PORT,
  type RemoteStatus,
  type RemoteConfig,
} from '@opencodex/contracts/remote';
import { Button } from '../../components/ui/button';
import { SegmentedControl } from '../../components/ui/segmented-control';
import { api } from '../../lib/api';
import { ago } from '../apps/app-time';
import { SettingsGroup, SettingsRow } from '../settings/settings-layout';
import './remote.css';

const PairDialog = lazy(() => import('./pair-dialog'));

const remoteKey = ['remote'];
type Draft = { hostname: string; port: string; tunnel: RemoteConfig['tunnel']; token: string };

const dates = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

function describe(data: RemoteStatus): { text: string; tone?: 'error' | 'success' } {
  if (!data.enabled) return { text: 'Off. Only this computer can use OpenCodex.' };
  if (data.listener.state === 'failed')
    return { text: data.listener.message ?? 'Remote access couldn’t start.', tone: 'error' };
  if (data.listener.state !== 'listening') return { text: 'Starting…' };
  if (!data.served)
    return {
      text: 'This development gateway serves only the API, so remote devices can’t load the app. Use a built OpenCodex to add devices.',
      tone: 'error',
    };
  if (data.tunnel === 'external')
    return { text: `Listening on 127.0.0.1:${data.port} for ${data.hostname}.` };
  const connector = data.connector;
  if (connector.state === 'connected')
    return { text: `Connected to Cloudflare at ${data.hostname}.`, tone: 'success' };
  if (connector.state === 'missing' || connector.state === 'failed')
    return { text: connector.message ?? 'cloudflared stopped.', tone: 'error' };
  return {
    text: connector.message
      ? `Connecting to Cloudflare… ${connector.message}`
      : 'Connecting to Cloudflare…',
  };
}

export function RemoteSettings() {
  const client = useQueryClient();
  const ids = { hostname: useId(), token: useId(), port: useId() };
  const [pairing, setPairing] = useState<number>();
  const status = useQuery({
    queryKey: remoteKey,
    queryFn: ({ signal }) => api.remote(signal),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (pairing) return 2_000;
      if (!data?.enabled) return false;
      return data.tunnel === 'external' || data.connector.state === 'connected' ? 10_000 : 2_000;
    },
  });
  const data = status.data;
  const [edits, setEdits] = useState<Partial<Draft>>({});
  const draft: Draft = {
    hostname: data?.hostname ?? '',
    port: String(data?.port ?? REMOTE_DEFAULT_PORT),
    tunnel: data?.tunnel ?? 'token',
    token: '',
    ...edits,
  };
  const edit = (change: Partial<Draft>) => setEdits((current) => ({ ...current, ...change }));
  const save = useMutation({
    mutationFn: (enabled: boolean) =>
      api.configureRemote({
        enabled,
        hostname: draft.hostname.trim() || null,
        port: Number(draft.port),
        tunnel: draft.tunnel,
        token: draft.token.trim() || undefined,
      }),
    onSuccess: (next) => {
      client.setQueryData(remoteKey, next);
      setEdits({});
    },
  });
  const revoke = useMutation({
    mutationFn: api.revokeDevice,
    onSettled: () => client.invalidateQueries({ queryKey: remoteKey }),
  });

  if (!data)
    return (
      <SettingsGroup title="Remote access">
        <SettingsRow
          label="Status"
          description={
            <span role="status" className={status.error ? 'text-error' : undefined}>
              {status.error?.message ?? 'Checking…'}
            </span>
          }
        />
      </SettingsGroup>
    );

  const state = describe(data);
  const dirty = Object.keys(edits).length > 0;
  const ready = data.enabled && data.listener.state === 'listening' && data.hostname;
  const paired = pairing
    ? data.devices.find((device) => device.created >= pairing)?.name
    : undefined;
  const target = <code>http://127.0.0.1:{draft.port || REMOTE_DEFAULT_PORT}</code>;

  return (
    <>
      <SettingsGroup
        title="Remote access"
        action={
          <Button
            variant={data.enabled ? 'secondary' : 'primary'}
            size="sm"
            disabled={save.isPending}
            onClick={() => save.mutate(!data.enabled)}
          >
            {data.enabled ? 'Turn off' : 'Turn on'}
          </Button>
        }
      >
        <SettingsRow
          label="Status"
          description={
            <span role="status" className="remote-status" data-tone={state.tone}>
              {state.text}
            </span>
          }
        />
        <SettingsRow
          label="Hostname"
          htmlFor={ids.hostname}
          description="The public address your Cloudflare tunnel serves."
        >
          <input
            id={ids.hostname}
            className="remote-input"
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            placeholder="opencodex.example.com"
            value={draft.hostname}
            onChange={(event) => edit({ hostname: event.target.value })}
          />
        </SettingsRow>
        <SettingsRow
          label="Tunnel"
          description={
            draft.tunnel === 'token'
              ? 'OpenCodex runs cloudflared while the app is open.'
              : 'You run cloudflared yourself.'
          }
        >
          <SegmentedControl
            label="Tunnel"
            value={draft.tunnel}
            options={[
              { value: 'token', label: 'Token' },
              { value: 'external', label: 'My own' },
            ]}
            onChange={(tunnel) => edit({ tunnel })}
          />
        </SettingsRow>
        {draft.tunnel === 'token' && (
          <SettingsRow
            label="Tunnel token"
            htmlFor={ids.token}
            description={
              <>
                In Cloudflare Zero Trust, give your tunnel a public hostname whose service is{' '}
                {target}, then copy its token. For a tunnel made with the CLI, run{' '}
                <code>cloudflared tunnel token NAME</code>.
              </>
            }
          >
            <input
              id={ids.token}
              className="remote-input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={data.tokenSet ? 'Saved' : 'Paste the token'}
              value={draft.token}
              onChange={(event) => edit({ token: event.target.value })}
            />
          </SettingsRow>
        )}
        <SettingsRow
          label="Port"
          htmlFor={ids.port}
          description={
            draft.tunnel === 'token' ? (
              'Remote requests arrive on this local port.'
            ) : (
              <>Point your tunnel’s service at {target}.</>
            )
          }
        >
          <input
            id={ids.port}
            className="remote-input remote-port"
            type="number"
            min={1024}
            max={65535}
            value={draft.port}
            onChange={(event) => edit({ port: event.target.value })}
          />
        </SettingsRow>
        {(dirty || save.error) && (
          <div className="settings-row remote-actions">
            <p className="field-error" role="alert">
              {save.error?.message}
            </p>
            {dirty && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={save.isPending}
                  onClick={() => {
                    setEdits({});
                    save.reset();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={save.isPending}
                  onClick={() => save.mutate(data.enabled)}
                >
                  {save.isPending ? 'Saving…' : 'Save'}
                </Button>
              </>
            )}
          </div>
        )}
      </SettingsGroup>
      <SettingsGroup
        title="Devices"
        action={
          <Button
            variant="secondary"
            size="sm"
            disabled={!ready || !data.served}
            onClick={() => setPairing(Date.now())}
          >
            Add device
          </Button>
        }
      >
        {data.devices.length ? (
          data.devices.map((device) => (
            <SettingsRow
              key={device.id}
              label={device.name}
              description={`Paired ${dates.format(device.created)}${device.seen ? ` · Active ${ago(device.seen)}` : ''}`}
            >
              <Button
                variant="ghost"
                size="sm"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(device.id)}
              >
                Revoke
              </Button>
            </SettingsRow>
          ))
        ) : (
          <SettingsRow
            label="No devices"
            description="Paired phones and computers appear here. Revoking one signs it out at once."
          />
        )}
        {revoke.error && (
          <p className="settings-row field-error" role="alert">
            {revoke.error.message}
          </p>
        )}
      </SettingsGroup>
      {pairing && data.hostname && (
        <Suspense>
          <PairDialog
            hostname={data.hostname}
            paired={paired}
            onClose={() => setPairing(undefined)}
          />
        </Suspense>
      )}
    </>
  );
}
