import { modelInputSchema, projectInputSchema, type ModelRef } from '@opencodex/contracts';
import { z } from 'zod';
import { readStorage, writeStorage } from '../../lib/storage';

const schema = z.record(projectInputSchema.shape.directory, modelInputSchema.shape.model);

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
