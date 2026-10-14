import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { OpenCodeProject } from '@opencodex/contracts';
import type { AppModel } from '@opencodex/contracts/canvas';
import { api } from '../../lib/api';
import { appModelKey } from '../canvas/canvas-context';

export const MODEL_SOURCE: Record<AppModel['source'], string> = {
  app: 'Picked for this app.',
  chat: 'Following the chat that made this app.',
  default: 'OpenCode’s default model.',
  none: 'No model is available.',
};

/** The model `oc.ask` and `oc.run` use when server.ts names none, and its catalog. */
export function useAppModel(id: string) {
  const current = useQuery({
    queryKey: appModelKey(id),
    queryFn: ({ signal }) => api.appModel(id, signal),
  });
  const directory = current.data?.directory;
  const catalog = useQuery({
    queryKey: ['models', directory],
    queryFn: ({ signal }) => api.models(directory!, signal),
    enabled: Boolean(directory),
    staleTime: 5 * 60_000,
  });
  const ref = current.data?.model;
  const name = ref
    ? (catalog.data?.data.find((item) => item.id === ref.id && item.providerID === ref.providerID)
        ?.name ?? ref.id)
    : undefined;
  return { current, catalog, name };
}

/** The project of the chat that made the app, from the projects list the sidebar already loads. */
export function useAppProject(projectID: string | undefined) {
  return useQuery({
    queryKey: ['projects'],
    queryFn: ({ signal }) => api.projects(signal),
    enabled: Boolean(projectID),
    select: useCallback(
      (projects: OpenCodeProject[]) => projects.find((project) => project.id === projectID),
      [projectID],
    ),
  }).data;
}
