import { useMemo, useState, type CSSProperties } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { RefreshIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type {
  OpenCodeProject,
  TokenUsageInfo,
  UsageBucket,
  UsageModel,
  UsagePeriod,
  UsageStats,
} from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { SegmentedControl } from '../../components/ui/segmented-control';
import { Select } from '../../components/ui/select';
import { api } from '../../lib/api';
import { ProviderLogo } from '../chat/provider-logo';
import { projectName } from '../projects/project-metadata';

type Metric = 'cost' | 'tokens';

const periods: { value: UsagePeriod; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
];
const periodText: Record<UsagePeriod, string> = {
  '24h': 'the last 24 hours',
  '7d': 'the last 7 days',
  '30d': 'the last 30 days',
  '90d': 'the last 90 days',
};
const metrics: { value: Metric; label: string }[] = [
  { value: 'cost', label: 'Spend' },
  { value: 'tokens', label: 'Tokens' },
];
const ALL = '';
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usdCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat('en-US');
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });

function money(value: number) {
  return value > 0 && value < 0.01 ? '<$0.01' : usd.format(value);
}

function tokenTotal(tokens: TokenUsageInfo) {
  return tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write;
}

export function UsageOverview({ connected }: { connected: boolean }) {
  const [period, setPeriod] = useState<UsagePeriod>('30d');
  const [metric, setMetric] = useState<Metric>('cost');
  const [project, setProject] = useState(ALL);
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: ({ signal }) => api.projects(signal),
    enabled: connected,
  });
  const stats = useQuery({
    queryKey: ['usage-stats', period, project, timeZone],
    queryFn: ({ signal }) =>
      api.usageStats({ period, timeZone, ...(project ? { project } : {}) }, signal),
    enabled: connected,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
  const projectOptions = useMemo(
    () => [
      { value: ALL, label: 'All projects' },
      ...[...(projects.data ?? [])]
        .sort((a, b) => b.time.active - a.time.active)
        .map((item: OpenCodeProject) => ({ value: item.id, label: projectName(item) })),
    ],
    [projects.data],
  );
  const data = stats.data;
  return (
    <>
      <div className="usage-toolbar">
        <SegmentedControl label="Period" value={period} options={periods} onChange={setPeriod} />
        <Select
          label="Project"
          value={project}
          options={projectOptions}
          onChange={setProject}
          renderOption={(option) => <span className="truncate">{option.label}</span>}
        />
        <Button
          variant="ghost"
          size="icon"
          className="usage-refresh"
          title="Refresh usage"
          disabled={!connected || stats.isFetching}
          onClick={() => void stats.refetch()}
        >
          <HugeiconsIcon
            icon={RefreshIcon}
            size={17}
            className={stats.isFetching ? 'spin' : undefined}
          />
        </Button>
      </div>
      {!connected ? (
        <p className="usage-note">Connect to OpenCode to see your usage.</p>
      ) : stats.error && !data ? (
        <p className="usage-note text-error" role="alert">
          {stats.error.message}
        </p>
      ) : !data ? (
        <p className="usage-note" role="status">
          Adding up usage…
        </p>
      ) : (
        <div className="usage-overview" data-stale={stats.isPlaceholderData || undefined}>
          <Summary stats={data} />
          {data.steps === 0 ? (
            <p className="usage-card usage-card-note">
              No agent activity in {periodText[data.period]}
              {project ? ' for this project' : ''}.
            </p>
          ) : (
            <>
              <section className="usage-panel">
                <div className="usage-panel-header">
                  <h2>{chartTitle(data.unit, metric)}</h2>
                  <SegmentedControl
                    label="Chart metric"
                    value={metric}
                    options={metrics}
                    onChange={setMetric}
                  />
                </div>
                <UsageChart stats={data} metric={metric} />
              </section>
              <TokenTypes tokens={data.tokens} />
              <ModelTable models={data.models} metric={metric} />
            </>
          )}
        </div>
      )}
    </>
  );
}

function chartTitle(unit: UsageStats['unit'], metric: Metric) {
  return `${unit === 'hour' ? 'Hourly' : 'Daily'} ${metric === 'cost' ? 'spend' : 'tokens'}`;
}

function Summary({ stats }: { stats: UsageStats }) {
  const tokens = tokenTotal(stats.tokens);
  const input = stats.tokens.input + stats.tokens.cache.read + stats.tokens.cache.write;
  const unpriced = stats.models.filter((model) => !model.priced);
  const planTokens = unpriced.reduce((sum, model) => sum + tokenTotal(model.tokens), 0);
  const failed = stats.tools.calls ? stats.tools.failed / stats.tools.calls : 0;
  return (
    <div className="usage-stats">
      <Stat
        label="API spend"
        value={money(stats.cost)}
        detail={
          planTokens
            ? `+ ${compact.format(planTokens)} tokens on plans`
            : `${stats.models.length} ${stats.models.length === 1 ? 'model' : 'models'}`
        }
        hint={
          planTokens
            ? `${unpriced.map((model) => model.name).join(', ')} ran on a subscription plan with no per-token price, so they don't count toward spend.`
            : undefined
        }
      />
      <Stat
        label="Tokens"
        value={compact.format(tokens)}
        detail={input ? `${percent.format(stats.tokens.cache.read / input)} of input cached` : '—'}
      />
      <Stat
        label="Sessions"
        value={whole.format(stats.sessions)}
        detail={`${compact.format(stats.prompts)} prompts · ${compact.format(stats.subagents)} subagents`}
      />
      <Stat
        label="Tool calls"
        value={compact.format(stats.tools.calls)}
        detail={stats.tools.calls ? `${percent.format(failed)} failed` : '—'}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  detail,
  hint,
}: {
  label: string;
  value: string;
  detail: string;
  hint?: string;
}) {
  return (
    <article className="usage-stat">
      <h3>{label}</h3>
      <strong>{value}</strong>
      <p data-tooltip={hint}>{detail}</p>
    </article>
  );
}

/** Brand-adjacent tints for the usual providers; others take the remaining project colors. */
const providerTints: Record<string, string> = {
  anthropic: 'var(--project-orange)',
  'claude-agent': 'var(--project-orange)',
  'claude-code': 'var(--project-orange)',
  openai: 'var(--project-green)',
  'google-vertex': 'var(--project-blue)',
  google: 'var(--project-blue)',
};
const spareTints = ['var(--project-purple)', 'var(--project-pink)', 'var(--project-gray)'];

function useProviderSeries(stats: UsageStats, metric: Metric) {
  return useMemo(() => {
    const totals = new Map<string, number>();
    for (const bucket of stats.buckets)
      for (const [id, value] of Object.entries(bucket.providers))
        totals.set(id, (totals.get(id) ?? 0) + value[metric]);
    const names = new Map(stats.providers.map((provider) => [provider.id, provider.name]));
    const used = new Set<string>();
    let spare = 0;
    return [...totals]
      .filter(([, total]) => total > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([id, total]) => {
        let tint = providerTints[id];
        // Two providers sharing a tint (Anthropic and Claude Agent) would merge in the stack.
        if (!tint || used.has(tint)) tint = spareTints[spare++ % spareTints.length]!;
        used.add(tint);
        return { id, name: names.get(id) ?? id, tint, total };
      });
  }, [stats, metric]);
}

function UsageChart({ stats, metric }: { stats: UsageStats; metric: Metric }) {
  const series = useProviderSeries(stats, metric);
  const [active, setActive] = useState<number>();
  const values = stats.buckets.map((bucket) => bucket[metric]);
  const max = niceMax(Math.max(...values));
  const format = metric === 'cost' ? (v: number) => usdCompact.format(v) : compact.format;
  const step = labelStep(stats);
  const total = values.reduce((sum, value) => sum + value, 0);
  const focused = active === undefined ? undefined : stats.buckets[active];
  return (
    <div className="usage-chart-wrap">
      {series.length > 1 && (
        <ul className="usage-legend-list">
          {series.map((item) => (
            <li key={item.id} style={{ '--tint': item.tint } as CSSProperties}>
              <span className="usage-swatch" aria-hidden="true" />
              {item.name}
            </li>
          ))}
        </ul>
      )}
      <div
        className="usage-chart"
        role="group"
        aria-label={`${chartTitle(stats.unit, metric)}: ${metric === 'cost' ? money(total) : `${compact.format(total)} tokens`} in total`}
        onMouseLeave={() => setActive(undefined)}
      >
        <div className="usage-axis" aria-hidden="true">
          <span>{format(max)}</span>
          <span>{format(max / 2)}</span>
          <span>{metric === 'cost' ? '$0' : '0'}</span>
        </div>
        <div className="usage-plot">
          <ol className="usage-bars" data-count={stats.buckets.length}>
            {stats.buckets.map((bucket, index) => (
              <li
                key={bucket.start}
                tabIndex={0}
                aria-label={`${bucketLabel(bucket, stats.unit)}: ${bucketValue(bucket, metric)}`}
                data-active={active === index || undefined}
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(undefined)}
              >
                <span className="usage-bar-stack">
                  {series.map((item) => {
                    const value = bucket.providers[item.id]?.[metric] ?? 0;
                    return value > 0 ? (
                      <span
                        key={item.id}
                        style={
                          {
                            '--tint': item.tint,
                            height: `${(value / max) * 100}%`,
                          } as CSSProperties
                        }
                      />
                    ) : null;
                  })}
                </span>
                {index % step === (stats.buckets.length - 1) % step && (
                  <span className="usage-tick" aria-hidden="true">
                    {tickLabel(bucket, stats.unit)}
                  </span>
                )}
              </li>
            ))}
          </ol>
          {focused && active !== undefined && (
            <div
              className="usage-chart-card"
              aria-hidden="true"
              data-side={(active + 0.5) / stats.buckets.length < 0.5 ? 'right' : 'left'}
              style={{ '--at': (active + 0.5) / stats.buckets.length } as CSSProperties}
            >
              <p className="usage-chart-card-title">{bucketLabel(focused, stats.unit)}</p>
              <p className="usage-chart-card-total">
                <strong>
                  {metric === 'cost'
                    ? money(focused.cost)
                    : `${compact.format(focused.tokens)} tokens`}
                </strong>
                <span>
                  {metric === 'cost'
                    ? `${compact.format(focused.tokens)} tokens`
                    : money(focused.cost)}
                </span>
              </p>
              {series
                .filter((item) => (focused.providers[item.id]?.tokens ?? 0) > 0)
                .map((item) => (
                  <p
                    key={item.id}
                    className="usage-chart-card-row"
                    style={{ '--tint': item.tint } as CSSProperties}
                  >
                    <span className="usage-swatch" />
                    <span className="truncate">{item.name}</span>
                    <span>
                      {metric === 'cost'
                        ? money(focused.providers[item.id]!.cost)
                        : compact.format(focused.providers[item.id]!.tokens)}
                    </span>
                  </p>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function bucketValue(bucket: UsageBucket, metric: Metric) {
  return metric === 'cost' ? money(bucket.cost) : `${compact.format(bucket.tokens)} tokens`;
}

function bucketLabel(bucket: UsageBucket, unit: UsageStats['unit']) {
  const start = new Date(bucket.start);
  if (unit === 'hour')
    return `${start.toLocaleDateString(undefined, { weekday: 'short' })} ${start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  return start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function tickLabel(bucket: UsageBucket, unit: UsageStats['unit']) {
  const start = new Date(bucket.start);
  if (unit === 'hour') return start.toLocaleTimeString(undefined, { hour: 'numeric' });
  return start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function labelStep(stats: UsageStats) {
  if (stats.unit === 'hour') return 6;
  return stats.buckets.length <= 7 ? 1 : stats.buckets.length <= 30 ? 7 : 15;
}

/** Rounds the axis top up to 1, 2 or 5 times a power of ten. */
function niceMax(value: number) {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  return ([1, 2, 5, 10].find((step) => step * power >= value) ?? 10) * power;
}

const tokenKinds: { key: string; label: string; pick: (tokens: TokenUsageInfo) => number }[] = [
  { key: 'cache-read', label: 'Cache read', pick: (tokens) => tokens.cache.read },
  { key: 'cache-write', label: 'Cache write', pick: (tokens) => tokens.cache.write },
  { key: 'input', label: 'Input', pick: (tokens) => tokens.input },
  { key: 'output', label: 'Output', pick: (tokens) => tokens.output },
  { key: 'reasoning', label: 'Reasoning', pick: (tokens) => tokens.reasoning },
];

function TokenTypes({ tokens }: { tokens: TokenUsageInfo }) {
  const total = tokenTotal(tokens);
  return (
    <section className="usage-panel">
      <div className="usage-panel-header">
        <h2>Tokens by type</h2>
      </div>
      <div
        className="usage-share"
        role="img"
        aria-label={tokenKinds
          .map((kind) => `${kind.label} ${percent.format(kind.pick(tokens) / total || 0)}`)
          .join(', ')}
      >
        {tokenKinds.map((kind) => {
          const value = kind.pick(tokens);
          return value > 0 ? (
            <span key={kind.key} data-kind={kind.key} style={{ flexGrow: value }} />
          ) : null;
        })}
      </div>
      <dl className="usage-kinds">
        {tokenKinds.map((kind) => (
          <div key={kind.key} data-kind={kind.key}>
            <dt>
              <span className="usage-swatch" aria-hidden="true" />
              {kind.label}
            </dt>
            <dd>
              {compact.format(kind.pick(tokens))}
              <span>{percent.format(kind.pick(tokens) / total || 0)}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ModelTable({ models, metric }: { models: UsageModel[]; metric: Metric }) {
  const sorted = useMemo(
    () =>
      metric === 'cost'
        ? models
        : [...models].sort((a, b) => tokenTotal(b.tokens) - tokenTotal(a.tokens)),
    [models, metric],
  );
  const total = sorted.reduce(
    (sum, model) => sum + (metric === 'cost' ? model.cost : tokenTotal(model.tokens)),
    0,
  );
  return (
    <section className="usage-panel">
      <div className="usage-panel-header">
        <h2>Models</h2>
      </div>
      <table className="usage-models">
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col">Spend</th>
            <th scope="col" className="usage-share-col">
              Share of {metric === 'cost' ? 'spend' : 'tokens'}
            </th>
            <th scope="col">Tokens</th>
            <th scope="col" className="usage-steps-col">
              Steps
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((model) => {
            const value = metric === 'cost' ? model.cost : tokenTotal(model.tokens);
            const share = total ? value / total : 0;
            return (
              <tr key={`${model.providerID}/${model.id}`}>
                <th scope="row">
                  <span className="usage-model">
                    <ProviderLogo providerID={model.providerID} />
                    <span className="usage-model-name">
                      <span className="truncate">{model.name}</span>
                      <span className="truncate">{model.provider}</span>
                    </span>
                  </span>
                </th>
                <td>
                  {model.priced ? (
                    money(model.cost)
                  ) : (
                    <span
                      className="usage-plan"
                      data-tooltip="Runs on a subscription plan, with no per-token price"
                    >
                      Plan
                    </span>
                  )}
                </td>
                <td className="usage-share-col">
                  <span className="usage-share-cell">
                    <span className="usage-meter" aria-hidden="true">
                      <span style={{ width: `${share * 100}%` }} />
                    </span>
                    <span className="usage-share-value">{percent.format(share)}</span>
                  </span>
                </td>
                <td>{compact.format(tokenTotal(model.tokens))}</td>
                <td className="usage-steps-col">{whole.format(model.steps)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
