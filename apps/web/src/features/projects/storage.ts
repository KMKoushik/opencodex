import { projectSchema, type Project } from '@opencodex/contracts';
import { readStorage, writeStorage } from '../../lib/storage';

export function readProject(): Project | null {
  try {
    const value: unknown = JSON.parse(readStorage('project') ?? 'null');
    const result = projectSchema.safeParse(value);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function storeProject(project: Project | null) {
  writeStorage('project', project ? JSON.stringify(project) : null);
}
