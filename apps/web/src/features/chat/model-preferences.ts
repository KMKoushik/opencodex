import { modelInputSchema, projectInputSchema, type ModelRef } from '@opencodex/contracts';
import { z } from 'zod';
import { readStorage, writeStorage } from '../../lib/storage';

const schema = z.record(projectInputSchema.shape.directory, modelInputSchema.shape.model);
const variantsSchema = z.record(z.string().max(2048), z.string().max(512).nullable());

export function readModelVariants(): Record<string, string | null> {
  try {
    const saved = readStorage('modelVariants') ?? '{}';
    if (saved.length > 16_384) return {};
    const result = variantsSchema.safeParse(JSON.parse(saved));
    return result.success ? Object.fromEntries(Object.entries(result.data).slice(-64)) : {};
  } catch {
    return {};
  }
}

export function storeModelVariants(variants: Readonly<Record<string, string | null>>) {
  writeStorage('modelVariants', JSON.stringify(variants));
}

export function readProjectModels(): Record<string, ModelRef> {
  try {
    const result = schema.safeParse(JSON.parse(readStorage('projectModels') ?? '{}'));
    return result.success ? result.data : {};
  } catch {
    return {};
  }
}

export function storeProjectModels(models: Readonly<Record<string, ModelRef>>) {
  writeStorage('projectModels', JSON.stringify(models));
}
