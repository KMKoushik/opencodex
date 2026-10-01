import type { OpenCodeProject, Project } from '@opencodex/contracts';

export const projectColors = ['gray', 'blue', 'green', 'orange', 'pink', 'purple'] as const;

export function projectName(project: OpenCodeProject) {
  return (
    project.name || project.canonical.split(/[\\/]/).filter(Boolean).at(-1) || project.canonical
  );
}

export function projectFolders(projects: OpenCodeProject[]) {
  const folders = new Map<string, OpenCodeProject>();
  // Preserve the service's recency order when a folder has historical identities.
  for (const project of projects) {
    if (!folders.has(project.canonical)) folders.set(project.canonical, project);
  }
  return folders;
}

export function projectFolder(project: OpenCodeProject): Project {
  return { name: projectName(project), directory: project.canonical };
}
