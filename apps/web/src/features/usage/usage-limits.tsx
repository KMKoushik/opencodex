import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshIcon, Refresh01Icon, TradeDownIcon, TradeUpIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { UsageProvider, UsageWindow } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/api';
import { ProviderLogo } from '../chat/provider-logo';
import './usage.css';

const logos: Record<UsageProvider['id'], string> = {
  codex: 'openai',
  claude: 'anthropic',
  'opencode-go': 'opencode',
};

export function UsageLimitsPage({ connected }: { connected: boolean }) {
  const limits = useQuery({
    queryKey: ['usage-limits'],
    queryFn: ({ signal }) => api.usageLimits(signal),
    enabled: connected,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
  const now = useMinuteClock();
  const providers = limits.data?.providers;
  return (
    <>
      <header className="usage-header">
        <h1 className="usage-breadcrumb">
          <span>Usage</span>
          <span aria-hidden="true">/</span>
          <span>Limits</span>
        </h1>
        <Button
          variant="ghost"
          size="icon"
          title="Refresh limits"
          disabled={!connected || limits.isFetching}
          onClick={() => void limits.refetch()}
        >
          <HugeiconsIcon
            icon={RefreshIcon}
            size={17}
            className={limits.isFetching ? 'spin' : undefined}
          />
        </Button>
      </header>
      {connected && limits.error && (
        <p className="usage-note text-error" role="alert">
          {limits.error.message}
        </p>
      )}
      {!connected ? (
        <p className="usage-note">Connect to OpenCode to check your plan limits.</p>
      ) : !providers ? (
        !limits.error && (
          <p className="usage-note" role="status">
            Checking limits…
          </p>
        )
      ) : providers.length === 0 ? (
        <p className="usage-note">
          No plan limits to show. Sign in with ChatGPT or add an OpenCode Go key in OpenCode, or
          sign in to Claude Code, to see your remaining usage here.
        </p>
      ) : (
        providers.map((provider) => (
          <ProviderLimits key={provider.id} provider={provider} now={now} />
        ))
      )}
    </>
  );
}

function ProviderLimits({ provider, now }: { provider: UsageProvider; now: number }) {
  return (
    <section className="usage-provider" data-provider={provider.id}>
      <h2>
        <ProviderLogo providerID={logos[provider.id]} />
        {provider.name}
      </h2>
      {provider.error ? (
        <p className="usage-card usage-card-note text-error">{provider.error}</p>
      ) : provider.windows.length === 0 ? (
        <p className="usage-card usage-card-note">This plan reports no usage limits.</p>
      ) : (
        provider.windows.map((window) => (
          <LimitCard key={window.id} provider={provider.name} window={window} now={now} />
        ))
      )}
    </section>
  );
}

function LimitCard({
  provider,
  window,
  now,
}: {
  provider: string;
  window: UsageWindow;
  now: number;
}) {
  const left = Math.round(100 - window.usedPercent);
  const pace = usagePace(window, now);
  return (
    <article className="usage-card" data-limited={window.limited || undefined}>
      <div className="usage-summary">
        <h3>{window.label}</h3>
        <p className="usage-left">
          <strong>{left}%</strong>
          <span>left</span>
          {pace && (
            <span
              className="usage-pace"
              role="img"
              aria-label={pace.label}
              data-tooltip={pace.label}
              data-fast={pace.fast || undefined}
            >
              <HugeiconsIcon icon={pace.fast ? TradeUpIcon : TradeDownIcon} size={18} />
            </span>
          )}
        </p>
      </div>
      <div className="usage-detail">
        <div
          className="usage-bar"
          role="meter"
          aria-label={`${provider} ${window.label.toLocaleLowerCase()} limit remaining`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={left}
          aria-valuetext={`${left}% left`}
        >
          {left > 0 && (
            <span className="usage-fill" style={{ width: `${left}%` }}>
              {left >= 8 && '1'}
            </span>
          )}
        </div>
        <div className="usage-legend">
          <span>
            <span className="usage-badge" aria-hidden="true">
              1
            </span>
            {provider} {left}%
          </span>
          {window.resetsAt !== undefined && window.resetsAt > now && (
            <span
              className="usage-reset"
              data-tooltip={`Resets ${new Date(window.resetsAt).toLocaleString()}`}
            >
              <HugeiconsIcon icon={Refresh01Icon} size={13} aria-hidden="true" />
              <span className="usage-hidden">Resets in </span>
              {countdown(window.resetsAt - now)}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

/** Compares usage with the share of the window already elapsed. */
function usagePace(window: UsageWindow, now: number) {
  if (window.resetsAt === undefined || !window.durationMs) return;
  const elapsed = 1 - (window.resetsAt - now) / window.durationMs;
  if (elapsed <= 0 || elapsed >= 1) return;
  const used = window.usedPercent / 100;
  const fast = used > elapsed;
  const share = Math.round(elapsed * 100);
  return {
    fast,
    label: fast
      ? `Using faster than the limit resets: ${Math.round(window.usedPercent)}% used with ${share}% of the window elapsed`
      : `On pace: ${Math.round(window.usedPercent)}% used with ${share}% of the window elapsed`,
  };
}

function countdown(ms: number) {
  const minutes = Math.max(0, Math.ceil(ms / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes % 60}m`;
  return minutes ? `${minutes}m` : 'now';
}

function useMinuteClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
