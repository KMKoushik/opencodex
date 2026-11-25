import { homedir } from 'node:os';
import type { OpenCodeClient, SessionStatsInfo, TokenUsageInfo } from '@opencode/client';
import {
  usagePeriods,
  type UsageBucket,
  type UsageModel,
  type UsagePeriod,
  type UsageStats,
} from '@opencodex/contracts';
import type { OpenCodeBackend } from './opencode';
import { GatewayError } from './errors';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const shape: Record<UsagePeriod, { count: number; unit: 'hour' | 'day' }> = {
  '24h': { count: 24, unit: 'hour' },
  '7d': { count: 7, unit: 'day' },
  '30d': { count: 30, unit: 'day' },
  '90d': { count: 90, unit: 'day' },
};
/** Concurrent stats queries; each scans OpenCode's database, which agents are also using. */
const CONCURRENCY = 6;
/** Finished buckets barely change, so switching periods reuses them for a while. */
const CACHE_TTL = 10 * 60_000;
const CACHE_LIMIT = 1_000;
const cache = new Map<string, { at: number; value: SessionStatsInfo }>();

type Filter = { project?: string; timeZone: string };

/**
 * Spend and tokens over a period from OpenCode's own session stats: one query for the totals,
 * models and tool calls, and one per hour or day for the chart, since OpenCode's activity
 * series counts only steps.
 */
export async function usageStats(
  backend: OpenCodeBackend,
  input: { period: string | undefined; project?: string; timeZone?: string },
  signal: AbortSignal,
): Promise<UsageStats> {
  const period = (input.period ?? '30d') as UsagePeriod;
  if (!usagePeriods.includes(period)) throw new GatewayError('Unknown usage period.', 400);
  const timeZone = validTimeZone(input.timeZone);
  const filter: Filter = { timeZone, ...(input.project ? { project: input.project } : {}) };
  const now = Date.now();
  const { unit } = shape[period];
  const edges = bucketEdges(period, timeZone, now);
  return backend.request(
    signal,
    async (client, options) => {
      const location = { directory: homedir() };
      const [total, catalog, providers, buckets] = await Promise.all([
        client.session.stats(query(filter, edges[0]!, now, 'summary'), options),
        client.model.list({ location }, options).catch(() => undefined),
        client.provider.list({ location }, options).catch(() => undefined),
        mapLimit(edges.slice(0, -1), CONCURRENCY, (from, index) =>
          bucketStats(client, filter, from, edges[index + 1]!, now, options),
        ),
      ]);
      const prices = new Map(
        catalog?.data.map((model) => [
          `${model.providerID}/${model.id}`,
          {
            name: model.name,
            priced: model.cost.some((cost) => cost.input > 0 || cost.output > 0),
          },
        ]),
      );
      const providerNames = new Map(providers?.data.map((item) => [item.id, item.name]));
      return {
        period,
        unit,
        from: edges[0]!,
        to: now,
        sessions: total.sessions,
        subagents: total.subagents,
        prompts: total.prompts,
        steps: total.steps,
        cost: total.cost,
        tokens: total.tokens,
        tools:
          total.tools.mode === 'none'
            ? { calls: 0, succeeded: 0, failed: 0 }
            : {
                calls: total.tools.totals.calls,
                succeeded: total.tools.totals.succeeded,
                failed: total.tools.totals.failed,
              },
        models: models(total, prices, providerNames),
        providers: [
          ...new Set(total.models.filter((m) => m.steps > 0).map((m) => m.model.providerID)),
        ].map((id) => ({ id, name: providerNames.get(id) ?? id })),
        buckets: buckets.map((stats, index) => bucket(stats, edges[index]!, edges[index + 1]!)),
      } satisfies UsageStats;
    },
    60_000,
  );
}

function query(filter: Filter, from: number, to: number, tools: 'none' | 'summary') {
  return {
    from,
    to,
    timezone: filter.timeZone,
    tools,
    ...(filter.project ? { project: filter.project } : {}),
  };
}

async function bucketStats(
  client: OpenCodeClient,
  filter: Filter,
  from: number,
  to: number,
  now: number,
  options: { signal: AbortSignal },
) {
  // The current bucket is still filling, so only finished ones are cached.
  const key = to < now ? `${filter.project ?? ''}|${from}|${to}` : undefined;
  const hit = key && cache.get(key);
  if (hit && now - hit.at < CACHE_TTL) return hit.value;
  const value = await client.session.stats(query(filter, from, to, 'none'), options);
  if (key) {
    cache.delete(key);
    cache.set(key, { at: now, value });
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  }
  return value;
}

/** Merges a model's thinking variants, keeping the biggest spenders first. */
function models(
  stats: SessionStatsInfo,
  catalog: Map<string, { name: string; priced: boolean }>,
  providers: Map<string, string>,
): UsageModel[] {
  const merged = new Map<string, UsageModel>();
  for (const usage of stats.models) {
    const key = `${usage.model.providerID}/${usage.model.id}`;
    const entry = merged.get(key);
    if (entry) {
      entry.steps += usage.steps;
      entry.cost += usage.cost;
      entry.tokens = addTokens(entry.tokens, usage.tokens);
      entry.priced ||= usage.cost > 0;
      continue;
    }
    const known = catalog.get(key);
    merged.set(key, {
      id: usage.model.id,
      providerID: usage.model.providerID,
      name: known?.name ?? usage.model.id,
      provider: providers.get(usage.model.providerID) ?? usage.model.providerID,
      steps: usage.steps,
      cost: usage.cost,
      tokens: usage.tokens,
      priced: (known?.priced ?? false) || usage.cost > 0,
    });
  }
  return (
    [...merged.values()]
      // Steps that failed before the model answered carry no tokens or cost.
      .filter((model) => model.cost > 0 || tokenTotal(model.tokens) > 0)
      .sort((a, b) => b.cost - a.cost || tokenTotal(b.tokens) - tokenTotal(a.tokens))
  );
}

function bucket(stats: SessionStatsInfo, start: number, end: number): UsageBucket {
  const providers: UsageBucket['providers'] = {};
  for (const usage of stats.models) {
    const entry = (providers[usage.model.providerID] ??= { cost: 0, tokens: 0 });
    entry.cost += usage.cost;
    entry.tokens += tokenTotal(usage.tokens);
  }
  return {
    start,
    end,
    cost: stats.cost,
    tokens: tokenTotal(stats.tokens),
    steps: stats.steps,
    providers,
  };
}

export function tokenTotal(tokens: TokenUsageInfo) {
  return tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write;
}

function addTokens(a: TokenUsageInfo, b: TokenUsageInfo): TokenUsageInfo {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    reasoning: a.reasoning + b.reasoning,
    cache: { read: a.cache.read + b.cache.read, write: a.cache.write + b.cache.write },
  };
}

function validTimeZone(timeZone: string | undefined) {
  if (!timeZone) return Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions().timeZone;
  } catch {
    throw new GatewayError('Unknown time zone.', 400);
  }
}

/**
 * Bucket boundaries ending at `now`: local hour starts for a day, or local midnights, so each
 * bar is one hour or one calendar day in the viewer's time zone, across DST changes.
 */
export function bucketEdges(period: UsagePeriod, timeZone: string, now: number) {
  const { count, unit } = shape[period];
  const clock = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
  const local = (time: number) => {
    const parts = Object.fromEntries(clock.formatToParts(time).map((p) => [p.type, p.value]));
    return { hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second) };
  };
  const { hour, minute, second } = local(now);
  const intoHour = minute * 60_000 + second * 1000 + (now % 1000);
  const edges: number[] = [now];
  if (unit === 'hour') {
    const start = now - intoHour;
    for (let i = 0; i < count; i++) edges.unshift(start - i * HOUR);
    return edges;
  }
  let midnight = now - hour * HOUR - intoHour;
  for (let i = 0; i < count; i++) {
    edges.unshift(midnight);
    // A day is 23 or 25 hours across a DST change; land back on local midnight.
    const guess = midnight - DAY;
    const shift = local(guess).hour;
    midnight = guess + (shift === 0 ? 0 : shift >= 12 ? (24 - shift) * HOUR : -shift * HOUR);
  }
  return edges;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  run: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await run(items[index]!, index);
      }
    }),
  );
  return results;
}
