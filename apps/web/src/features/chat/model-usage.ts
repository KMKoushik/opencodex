import { z } from 'zod';
import type { ModelRef } from '@opencodex/contracts';
import { readStorage, writeStorage } from '../../lib/storage';

const schema = z
  .array(
    z.object({
      key: z.string().max(1024),
      count: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    }),
  )
  .max(64);

export const modelKey = (model: ModelRef) => JSON.stringify([model.providerID, model.id]);

export function readModelUsage(): Map<string, number> {
  try {
    const result = schema.safeParse(JSON.parse(readStorage('modelUsage') ?? '[]'));
    return new Map(result.success ? result.data.map(({ key, count }) => [key, count]) : []);
  } catch {
    return new Map();
  }
}

export function recordModelUsage(model: ModelRef) {
  const usage = readModelUsage();
  const key = modelKey(model);
  const count = usage.get(key) ?? 0;
  usage.delete(key);
  usage.set(key, Math.min(Number.MAX_SAFE_INTEGER, count + 1));
  const entries = [...usage].map(([key, count]) => ({ key, count }));
  entries.sort((a, b) => b.count - a.count);
  entries.splice(64);
  while (entries.length && JSON.stringify(entries).length > 16_384) entries.pop();
  writeStorage('modelUsage', JSON.stringify(entries));
}
