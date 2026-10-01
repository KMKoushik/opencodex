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

export function readProjects(): Project[] {
  const current = readProject();
  const fallback = current ? [current] : [];
  try {
    const value: unknown = JSON.parse(readStorage('projects') ?? 'null');
    const result = projectSchema.array().safeParse(value);
    if (!result.success) return fallback;
    const folders = new Map(result.data.map((project) => [project.directory, project]));
    // Migrate the previous selected-folder preference, never the server catalog.
    if (current && !folders.has(current.directory)) folders.set(current.directory, current);
    return [...folders.values()];
  } catch {
    return fallback;
  }
}

export function storeProjects(projects: Project[]) {
  writeStorage('projects', JSON.stringify(projects));
}
